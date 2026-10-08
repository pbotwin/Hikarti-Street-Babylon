import { makeAudioSamples } from './audioSamples.js';

// The audio's noise, reverb and engine samples, made off the main thread (see audioSamples.js).
self.onmessage = ({ data: { sr } }) => {
  const s = makeAudioSamples(sr);
  self.postMessage(s, [s.noise, ...s.brown, ...s.impulse, s.engine].map((d) => d.buffer));
};
