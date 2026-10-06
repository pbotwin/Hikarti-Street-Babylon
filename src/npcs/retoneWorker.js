import { retonePixels } from './retonePixels.js';

// Resident texture re-toning off the main thread (it took ~30 ms per resident).
self.onmessage = ({ data: { id, px, th, ts, tv, opts } }) => {
  retonePixels(px, th, ts, tv, opts);
  self.postMessage({ id, px }, [px.buffer]);
};
