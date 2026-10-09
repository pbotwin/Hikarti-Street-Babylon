import { mulberry32 } from '../world/rng.js';
import { FONT } from '../interiors/Labels.js';

/**
 * Pictures for Hikari Mall's sign atlas (MallSigns), drawn lit (`signs.print`)
 * or self-lit (`signs.material`): shelves of goods as seen through a shop
 * window (books, cosmetics, toys, shoes, televisions…), the interiors of
 * the upper floor's shops, machine fronts (gacha, cranes, vending, photo
 * booths), murals, banners and the small printed things (price cards,
 * menus). A shop's shelf is a box with one of these across it: from the
 * concourse it reads as a shelf full of goods for two triangles a bay.
 *
 * Each entry: id → [width, height, painter(g, x, y, w, h), density]
 * (MallSigns' sign list).
 */

function text(g, s, x, y, size, color, weight = 800, align = 'center') {
  g.font = `${weight} ${size}px ${FONT}`;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillText(s, x, y);
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/** Shelf boards across a picture: `rows` bays, each filled by `item(x, y, w, h, rnd)` left to right. */
function shelves(bg, board, rows, item, seed) {
  return (g, x, y, w, h) => {
    const rnd = mulberry32(seed), bh = h / rows;
    g.fillStyle = bg; g.fillRect(x, y, w, h);
    for (let i = 0; i < rows; i++) {
      const top = y + i * bh;
      // Shade toward the back of the bay, under the board above.
      const sh = g.createLinearGradient(0, top, 0, top + bh);
      sh.addColorStop(0, 'rgba(0,0,0,0.35)'); sh.addColorStop(0.25, 'rgba(0,0,0,0.05)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = sh; g.fillRect(x, top, w, bh);
      let cx = x + 3;
      while (cx < x + w - 6) cx += item(g, cx, top + bh * 0.12, x + w - 3 - cx, bh * 0.82, rnd) + 1;
      g.fillStyle = board; g.fillRect(x, top + bh - bh * 0.07, w, bh * 0.07);
    }
  };
}

const BOOK_COLORS = ['#7a2e2e', '#2e4a7a', '#2f6a4a', '#c9a227', '#e0dccf', '#3b3f46', '#a2462f', '#5b3b7a', '#d77a61', '#1f6f8b', '#efe6d0', '#8a6d3b'];
const PASTELS = ['#f6c1d1', '#fbe3b0', '#c9e4f6', '#d8f0c8', '#e6d4f5', '#ffffff', '#f7a9a8', '#ffd6a5'];
const BRIGHT = ['#e2574c', '#f2c230', '#2f6fb3', '#4f9a4a', '#e27c9a', '#f29a2e', '#7a5fb3', '#2a9d8f', '#ffffff'];

function book(g, x, y, w, h, rnd) {
  const bw = Math.min(w, 5 + rnd() * 9), bh = h * (0.7 + rnd() * 0.3);
  g.fillStyle = rnd.pick(BOOK_COLORS); g.fillRect(x, y + h - bh, bw, bh);
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(x + 1, y + h - bh + bh * 0.15, bw - 2, 2);
  g.fillRect(x + 1, y + h - bh * 0.25, bw - 2, 1.5);
  if (rnd() < 0.08) { g.fillStyle = rnd.pick(BOOK_COLORS); g.fillRect(x + bw, y + h - bw * 0.2 - 10, h * 0.6, 10); return bw + h * 0.6; }
  return bw;
}

function bottle(g, x, y, w, h, rnd) {
  const bw = Math.min(w, 6 + rnd() * 8), bh = h * (0.4 + rnd() * 0.45);
  const c = rnd.pick(PASTELS);
  g.fillStyle = c; roundRect(g, x, y + h - bh, bw, bh, 2); g.fill();
  g.fillStyle = rnd() < 0.5 ? '#c9a227' : '#ffffff'; g.fillRect(x + bw * 0.25, y + h - bh - bh * 0.18, bw * 0.5, bh * 0.18);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 1, y + h - bh * 0.6, bw - 2, bh * 0.25);
  return bw + 1;
}

function toy(g, x, y, w, h, rnd) {
  const t = rnd();
  if (t < 0.55) {
    const bw = Math.min(w, 18 + rnd() * 26), bh = h * (0.55 + rnd() * 0.45);
    g.fillStyle = rnd.pick(BRIGHT); g.fillRect(x, y + h - bh, bw, bh);
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(x + bw * 0.15, y + h - bh * 0.85, bw * 0.7, bh * 0.45);
    g.fillStyle = rnd.pick(BRIGHT); g.beginPath(); g.arc(x + bw / 2, y + h - bh * 0.62, Math.min(bw, bh) * 0.16, 0, Math.PI * 2); g.fill();
    return bw;
  }
  // A plush: round body and head with ears.
  const s = Math.min(w, h * (0.5 + rnd() * 0.35)), c = rnd.pick(['#d9a066', '#f6c1d1', '#ffffff', '#c9e4f6', '#f2c230']);
  g.fillStyle = c;
  g.beginPath(); g.arc(x + s / 2, y + h - s * 0.32, s * 0.36, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(x + s / 2, y + h - s * 0.78, s * 0.27, 0, Math.PI * 2); g.fill();
  for (const d of [-1, 1]) { g.beginPath(); g.arc(x + s / 2 + d * s * 0.22, y + h - s, s * 0.1, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#222'; for (const d of [-1, 1]) g.fillRect(x + s / 2 + d * s * 0.09 - 1, y + h - s * 0.8, 2.5, 2.5);
  return s;
}

function shoe(g, x, y, w, h, rnd) {
  const sw = Math.min(w, 34 + rnd() * 10), sh = h * 0.42, b = y + h;
  const c = rnd.pick(['#ffffff', '#222222', '#c0392b', '#2f6fb3', '#e6d4b0', '#7a5fb3', '#4f9a4a', '#f6c1d1', '#8a5a3b']);
  g.fillStyle = c;
  g.beginPath(); g.moveTo(x + 2, b - 3); g.lineTo(x + 2, b - sh); g.quadraticCurveTo(x + sw * 0.35, b - sh * 1.1, x + sw * 0.45, b - sh * 0.55);
  g.quadraticCurveTo(x + sw * 0.9, b - sh * 0.5, x + sw - 1, b - 5); g.lineTo(x + sw - 1, b - 3); g.closePath(); g.fill();
  g.fillStyle = '#f2f0ea'; g.fillRect(x + 2, b - 5, sw - 3, 4);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + sw * 0.18, b - sh * 0.75, sw * 0.22, 2);
  return sw + 6;
}

function goods(g, x, y, w, h, rnd) {
  const t = rnd(), c = rnd.pick(BRIGHT.concat(PASTELS));
  if (t < 0.4) {
    // A bin of small things.
    const bw = Math.min(w, 26 + rnd() * 16), bh = h * 0.5;
    for (let i = 0; i < 14; i++) { g.fillStyle = rnd.pick(BRIGHT.concat(PASTELS)); g.beginPath(); g.arc(x + 4 + rnd() * (bw - 8), y + h - bh + 4 + rnd() * bh * 0.4, 3 + rnd() * 3, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = c; g.fillRect(x, y + h - bh * 0.6, bw, bh * 0.6);
    g.fillStyle = '#fff'; g.fillRect(x + bw * 0.2, y + h - bh * 0.42, bw * 0.6, bh * 0.2);
    return bw + 2;
  }
  if (t < 0.7) {
    const bw = Math.min(w, 8 + rnd() * 10), bh = h * (0.5 + rnd() * 0.4);
    g.fillStyle = c; g.fillRect(x, y + h - bh, bw, bh);
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(x + 1, y + h - bh * 0.7, bw - 2, bh * 0.2);
    return bw + 1;
  }
  // Hanging packs on a hook.
  const bw = Math.min(w, 14 + rnd() * 8), bh = h * 0.55;
  g.fillStyle = '#9a9a9a'; g.fillRect(x + bw / 2 - 1, y, 2, h * 0.2);
  g.fillStyle = c; g.fillRect(x, y + h * 0.18, bw, bh);
  g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillRect(x + 2, y + h * 0.22, bw - 4, bh * 0.35);
  return bw + 3;
}

function bread(g, x, y, w, h, rnd) {
  const bw = Math.min(w, 22 + rnd() * 18), bh = h * (0.3 + rnd() * 0.25);
  const c = rnd.pick(['#c98a4b', '#b8743a', '#dca86a', '#8a5a2b', '#e8c58e']);
  g.fillStyle = c; g.beginPath(); g.ellipse(x + bw / 2, y + h - bh / 2, bw / 2, bh / 2, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,240,210,0.5)'; g.beginPath(); g.ellipse(x + bw / 2, y + h - bh * 0.7, bw * 0.3, bh * 0.15, 0, 0, Math.PI * 2); g.fill();
  return bw + 3;
}

function candy(g, x, y, w, h, rnd) {
  const bw = Math.min(w, 9 + rnd() * 7), bh = h * (0.55 + rnd() * 0.35);
  g.fillStyle = rnd.pick(BRIGHT); g.fillRect(x, y + h - bh, bw, bh);
  g.fillStyle = rnd.pick(['#ffffff', '#f2c230', '#141518']); g.fillRect(x + 1, y + h - bh * 0.62, bw - 2, bh * 0.22);
  return bw + 1;
}

/** A row of flat screens on a dark wall, each showing a bright scene. */
function screens(g, x, y, w, h) {
  const rnd = mulberry32(61);
  g.fillStyle = '#1b1e24'; g.fillRect(x, y, w, h);
  const scenes = [['#4fb3e8', '#2f8f5b'], ['#f29a2e', '#7a2e8a'], ['#f6c1d1', '#2f6fb3'], ['#7bd389', '#1f6f8b'], ['#ffd6a5', '#e2574c']];
  const rows = [[0.06, 0.4, 3], [0.54, 0.38, 4]];
  for (const [ry, rh, n] of rows) {
    const sw = w / n;
    for (let i = 0; i < n; i++) {
      const sx = x + i * sw + sw * 0.06, sy = y + ry * h, ww = sw * 0.88, hh = rh * h;
      g.fillStyle = '#0c0d10'; g.fillRect(sx, sy, ww, hh);
      const [a, b] = scenes[(i + Math.round(ry * 10)) % scenes.length];
      const gr = g.createLinearGradient(sx, sy, sx, sy + hh); gr.addColorStop(0, a); gr.addColorStop(1, b);
      g.fillStyle = gr; g.fillRect(sx + 3, sy + 3, ww - 6, hh - 6);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath(); g.arc(sx + ww * (0.3 + rnd() * 0.4), sy + hh * 0.45, hh * 0.18, 0, Math.PI * 2); g.fill();
    }
  }
}

/** The inside of an upper-floor shop seen through its window: back wall, lights, fixtures in perspective, people-free. */
const room = (wall, floor, accent, kind) => (g, x, y, w, h) => {
  const rnd = mulberry32(kind.length * 31 + 7);
  g.fillStyle = wall; g.fillRect(x, y, w, h);
  g.fillStyle = floor; g.fillRect(x, y + h * 0.72, w, h * 0.28);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  for (let i = 0; i < 6; i++) g.fillRect(x + w * (0.06 + i * 0.16), y + h * 0.04, w * 0.08, h * 0.03);
  g.fillStyle = accent; g.fillRect(x, y + h * 0.12, w, h * 0.06);
  if (kind === 'shelves') {
    for (let i = 0; i < 5; i++) {
      const sx = x + w * (0.04 + i * 0.195), sw = w * 0.17, top = y + h * 0.24;
      g.fillStyle = '#efece6'; g.fillRect(sx, top, sw, h * 0.5);
      for (let k = 0; k < 4; k++) {
        let cx = sx + 2;
        while (cx < sx + sw - 6) { const bw = 4 + rnd() * 8; g.fillStyle = rnd.pick(BRIGHT.concat(PASTELS)); g.fillRect(cx, top + 4 + k * h * 0.12, bw, h * 0.09); cx += bw + 1; }
      }
    }
  } else if (kind === 'racks') {
    for (let i = 0; i < 6; i++) {
      const rx = x + w * (0.05 + i * 0.16), top = y + h * 0.36;
      g.fillStyle = '#9aa0a6'; g.fillRect(rx, top, w * 0.13, 2);
      for (let k = 0; k < 9; k++) { g.fillStyle = rnd.pick(BRIGHT.concat(PASTELS, ['#3b3f46', '#26324a'])); g.fillRect(rx + k * w * 0.0145, top + 2, w * 0.012, h * (0.2 + rnd() * 0.12)); }
    }
  } else if (kind === 'food') {
    // Counters with lit menus along the back, tables and chairs.
    for (let i = 0; i < 4; i++) {
      const sx = x + w * (0.03 + i * 0.245);
      g.fillStyle = rnd.pick(['#e2574c', '#2f8f5b', '#f29a2e', '#2f6fb3']); g.fillRect(sx, y + h * 0.2, w * 0.22, h * 0.1);
      g.fillStyle = '#fff8ee'; g.fillRect(sx + 4, y + h * 0.31, w * 0.22 - 8, h * 0.12);
      for (let k = 0; k < 4; k++) { g.fillStyle = rnd.pick(['#c98a4b', '#f2c230', '#e2574c', '#7bd389']); g.fillRect(sx + 8 + k * w * 0.05, y + h * 0.33, w * 0.035, h * 0.07); }
      g.fillStyle = '#d6b58a'; g.fillRect(sx, y + h * 0.48, w * 0.22, h * 0.2);
    }
    for (let i = 0; i < 7; i++) { g.fillStyle = '#f2f0ea'; g.fillRect(x + w * (0.04 + i * 0.14), y + h * 0.78, w * 0.08, h * 0.04); g.fillStyle = '#6b4a32'; g.fillRect(x + w * (0.075 + i * 0.14), y + h * 0.82, w * 0.01, h * 0.12); }
  } else if (kind === 'cinema') {
    for (let i = 0; i < 6; i++) {
      const px = x + w * (0.04 + i * 0.16), c = rnd.pick(['#1f6f8b', '#7a2e8a', '#c0392b', '#26324a', '#f29a2e', '#2f8f5b']);
      g.fillStyle = '#141518'; g.fillRect(px - 3, y + h * 0.22 - 3, w * 0.12 + 6, h * 0.42 + 6);
      const gr = g.createLinearGradient(px, y + h * 0.22, px, y + h * 0.64); gr.addColorStop(0, c); gr.addColorStop(1, '#141518');
      g.fillStyle = gr; g.fillRect(px, y + h * 0.22, w * 0.12, h * 0.42);
      g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(px + w * 0.015, y + h * 0.56, w * 0.09, h * 0.025);
    }
    g.fillStyle = '#c9a227'; g.fillRect(x + w * 0.3, y + h * 0.68, w * 0.4, h * 0.05);
  }
};

/** Banner art: tall, both sides of a hanging banner. */
const banner = (top, bottom, title, sub, motif) => (g, x, y, w, h) => {
  const gr = g.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, top); gr.addColorStop(1, bottom);
  g.fillStyle = gr; g.fillRect(x, y, w, h);
  motif(g, x, y, w, h);
  g.save(); g.translate(x + w / 2, y + h * 0.66); g.rotate(-Math.PI / 2);
  text(g, title, 0, 0, w * 0.34, '#fff8ee', 900);
  g.restore();
  text(g, sub, x + w / 2, y + h * 0.93, w * 0.12, '#fff8ee', 800);
};

function maple(g, cx, cy, r, color) {
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath(); g.fill();
  g.fillRect(cx - r * 0.05, cy, r * 0.1, r * 0.8);
}

function pumpkin(g, cx, cy, r) {
  g.fillStyle = '#e8892f';
  for (const d of [-0.45, 0, 0.45]) { g.beginPath(); g.ellipse(cx + d * r, cy, r * 0.55, r * 0.75, 0, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#4f6b2c'; g.fillRect(cx - r * 0.08, cy - r * 0.95, r * 0.16, r * 0.3);
  g.fillStyle = '#2a1a0a';
  for (const d of [-1, 1]) { g.beginPath(); g.moveTo(cx + d * r * 0.35, cy - r * 0.25); g.lineTo(cx + d * r * 0.15, cy); g.lineTo(cx + d * r * 0.5, cy); g.fill(); }
  g.beginPath(); g.moveTo(cx - r * 0.45, cy + r * 0.2); g.lineTo(cx + r * 0.45, cy + r * 0.2); g.lineTo(cx, cy + r * 0.45); g.fill();
}

/** A price card: yellow with a red price, as clipped to shelf edges. */
const card = (price, bg = '#f6d24a', fg = '#c0392b') => (g, x, y, w, h) => {
  g.fillStyle = bg; g.fillRect(x, y, w, h);
  g.fillStyle = fg; g.fillRect(x, y, w, h * 0.22);
  text(g, '特価', x + w / 2, y + h * 0.11, h * 0.16, '#fff', 900);
  text(g, price, x + w / 2, y + h * 0.6, h * 0.42, fg, 900);
};

export function pictures() {
  return {
    // ---------------------------------------------------------------- shelves of goods (lit)
    shelfBooks: [160, 160, shelves('#5b4632', '#8a6a48', 5, book, 3), 2],
    shelfCosmetics: [160, 160, shelves('#fbf6f4', '#e9dfe0', 5, bottle, 5), 2],
    shelfToys: [160, 160, shelves('#eef2f7', '#d8dde4', 4, toy, 7), 2],
    shelfShoes: [160, 160, shelves('#f4efe8', '#d6cfc4', 4, shoe, 9), 2],
    shelfHyaku: [160, 160, shelves('#f7f4ee', '#e2574c', 5, goods, 11), 2],
    breadRack: [192, 96, shelves('#6b4a32', '#8a6a48', 3, bread, 13), 1.5],
    candy: [192, 96, shelves('#f2f0ea', '#d0ccc4', 3, candy, 15)],
    screens: [320, 160, screens, 1.5],
    // ---------------------------------------------------------------- machine fronts and kiosks
    gacha: [96, 144, (g, x, y, w, h) => {
      const rnd = mulberry32(19);
      g.fillStyle = '#f4f3ee'; g.fillRect(x, y, w, h);
      g.fillStyle = '#1b1e24'; g.fillRect(x + w * 0.1, y + h * 0.06, w * 0.8, h * 0.46);
      for (let i = 0; i < 26; i++) {
        const cx = x + w * (0.18 + rnd() * 0.64), cy = y + h * (0.22 + rnd() * 0.28), c = rnd.pick(BRIGHT);
        g.fillStyle = c; g.beginPath(); g.arc(cx, cy, w * 0.07, Math.PI, 0); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(cx, cy, w * 0.07, 0, Math.PI); g.fill();
      }
      g.fillStyle = rnd.pick(BRIGHT); g.fillRect(x + w * 0.1, y + h * 0.55, w * 0.8, h * 0.16);
      text(g, '¥300', x + w / 2, y + h * 0.63, h * 0.08, '#fff', 900);
      g.fillStyle = '#9aa0a6'; g.beginPath(); g.arc(x + w / 2, y + h * 0.8, w * 0.12, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#26324a'; g.fillRect(x + w * 0.3, y + h * 0.92, w * 0.4, h * 0.05);
    }],
    crane: [96, 192, (g, x, y, w, h) => {
      const rnd = mulberry32(23);
      g.fillStyle = '#26324a'; g.fillRect(x, y, w, h);
      g.fillStyle = '#e8f4ff'; g.fillRect(x + w * 0.06, y + h * 0.1, w * 0.88, h * 0.5);
      g.fillStyle = '#9aa0a6'; g.fillRect(x + w * 0.48, y + h * 0.1, 3, h * 0.16);
      for (let i = 0; i < 3; i++) g.fillRect(x + w * (0.4 + i * 0.07), y + h * 0.26, 3, h * 0.06);
      for (let i = 0; i < 8; i++) toy(g, x + w * (0.08 + (i % 4) * 0.21), y + h * (0.4 + Math.floor(i / 4) * 0.09), w * 0.2, h * 0.11, rnd);
      g.fillStyle = '#e27c9a'; g.fillRect(x, y, w, h * 0.09);
      text(g, 'UFO', x + w / 2, y + h * 0.045, h * 0.06, '#fff', 900);
      g.fillStyle = '#f2c230'; g.fillRect(x + w * 0.1, y + h * 0.66, w * 0.8, h * 0.08);
      g.fillStyle = '#e2574c'; g.beginPath(); g.arc(x + w * 0.35, y + h * 0.8, w * 0.07, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2f6fb3'; g.beginPath(); g.arc(x + w * 0.62, y + h * 0.8, w * 0.07, 0, Math.PI * 2); g.fill();
    }, 1.5],
    rhythm: [96, 192, (g, x, y, w, h) => {
      g.fillStyle = '#141518'; g.fillRect(x, y, w, h);
      const gr = g.createLinearGradient(x, y + h * 0.1, x, y + h * 0.5); gr.addColorStop(0, '#7a2e8a'); gr.addColorStop(1, '#1f6f8b');
      g.fillStyle = gr; g.fillRect(x + w * 0.08, y + h * 0.1, w * 0.84, h * 0.4);
      for (let i = 0; i < 6; i++) { g.fillStyle = BRIGHT[i]; g.beginPath(); g.arc(x + w * (0.2 + (i % 3) * 0.3), y + h * (0.62 + Math.floor(i / 3) * 0.12), w * 0.09, 0, Math.PI * 2); g.fill(); }
      text(g, 'DANCE!', x + w / 2, y + h * 0.05, h * 0.06, '#f6c1d1', 900);
    }, 1.5],
    vending: [96, 192, (g, x, y, w, h) => {
      const rnd = mulberry32(29);
      g.fillStyle = '#d9e6f2'; g.fillRect(x, y, w, h);
      g.fillStyle = '#1b1e24'; g.fillRect(x + w * 0.06, y + h * 0.05, w * 0.88, h * 0.5);
      for (let r = 0; r < 4; r++) for (let i = 0; i < 6; i++) {
        const cx = x + w * (0.12 + i * 0.135), cy = y + h * (0.08 + r * 0.12);
        g.fillStyle = rnd.pick(BRIGHT); roundRect(g, cx, cy, w * 0.09, h * 0.08, 2); g.fill();
        g.fillStyle = '#e2574c'; g.fillRect(cx, cy + h * 0.09, w * 0.09, 2);
      }
      g.fillStyle = '#2f6fb3'; g.fillRect(x, y + h * 0.58, w, h * 0.1);
      text(g, 'Drinks', x + w / 2, y + h * 0.63, h * 0.05, '#fff', 900);
      g.fillStyle = '#1b1e24'; g.fillRect(x + w * 0.15, y + h * 0.82, w * 0.7, h * 0.09);
    }, 1.5],
    purikura: [128, 192, (g, x, y, w, h) => {
      const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, '#f6c1d1'); gr.addColorStop(1, '#c9b2ec');
      g.fillStyle = gr; g.fillRect(x, y, w, h);
      for (let i = 0; i < 2; i++) {
        const cx = x + w * (0.33 + i * 0.34), cy = y + h * 0.42;
        g.fillStyle = '#ffe9dc'; g.beginPath(); g.ellipse(cx, cy, w * 0.13, h * 0.1, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = i ? '#3a2430' : '#8a5a3b'; g.beginPath(); g.ellipse(cx, cy - h * 0.05, w * 0.15, h * 0.09, 0, Math.PI, 0); g.fill();
        g.fillRect(cx - w * 0.15, cy - h * 0.05, w * 0.05, h * 0.16); g.fillRect(cx + w * 0.1, cy - h * 0.05, w * 0.05, h * 0.16);
        g.fillStyle = '#222'; g.beginPath(); g.arc(cx - w * 0.045, cy, w * 0.018, 0, Math.PI * 2); g.arc(cx + w * 0.045, cy, w * 0.018, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#e27c9a'; g.beginPath(); g.arc(cx, cy + h * 0.04, w * 0.02, 0, Math.PI); g.fill();
      }
      for (let i = 0; i < 12; i++) { g.fillStyle = 'rgba(255,255,255,0.8)'; const sx = x + w * ((i * 37) % 100) / 100, sy = y + h * ((i * 53) % 100) / 100; g.fillRect(sx, sy, 4, 4); }
      text(g, 'PURI ♡', x + w / 2, y + h * 0.13, w * 0.17, '#ffffff', 900);
      text(g, 'プリクラ', x + w / 2, y + h * 0.72, w * 0.13, '#7a2e8a', 900);
      text(g, '¥500', x + w / 2, y + h * 0.86, w * 0.1, '#7a2e8a', 900);
    }, 2],
    // ---------------------------------------------------------------- food
    ramenMenu: [384, 96, (g, x, y, w, h) => {
      g.fillStyle = '#2a1a12'; g.fillRect(x, y, w, h);
      const items = [['醤油', '¥780', '#c98a4b'], ['味噌', '¥850', '#d99a2b'], ['豚骨', '¥880', '#efe6d0'], ['塩', '¥780', '#f2e2b0'], ['餃子', '¥380', '#e8c58e']];
      items.forEach(([n, p, c], i) => {
        const cx = x + w * (0.1 + i * 0.2);
        g.fillStyle = '#141518'; g.beginPath(); g.ellipse(cx, y + h * 0.42, w * 0.07, h * 0.26, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = c; g.beginPath(); g.ellipse(cx, y + h * 0.42, w * 0.058, h * 0.2, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#f2c230'; g.fillRect(cx - w * 0.02, y + h * 0.3, w * 0.025, h * 0.08);
        g.fillStyle = '#4f9a4a'; g.fillRect(cx + w * 0.01, y + h * 0.42, w * 0.02, h * 0.05);
        text(g, `${n} ${p}`, cx, y + h * 0.84, h * 0.17, '#fff8ee', 800);
      });
    }, 2],
    samples: [192, 96, (g, x, y, w, h) => {
      const rnd = mulberry32(37);
      g.fillStyle = '#efe6d0'; g.fillRect(x, y, w, h);
      for (let i = 0; i < 6; i++) {
        const cx = x + w * (0.1 + (i % 3) * 0.4) * 0.95, cy = y + h * (0.32 + Math.floor(i / 3) * 0.42);
        g.fillStyle = rnd.pick(['#141518', '#ffffff', '#7a2e2e']); g.beginPath(); g.ellipse(cx + w * 0.08, cy, w * 0.1, h * 0.13, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = rnd.pick(['#c98a4b', '#f2c230', '#e8c58e', '#e2574c']); g.beginPath(); g.ellipse(cx + w * 0.08, cy - 2, w * 0.08, h * 0.09, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#c0392b'; g.fillRect(cx + w * 0.02, cy + h * 0.15, w * 0.12, h * 0.07);
      }
    }],
    pastry: [192, 96, shelves('#f7efe2', '#c9b79c', 2, (g, x, y, w, h, rnd) => {
      const bw = Math.min(w, 20 + rnd() * 10), c = rnd.pick(['#f6c1d1', '#c98a4b', '#ffffff', '#7a2e2e', '#f2c230', '#e8c58e']);
      g.fillStyle = c; g.beginPath(); g.ellipse(x + bw / 2, y + h * 0.7, bw / 2 - 1, h * 0.26, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x + bw * 0.3, y + h * 0.55, bw * 0.4, 2);
      return bw + 2;
    }, 41), 1.5],
    cafeMenu: [192, 96, (g, x, y, w, h) => {
      g.fillStyle = '#2b2b2b'; g.fillRect(x, y, w, h);
      text(g, 'CAFÉ MENU', x + w / 2, y + h * 0.14, h * 0.13, '#f6c1d1', 900);
      const rows = [['Sakura Latte', '480'], ['Melon Pan', '220'], ['Matcha Roll', '380'], ['Strawberry Shortcake', '450']];
      rows.forEach(([n, p], i) => { text(g, n, x + w * 0.08, y + h * (0.36 + i * 0.17), h * 0.1, '#fff8ee', 700, 'left'); text(g, `¥${p}`, x + w * 0.92, y + h * (0.36 + i * 0.17), h * 0.1, '#fff8ee', 700, 'right'); });
    }, 1.5],
    // ---------------------------------------------------------------- upper-floor interiors (self-lit, behind glass)
    roomShelves: [256, 128, room('#f2efe9', '#d8d1c6', '#2f6fb3', 'shelves'), 1.5],
    roomRacks: [256, 128, room('#f6f1ec', '#cdb89a', '#e27c9a', 'racks'), 1.5],
    roomFood: [256, 128, room('#efe6d8', '#bfae96', '#e2574c', 'food'), 1.5],
    roomCinema: [256, 128, room('#2b2530', '#4a3a42', '#c9a227', 'cinema'), 1.5],
    // ---------------------------------------------------------------- murals, banners, decoration
    muralProduce: [384, 120, (g, x, y, w, h) => {
      const rnd = mulberry32(43);
      const gr = g.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, '#bfe3a6'); gr.addColorStop(1, '#6fae5a');
      g.fillStyle = gr; g.fillRect(x, y, w, h);
      for (let i = 0; i < 40; i++) {
        const cx = x + rnd() * w, cy = y + h * (0.55 + rnd() * 0.4), r = h * (0.06 + rnd() * 0.08);
        g.fillStyle = rnd.pick(['#e2574c', '#f29a2e', '#f2c230', '#7bd389', '#7a2e8a', '#c0392b']);
        g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      }
      text(g, '旬の野菜と果物', x + w / 2, y + h * 0.26, h * 0.24, '#ffffff', 900);
    }, 1.5],
    muralBakery: [384, 120, (g, x, y, w, h) => {
      const rnd = mulberry32(47);
      g.fillStyle = '#8a5a2b'; g.fillRect(x, y, w, h);
      for (let i = 0; i < 26; i++) bread(g, x + rnd() * (w - 40), y + h * 0.5, 40, h * 0.45, rnd);
      text(g, '焼きたてパン', x + w / 2, y + h * 0.26, h * 0.24, '#fff3dc', 900);
    }, 1.5],
    autumn: [96, 256, banner('#c0392b', '#e8892f', 'AUTUMN FAIR', '秋の大感謝祭', (g, x, y, w, h) => {
      const rnd = mulberry32(53);
      for (let i = 0; i < 9; i++) maple(g, x + rnd() * w, y + rnd() * h * 0.4, w * (0.08 + rnd() * 0.08), rnd.pick(['#f2c230', '#fff1d6', '#7a2e2e']));
    }), 2],
    halloween: [96, 256, banner('#3a2459', '#e8892f', 'HALLOWEEN', '10.31 イベント', (g, x, y, w, h) => {
      pumpkin(g, x + w * 0.5, y + h * 0.15, w * 0.24);
      g.fillStyle = '#fff8ee'; for (let i = 0; i < 6; i++) g.fillRect(x + w * (0.1 + i * 0.15), y + h * 0.3, 3, 3);
    }), 2],
    sakuraWeek: [96, 256, banner('#f6c1d1', '#e27c9a', 'POINT x5', 'ポイント5倍デー', (g, x, y, w, h) => {
      g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath(); g.arc(x + w / 2, y + h * 0.17, w * 0.3, 0, Math.PI * 2); g.fill();
      text(g, '5', x + w / 2, y + h * 0.17, w * 0.4, '#e27c9a', 900);
    }), 2],
    harvest: [384, 96, (g, x, y, w, h) => {
      g.fillStyle = '#e8892f'; g.fillRect(x, y, w, h);
      for (let i = 0; i < 8; i++) maple(g, x + w * (0.05 + i * 0.13), y + h * 0.82, h * 0.13, i % 2 ? '#c0392b' : '#f2c230');
      text(g, '秋の味覚フェア', x + w / 2, y + h * 0.36, h * 0.36, '#fff8ee', 900);
    }, 1.5],
    tokubai: [192, 72, (g, x, y, w, h) => {
      g.fillStyle = '#e2574c'; g.fillRect(x, y, w, h);
      g.fillStyle = '#f6d24a'; g.fillRect(x, y + h * 0.82, w, h * 0.18);
      text(g, '本日の特売', x + w / 2, y + h * 0.42, h * 0.48, '#ffffff', 900);
    }],
    price198: [64, 88, card('¥198')],
    price98: [64, 88, card('¥98')],
    price298: [64, 88, card('¥298', '#ffffff', '#e2574c')],
    newItem: [64, 88, card('NEW', '#2f6fb3', '#ffffff'), 1.5],
    fashionPoster: [160, 240, (g, x, y, w, h) => {
      const gr = g.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, '#efe0d0'); gr.addColorStop(1, '#c9a98a');
      g.fillStyle = gr; g.fillRect(x, y, w, h);
      // A figure in a long coat, faceless (a fashion photo from afar).
      g.fillStyle = '#3a2430'; g.beginPath(); g.ellipse(x + w / 2, y + h * 0.17, w * 0.09, h * 0.07, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffe9dc'; g.beginPath(); g.ellipse(x + w / 2, y + h * 0.2, w * 0.065, h * 0.05, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#8a3b2e'; g.beginPath(); g.moveTo(x + w * 0.38, y + h * 0.28); g.lineTo(x + w * 0.62, y + h * 0.28); g.lineTo(x + w * 0.7, y + h * 0.78); g.lineTo(x + w * 0.3, y + h * 0.78); g.closePath(); g.fill();
      g.fillStyle = '#26324a'; g.fillRect(x + w * 0.42, y + h * 0.78, w * 0.06, h * 0.12); g.fillRect(x + w * 0.52, y + h * 0.78, w * 0.06, h * 0.12);
      text(g, 'AUTUMN', x + w / 2, y + h * 0.06, w * 0.16, '#3a2430', 900);
      text(g, 'COLLECTION', x + w / 2, y + h * 0.95, w * 0.1, '#3a2430', 800);
    }],
    adScreen: [256, 144, (g, x, y, w, h) => {
      const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, '#1f6f8b'); gr.addColorStop(1, '#7a2e8a');
      g.fillStyle = gr; g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(255,255,255,0.18)'; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(x + w * (0.15 + i * 0.18), y + h * 0.7, h * (0.1 + i * 0.03), 0, Math.PI * 2); g.fill(); }
      text(g, 'HIKARI CINEMA', x + w / 2, y + h * 0.3, h * 0.13, '#ffffff', 900);
      text(g, 'NOW SHOWING · 3F', x + w / 2, y + h * 0.5, h * 0.08, '#f6c1d1', 800);
    }, 2],
  };
}
