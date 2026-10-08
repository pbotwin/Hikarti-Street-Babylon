import { FASHION_BRANDS } from './MallCatalog.js';
import { FONT } from '../interiors/Labels.js';

/**
 * The clothing labels' artwork, as plain 2D canvas painters: each brand's
 * logo (LOGOS, for hang tags, price cards, bags and signs) and the prints
 * on the clothes (PRINTS, by the catalog's style.print: chest graphics, the
 * sneakers' side mark, the jeans' leather patch). Painted once into the
 * store's atlases (GarmentPrint, FashionPrint); nothing here touches the GPU.
 *
 * Painters draw centred on (x, y) in a w × h box, in the caller's units.
 */

const TAU = Math.PI * 2;
const SERIF = `'Cormorant Garamond', Georgia, 'Times New Roman', serif`;
const SCRIPT = `'Caveat', 'Segoe Script', 'Brush Script MT', cursive`;
const SERIF_JP = `'Noto Serif JP', 'Hiragino Mincho ProN', 'Yu Mincho', serif`;

/** Set a font, shrinking from `size` until `text` fits `w`; returns the size used. */
export function fitFont(g, text, w, size, weight, family = FONT, style = '') {
  g.font = `${style} ${weight} ${size}px ${family}`;
  const m = g.measureText(text).width;
  if (m > w) { size *= w / m; g.font = `${style} ${weight} ${size}px ${family}`; }
  return size;
}

function text(g, t, x, y, w, size, weight, family, fill, style = '') {
  g.fillStyle = fill;
  fitFont(g, t, w, size, weight, family, style);
  g.fillText(t, x, y);
}

function blossom(g, x, y, r, petal, centre) {
  g.fillStyle = petal;
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU - Math.PI / 2;
    g.beginPath(); g.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.48, 0, TAU); g.fill();
  }
  g.fillStyle = centre; g.beginPath(); g.arc(x, y, r * 0.25, 0, TAU); g.fill();
}

function star(g, x, y, r, fill, points = 5, inner = 0.45) {
  g.fillStyle = fill;
  g.beginPath();
  for (let k = 0; k < points * 2; k++) {
    const a = (k / (points * 2)) * TAU - Math.PI / 2, rr = k % 2 ? r * inner : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath(); g.fill();
}

function wave(g, x, y, w, h, fill) {
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(x - w / 2, y + h / 2);
  g.bezierCurveTo(x - w * 0.3, y - h * 0.6, x + w * 0.05, y - h * 0.7, x + w * 0.2, y - h * 0.1);
  g.bezierCurveTo(x + w * 0.05, y - h * 0.3, x - w * 0.05, y + h * 0.1, x + w * 0.12, y + h * 0.2);
  g.bezierCurveTo(x + w * 0.3, y + h * 0.3, x + w * 0.45, y + h * 0.1, x + w / 2, y + h / 2);
  g.closePath(); g.fill();
}

function leaf(g, x, y, len, a, fill) {
  g.save(); g.translate(x, y); g.rotate(a);
  g.fillStyle = fill;
  g.beginPath(); g.moveTo(0, 0);
  g.quadraticCurveTo(len * 0.5, -len * 0.35, len, 0); g.quadraticCurveTo(len * 0.5, len * 0.35, 0, 0);
  g.fill();
  g.restore();
}

function swallow(g, x, y, s, fill) {
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(x - s * 0.5, y - s * 0.1);
  g.quadraticCurveTo(x - s * 0.1, y - s * 0.05, x, y + s * 0.05);
  g.quadraticCurveTo(x + s * 0.2, y - s * 0.35, x + s * 0.5, y - s * 0.4);
  g.quadraticCurveTo(x + s * 0.25, y - s * 0.1, x + s * 0.15, y + s * 0.15);
  g.lineTo(x + s * 0.35, y + s * 0.45); g.lineTo(x + s * 0.05, y + s * 0.2);
  g.quadraticCurveTo(x - s * 0.15, y + s * 0.15, x - s * 0.5, y - s * 0.1);
  g.fill();
}

/** Three wind strokes (Kaze's mark). */
function wind(g, x, y, w, h, fill) {
  g.fillStyle = fill;
  for (let k = 0; k < 3; k++) {
    const yy = y - h * 0.3 + k * h * 0.3, x0 = x - w / 2 + k * w * 0.08;
    g.beginPath();
    g.moveTo(x0, yy + h * 0.06);
    g.quadraticCurveTo(x0 + w * 0.6, yy + h * 0.12, x + w / 2, yy - h * 0.12);
    g.quadraticCurveTo(x0 + w * 0.6, yy + h * 0.02, x0, yy - h * 0.06);
    g.closePath(); g.fill();
  }
}

/** Each label's logo in `ink` (null: its own colour), fitted to w × h. */
export const LOGOS = {
  'Sakura Style'(g, x, y, w, h, ink) {
    const c = ink || FASHION_BRANDS['Sakura Style'].ink;
    blossom(g, x - w * 0.38, y, h * 0.4, c, '#f7d36b');
    g.textAlign = 'left'; g.textBaseline = 'middle';
    text(g, 'Sakura Style', x - w * 0.24, y - h * 0.06, w * 0.72, h * 0.62, 700, SERIF, c, 'italic');
    text(g, 'HIKARI MALL', x - w * 0.23, y + h * 0.36, w * 0.5, h * 0.18, 700, FONT, c);
    g.textAlign = 'center';
  },
  'Nami Surf Co.'(g, x, y, w, h, ink) {
    const c = ink || FASHION_BRANDS['Nami Surf Co.'].ink;
    wave(g, x - w * 0.36, y, h * 0.8, h * 0.7, c);
    g.textAlign = 'left'; g.textBaseline = 'middle';
    text(g, 'NAMI', x - w * 0.18, y - h * 0.12, w * 0.6, h * 0.62, 800, FONT, c);
    text(g, 'SURF CO.', x - w * 0.17, y + h * 0.36, w * 0.5, h * 0.22, 700, FONT, c);
    g.textAlign = 'center';
  },
  'Hoshi Athletic'(g, x, y, w, h, ink) {
    const c = ink || FASHION_BRANDS['Hoshi Athletic'].ink;
    star(g, x - w * 0.36, y, h * 0.45, c);
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.save(); g.translate(x - w * 0.2, y); g.transform(1, 0, -0.2, 1, 0, 0);
    text(g, 'HOSHI', 0, -h * 0.1, w * 0.62, h * 0.66, 800, FONT, c);
    text(g, 'ATHLETIC', 0, h * 0.36, w * 0.5, h * 0.2, 800, FONT, c);
    g.restore();
    g.textAlign = 'center';
  },
  'Mori & Co.'(g, x, y, w, h, ink) {
    const c = ink || FASHION_BRANDS['Mori & Co.'].ink;
    leaf(g, x - w * 0.45, y + h * 0.2, h * 0.7, -1.0, c);
    leaf(g, x - w * 0.38, y + h * 0.2, h * 0.5, -0.4, c);
    g.textAlign = 'left'; g.textBaseline = 'middle';
    text(g, 'MORI & Co.', x - w * 0.24, y, w * 0.72, h * 0.55, 700, SERIF, c);
    g.textAlign = 'center';
  },
  'Kumo Records'(g, x, y, w, h, ink) {
    const c = ink || FASHION_BRANDS['Kumo Records'].ink;
    g.fillStyle = c; g.beginPath(); g.arc(x - w * 0.36, y, h * 0.42, 0, TAU); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x - w * 0.36, y, h * 0.12, 0, TAU); g.fill();
    g.textAlign = 'left'; g.textBaseline = 'middle';
    text(g, 'KUMO', x - w * 0.18, y - h * 0.12, w * 0.6, h * 0.58, 800, FONT, c);
    text(g, 'RECORDS', x - w * 0.17, y + h * 0.34, w * 0.5, h * 0.2, 700, FONT, c);
    g.textAlign = 'center';
  },
  'Tsubame Denim'(g, x, y, w, h, ink) {
    const c = ink || FASHION_BRANDS['Tsubame Denim'].ink;
    swallow(g, x - w * 0.34, y, h * 0.9, c);
    g.textAlign = 'left'; g.textBaseline = 'middle';
    text(g, 'TSUBAME', x - w * 0.16, y - h * 0.1, w * 0.64, h * 0.5, 700, SERIF, c);
    text(g, 'DENIM · 1962', x - w * 0.15, y + h * 0.32, w * 0.5, h * 0.2, 700, FONT, c);
    g.textAlign = 'center';
  },
  Kaze(g, x, y, w, h, ink) {
    const c = ink || FASHION_BRANDS.Kaze.ink;
    wind(g, x - w * 0.28, y, w * 0.4, h * 0.9, c);
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.save(); g.translate(x + w * 0.0, y); g.transform(1, 0, -0.25, 1, 0, 0);
    text(g, 'KAZE', 0, 0, w * 0.5, h * 0.75, 800, FONT, c);
    g.restore();
    g.textAlign = 'center';
  },
};

/** A brand's logo (unknown labels: their name). */
export function logo(g, brand, x, y, w, h, ink = null) {
  if (LOGOS[brand]) { LOGOS[brand](g, x, y, w, h, ink); return; }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  text(g, brand, x, y, w, h * 0.6, 700, FONT, ink || '#26262b');
}

/** Distressed ink: knock specks out of what was just printed (screen-printed look). */
function distress(g, x, y, w, h, n) {
  g.save();
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = 'rgba(0,0,0,0.55)';
  let s = 7;
  for (let i = 0; i < n; i++) {
    s = (s * 16807) % 2147483647;
    const px = x + (s % 1000) / 1000 * w; s = (s * 16807) % 2147483647;
    const py = y + (s % 1000) / 1000 * h;
    g.fillRect(px, py, 1 + (s % 3), 1 + (s % 2));
  }
  g.restore();
}

/**
 * Prints, painted on a transparent w × h box that covers the garment's
 * printable side (a top's front from the shoulders down to the hem, a
 * shoe's side, the jeans' waistband): each draws where it sits on it.
 */
export const PRINTS = {
  surf(g, w, h) {                         // a sunset and waves across the chest
    const cx = w / 2, cy = h * 0.32, r = w * 0.2;
    const grd = g.createLinearGradient(0, cy - r, 0, cy + r);
    grd.addColorStop(0, '#f7c84a'); grd.addColorStop(0.5, '#f28a4a'); grd.addColorStop(1, '#e2557c');
    g.save(); g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.clip();
    g.fillStyle = grd; g.fillRect(cx - r, cy - r, r * 2, r * 2);
    g.fillStyle = '#1f5f8b';
    for (let k = 0; k < 4; k++) g.fillRect(cx - r, cy + r * (0.15 + k * 0.22), r * 2, r * 0.1);
    wave(g, cx - r * 0.2, cy + r * 0.55, r * 1.4, r * 0.9, '#1f5f8b');
    g.restore();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    text(g, 'NAMI SURF CO.', cx, cy + r * 1.3, w * 0.62, w * 0.075, 800, FONT, '#1f5f8b');
    text(g, 'CHIGASAKI · EST. 1974', cx, cy + r * 1.62, w * 0.5, w * 0.035, 700, FONT, '#1f5f8b');
    distress(g, cx - r * 1.6, cy - r, r * 3.2, r * 3, 260);
  },
  chestStar(g, w, h) {                    // a small chest logo, left side as worn
    star(g, w * 0.66, h * 0.24, w * 0.05, '#c8202c');
    g.textAlign = 'center'; g.textBaseline = 'middle';
    text(g, 'HOSHI', w * 0.66, h * 0.31, w * 0.16, w * 0.04, 800, FONT, '#1d1d1f');
  },
  botanical(g, w, h) {                    // pressed leaves and a serif caption
    const cx = w / 2, cy = h * 0.34;
    g.strokeStyle = '#3d5a3a'; g.lineWidth = w * 0.006;
    g.beginPath(); g.moveTo(cx, cy + w * 0.2); g.quadraticCurveTo(cx - w * 0.03, cy, cx + w * 0.02, cy - w * 0.2); g.stroke();
    for (let k = 0; k < 6; k++) {
      const t = k / 6, yy = cy + w * 0.17 - t * w * 0.34, s = k % 2 ? 1 : -1;
      leaf(g, cx + w * 0.005, yy, w * (0.1 - t * 0.04), s > 0 ? -0.5 : Math.PI + 0.5, k % 3 ? '#4a6a3a' : '#2f4a2a');
    }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    text(g, 'Mori & Co.', cx, cy + w * 0.27, w * 0.4, w * 0.06, 600, SERIF, '#2f4a2a', 'italic');
    text(g, 'FOREST SUPPLY · 森', cx, cy + w * 0.33, w * 0.4, w * 0.028, 700, FONT, '#2f4a2a');
  },
  records(g, w, h) {                      // a band-tee: vinyl, cloud, tour dates
    const cx = w / 2, cy = h * 0.33, r = w * 0.17;
    g.fillStyle = '#e8e4da'; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
    g.strokeStyle = '#2a2a2e'; g.lineWidth = w * 0.004;
    for (let k = 1; k < 6; k++) { g.beginPath(); g.arc(cx, cy, r * (0.35 + k * 0.11), 0, TAU); g.stroke(); }
    g.fillStyle = '#e2557c'; g.beginPath(); g.arc(cx, cy, r * 0.3, 0, TAU); g.fill();
    g.fillStyle = '#2a2a2e'; g.beginPath(); g.arc(cx, cy, r * 0.05, 0, TAU); g.fill();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    text(g, 'KUMO RECORDS', cx, cy - r * 1.35, w * 0.6, w * 0.08, 800, FONT, '#e8e4da');
    text(g, 'TOKYO  ·  OSAKA  ·  SAPPORO', cx, cy + r * 1.3, w * 0.55, w * 0.032, 700, FONT, '#e8e4da');
    text(g, 'クモ・レコード', cx, cy + r * 1.6, w * 0.4, w * 0.04, 700, FONT, '#e2557c');
    distress(g, cx - r * 1.8, cy - r * 1.6, r * 3.6, r * 3.4, 320);
  },
  chestSakura(g, w, h) {                  // the house blossom, small on the chest
    blossom(g, w * 0.66, h * 0.24, w * 0.045, '#b8486a', '#f7d36b');
    g.textAlign = 'center'; g.textBaseline = 'middle';
    text(g, 'Sakura Style', w * 0.66, h * 0.305, w * 0.2, w * 0.035, 700, SERIF, '#b8486a', 'italic');
  },
  college(g, w, h) {                      // arched college letters
    const cx = w / 2, cy = h * 0.42, R = w * 0.32;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const word = 'HOSHI', n = word.length;
    g.font = `800 ${w * 0.11}px ${FONT}`;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.24;
      g.save(); g.translate(cx + Math.cos(a) * R, cy + R * 0.2 + Math.sin(a) * R); g.rotate(a + Math.PI / 2);
      g.lineJoin = 'round'; g.strokeStyle = '#ffffff'; g.lineWidth = w * 0.02; g.strokeText(word[i], 0, 0);
      g.fillStyle = '#2c3a5c'; g.fillText(word[i], 0, 0);
      g.restore();
    }
    text(g, 'ATHLETIC DEPT.', cx, cy + w * 0.02, w * 0.4, w * 0.045, 800, FONT, '#2c3a5c');
    text(g, '19', cx - w * 0.17, cy + w * 0.11, w * 0.1, w * 0.07, 800, FONT, '#c8202c');
    text(g, '87', cx + w * 0.17, cy + w * 0.11, w * 0.1, w * 0.07, 800, FONT, '#c8202c');
    star(g, cx, cy + w * 0.11, w * 0.04, '#c8202c');
  },
  bigStar(g, w, h) {                      // a big chest logo
    star(g, w / 2, h * 0.3, w * 0.12, '#f4f4f6');
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.save(); g.translate(w / 2, h * 0.43); g.transform(1, 0, -0.2, 1, 0, 0);
    text(g, 'HOSHI', 0, 0, w * 0.5, w * 0.12, 800, FONT, '#f4f4f6');
    g.restore();
    text(g, 'ATHLETIC', w / 2, h * 0.49, w * 0.3, w * 0.04, 800, FONT, '#c8202c');
  },
  sunday(g, w, h) {                       // embroidered script
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.save(); g.translate(w / 2, h * 0.3); g.rotate(-0.08);
    text(g, 'Sunday Morning', 0, 0, w * 0.55, w * 0.1, 700, SCRIPT, '#f6f1e6');
    g.restore();
    text(g, '— Mori & Co. —', w / 2, h * 0.37, w * 0.3, w * 0.03, 600, SERIF, '#f6f1e6');
  },
  kaze(g, w, h) {                         // the sneakers' side: wind strokes along the quarter, the name on the heel
    wind(g, w * 0.48, h * 0.5, w * 0.42, h * 0.42, '#ffffff');
    g.save(); g.translate(w * 0.13, h * 0.42); g.rotate(-Math.PI / 2);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    text(g, 'KAZE', 0, 0, h * 0.3, w * 0.05, 800, FONT, '#ffffff');
    g.restore();
  },
  patch(g, w, h) {                        // the jeans' leather patch at the waistband (right of the fold)
    const x = w * 0.66, y = h * 0.035, pw = w * 0.22, ph = h * 0.075;
    g.fillStyle = '#b8864a'; g.fillRect(x, y, pw, ph);
    g.strokeStyle = '#7a5226'; g.lineWidth = w * 0.004; g.setLineDash([w * 0.006, w * 0.004]);
    g.strokeRect(x + pw * 0.05, y + ph * 0.08, pw * 0.9, ph * 0.84); g.setLineDash([]);
    swallow(g, x + pw * 0.22, y + ph * 0.5, ph * 0.7, '#5a3416');
    g.textAlign = 'center'; g.textBaseline = 'middle';
    text(g, 'TSUBAME', x + pw * 0.62, y + ph * 0.38, pw * 0.6, ph * 0.3, 700, SERIF, '#5a3416');
    text(g, 'DENIM', x + pw * 0.62, y + ph * 0.7, pw * 0.4, ph * 0.18, 700, FONT, '#5a3416');
  },
};

/** A paper hang tag: the label's colours and logo, a size box, a barcode. */
export function hangTag(g, brand, x, y, w, h) {
  const B = FASHION_BRANDS[brand] || { ink: '#26262b', paper: '#f6f4ee', jp: '' };
  g.fillStyle = B.paper; g.fillRect(x, y, w, h);
  g.fillStyle = B.ink; g.fillRect(x, y, w, h * 0.06);
  g.beginPath(); g.arc(x + w / 2, y + h * 0.13, w * 0.04, 0, TAU); g.fillStyle = '#d8d4cc'; g.fill();
  g.save(); g.translate(x + w / 2, y + h * 0.36); g.rotate(-Math.PI / 2);
  logo(g, brand, 0, 0, h * 0.4, w * 0.62, B.ink);
  g.restore();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  text(g, B.jp, x + w / 2, y + h * 0.66, w * 0.8, w * 0.16, 700, SERIF_JP, B.ink);
  g.fillStyle = '#111111';
  for (let k = 0, bx = x + w * 0.15; bx < x + w * 0.85; k++) { const bw = w * (0.01 + (k * 7 % 3) * 0.01); if (k % 2 === 0) g.fillRect(bx, y + h * 0.78, bw, h * 0.12); bx += bw + w * 0.008; }
}
