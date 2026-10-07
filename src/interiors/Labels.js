import { DynamicTexture } from '@babylonjs/core';

/**
 * Printed packaging for the shop products: one 1024² atlas of 8 × 8 label
 * designs (drinks, snacks, magazine covers, book jackets): a brand word,
 * a logo, a "photo", small print and a barcode on a coloured ground. A
 * product picks a cell (Products: aCell) so a shelf shows many different
 * real-looking packs from one texture and one draw per shape.
 */
export const CELLS = 8;
export const FONT = `'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', 'Hiragino Sans', 'Noto Sans JP', 'Yu Gothic', system-ui, sans-serif`;

const GROUNDS = ['#f7f3ea', '#ffffff', '#e8463c', '#f2b52a', '#2f7fc1', '#3f9a5b', '#1e2a44', '#f08bb0',
  '#7a4fb3', '#fbe7c8', '#d8ecf6', '#121212', '#ff7a2f', '#9ccf5a', '#c7b9ff', '#a63a2c'];
const INKS = ['#1b1b1f', '#ffffff', '#d92b2b', '#1d4fa0', '#f7c52a', '#156b3a'];
const WORDS = ['HIKARI', 'KUMO', 'SORA', 'MIZU', 'pocha', 'Fuwa', 'NAMI', 'Choco', 'YUZU', 'Matcha', 'Calpi', 'POKI', 'Ramune', 'Mochi',
  'ネオ', 'さくら', 'おちゃ', 'みかん', 'うまい', 'ほっと', 'WALKER', 'GAZETTE', 'mode', 'TOKYO', 'Crisp', 'Melon', 'Zest', 'Umami'];

let atlas = null;

/** The shared label atlas texture (painted once; v up the canvas, like three's flipY). */
export function labelAtlas(scene) {
  if (atlas) return atlas;
  const S = 1024, C = S / CELLS;
  atlas = new DynamicTexture('labels', { width: S, height: S }, scene, true);
  atlas.anisotropicFilteringLevel = 4;
  const g = atlas.getContext();
  let seed = 97;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  for (let j = 0; j < CELLS; j++) for (let i = 0; i < CELLS; i++) {
    const x = i * C, y = j * C;
    g.save();
    g.beginPath(); g.rect(x, y, C, C); g.clip();
    const ground = pick(GROUNDS);
    g.fillStyle = ground; g.fillRect(x, y, C, C);
    const dark = parseInt(ground.slice(1, 3), 16) + parseInt(ground.slice(3, 5), 16) + parseInt(ground.slice(5, 7), 16) < 330;
    const ink = dark ? '#ffffff' : pick(INKS.filter((k) => k !== '#ffffff' && k !== ground));
    // Accent band or diagonal swoosh.
    g.fillStyle = pick(GROUNDS.filter((k) => k !== ground));
    if (rnd() < 0.5) g.fillRect(x, y + C * (0.08 + rnd() * 0.5), C, C * (0.12 + rnd() * 0.12));
    else { g.beginPath(); g.moveTo(x, y + C); g.lineTo(x + C, y + C * 0.45); g.lineTo(x + C, y + C * 0.7); g.lineTo(x, y + C * 1.25); g.fill(); }
    // "Photo": a soft round product shot.
    const px = x + C * (0.3 + rnd() * 0.4), py = y + C * (0.55 + rnd() * 0.2), pr = C * (0.14 + rnd() * 0.1);
    const grd = g.createRadialGradient(px - pr * 0.3, py - pr * 0.3, pr * 0.1, px, py, pr);
    const food = pick(['#f4d27a', '#c8553d', '#e9a0b4', '#7cb342', '#8a5a3c', '#f6f1e3', '#ffb347']);
    grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.35, food); grd.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = grd; g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.fill();
    // Logo roundel.
    g.fillStyle = pick(INKS); g.beginPath(); g.arc(x + C * 0.17, y + C * 0.16, C * 0.09, 0, Math.PI * 2); g.fill();
    // Brand word.
    const word = pick(WORDS);
    g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = C * 0.24;
    g.font = `900 ${size}px ${FONT}`;
    while (g.measureText(word).width > C * 0.86 && size > 10) { size -= 2; g.font = `900 ${size}px ${FONT}`; }
    g.fillText(word, x + C / 2, y + C * (0.3 + rnd() * 0.08));
    // Small print.
    g.globalAlpha = 0.55;
    for (let k = 0; k < 3; k++) g.fillRect(x + C * 0.12, y + C * (0.84 + k * 0.045), C * (0.3 + rnd() * 0.35), C * 0.018);
    g.globalAlpha = 1;
    // Barcode.
    g.fillStyle = '#ffffff'; g.fillRect(x + C * 0.66, y + C * 0.82, C * 0.26, C * 0.13);
    g.fillStyle = '#111111';
    for (let b = x + C * 0.68; b < x + C * 0.9; b += 2 + Math.floor(rnd() * 3)) g.fillRect(b, y + C * 0.84, 1 + Math.floor(rnd() * 2), C * 0.09);
    g.restore();
  }
  atlas.update();
  return atlas;
}

/** A stable label cell (0..63) for a name (an item id, a shelf position). */
export function labelFor(name) {
  let h = 2166136261;
  for (const ch of String(name)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % (CELLS * CELLS);
}

// ---------------------------------------------------------------- mall groceries
/**
 * Printed packaging for the mall's groceries (MallCatalog GROCERIES): one
 * cell per product, in catalog order, with its real brand and name. A cell
 * holds the pack's print (rows 0-88: the package colour, the brand, a band
 * in the label colour with the name, a "photo", small print and a barcode)
 * and below it the shelf-edge price tag (rows 88-128) the tags show.
 * Round packs (cans, bottles, tubs, jars) wrap the print around: it is
 * painted twice side by side so each half of the wrap shows a whole label.
 * Made for a shopping trip and disposed with it (disposeGroceryAtlas).
 */
export const PRINT_V = 88 / 128;     // share of a cell above the price tag (uv v from the top)
const ROUND = new Set(['can', 'bottle', 'bigBottle', 'tub', 'jar', 'roll']);
let groceries = null;

/** Readable ink on a ground colour. */
const inkOn = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) > 150 ? '#1b1b1f' : '#ffffff';
};

/** Fit text into `w` px (shrinking the font from `size`); returns the size used. */
function fitText(g, text, w, size, weight = 900) {
  g.font = `${weight} ${size}px ${FONT}`;
  while (g.measureText(text).width > w && size > 7) { size -= 1; g.font = `${weight} ${size}px ${FONT}`; }
  return size;
}

/** Split a name into at most two lines that fit `w` px. */
function twoLines(g, text, w) {
  if (g.measureText(text).width <= w) return [text];
  const words = text.split(' ');
  for (let i = words.length - 1; i > 0; i--) {
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
    if (g.measureText(a).width <= w) return [a, b];
  }
  return [text];
}

/** The pack print of one product into a w × h box at (x, y). */
function paintPrint(g, p, x, y, w, h, seed) {
  const { color, label } = p.look;
  g.fillStyle = color; g.fillRect(x, y, w, h);
  // Brand on the package colour, the name on a band of the label colour.
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = label;
  let s = fitText(g, p.brand.toUpperCase(), w * 0.86, Math.round(h * 0.15), 900);
  g.fillText(p.brand.toUpperCase(), x + w / 2, y + h * 0.14);
  const bandY = y + h * 0.28, bandH = h * 0.36;
  g.fillRect(x, bandY, w, bandH);
  g.fillStyle = inkOn(label);
  const name = p.name.replace(/ ×\d+$| \d+(\.\d+)? (L|kg)$/, '');
  s = fitText(g, name, w * 0.9, Math.round(h * 0.17), 800);
  let lines = twoLines(g, name, w * 0.9);
  if (lines.length > 1) { s = Math.min(s, fitText(g, lines[0], w * 0.9, Math.round(h * 0.15), 800), fitText(g, lines[1], w * 0.9, Math.round(h * 0.15), 800)); g.font = `800 ${s}px ${FONT}`; }
  lines.forEach((l, i) => g.fillText(l, x + w / 2, bandY + bandH / 2 + (i - (lines.length - 1) / 2) * s * 1.05));
  // A soft round "photo" of the contents, the size (×10, 1.5 L) in a roundel.
  const px = x + w * (0.3 + (seed % 3) * 0.2), py = y + h * 0.8, pr = h * 0.13;
  const grd = g.createRadialGradient(px - pr * 0.3, py - pr * 0.3, pr * 0.1, px, py, pr);
  grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.4, label); grd.addColorStop(1, 'rgba(0,0,0,0.3)');
  g.fillStyle = grd; g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.fill();
  const amount = /×\d+$| \d+(\.\d+)? (L|kg)$/.exec(p.name)?.[0].trim();
  if (amount) {
    g.fillStyle = label; g.beginPath(); g.arc(x + w * 0.8, y + h * 0.8, h * 0.11, 0, Math.PI * 2); g.fill();
    g.fillStyle = inkOn(label);
    fitText(g, amount, h * 0.2, Math.round(h * 0.09), 900);
    g.fillText(amount, x + w * 0.8, y + h * 0.8);
  }
  // Small print and a barcode.
  g.fillStyle = inkOn(color); g.globalAlpha = 0.5;
  for (let k = 0; k < 2; k++) g.fillRect(x + w * 0.08, y + h * (0.7 + k * 0.06), w * 0.3, h * 0.025);
  g.globalAlpha = 1;
}

/** The shelf-edge tag: name and price on white, an accent strip in the label colour. */
function paintTag(g, p, x, y, w, h) {
  g.fillStyle = '#fbfaf5'; g.fillRect(x, y, w, h);
  g.fillStyle = p.look.label === '#ffffff' || p.look.label === '#f4f1ea' ? p.look.color : p.look.label;
  g.fillRect(x, y, w * 0.05, h);
  g.textBaseline = 'middle';
  g.textAlign = 'left'; g.fillStyle = '#26262b';
  fitText(g, p.name, w * 0.56, Math.round(h * 0.3), 700);
  const lines = twoLines(g, p.name, w * 0.56);
  lines.forEach((l, i) => g.fillText(l, x + w * 0.09, y + h * (lines.length > 1 ? 0.32 + i * 0.36 : 0.5)));
  g.textAlign = 'right'; g.fillStyle = '#c8202c';
  fitText(g, String(p.price), w * 0.26, Math.round(h * 0.72), 900);
  g.fillText(String(p.price), x + w * 0.9, y + h * 0.54);
  // The coin mark (a small diamond, as the HUD's ◈).
  const cx = x + w * 0.955, cy = y + h * 0.54, r = h * 0.14;
  g.beginPath(); g.moveTo(cx, cy - r); g.lineTo(cx + r * 0.7, cy); g.lineTo(cx, cy + r); g.lineTo(cx - r * 0.7, cy); g.closePath(); g.fill();
}

/** The groceries' label atlas (painted once per trip). `items` = MallCatalog GROCERIES. */
export function groceryAtlas(scene, items) {
  if (groceries) return groceries;
  const S = 1024, C = S / CELLS, P = Math.round(C * PRINT_V);
  groceries = new DynamicTexture('groceryLabels', { width: S, height: S }, scene, true);
  groceries.anisotropicFilteringLevel = 4;
  const g = groceries.getContext();
  items.slice(0, CELLS * CELLS).forEach((p, n) => {
    // Cell (i, j) is sampled from the bottom of the canvas up (flipped upload).
    const i = n % CELLS, j = CELLS - 1 - Math.floor(n / CELLS);
    const x = i * C, y = j * C;
    g.save();
    g.beginPath(); g.rect(x, y, C, C); g.clip();
    if (ROUND.has(p.look.shape)) { paintPrint(g, p, x, y, C / 2, P, n); paintPrint(g, p, x + C / 2, y, C / 2, P, n); }
    else paintPrint(g, p, x, y, C, P, n);
    paintTag(g, p, x, y + P, C, C - P);
    g.restore();
  });
  groceries.update();
  return groceries;
}

export function disposeGroceryAtlas() {
  groceries?.dispose();
  groceries = null;
}
