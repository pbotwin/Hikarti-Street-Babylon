import { makeAudioSamples, ENGINE_BASE } from './audioSamples.js';

/**
 * Fully procedural audio (WebAudio) — no audio files to license or download.
 *
 *  ambience : city hum, wind gusts, distant traffic swells, birds
 *  sfx      : footsteps, jump, land, fragment chime, portal shimmer/hum/enter,
 *             crosswalk "piyo-piyo" signal, passing train
 *  music    : soft, modern lo-fi / city-pop loop — electric-piano chords
 *             (maj7 / m9 voicings), warm pad, sparse pentatonic melody and a
 *             gentle brushed beat. Peaceful, not "fantasy battle".
 */
export class AudioSystem {
  constructor(state) {
    this.state = state;
    this.ctx = null;
    this.started = false;
    state.on('player:footstep', (e) => this.footstep(e));
    state.on('player:jump', () => this.jump());
    state.on('player:climb', () => this.jump());
    state.on('player:land', (e) => this.land(e));
    state.on('vehicle:crash', (e) => this.crash(e));
    state.on('fragment:collected', (e) => this.chime(e.count));
    state.on('portal:activated', () => setTimeout(() => this.portalOpen(), 700));
    state.on('portal:enter', () => this.portalEnter());
    state.on('game:complete', () => this.musicDuck(0.6));
    state.on('game:reset', () => this.musicDuck(1));
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend(); else this.ctx.resume();
    });
  }

  get muted() { return !!this._muted; }

  setMuted(m) {
    this._muted = m;
    if (!this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(m ? 0 : 0.7, t, 0.08);
  }

  /** Must be called from a user gesture (the Start button). */
  start() {
    if (this.started) { this.ctx?.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.started = true;
    const ctx = this.ctx = new AC({ latencyHint: 'interactive' });

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.gain.linearRampToValueAtTime(this._muted ? 0 : 0.7, ctx.currentTime + 3);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -22; comp.ratio.value = 2.5; comp.attack.value = 0.02; comp.release.value = 0.4;
    // Gentle top-end roll-off on everything: no harsh highs anywhere.
    const soft = ctx.createBiquadFilter(); soft.type = 'lowpass'; soft.frequency.value = 7000; soft.Q.value = 0.5;
    this.master.connect(soft).connect(comp).connect(ctx.destination);

    this.reverb = ctx.createConvolver();   // its impulse arrives with the samples
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.9;
    this.reverbSend.connect(this.reverb).connect(this.master);

    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.6; this.sfx.connect(this.master);
    this.amb = ctx.createGain(); this.amb.gain.value = 0.45; this.amb.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = 0.34; this.music.connect(this.master);
    this.musicVerb = ctx.createGain(); this.musicVerb.gain.value = 0.35;
    this.music.connect(this.musicVerb).connect(this.reverbSend);

    // Noise, reverb and engine samples (null until made): noise shots are
    // silent until then, and the loops and the engine start with them.
    this.noise = null;
    this._ambience();
    this._music();
    this.portalHum = null;
    this.birdTimer = 2;
    this.piyoTimer = 0;
    samples(ctx.sampleRate).then((s) => this._useSamples(s));
  }

  // ---------------------------------------------------------------- helpers
  _useSamples(s) {
    const ctx = this.ctx;
    const buffer = (channels) => {
      const b = ctx.createBuffer(channels.length, channels[0].length, ctx.sampleRate);
      channels.forEach((d, c) => b.copyToChannel(d, c));
      return b;
    };
    this.reverb.buffer = buffer(s.impulse);
    this.noise = buffer([s.noise]);
    this._engineCycle = buffer([s.engine]);
    const brown = s.brown.map((d) => buffer([d]));
    for (const [input, i] of this._loops) {
      const src = ctx.createBufferSource();
      src.buffer = i < 0 ? this.noise : brown[i]; src.loop = true;
      src.connect(input); src.start();
    }
    this._loops = null;
  }

  _env(g, t, a, peak, d, sustain = 0) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + a + d);
  }

  _noiseShot(dest, t, { dur = 0.1, freq = 1000, q = 1, type = 'bandpass', gain = 0.3, attack = 0.003, rate = 1 }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rate;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    this._env(g, t, attack, gain, dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 2, dur + 0.1);
    return { f, g };
  }

  _tone(dest, t, freq, { type = 'sine', dur = 0.5, gain = 0.2, attack = 0.01, detune = 0, release } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = freq; o.detune.value = detune;
    const g = ctx.createGain();
    this._env(g, t, attack, gain, release ?? dur);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + attack + (release ?? dur) + 0.05);
    return { o, g };
  }

  // --------------------------------------------------------------- ambience
  _ambience() {
    const ctx = this.ctx;
    // The noise loops start with the samples (_useSamples); here their
    // filters and gains.
    // Low city hum (brown noise, lowpassed).
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    const hg = ctx.createGain(); hg.gain.value = 0.16;
    lp.connect(hg).connect(this.amb);

    // Wind: bandpassed noise with a slow random gust envelope.
    const bp = ctx.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 500; bp.Q.value = 0.3;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0.02;
    this.windFilter = bp;
    bp.connect(this.windGain).connect(this.amb);
    this.gust = 0;

    // Distant traffic swells.
    const tf = ctx.createBiquadFilter(); tf.type = 'lowpass'; tf.frequency.value = 500;
    this.trafficGain = ctx.createGain(); this.trafficGain.gain.value = 0.0;
    tf.connect(this.trafficGain).connect(this.amb);
    this.trafficTimer = 4;

    // Train rumble (driven by world train position).
    const trf = ctx.createBiquadFilter(); trf.type = 'lowpass'; trf.frequency.value = 220;
    this.trainGain = ctx.createGain(); this.trainGain.gain.value = 0;
    trf.connect(this.trainGain).connect(this.amb);
    this.trainClack = 0;

    // Summer cicadas (ミンミンゼミ / アブラゼミ): a high, buzzing, pulsing
    // drone near trees. Bandpassed noise with a fast tremolo, gain set by
    // how green the player's surroundings are (see update()).
    const cbp = ctx.createBiquadFilter(); cbp.type = 'bandpass'; cbp.frequency.value = 4600; cbp.Q.value = 6;
    const trem = ctx.createGain(); trem.gain.value = 0.5;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 38;
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 0.5;
    lfo.connect(lfoAmt).connect(trem.gain); lfo.start();
    this.cicadaGain = ctx.createGain(); this.cicadaGain.gain.value = 0;
    cbp.connect(trem).connect(this.cicadaGain).connect(this.amb);
    this.cicadaCycle = 0;
    // Each loop's input and its noise: brown noise 0-2, or white (-1).
    this._loops = [[lp, 0], [bp, -1], [tf, 1], [trf, 2], [cbp, -1]];
    this.chimeTimer = 3; this.crowTimer = 20;
  }

  _bird(t) {
    const ctx = this.ctx;
    const pan = ctx.createStereoPanner(); pan.pan.value = Math.random() * 1.6 - 0.8;
    const g = ctx.createGain(); g.gain.value = 0.03 + Math.random() * 0.02;
    pan.connect(g).connect(this.amb);
    g.connect(this.reverbSend);
    const base = 1700 + Math.random() * 900;
    const notes = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < notes; i++) {
      const s = t + i * (0.09 + Math.random() * 0.06);
      const o = ctx.createOscillator(); o.type = 'sine';
      const og = ctx.createGain();
      o.frequency.setValueAtTime(base * (1 + Math.random() * 0.2), s);
      o.frequency.exponentialRampToValueAtTime(base * (0.7 + Math.random() * 0.5), s + 0.07);
      this._env(og, s, 0.02, 0.5, 0.09);
      o.connect(og).connect(pan);
      o.start(s); o.stop(s + 0.12);
    }
  }

  /** Tyre squeal while sliding on hard ground (level 0…1), continuous. */
  skid(level) {
    if (!this.noise || this.ctx.state !== 'running') return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (!this._skid) {
      const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 9;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(bp).connect(g).connect(this.sfx); src.start();
      this._skid = { g, bp };
    }
    this._skid.g.gain.setTargetAtTime(level > 0.15 ? 0.05 + level * 0.12 : 0, t, 0.06);
    this._skid.bp.frequency.setTargetAtTime(1600 + level * 900, t, 0.1);
  }

  /** Impact: low thump + crunchy metal + a little glass tinkle. */
  crash({ strength = 0.5 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._noiseShot(this.sfx, t, { dur: 0.35, freq: 140, q: 0.7, type: 'lowpass', gain: 0.3 * (0.4 + strength) });
    this._noiseShot(this.sfx, t + 0.01, { dur: 0.22, freq: 900, q: 1.2, gain: 0.16 * (0.4 + strength) });
    for (let i = 0; i < 3 + strength * 5; i++) {
      this._tone(this.sfx, t + 0.04 + Math.random() * 0.2, 3000 + Math.random() * 3000, { dur: 0.15, gain: 0.012, attack: 0.002 });
    }
  }

  /** Glass wind chime (風鈴): a bright partial cluster with a long ring. */
  _furin(t, vol) {
    const f = 2200 + Math.random() * 500;
    for (const [m, g] of [[1, 1], [2.76, 0.45], [5.4, 0.2], [8.9, 0.08]]) {
      this._tone(this.amb, t, f * m * (1 + (Math.random() - 0.5) * 0.004), { type: 'sine', dur: 2.2 / Math.sqrt(m), gain: vol * g, attack: 0.002 });
    }
    this._noiseShot(this.amb, t, { dur: 0.02, freq: 6000, q: 2, gain: vol * 0.5, attack: 0.001 });
  }

  /** Distant crow: two or three hoarse "kaa" calls. */
  _crow(t) {
    const n = 2 + Math.floor(Math.random() * 2);
    const pan = this.ctx.createStereoPanner(); pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(this.amb); pan.connect(this.reverbSend);
    for (let i = 0; i < n; i++) {
      const s = t + i * 0.42;
      const o = this.ctx.createOscillator(); o.type = 'sawtooth';
      const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 3;
      const og = this.ctx.createGain();
      o.frequency.setValueAtTime(560, s); o.frequency.linearRampToValueAtTime(470, s + 0.28);
      this._env(og, s, 0.03, 0.022, 0.26);
      o.connect(bp).connect(og).connect(pan); o.start(s); o.stop(s + 0.35);
    }
  }

  /** Japanese crosswalk signal: "piyo piyo" chirp. */
  _piyo(t, vol) {
    const g = this.ctx.createGain(); g.gain.value = vol; g.connect(this.amb);
    for (const [dt, f0, f1] of [[0, 1900, 1500], [0.22, 1900, 1500]]) {
      const o = this.ctx.createOscillator(); o.type = 'sine';
      const og = this.ctx.createGain();
      o.frequency.setValueAtTime(f0, t + dt);
      o.frequency.exponentialRampToValueAtTime(f1, t + dt + 0.12);
      this._env(og, t + dt, 0.02, 0.4, 0.12);
      o.connect(og).connect(g); o.start(t + dt); o.stop(t + dt + 0.16);
    }
  }

  // ------------------------------------------------------------------ music
  _music() {
    const ctx = this.ctx;
    this.bpm = 78;
    this.beat = 60 / this.bpm;
    this.nextBar = ctx.currentTime + 1.5;
    this.bar = 0;
    // Fmaj9 → Em7 → Dm9 → Cmaj7(add9) … classic soft city-pop / lo-fi motion.
    this.chords = [
      [53, 57, 60, 64, 67], // F A C E G
      [52, 55, 59, 62, 66], // E G B D F#
      [50, 53, 57, 60, 64], // D F A C E
      [48, 52, 55, 59, 62], // C E G B D
    ];
    this.bass = [41, 40, 38, 36];
    this.scale = [60, 62, 64, 67, 69, 72, 74, 76]; // C major pentatonic
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 1;
    // Gentle lo-fi tone: lowpass + slow wobble.
    this.musicLP = ctx.createBiquadFilter(); this.musicLP.type = 'lowpass'; this.musicLP.frequency.value = 2400;
    this.musicBus.connect(this.musicLP).connect(this.music);
  }

  _scheduleMusic() {
    const ctx = this.ctx;
    while (this.nextBar < ctx.currentTime + 0.6) {
      const t = this.nextBar;
      const i = this.bar % 4;
      const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
      const ch = this.chords[i];
      // Electric piano chord (two slightly detuned sines + a soft FM bell) — strummed.
      ch.forEach((n, k) => {
        const s = t + k * 0.018;
        this._ep(s, midi(n), 0.045, this.beat * 3.6);
        // Re-strike on beat 3 (softer) for movement.
        this._ep(t + this.beat * 2.5 + k * 0.012, midi(n), 0.022, this.beat * 1.4);
      });
      // Warm pad.
      ch.slice(0, 3).forEach((n) => {
        this._tone(this.musicBus, t, midi(n), { type: 'triangle', dur: this.beat * 4.2, gain: 0.018, attack: 0.9, detune: Math.random() * 8 - 4 });
      });
      // Bass.
      this._tone(this.musicBus, t, midi(this.bass[i]), { type: 'sine', dur: this.beat * 1.6, gain: 0.12, attack: 0.02 });
      this._tone(this.musicBus, t + this.beat * 2.5, midi(this.bass[i] + 7), { type: 'sine', dur: this.beat * 1.2, gain: 0.07, attack: 0.02 });
      // Sparse melody (not every bar, so it breathes).
      if (this.bar % 8 >= 2) {
        const steps = [0, 1.5, 2, 3];
        steps.forEach((b) => {
          if (Math.random() < 0.55) {
            const n = this.scale[Math.floor(Math.random() * this.scale.length)] + 12;
            this._bell(t + b * this.beat, midi(n), 0.022);
          }
        });
      }
      // Soft heartbeat pulse after the intro (no noisy hats or snares).
      if (this.bar >= 4) {
        this._kick(t);
        this._kick(t + this.beat * 2.5);
        for (let b = 1; b < 4; b += 2) this._noiseShot(this.musicBus, t + b * this.beat, { dur: 0.12, freq: 900, q: 0.6, type: 'lowpass', gain: 0.012, attack: 0.01 });
      }
      this.bar++;
      this.nextBar += this.beat * 4;
    }
  }

  _ep(t, f, gain, dur) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    this._env(g, t, 0.008, gain, dur);
    g.connect(this.musicBus);
    for (const det of [-5, 5]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.detune.value = det;
      o.connect(g); o.start(t); o.stop(t + dur + 0.1);
    }
    // Tine (FM): modulator at 14x gives the Rhodes "bark".
    const car = ctx.createOscillator(); car.frequency.value = f;
    const mod = ctx.createOscillator(); mod.frequency.value = f * 14;
    const mg = ctx.createGain(); mg.gain.setValueAtTime(f * 0.35, t); mg.gain.exponentialRampToValueAtTime(1, t + 0.2);
    const tg = ctx.createGain(); this._env(tg, t, 0.006, gain * 0.12, 0.35);
    mod.connect(mg).connect(car.frequency);
    car.connect(tg).connect(this.musicBus);
    car.start(t); mod.start(t); car.stop(t + 0.5); mod.stop(t + 0.5);
  }

  _bell(t, f, gain) {
    this._tone(this.musicBus, t, f, { type: 'sine', dur: 1.2, gain, attack: 0.005 });
    this._tone(this.musicBus, t, f * 2, { type: 'sine', dur: 0.5, gain: gain * 0.3, attack: 0.005 });
  }

  _kick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.15);
    const g = ctx.createGain(); this._env(g, t, 0.006, 0.07, 0.25);
    o.connect(g).connect(this.musicBus); o.start(t); o.stop(t + 0.3);
  }

  musicDuck(v) {
    if (!this.ctx) return;
    this.music.gain.linearRampToValueAtTime(0.34 * v, this.ctx.currentTime + 1.5);
  }

  // -------------------------------------------------------------------- sfx
  /** Soft, low "tap" on paving — felt more than heard. */
  /**
   * Footstep per surface (e.surface is set by gameplay/Footsteps.js):
   *   asphalt/concrete/stone  firm heel thud + short scuff (asphalt a touch wet)
   *   grass                   soft muffled thud + leafy swish
   *   gravel                  thud + a few crunchy grains
   *   sand                    soft, dull, with a hissing grain slide
   *   wood                    hollow knock
   *   metal                   duller thud with a faint ring
   */
  footstep({ run, speed, surface = 'concrete' }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const r = () => Math.random();
    const v = (run ? 0.07 : 0.045) * (0.85 + r() * 0.3) + Math.min(0.02, speed * 0.004);
    const shot = (dt, o) => this._noiseShot(this.sfx, t + dt, o);
    switch (surface) {
      case 'grass':
        shot(0, { dur: 0.08, freq: 260 + r() * 80, q: 0.6, type: 'lowpass', gain: v * 0.7, attack: 0.01 });
        shot(0.01, { dur: 0.12, freq: 2600 + r() * 900, q: 0.5, gain: v * 0.22, attack: 0.02 });
        break;
      case 'sand':
        shot(0, { dur: 0.09, freq: 220 + r() * 60, q: 0.5, type: 'lowpass', gain: v * 0.6, attack: 0.012 });
        shot(0.015, { dur: 0.16, freq: 3800 + r() * 1200, q: 0.4, gain: v * 0.16, attack: 0.03 });
        break;
      case 'gravel':
        shot(0, { dur: 0.07, freq: 360 + r() * 120, q: 0.7, type: 'lowpass', gain: v * 0.8, attack: 0.006 });
        for (let i = 0; i < 4; i++) shot(0.008 + i * 0.016 + r() * 0.01, { dur: 0.025, freq: 1800 + r() * 2400, q: 1.6, gain: v * 0.22, attack: 0.002 });
        break;
      case 'wood':
        shot(0, { dur: 0.09, freq: 520 + r() * 90, q: 3.5, gain: v * 0.9, attack: 0.004 });
        shot(0, { dur: 0.06, freq: 260, q: 0.8, type: 'lowpass', gain: v * 0.5, attack: 0.004 });
        break;
      case 'metal':
        shot(0, { dur: 0.06, freq: 300 + r() * 60, q: 0.8, type: 'lowpass', gain: v * 0.8, attack: 0.004 });
        this._tone(this.sfx, t + 0.004, 1650 + r() * 300, { type: 'sine', dur: 0.12, gain: v * 0.08, attack: 0.003 });
        break;
      default: { // asphalt, concrete, stone
        const wet = surface === 'asphalt';
        shot(0, { dur: 0.07, freq: 380 + r() * 160, q: 0.7, type: 'lowpass', gain: v, attack: 0.006 });
        shot(0.012, { dur: wet ? 0.07 : 0.05, freq: (wet ? 2000 : 1100) + r() * 300, q: 0.8, gain: v * (wet ? 0.12 : 0.18), attack: 0.004 });
      }
    }
  }

  /** Light airy lift. */
  jump() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const { f } = this._noiseShot(this.sfx, t, { dur: 0.3, freq: 300, q: 0.6, type: 'lowpass', gain: 0.06, attack: 0.05 });
    f.frequency.exponentialRampToValueAtTime(1200, t + 0.25);
    this._tone(this.sfx, t, 520, { type: 'sine', dur: 0.18, gain: 0.015, attack: 0.02 });
  }

  /**
   * Engine note for the vehicle being driven (null = none / switched off):
   * a sawtooth + sub-octave through a low-pass whose cutoff opens with load,
   * pitch following rpm between idle and redline. Bicycles pass null.
   */
  /**
   * Engine for the vehicle being driven (null = off). Layers:
   *   firing loop (rate = rpm) → soft saturation → exhaust low-pass (opens
   *   with throttle), plus a muffled intake rush under load.
   */
  engine(e) {
    if (!this.noise) return;     // no samples yet
    const ctx = this.ctx, t = ctx.currentTime;
    if (!this._eng) {
      const src = ctx.createBufferSource(); src.buffer = this._engineCycle; src.loop = true;
      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) { const x = i / 127.5 - 1; curve[i] = Math.tanh(x * 1.8) / Math.tanh(1.8); }
      shaper.curve = curve;
      const pre = ctx.createGain(); pre.gain.value = 0.8;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.9; lp.frequency.value = 500;
      const body = ctx.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 140; body.gain.value = 5; body.Q.value = 1;
      const out = ctx.createGain(); out.gain.value = 0;
      src.connect(pre).connect(shaper).connect(body).connect(lp).connect(out).connect(this.sfx);
      // Intake rush: band-passed noise, only under load.
      const nz = ctx.createBufferSource(); nz.buffer = this.noise; nz.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.8;
      const ng = ctx.createGain(); ng.gain.value = 0;
      nz.connect(bp).connect(ng).connect(this.sfx);
      src.start(); nz.start();
      this._eng = { src, lp, out, bp, ng, on: false };
    }
    const g = this._eng;
    if (!e) {
      if (g.on) { g.out.gain.setTargetAtTime(0, t, 0.3); g.ng.gain.setTargetAtTime(0, t, 0.2); g.on = false; }
      return;
    }
    g.on = true;
    const f = e.idle + (e.max - e.idle) * e.rpm;            // firing frequency
    g.src.playbackRate.setTargetAtTime(f / ENGINE_BASE, t, 0.06);
    g.lp.frequency.setTargetAtTime(350 + f * 4 + e.load * 1400, t, 0.1);
    g.out.gain.setTargetAtTime(0.09 + e.load * 0.06 + e.rpm * 0.04, t, 0.12);
    g.bp.frequency.setTargetAtTime(600 + f * 6, t, 0.1);
    g.ng.gain.setTargetAtTime(e.load * (0.006 + e.rpm * 0.01), t, 0.12);
  }

  /** Soft cushioned landing. */
  land({ impact }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._noiseShot(this.sfx, t, { dur: 0.12, freq: 220, q: 0.6, type: 'lowpass', gain: 0.07 + impact * 0.07, attack: 0.008 });
  }

  /** Rising sparkle arpeggio; pitch climbs with each fragment. */
  /** Warm music-box arpeggio; pitch climbs with each fragment. */
  chime(count) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const root = 72 + [0, 2, 4, 7, 9][Math.min(4, count - 1)];
    const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const out = this.ctx.createGain(); out.gain.value = 0.8;
    out.connect(this.sfx); out.connect(this.reverbSend);
    [0, 4, 7, 12].forEach((iv, k) => {
      const s = t + k * 0.075;
      this._tone(out, s, midi(root + iv), { type: 'sine', dur: 1.1 - k * 0.12, gain: 0.07, attack: 0.008 });
      this._tone(out, s, midi(root + iv) * 2, { type: 'sine', dur: 0.35, gain: 0.012, attack: 0.008 });
    });
  }

  /** Slow, dreamy chord swell when the portal appears, then a soft hum near it. */
  portalOpen() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.ctx.createGain(); out.gain.value = 0.9;
    out.connect(this.sfx); out.connect(this.reverbSend);
    const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
    [60, 64, 67, 71, 74].forEach((n, k) => {
      this._tone(out, t + k * 0.18, midi(n), { type: 'sine', dur: 3.2, gain: 0.035, attack: 0.6 });
      this._tone(out, t + k * 0.18 + 0.4, midi(n + 12), { type: 'sine', dur: 1.8, gain: 0.012, attack: 0.3 });
    });

    const ctx = this.ctx;
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 220;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 329.6;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.25;
    const lg = ctx.createGain(); lg.gain.value = 0.25;
    const hg = ctx.createGain(); hg.gain.value = 0;
    const g2 = ctx.createGain(); g2.gain.value = 0.5;
    lfo.connect(lg).connect(g2.gain);
    o1.connect(g2); o2.connect(g2); g2.connect(hg).connect(this.sfx);
    hg.connect(this.reverbSend);
    o1.start(); o2.start(); lfo.start();
    this.portalHum = { hg, nodes: [o1, o2, lfo] };
  }

  /** Gentle rising chord as you step through. */
  portalEnter() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.ctx.createGain(); out.gain.value = 0.9;
    out.connect(this.sfx); out.connect(this.reverbSend);
    const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
    [65, 69, 72, 76, 79, 84].forEach((n, k) => this._tone(out, t + 0.1 + k * 0.12, midi(n), { type: 'sine', dur: 3.2, gain: 0.04, attack: 0.08 }));
    const { f } = this._noiseShot(out, t, { dur: 1.2, freq: 300, q: 0.5, type: 'lowpass', gain: 0.04, attack: 0.3 });
    f.frequency.exponentialRampToValueAtTime(1500, t + 1.1);
    if (this.portalHum) {
      this.portalHum.hg.gain.linearRampToValueAtTime(0, t + 1.5);
      const nodes = this.portalHum.nodes;
      setTimeout(() => nodes.forEach((n) => n.stop()), 1800);
      this.portalHum = null;
    }
  }

  // ----------------------------------------------------------------- update
  update(dt, player, camera, world) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    this._scheduleMusic();

    // Wind gusts.
    this.gust += dt;
    const g = 0.015 + 0.025 * (0.5 + 0.5 * Math.sin(this.gust * 0.21) * Math.sin(this.gust * 0.13 + 1));
    this.windGain.gain.setTargetAtTime(g, t, 1.5);
    this.windFilter.frequency.setTargetAtTime(380 + g * 6000, t, 1.5);

    // Traffic swell every so often.
    this.trafficTimer -= dt;
    if (this.trafficTimer <= 0) {
      this.trafficTimer = 7 + Math.random() * 10;
      this.trafficGain.gain.setTargetAtTime(0.05, t, 2);
      this.trafficGain.gain.setTargetAtTime(0, t + 3, 1.5);
    }

    // Birds (more in the park).
    this.birdTimer -= dt;
    const inPark = player.position.x < -9 && player.position.z > -27 && player.position.z < -7;
    if (this.birdTimer <= 0) {
      this.birdTimer = (inPark ? 3 : 7) + Math.random() * 6;
      this._bird(t);
    }

    // Cicadas swell and fade in long cycles; louder in green places (park,
    // gardens, tree-lined streets), quieter on bare asphalt.
    this.cicadaCycle += dt;
    const P = player.position;
    const green = (P.x < -9 && P.z > -27 && P.z < -7) || (Math.abs(P.x) > 9 && P.z > 106 && P.z < 142) ? 1 : 0.35;
    const swell = Math.max(0, Math.sin(this.cicadaCycle * 0.11) * 0.6 + 0.4);
    this.cicadaGain.gain.setTargetAtTime(0.022 * green * swell, t, 1.2);

    // Wind chimes hang in the shrine alley and at the café: they ring with the gusts.
    this.chimeTimer -= dt;
    if (this.chimeTimer <= 0) {
      this.chimeTimer = 1.2 + Math.random() * 3.5 / (0.4 + g * 30);
      const dAlley = Math.hypot(Math.max(0, Math.abs(P.x - 20) - 12), P.z + 8.75);
      const dCafe = Math.hypot(P.x + 8, P.z + 1);
      const d = Math.min(dAlley, dCafe);
      if (d < 14) this._furin(t, 0.022 * (1 - d / 14));
    }

    // A crow now and then, far off.
    this.crowTimer -= dt;
    if (this.crowTimer <= 0) { this.crowTimer = 25 + Math.random() * 35; this._crow(t); }

    // Crosswalk chirp near crossings.
    this.piyoTimer -= dt;
    if (this.piyoTimer <= 0) {
      this.piyoTimer = 1.6;
      const d = Math.min(...[-35, 24].map((z) => Math.hypot(player.position.x, player.position.z - z)));
      if (d < 10) this._piyo(t, 0.018 * (1 - d / 10));
    }

    // Train rumble from the overpass.
    const tx = world?.trainX;
    if (tx != null) {
      const d = Math.hypot(player.position.x - (tx + 30), player.position.z - 48);
      this.trainGain.gain.setTargetAtTime(Math.max(0, 0.22 * (1 - d / 120)), t, 0.5);
      this.trainClack -= dt;
      if (this.trainClack <= 0 && d < 90) {
        this.trainClack = 0.18;
        this._noiseShot(this.amb, t, { dur: 0.06, freq: 260, q: 1, type: 'lowpass', gain: 0.05 * (1 - d / 90) });
      }
    } else this.trainGain.gain.setTargetAtTime(0, t, 0.6);

    // Portal hum attenuates with distance.
    if (this.portalHum) {
      const d = Math.hypot(player.position.x - 0, player.position.z + 6);
      this.portalHum.hg.gain.setTargetAtTime(0.035 * Math.max(0, 1 - d / 20), t, 0.3);
    }
  }
}

// The sample data, made off the main thread (see audioSamples.js); on the
// main thread where a worker can't run.
function samples(sr) {
  return new Promise((resolve) => {
    const fallback = () => resolve(makeAudioSamples(sr));
    let worker;
    try { worker = new Worker(new URL('./audioSamplesWorker.js', import.meta.url), { type: 'module' }); } catch { fallback(); return; }
    worker.onmessage = ({ data }) => { worker.terminate(); resolve(data); };
    worker.onerror = () => { worker.terminate(); fallback(); };
    worker.postMessage({ sr });
  });
}
