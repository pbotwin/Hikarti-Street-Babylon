/**
 * Neural voices (Kokoro-82M, ONNX q8 ≈ 90 MB, downloaded once and cached by
 * the browser) running in a worker so speech synthesis never touches the
 * game's main thread. Requests run one at a time, in order.
 *
 *   → { type: 'load' }                          start downloading / warming up
 *   → { type: 'say', id, text, voice, speed }   synthesise, sentence by sentence
 *   → { type: 'stop', id }                      drop that request (queued or running)
 *   ← { type: 'progress', loaded }              0..1 while downloading
 *   ← { type: 'ready' } / { type: 'error', message }
 *   ← { type: 'audio', id, pcm, rate, last }    one sentence of audio
 *   ← { type: 'done', id }
 */
let tts = null, loading = null;
const queue = [];
const stopped = new Set();
let busy = false;

async function load() {
  if (tts) return tts;
  if (loading) return loading;
  loading = (async () => {
    const { KokoroTTS } = await import('kokoro-js');
    tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
      dtype: 'q8', device: 'wasm',
      progress_callback: (p) => {
        if (p.status === 'progress' && p.total) postMessage({ type: 'progress', loaded: p.loaded / p.total, file: p.file });
      },
    });
    // Warm up so the first real line comes out quickly.
    await tts.generate('Hi.', { voice: 'af_heart' });
    postMessage({ type: 'ready' });
    return tts;
  })().catch((e) => { loading = null; postMessage({ type: 'error', message: String(e?.message || e) }); throw e; });
  return loading;
}

/** Sentences, merging very short ones so each chunk sounds natural. */
function sentences(text) {
  const parts = text.replace(/\s+/g, ' ').match(/[^.!?…]+[.!?…]+["”’)]*|[^.!?…]+$/g) || [text];
  const out = [];
  for (const p of parts.map((s) => s.trim()).filter(Boolean)) {
    if (out.length && (out[out.length - 1].length < 28 || p.length < 12)) out[out.length - 1] += ' ' + p;
    else out.push(p);
  }
  return out;
}

async function pump() {
  if (busy) return;
  busy = true;
  try {
    while (queue.length) {
      const m = queue.shift();
      if (stopped.has(m.id)) { stopped.delete(m.id); continue; }
      try {
        const t = await load();
        const list = sentences(m.text);
        for (let i = 0; i < list.length; i++) {
          if (stopped.has(m.id)) break;
          const audio = await t.generate(list[i], { voice: m.voice, speed: m.speed || 1 });
          if (stopped.has(m.id)) break;
          const pcm = audio.audio instanceof Float32Array ? audio.audio : new Float32Array(audio.audio);
          postMessage({ type: 'audio', id: m.id, pcm, rate: audio.sampling_rate || 24000, last: i === list.length - 1 }, [pcm.buffer]);
        }
      } catch (err) {
        postMessage({ type: 'error', id: m.id, message: String(err?.message || err) });
      }
      stopped.delete(m.id);
      postMessage({ type: 'done', id: m.id });
    }
  } finally { busy = false; }
}

onmessage = (e) => {
  const m = e.data;
  if (m.type === 'load') { load().catch(() => {}); return; }
  if (m.type === 'stop') { stopped.add(m.id); return; }
  if (m.type === 'say') {
    // Speaking now jumps ahead of background preparation.
    if (m.urgent) queue.unshift(m); else queue.push(m);
    pump();
  }
};
