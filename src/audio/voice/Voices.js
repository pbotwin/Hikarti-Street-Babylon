/**
 * Resident voices.
 *
 *   natural  Kokoro-82M neural voices in a worker (best quality; ~90 MB
 *            downloaded once, the first time someone is about to talk)
 *   device   the device's built-in speech voices (instant, no download;
 *            used while the natural voices download, and on low-end phones)
 *   off
 *
 * Every resident has their own voice: a base voice plus their own speed and
 * pitch. While someone speaks, `level(id)` gives their loudness for lip-sync.
 */
const KEY = 'hikari.voices';

// Best-graded Kokoro voices first.
const FEMALE = ['af_heart', 'af_bella', 'af_nicole', 'af_kore', 'af_sarah', 'af_aoede', 'bf_emma', 'bf_isabella', 'af_nova', 'af_sky', 'bf_alice', 'bf_lily', 'af_alloy', 'af_jessica'];
const MALE = ['am_fenrir', 'am_michael', 'am_puck', 'bm_george', 'bm_fable', 'am_echo', 'bm_daniel', 'am_liam', 'bm_lewis', 'am_eric'];

function hash(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; }

export class Voices {
  constructor() {
    this.mode = this._loadMode();
    this.profiles = new Map();
    this.worker = null;
    this.ready = false;
    this.loading = 0;
    this.current = null;          // { id, item, sources[], until }
    this.levels = new Map();
    // Lines prepared ahead of time (synthesised while she walks up):
    // itemId → { text, req, chunks: [{pcm, rate}], done }
    this.prepared = new Map();
    this.byReq = new Map();
    this.isMuted = () => false;
    this.onStatus = null;         // (text) progress / errors for the UI
    this._lines = 0;
  }

  _loadMode() {
    let m = null;
    try { m = localStorage.getItem(KEY); } catch { /* private mode */ }
    if (m === 'natural' || m === 'device' || m === 'off') return m;
    // Default: natural voices, unless the device is small or saving data.
    const low = (navigator.deviceMemory && navigator.deviceMemory < 4) || navigator.connection?.saveData;
    return low ? 'device' : 'natural';
  }

  setMode(m) {
    this.mode = m;
    try { localStorage.setItem(KEY, m); } catch { /* private mode */ }
    if (m !== 'off') this.prefetch();
    else this.stop();
  }

  /** Voice for a resident: gender and age from their spec, stable per id. */
  profile(item) {
    if (this.profiles.has(item.id)) return this.profiles.get(item.id);
    const male = item.look?.gender === 'm';
    const list = male ? MALE : FEMALE;
    const h = hash(item.id), role = (item.spec?.role || '').toLowerCase();
    const older = /longtime|guide|planner|librarian/.test(role);
    const young = /student|school/.test(role);
    // Spread residents over the voices in order of quality.
    const idx = Math.floor(h * Math.min(list.length, male ? 6 : 9));
    const p = {
      voice: list[idx],
      speed: (older ? 0.9 : young ? 1.06 : 1) * (0.96 + hash(item.id + 's') * 0.08),
      // Small pitch offset (playback rate) so two people sharing a voice differ.
      pitch: (older ? 0.95 : young ? 1.04 : 1) * (0.975 + hash(item.id + 'p') * 0.05),
      male,
    };
    this.profiles.set(item.id, p);
    return p;
  }

  // ------------------------------------------------------------ natural voices
  prefetch() {
    if (this.mode !== 'natural' || this.worker) return;
    try {
      this.worker = new Worker(new URL('./VoiceWorker.js', import.meta.url), { type: 'module' });
    } catch { this.mode = 'device'; return; }
    this.worker.onmessage = (e) => this._onWorker(e.data);
    this.worker.onerror = () => { this.worker = null; this.mode = 'device'; };
    this.worker.postMessage({ type: 'load' });
  }

  _onWorker(m) {
    if (m.type === 'progress') { this.loading = m.loaded; this.onStatus?.(`Downloading voices… ${Math.round(m.loaded * 100)}%`); }
    else if (m.type === 'ready') { this.ready = true; this.onStatus?.('Natural voices ready'); }
    else if (m.type === 'error' && !m.id) { this.onStatus?.('Natural voices unavailable — using device voices'); this.mode = 'device'; }
    else if (m.type === 'audio') {
      const e = this.byReq.get(m.id);
      if (e) e.chunks.push({ pcm: m.pcm, rate: m.rate });
      if (this.current && this.current.req === m.id) this._play(m);
    } else if (m.type === 'done') {
      const e = this.byReq.get(m.id);
      if (e) e.done = true;
    }
  }

  _ctx() {
    if (!this.ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ac = new AC({ latencyHint: 'interactive' });
      this.out = this.ac.createGain();
      this.out.gain.value = 0.95;
      // Gentle presence EQ so voices sit above the music and ambience.
      const eq = this.ac.createBiquadFilter(); eq.type = 'peaking'; eq.frequency.value = 2800; eq.gain.value = 2.5; eq.Q.value = 0.8;
      this.analyser = this.ac.createAnalyser(); this.analyser.fftSize = 512;
      this.out.connect(eq).connect(this.analyser).connect(this.ac.destination);
      this._buf = new Float32Array(this.analyser.fftSize);
    }
    if (this.ac.state === 'suspended') this.ac.resume();
    return this.ac;
  }

  _play(m) {
    const c = this.current;
    if (!c || this.isMuted()) return;
    const ac = this._ctx();
    const buf = ac.createBuffer(1, m.pcm.length, m.rate);
    buf.copyToChannel(m.pcm, 0);
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = c.profile.pitch;
    src.connect(this.out);
    const start = Math.max(ac.currentTime + 0.03, c.until);
    src.start(start);
    c.until = start + buf.duration / c.profile.pitch + 0.12;
    c.sources.push(src);
  }

  // ------------------------------------------------------------ speaking
  /**
   * Synthesise `text` for this resident in the background (she is walking
   * up to them), so it plays instantly when spoken.
   */
  prepare(item, text) {
    if (this.mode !== 'natural' || !this.ready || !text) return;
    const old = this.prepared.get(item.id);
    if (old?.text === text) return;
    if (old && !(this.current && this.current.req === old.req)) { this.worker.postMessage({ type: 'stop', id: old.req }); this.byReq.delete(old.req); }
    const profile = this.profile(item);
    const e = { text, req: ++this._lines, chunks: [], done: false };
    this.prepared.set(item.id, e);
    this.byReq.set(e.req, e);
    this.worker.postMessage({ type: 'say', id: e.req, text, voice: profile.voice, speed: profile.speed });
  }

  /** Say `text` as resident `item` (stops whoever was speaking). */
  speak(item, text) {
    this.stop();
    if (this.mode === 'off' || !text || this.isMuted()) return;
    const profile = this.profile(item);
    this.current = { item, profile, sources: [], until: 0, device: false, req: null };
    if (this.mode === 'natural') {
      this.prefetch();
      if (this.ready) {
        this._ctx();
        this.current.until = this.ac.currentTime;
        const pre = this.prepared.get(item.id);
        if (pre?.text === text) {
          // Ready (or partly ready) in advance: play what we have, stream the rest.
          this.current.req = pre.req;
          for (const c of pre.chunks) this._play(c);
          return;
        }
        const e = { text, req: ++this._lines, chunks: [], done: false };
        this.prepared.set(item.id, e);
        this.byReq.set(e.req, e);
        this.current.req = e.req;
        this.worker.postMessage({ type: 'say', id: e.req, text, voice: profile.voice, speed: profile.speed, urgent: true });
        return;
      }
    }
    this._device(text, profile);
  }

  _device(text, profile) {
    const ss = window.speechSynthesis;
    if (!ss) return;
    const u = new SpeechSynthesisUtterance(text);
    const voices = ss.getVoices().filter((v) => /^en/i.test(v.lang));
    // Prefer natural / neural device voices, matching the resident's gender when names say so.
    const good = voices.filter((v) => /natural|neural|google|samantha|aria|jenny|guy|daniel|serena/i.test(v.name));
    const pool = good.length ? good : voices;
    const female = pool.filter((v) => /female|aria|jenny|samantha|serena|zira|susan|libby|sonia|natasha|emma/i.test(v.name));
    const male = pool.filter((v) => /male|guy|daniel|david|mark|ryan|thomas|george/i.test(v.name) && !/female/i.test(v.name));
    const list = (profile.male ? male : female).length ? (profile.male ? male : female) : pool;
    if (list.length) u.voice = list[Math.floor(hash(profile.voice) * list.length)];
    u.rate = profile.speed;
    u.pitch = Math.max(0.6, Math.min(1.5, profile.pitch * (profile.male ? 0.92 : 1.12)));
    const c = this.current;
    c.device = true;
    c.utter = u;
    u.onend = () => { if (this.current === c) this.current = null; };
    ss.cancel();
    ss.speak(u);
  }

  stop() {
    const c = this.current;
    if (!c) return;
    this.current = null;
    if (c.device) window.speechSynthesis?.cancel();
    else {
      for (const s of c.sources) { try { s.stop(); } catch { /* already ended */ } }
      // A line that was cut off isn't replayed: free the worker.
      const e = c.req && this.byReq.get(c.req);
      if (e && !e.done) this.worker?.postMessage({ type: 'stop', id: c.req });
      if (e) { this.byReq.delete(c.req); if (this.prepared.get(c.item.id) === e) this.prepared.delete(c.item.id); }
    }
  }

  /** Current loudness 0..1 of resident `id` (for the mouth). */
  level(id) {
    const c = this.current;
    if (!c || c.item.id !== id) return 0;
    if (c.device) return window.speechSynthesis?.speaking ? 0.35 + 0.35 * Math.abs(Math.sin(performance.now() / 85)) : 0;
    if (!this.analyser || this.ac.currentTime > c.until) return 0;
    this.analyser.getFloatTimeDomainData(this._buf);
    let s = 0;
    for (let i = 0; i < this._buf.length; i++) s += this._buf[i] * this._buf[i];
    return Math.min(1, Math.sqrt(s / this._buf.length) * 6);
  }

  get speaking() { return !!this.current; }
}
