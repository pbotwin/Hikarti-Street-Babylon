import { phonemize } from 'phonemizer';

/**
 * Neural voices (Kokoro-82M, ONNX q8 ≈ 90 MB, downloaded once and cached by
 * the browser) running in a worker so speech synthesis never touches the
 * game's main thread. Requests run one at a time, in order.
 *
 * The text is turned into phonemes here rather than by Kokoro's own
 * `generate`, with the same espeak-ng phonemizer and post-processing, so
 * the Japanese names and words the English letter-to-sound rules get wrong
 * ("Kaede" as "kayd", "Nao" as "now") can be given their pronunciation.
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

// Names and words said the Japanese way (Kokoro's American IPA; ˈ before
// the stressed syllable). Keys are matched as whole words, any case.
const LEXICON = {
  aoi: 'ɑːˈoʊi', ren: 'ɹˈɛn', emi: 'ˈɛmi', sora: 'sˈoʊɹɑː', hana: 'hˈɑːnɑː', kenji: 'kˈɛndʒi',
  yuki: 'jˈuːki', daichi: 'dˈaɪtʃi', mika: 'mˈiːkɑː', haru: 'hˈɑːɹuː', natsumi: 'nˈɑːtsuːmi',
  riku: 'ɹˈiːkuː', akari: 'ɑːkˈɑːɹi', tomo: 'tˈoʊmoʊ', kaede: 'kɑːˈɛdɛ', jun: 'dʒˈuːn',
  kasumi: 'kɑːsˈuːmi', teppei: 'tˈɛpeɪ', mei: 'mˈeɪ', fumi: 'fˈuːmi', ayame: 'ɑːjˈɑːmɛ',
  shun: 'ʃˈuːn', chiyo: 'tʃˈiːjoʊ', nao: 'nˈɑːoʊ', shiori: 'ʃiˈoʊɹi', kaito: 'kˈaɪtoʊ',
  hinata: 'hinˈɑːtɑː', asahi: 'ɑːsˈɑːhi', tomoe: 'toʊmˈoʊɛ', makoto: 'mɑːkˈoʊtoʊ',
  izumi: 'iːzˈuːmi', tsuki: 'tsˈuːki',
  hikari: 'hikˈɑːɹi', sakura: 'sˈɑːkuːɹɑː', komorebi: 'koʊmoʊɹˈɛbi', mirei: 'miɹˈeɪ',
  ramen: 'ɹˈɑːmɛn', matcha: 'mˈɑːtʃə', onigiri: 'oʊnˈiːɡiɹi', mochi: 'mˈoʊtʃi', dango: 'dˈɑːŋɡoʊ',
  taiyaki: 'tˈaɪjɑːki', bento: 'bˈɛntoʊ', yukata: 'juːkˈɑːtɑː', gyoza: 'ɡiˈoʊzə', udon: 'ˈuːdɑːn',
  manga: 'mˈɑːŋɡə', anime: 'ˈænɪmeɪ', torii: 'tˈoʊɹiˌiː', izakaya: 'ˌiːzɑːkˈɑːjə', konbini: 'kɑːnbˈiːni',
  karaoke: 'kˌæɹiˈoʊki', yen: 'jˈɛn',
};
// A lexicon word (with a possessive), or a run of punctuation Kokoro keeps as
// its own tokens (parentheses are spoken as « » by Kokoro's normaliser).
const TOKENS = new RegExp(`\\b(${Object.keys(LEXICON).join('|')})('s)?\\b|([;:,.!?¡¿—…"«»]+\\s*)`, 'gi');

/** Kokoro's phoneme string for `text`: espeak-ng for the words, the lexicon for the names. */
export async function phonemes(text) {
  const t = text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\(/g, '«').replace(/\)/g, '»').replace(/\s+/g, ' ');
  const parts = [];
  let last = 0;
  const flush = async (s) => {
    if (!s) return;
    const core = s.trim();
    const pre = /^\s/.test(s) ? ' ' : '', post = /\s$/.test(s) ? ' ' : '';
    parts.push(core ? pre + (await phonemize(core, 'en-us')).join(' ') + post : ' ');
  };
  for (const m of t.matchAll(TOKENS)) {
    await flush(t.slice(last, m.index));
    if (m[1]) parts.push(LEXICON[m[1].toLowerCase()] + (m[2] ? 'z' : ''));
    else parts.push(m[3]);
    last = m.index + m[0].length;
  }
  await flush(t.slice(last));
  // Kokoro's own clean-up of espeak's output.
  return parts.join('').replace(/ʲ/g, 'j').replace(/r/g, 'ɹ').replace(/x/g, 'k').replace(/ɬ/g, 'l')
    .replace(/(?<=[a-zɹː])(?=hˈʌndɹɪd)/g, ' ').replace(/ z(?=[;:,.!?¡¿—…"«»“” ]|$)/g, 'z')
    .replace(/(?<=nˈaɪn)ti(?!ː)/g, 'di').trim();
}

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
    await speak('Hi.', 'af_heart', 1);
    postMessage({ type: 'ready' });
    return tts;
  })().catch((e) => { loading = null; postMessage({ type: 'error', message: String(e?.message || e) }); throw e; });
  return loading;
}

/** One sentence as audio ({ audio: Float32Array, sampling_rate }). */
async function speak(text, voice, speed) {
  const { input_ids } = tts.tokenizer(await phonemes(text), { truncation: true });
  return tts.generate_from_ids(input_ids, { voice, speed });
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
        await load();
        const list = sentences(m.text);
        for (let i = 0; i < list.length; i++) {
          if (stopped.has(m.id)) break;
          const audio = await speak(list[i], m.voice, m.speed || 1);
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
