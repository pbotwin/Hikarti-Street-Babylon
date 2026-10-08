import { DynamicTexture } from '@babylonjs/core';
import { BRANDS } from '../mall/MallCatalog.js';
import { CELLS, FONT } from './Labels.js';
import { ART, MARKS, SKINS, lum, tone } from './PackArt.js';

/**
 * Printed packaging for the mall's groceries (MallCatalog GROCERIES): one
 * 2048² atlas, a 256 px cell per product in catalog order. A cell holds the
 * pack's print (its top PRINT_V) and below it the shelf-edge price tag.
 *
 * The print is cut into the regions a pack shape wraps (LAYOUTS: a can's
 * front and back halves, a carton's four sides, a tub's lid, a bottle's cap,
 * a fruit's skin…). Each region is painted in the pack's real proportions
 * (millimetres, scaled into its pixels), so text and art stand upright and
 * undistorted on the 3D pack: the front with the brand's logo and emblem,
 * the product's name in Japanese and English, its illustration and amount;
 * the back with a nutrition panel, ingredients, a barcode and recycling
 * marks; caps, lids and skins in their own colours and textures.
 *
 * Every brand (MallCatalog BRANDS) keeps one lettering and layout on all its
 * packs, so a shelf reads as product families. 256 px cells give about a
 * pixel per millimetre of pack: sharp at arm's length; the atlas is 16 MB
 * (+ mips), painted per trip and disposed with it (disposeGroceryAtlas).
 */
export const PRINT_V = 0.7;          // share of a cell above the price tag (uv v from the top)
const SIZE = 2048;
const INSET = 0.03;                  // the shader samples the inner 94 % of a cell (no bleeding)

const SERIF_JP = `'Noto Serif JP', 'Hiragino Mincho ProN', 'Yu Mincho', serif`;
const SERIF = `'Cormorant Garamond', Georgia, 'Times New Roman', serif`;
const SCRIPT = `'Caveat', 'Segoe Script', 'Brush Script MT', cursive`;

/**
 * Print regions per pack shape: r = [x, y, w, h] of the print area (y down),
 * mm = the surface's real size, paint = what goes there. Regions with no
 * paint only name a span the geometry maps (a wrap = back + front).
 */
const wrap = (h, mmW, mmH) => ({
  back: { r: [0, 0, 0.5, h], mm: [mmW / 2, mmH], paint: 'back' },
  front: { r: [0.5, 0, 0.5, h], mm: [mmW / 2, mmH], paint: 'front' },
  wrap: { r: [0, 0, 1, h] },
});
const cap = (y, mmW, mmH) => ({
  cap: { r: [0, y, 0.8, 1 - y], mm: [mmW, mmH], paint: 'cap' },
  capTop: { r: [0.8, y, 0.2, 1 - y], mm: [mmW * 0.25, mmH], paint: 'capTop' },
});
export const LAYOUTS = {
  can: { ...wrap(1, 209, 112) },
  bottle: { ...wrap(0.66, 217, 72), ...cap(0.66, 107, 32) },
  bigBottle: { ...wrap(0.66, 317, 110), ...cap(0.66, 132, 38) },
  squareBottle: { ...wrap(0.66, 360, 120), ...cap(0.66, 132, 38) },
  jug: { ...wrap(0.7, 300, 150), ...cap(0.7, 170, 40) },
  carton: {
    front: { r: [0, 0, 0.36, 1], mm: [70, 190], paint: 'front' },
    back: { r: [0.36, 0, 0.32, 1], mm: [70, 190], paint: 'back' },
    side: { r: [0.68, 0, 0.32, 1], mm: [70, 190], paint: 'side' },
  },
  tub: { ...wrap(0.42, 327, 42), lid: { r: [0.15, 0.42, 0.7, 0.58], mm: [110, 110], paint: 'lid' } },
  block: {
    front: { r: [0, 0, 1, 0.34], mm: [100, 36], paint: 'front' },
    top: { r: [0, 0.34, 0.68, 0.66], mm: [100, 65], paint: 'top' },
    side: { r: [0.68, 0.34, 0.32, 0.66], mm: [65, 36], paint: 'side' },
  },
  bag: {
    front: { r: [0, 0, 0.56, 1], mm: [150, 190], paint: 'front' },
    back: { r: [0.56, 0, 0.44, 1], mm: [150, 190], paint: 'back' },
  },
  box: {
    front: { r: [0, 0, 0.5, 1], mm: [110, 170], paint: 'front' },
    back: { r: [0.5, 0, 0.36, 1], mm: [110, 170], paint: 'back' },
    side: { r: [0.86, 0, 0.14, 1], mm: [40, 170], paint: 'side' },
  },
  jar: { ...wrap(0.55, 229, 50), lid: { r: [0, 0.55, 1, 0.45], mm: [110, 40], paint: 'jarLid' } },
  loaf: {
    front: { r: [0, 0, 0.62, 0.45], mm: [100, 60], paint: 'sticker' },
    tie: { r: [0.62, 0, 0.38, 0.45], mm: [30, 30], paint: 'tie' },
    crust: { r: [0, 0.45, 1, 0.55], mm: [240, 120], paint: 'crust' },
  },
  baguette: {
    front: { r: [0, 0, 1, 0.45], mm: [220, 220], paint: 'sleeve' },
    crust: { r: [0, 0.45, 1, 0.55], mm: [200, 240], paint: 'crust' },
  },
  bun: {
    front: { r: [0, 0, 0.6, 0.38], mm: [50, 34], paint: 'sticker' },
    crust: { r: [0, 0.38, 1, 0.62], mm: [200, 60], paint: 'crust' },
  },
  fruit: { front: { r: [0, 0, 1, 0.2], mm: [150, 14], paint: 'band' }, skin: { r: [0, 0.2, 1, 0.8], mm: [120, 60], paint: 'skin' } },
  banana: { front: { r: [0, 0, 1, 0.2], mm: [80, 14], paint: 'band' }, skin: { r: [0, 0.2, 1, 0.8], mm: [200, 60], paint: 'skin' } },
  head: { front: { r: [0, 0, 1, 0.2], mm: [150, 20], paint: 'band' }, skin: { r: [0, 0.2, 1, 0.8], mm: [200, 100], paint: 'skin' } },
  tray: {
    front: { r: [0, 0, 1, 0.26], mm: [260, 40], paint: 'band' },
    top: { r: [0, 0.26, 1, 0.74], mm: [260, 105], paint: 'film' },
  },
  roll: {
    front: { r: [0, 0, 1, 0.3], mm: [110, 30], paint: 'band' },
    skin: { r: [0, 0.3, 1, 0.7], mm: [480, 40], paint: 'skin' },
  },
  pack: {
    front: { r: [0, 0, 0.62, 0.5], mm: [200, 120], paint: 'front' },
    top: { r: [0, 0.5, 0.62, 0.5], mm: [200, 120], paint: 'top' },
    side: { r: [0.62, 0, 0.38, 1], mm: [120, 120], paint: 'side' },
  },
};

/** A brand's identity (a plain one for brands not in BRANDS). */
const brandOf = (p) => BRANDS[p.brand] || { jp: p.brand, logo: 'round', mark: 'none', ink: null, layout: 'band' };
const inkOn = (hex) => (lum(hex) > 150 ? '#1b1b1f' : '#ffffff');

/** Stable small numbers from a product id (badges, barcode digits). */
function hash(s) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Set a font, shrinking from `size` until `text` fits `w`; returns the size used. */
function fit(g, text, w, size, weight, family = FONT, style = '') {
  g.font = `${style} ${weight} ${size}px ${family}`;
  const m = g.measureText(text).width;
  if (m > w) { size *= w / m; g.font = `${style} ${weight} ${size}px ${family}`; }
  return size;
}

/** Text with a contrasting outline (Japanese packaging style). */
function outlined(g, text, x, y, fill, line, lw) {
  g.lineJoin = 'round';
  g.strokeStyle = line; g.lineWidth = lw; g.strokeText(text, x, y);
  g.fillStyle = fill; g.fillText(text, x, y);
}

/**
 * Fill and outline for a name on `ground`: the label colour when it stands
 * out from the ground, else black or white; the outline the other way.
 */
function nameInk(ground, label) {
  const fill = Math.abs(lum(label) - lum(ground)) > 90 ? label : inkOn(ground);
  return { fill, line: lum(fill) > 140 ? tone(ground, -0.6) : '#ffffff' };
}

/** What the pack holds, printed in its roundel: from the name (×10, 1.5 L, 5 kg) or the shape's usual size. */
const AMOUNT = { can: '350ml', bottle: '500ml', bigBottle: '1.5L', squareBottle: '2L', jug: '900g', carton: '1000ml', tub: '400g', block: '200g',
  bag: '85g', box: '12本', jar: '300g', pack: '5食' };
function amount(p) {
  const m = / (\d+(\.\d+)?) (L|kg)$/.exec(p.name) || /×(\d+)$/.exec(p.name);
  if (m) return m[3] ? `${m[1]}${m[3]}` : `${m[1]}個`;
  if (p.look.shape === 'carton' && (p.look.size || 1) < 1) return '200ml';
  return AMOUNT[p.look.shape] || '';
}

// ---------------------------------------------------------------- logos
/** The brand's logo centred in a w × h box at (x, y), in `ink`. */
function logo(g, p, x, y, w, h, ink) {
  const B = brandOf(p), name = p.brand;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const markW = B.mark !== 'none' && B.logo !== 'serif' && B.logo !== 'seal' ? Math.min(h, w * 0.25) : 0;
  const tx = x + markW * 0.55, tw = w - markW * 1.1;
  if (markW) MARKS[B.mark](g, x - w / 2 + markW / 2, y, markW * 0.9, ink);
  switch (B.logo) {
    case 'script': {
      const s = fit(g, name, tw, h * 1.15, 700, SCRIPT);
      g.fillStyle = ink; g.fillText(name, tx, y);
      // A swoosh under the name.
      g.strokeStyle = ink; g.lineWidth = s * 0.07; g.lineCap = 'round';
      g.beginPath(); g.moveTo(tx - tw * 0.42, y + s * 0.42); g.quadraticCurveTo(tx, y + s * 0.62, tx + tw * 0.45, y + s * 0.3); g.stroke();
      g.lineCap = 'butt';
      break;
    }
    case 'round': {
      const s = fit(g, name, tw * 0.86, h * 0.62, 800);
      const bw = Math.min(tw, g.measureText(name).width + s * 1.1), bh = s * 1.45;
      g.fillStyle = ink; g.beginPath(); g.roundRect(tx - bw / 2, y - bh / 2, bw, bh, bh / 2); g.fill();
      g.fillStyle = inkOn(ink === '#ffffff' ? '#ffffff' : ink); g.fillText(name, tx, y + s * 0.05);
      break;
    }
    case 'block': {
      // Heavy slanted capitals (rounded, not condensed: they stay legible small).
      const text = name.toUpperCase();
      g.save(); g.translate(tx, y); g.transform(1, 0, -0.2, 1, 0, 0);
      const s = fit(g, text, tw * 0.95, h * 0.8, 800);
      outlined(g, text, 0, 0, ink, inkOn(ink) === '#ffffff' ? '#1b1b1f' : '#ffffff', s * 0.12);
      g.restore();
      break;
    }
    case 'serif': {
      const text = name.toUpperCase();
      if (B.mark !== 'none') MARKS[B.mark](g, x, y - h * 0.3, h * 0.42, ink);
      const s = fit(g, text, w * 0.92, h * 0.4, 700, SERIF);
      g.fillStyle = ink; g.fillText(text, x, y + h * 0.18);
      g.fillRect(x - w * 0.3, y + h * 0.18 + s * 0.62, w * 0.6, s * 0.05);
      break;
    }
    case 'seal': {
      // A red seal with the brand's kanji, the romaji beside it.
      const sq = Math.min(h, w * 0.42);
      g.fillStyle = ink; g.beginPath(); g.roundRect(x - w / 2, y - sq / 2, sq, sq, sq * 0.12); g.fill();
      const jp = B.jp;
      g.fillStyle = '#ffffff';
      fit(g, jp, sq * 0.82, sq * (jp.length > 2 ? 0.42 : 0.62), 700, SERIF_JP);
      if (jp.length > 2) {
        const half = Math.ceil(jp.length / 2);
        g.fillText(jp.slice(0, half), x - w / 2 + sq / 2, y - sq * 0.2);
        g.fillText(jp.slice(half), x - w / 2 + sq / 2, y + sq * 0.22);
      } else g.fillText(jp, x - w / 2 + sq / 2, y);
      g.textAlign = 'left';
      fit(g, name.toUpperCase(), w - sq * 1.2, h * 0.36, 700, SERIF);
      g.fillStyle = ink; g.fillText(name.toUpperCase(), x - w / 2 + sq * 1.15, y);
      g.textAlign = 'center';
      break;
    }
    default: {   // farm: the prefecture's co-op sticker
      const r = Math.min(w, h * 2.2) / 2;
      g.fillStyle = ink; g.beginPath(); g.roundRect(x - r, y - h / 2, r * 2, h, h * 0.2); g.fill();
      g.fillStyle = lum(ink) > 200 ? p.look.label : '#ffffff';
      fit(g, B.jp, r * 1.7, h * 0.6, 800);
      g.fillText(B.jp, x, y + h * 0.04);
    }
  }
}

// ---------------------------------------------------------------- pack faces
/** The ground of a face in the brand's layout. */
function ground(g, p, w, h) {
  const B = brandOf(p), { color, label } = p.look;
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, tone(color, 0.12)); grd.addColorStop(1, tone(color, -0.08));
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.fillStyle = label;
  switch (B.layout) {
    case 'full':        // a dynamic ribbon across
      g.beginPath(); g.moveTo(0, h * 0.5); g.bezierCurveTo(w * 0.3, h * 0.35, w * 0.6, h * 0.62, w, h * 0.42);
      g.lineTo(w, h * 0.5); g.bezierCurveTo(w * 0.6, h * 0.72, w * 0.3, h * 0.45, 0, h * 0.6); g.fill();
      break;
    case 'stripe':      // bold diagonal stripes in the label colour
      g.globalAlpha = 0.9;
      for (let k = -2; k < 6; k++) { g.beginPath(); g.moveTo(k * w * 0.3, h); g.lineTo(k * w * 0.3 + w * 0.1, h); g.lineTo(k * w * 0.3 + w * 0.5, 0); g.lineTo(k * w * 0.3 + w * 0.4, 0); g.fill(); }
      g.globalAlpha = 1;
      break;
    case 'frame':       // a fine double border
      g.strokeStyle = brandOf(p).ink || label; g.lineWidth = Math.min(w, h) * 0.02;
      g.strokeRect(w * 0.04, h * 0.03, w * 0.92, h * 0.94);
      g.lineWidth *= 0.4; g.strokeRect(w * 0.065, h * 0.045, w * 0.87, h * 0.91);
      break;
    case 'band':
      g.fillRect(0, 0, w, h * 0.24);
      break;
    case 'vertical':    // a washi-paper column
      g.fillStyle = '#f7f1e3'; g.fillRect(w * 0.6, 0, w * 0.4, h);
      g.fillStyle = label; g.fillRect(w * 0.6, 0, w * 0.015, h);
      break;
    default: {          // panel: a soft white panel for the art
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.beginPath(); g.roundRect(w * 0.08, h * 0.42, w * 0.84, h * 0.44, Math.min(w, h) * 0.08); g.fill();
      g.strokeStyle = label; g.lineWidth = Math.min(w, h) * 0.015; g.stroke();
    }
  }
}

/** A pack's front: logo, names, illustration, amount, maybe a badge. */
function front(g, p, w, h) {
  const B = brandOf(p), { color, label, jp, art } = p.look;
  ground(g, p, w, h);
  const onColor = inkOn(color);
  const ink = B.layout === 'band' ? inkOn(label) : B.ink && lum(B.ink) > 200 && lum(color) > 170 ? label : B.ink || onColor;
  const wide = w > h * 1.6, vertical = B.layout === 'vertical' && !wide;
  const en = p.name.replace(/ ×\d+$| \d+(\.\d+)? (L|kg)$/, '');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let artBox;
  if (wide) {
    logo(g, p, w * 0.3, h * 0.22, w * 0.52, h * 0.3, ink);
    const s = fit(g, jp, w * 0.54, h * 0.24, 800), ni = nameInk(color, label);
    outlined(g, jp, w * 0.3, h * 0.55, ni.fill, ni.line, s * 0.1);
    g.fillStyle = onColor; fit(g, en.toUpperCase(), w * 0.5, h * 0.11, 700); g.fillText(en.toUpperCase(), w * 0.3, h * 0.78);
    artBox = [w * 0.78, h * 0.52, Math.min(w * 0.4, h * 0.9)];
  } else if (vertical) {
    // Traditional: the name in a vertical column on washi, the seal above the art.
    logo(g, p, w * 0.3, h * 0.11, w * 0.52, h * 0.12, B.ink || label);
    const chars = [...jp.replace(/ /g, '')], n = chars.length;
    const cs = Math.min(w * 0.32, (h * 0.86) / n);
    g.font = `700 ${cs}px ${SERIF_JP}`; g.fillStyle = '#1b1b1f';
    chars.forEach((c, i) => g.fillText(c, w * 0.8, h * 0.08 + cs * (i + 0.5)));
    g.fillStyle = inkOn(color); fit(g, en, w * 0.55, h * 0.06, 700, SERIF); g.fillText(en, w * 0.3, h * 0.25);
    artBox = [w * 0.3, h * 0.58, Math.min(w * 0.56, h * 0.45)];
  } else {
    logo(g, p, w / 2, h * 0.14, w * 0.84, h * 0.17, ink);
    const s = fit(g, jp, w * 0.88, h * 0.12, 800);
    const jy = B.layout === 'full' ? h * 0.33 : h * 0.31;
    const ni = nameInk(color, label);
    outlined(g, jp, w / 2, jy, ni.fill, ni.line, s * 0.1);
    g.fillStyle = onColor; fit(g, en.toUpperCase(), w * 0.8, h * 0.055, 700); g.fillText(en.toUpperCase(), w / 2, jy + s * 0.78);
    artBox = [w / 2, h * 0.64, Math.min(w * 0.8, h * 0.4)];
  }
  ART[art]?.(g, artBox[0], artBox[1], artBox[2], p);
  // The amount in a roundel, a promotional badge on some packs.
  const amt = amount(p), r = Math.min(w, h) * (wide ? 0.13 : 0.11);
  if (amt) {
    const ax = wide ? w * 0.06 + r : w - r * 1.25, ay = h - r * 1.25;
    g.fillStyle = label; g.beginPath(); g.arc(ax, ay, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = r * 0.12; g.stroke();
    g.fillStyle = inkOn(label); fit(g, amt, r * 1.6, r * 0.75, 800); g.fillText(amt, ax, ay + r * 0.05);
  }
  const badge = /Zero/.test(p.name) ? 'ゼロ' : ['新発売', 'NEW', '期間限定', null, null, null][hash(p.id) % 6];
  if (badge && !wide) {
    const bx = r * 1.4, by = h * 0.86;
    MARKS.burst(g, bx, by, r * 2.3, '#e8242c');
    g.fillStyle = '#ffffff'; fit(g, badge, r * 1.5, r * 0.6, 800); g.fillText(badge, bx, by);
  }
}

/** A pack's back: maker, ingredients, nutrition panel, barcode, recycling mark. */
function back(g, p, w, h) {
  const { color, label, jp } = p.look;
  g.fillStyle = tone(color, 0.15); g.fillRect(0, 0, w, h);
  const ink = inkOn(color);
  g.textAlign = 'left'; g.textBaseline = 'middle';
  const m = Math.min(w, h) * 0.07, cw = w - m * 2;
  // Name, maker and the ingredients' small print.
  g.fillStyle = ink; fit(g, jp, cw * 0.7, h * 0.07, 800); g.fillText(jp, m, m + h * 0.03);
  g.globalAlpha = 0.7; fit(g, `${p.brand} · Hikari Foods`, cw * 0.6, h * 0.035, 500); g.fillText(`${p.brand} · Hikari Foods`, m, m + h * 0.085);
  for (let k = 0; k < 5; k++) g.fillRect(m, m + h * (0.13 + k * 0.03), cw * (0.6 + ((hash(p.id + k) % 40) / 100)), h * 0.008);
  g.globalAlpha = 1;
  // Nutrition facts.
  const ty = m + h * 0.3, th = h * 0.33;
  g.fillStyle = '#ffffff'; g.fillRect(m, ty, cw, th);
  g.strokeStyle = '#1b1b1f'; g.lineWidth = h * 0.005; g.strokeRect(m, ty, cw, th);
  g.fillStyle = '#1b1b1f'; fit(g, '栄養成分表示', cw * 0.6, th * 0.13, 800); g.fillText('栄養成分表示', m + cw * 0.04, ty + th * 0.1);
  const rows = ['エネルギー', 'たんぱく質', '脂質', '炭水化物', '食塩相当量'];
  rows.forEach((row, i) => {
    const y = ty + th * (0.28 + i * 0.15);
    g.fillRect(m + cw * 0.03, y - th * 0.07, cw * 0.94, th * 0.006);
    fit(g, row, cw * 0.5, th * 0.1, 500); g.fillText(row, m + cw * 0.06, y);
    g.textAlign = 'right'; g.fillText(`${(hash(p.id + row) % 300) / 10}${i ? 'g' : 'kcal'}`, m + cw * 0.94, y); g.textAlign = 'left';
  });
  // Barcode (EAN-style bars from the id) and its digits.
  const bw = cw * 0.55, bh = h * 0.17, bx = m, by = h - m - bh;
  g.fillStyle = '#ffffff'; g.fillRect(bx - bw * 0.04, by - bh * 0.06, bw * 1.08, bh * 1.12);
  g.fillStyle = '#111111';
  let seed = hash(p.id);
  for (let k = 0, x = bx; x < bx + bw; k++) {
    seed = (seed * 16807) % 2147483647;
    const bar = bw * (0.008 + (seed % 3) * 0.008), guard = k < 3 || k > 56 || (k > 28 && k < 32);
    if (k % 2 === 0) g.fillRect(x, by, bar, guard ? bh : bh * 0.8);
    x += bar + bw * 0.006;
  }
  fit(g, `4 9${String(hash(p.id)).padStart(10, '0').slice(0, 10)} ${hash(p.name) % 10}`, bw, bh * 0.2, 500);
  g.fillText(`4 9${String(hash(p.id)).padStart(10, '0').slice(0, 10)} ${hash(p.name) % 10}`, bx, by + bh * 0.92);
  // Recycling mark: the material's triangle.
  const rx = w - m - h * 0.08, ry = h - m - h * 0.1, rr = h * 0.07;
  g.strokeStyle = ink; g.lineWidth = rr * 0.15;
  g.beginPath(); g.moveTo(rx, ry - rr); g.lineTo(rx + rr, ry + rr * 0.7); g.lineTo(rx - rr, ry + rr * 0.7); g.closePath(); g.stroke();
  g.fillStyle = ink; g.textAlign = 'center';
  const mat = { can: 'アルミ', bottle: 'PET', bigBottle: 'PET', squareBottle: 'PET', jug: 'プラ', carton: '紙' }[p.look.shape] || 'プラ';
  fit(g, mat, rr * 1.4, rr * 0.6, 800); g.fillText(mat, rx, ry + rr * 0.15);
  g.fillStyle = label; g.fillRect(0, 0, w, h * 0.012);
}

/** A narrow side: the brand colour, the name running up it, the logo. */
function side(g, p, w, h) {
  const { color, label, jp } = p.look;
  g.fillStyle = label; g.fillRect(0, 0, w, h);
  g.fillStyle = color; g.fillRect(w * 0.08, h * 0.04, w * 0.84, h * 0.92);
  g.save(); g.translate(w / 2, h / 2); g.rotate(-Math.PI / 2);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const s = fit(g, jp, h * 0.6, w * 0.42, 800);
  const ni = nameInk(color, label);
  outlined(g, jp, -h * 0.12, 0, ni.fill, ni.line, s * 0.08);
  fit(g, p.brand.toUpperCase(), h * 0.25, w * 0.25, 800); g.fillStyle = label === color ? inkOn(color) : label;
  g.fillText(p.brand.toUpperCase(), h * 0.32, 0);
  g.restore();
}

/** The top of a box or pack: logo and a small illustration. */
function top(g, p, w, h) {
  const { color, label, art } = p.look;
  g.fillStyle = color; g.fillRect(0, 0, w, h);
  g.fillStyle = label; g.fillRect(0, h * 0.85, w, h * 0.15);
  if (p.look.art === 'tissue') {
    // The tissue box's opening, a sheet peeking out.
    g.fillStyle = '#d8d4cc'; g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.3, h * 0.12, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.22, h * 0.08, 0, 0, Math.PI * 2); g.fill();
    logo(g, p, w / 2, h * 0.2, w * 0.6, h * 0.18, brandOf(p).ink || label);
    return;
  }
  if (p.look.art === 'roll') {
    // Toilet rolls seen through the film: twelve roll ends.
    g.fillStyle = '#efece6'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      const cx = w * (0.13 + i * 0.25), cy = h * (0.18 + j * 0.32), r = Math.min(w / 8.5, h / 6.5);
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(150,150,160,0.5)'; g.lineWidth = r * 0.05; g.stroke();
      g.fillStyle = '#c8b090'; g.beginPath(); g.arc(cx, cy, r * 0.32, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = label; g.globalAlpha = 0.85; g.fillRect(0, h * 0.42, w, h * 0.16); g.globalAlpha = 1;
    logo(g, p, w / 2, h * 0.5, w * 0.5, h * 0.13, inkOn(label));
    return;
  }
  logo(g, p, w * 0.36, h * 0.3, w * 0.6, h * 0.3, brandOf(p).ink && lum(brandOf(p).ink) > 200 && lum(color) > 170 ? label : brandOf(p).ink || inkOn(color));
  ART[art]?.(g, w * 0.78, h * 0.42, Math.min(w * 0.36, h * 0.7), p);
  g.fillStyle = inkOn(color); g.textAlign = 'left';
  fit(g, p.look.jp, w * 0.55, h * 0.16, 800); g.fillText(p.look.jp, w * 0.06, h * 0.68);
}

/** A tub's lid: a round label. */
function lid(g, p, w, h) {
  const { color, label, jp, art } = p.look;
  g.fillStyle = tone(label, 0.2); g.fillRect(0, 0, w, h);
  g.fillStyle = color; g.beginPath(); g.arc(w / 2, h / 2, w * 0.44, 0, Math.PI * 2); g.fill();
  g.strokeStyle = label; g.lineWidth = w * 0.03; g.stroke();
  ART[art]?.(g, w / 2, h * 0.58, w * 0.42, p);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  logo(g, p, w / 2, h * 0.22, w * 0.6, h * 0.14, brandOf(p).ink || label);
  const s = fit(g, jp, w * 0.66, h * 0.11, 800);
  const ni = nameInk(color, label);
  outlined(g, jp, w / 2, h * 0.36, ni.fill, ni.line, s * 0.1);
}

/** A jar's lid: gingham cloth for jam, gold for honey. */
function jarLid(g, p, w, h) {
  if (p.look.art === 'jam') {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(200,30,45,0.55)';
    const n = 12;
    for (let k = 0; k < n; k++) { g.fillRect((k / n) * w, 0, w / n / 2, h); g.fillRect(0, (k / n) * h, w, h / n / 2); }
  } else {
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, '#a8781a'); grd.addColorStop(0.5, '#f2cf6a'); grd.addColorStop(1, '#a8781a');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    logo(g, p, w / 2, h / 2, w * 0.4, h * 0.4, '#5a3a10');
  }
}

/** A cap's side: fine ridges in the cap's colour (the brand's label colour, or white). */
function capSide(g, p, w, h) {
  const c = capColor(p);
  g.fillStyle = c; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let x = 0; x < w; x += w / 60) g.fillRect(x, h * 0.25, w / 150, h * 0.75);
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, h * 0.18, w, h * 0.06);
}
const capColor = (p) => (p.look.shape === 'jug' ? tone(p.look.color, -0.2) : p.look.label === '#ffffff' || p.look.label === '#f4f1ea' ? tone(p.look.color, -0.25) : p.look.label);
function capTop(g, p, w, h) { g.fillStyle = tone(capColor(p), 0.1); g.fillRect(0, 0, w, h); }

/** A bread bag's sticker / a bun's: the bakery's round label. */
function sticker(g, p, w, h) {
  const { label, jp } = p.look;
  g.fillStyle = '#fbf6ea'; g.fillRect(0, 0, w, h);
  g.fillStyle = label; g.fillRect(0, 0, w, h * 0.3);
  logo(g, p, w / 2, h * 0.15, w * 0.9, h * 0.24, '#fbf6ea');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = label; fit(g, jp, w * 0.88, h * 0.32, 800); g.fillText(jp, w / 2, h * 0.58);
  g.fillStyle = '#26262b'; fit(g, p.name, w * 0.8, h * 0.14, 700); g.fillText(p.name, w / 2, h * 0.84);
}
function tie(g, p, w, h) { g.fillStyle = p.look.label; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(0, h * 0.4, w, h * 0.1); }

/**
 * A baguette's paper sleeve, wrapped round it (u) along its length (v up =
 * towards the bread): kraft ribs, the bakery's name reading along the
 * loaf on its front (u = 0.75 as it lies).
 */
function sleeve(g, p, w, h) {
  g.fillStyle = '#e9dcc0'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(120,90,50,0.22)'; g.lineWidth = w * 0.006;
  for (let k = 0; k < 16; k++) { g.beginPath(); g.moveTo((k / 16) * w, 0); g.lineTo((k / 16) * w, h); g.stroke(); }
  g.save(); g.translate(w * 0.75, h / 2); g.rotate(-Math.PI / 2);
  logo(g, p, -h * 0.08, 0, h * 0.6, w * 0.2, p.look.label);
  MARKS.wheat(g, h * 0.32, 0, w * 0.16, p.look.label);
  g.restore();
}

/** Bread crust (loaf, baguette, bun domes: melon pan's sugar grid, curry pan's crumbs). */
function crust(g, p, w, h) {
  const art = p.look.art;
  const base = { melonpan: '#e8b85a', currypan: '#b86a2a', baguette: '#c8843a' }[art] || '#c98a3e';
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, tone(base, 0.15)); grd.addColorStop(1, tone(base, -0.15));
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  if (art === 'melonpan') {
    g.strokeStyle = 'rgba(150,95,30,0.6)'; g.lineWidth = Math.min(w, h) * 0.02;
    const step = w / 14;
    for (let x = -h; x < w + h; x += step) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + h, h); g.stroke(); g.beginPath(); g.moveTo(x + h, 0); g.lineTo(x, h); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 300; i++) g.fillRect((i * 37) % w, (i * 53) % h, 0.9, 0.9);
  } else if (art === 'currypan') {
    for (let i = 0; i < 600; i++) { g.fillStyle = i % 3 ? 'rgba(235,180,100,0.85)' : 'rgba(120,60,20,0.6)'; g.fillRect((i * 37) % w, (i * 53) % h, 1.6, 1.1); }
  } else if (art === 'baguette') {
    // Round the loaf (u): golden on top (u = 0.5 as it lies), darker underneath; scored slashes along the top.
    const r = g.createLinearGradient(0, 0, w, 0);
    for (const [t, c] of [[0, '#8a5420'], [0.25, '#c8843a'], [0.5, '#e8b45e'], [0.75, '#c8843a'], [1, '#8a5420']]) r.addColorStop(t, c);
    g.fillStyle = r; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 4; k++) {
      g.fillStyle = '#f4d898'; g.beginPath(); g.ellipse(w * 0.5, h * (0.14 + k * 0.24), w * 0.05, h * 0.09, 0.35, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(120,70,20,0.6)'; g.lineWidth = w * 0.006; g.stroke();
    }
  } else {
    // A shokupan loaf in its bag: the golden top, pale sides, crumb at the cut end.
    g.fillStyle = 'rgba(255,250,235,0.8)'; g.fillRect(0, h * 0.55, w, h * 0.45);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    for (let k = 0; k < 6; k++) g.fillRect(0, h * (0.1 + k * 0.15), w, h * 0.015);
  }
}

/** A produce label strip: the farm's sticker on the tray, band or tape. */
function band(g, p, w, h) {
  const { label, jp } = p.look;
  g.fillStyle = label; g.fillRect(0, 0, w, h);
  g.fillStyle = '#ffffff'; g.fillRect(0, h * 0.08, w, h * 0.04); g.fillRect(0, h * 0.88, w, h * 0.04);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  logo(g, p, w * 0.2, h * 0.5, w * 0.3, h * 0.66, '#ffffff');
  g.fillStyle = '#ffffff'; fit(g, jp, w * 0.38, h * 0.62, 800); g.fillText(jp, w * 0.58, h * 0.52);
  fit(g, p.name.toUpperCase(), w * 0.18, h * 0.3, 700); g.fillText(p.name.toUpperCase(), w * 0.88, h * 0.52);
}

/** A tray's film top: what is inside, seen from above, and a label. */
function film(g, p, w, h) {
  if (p.look.art === 'egg') {
    g.fillStyle = '#d9cdb2'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) {
      const cx = w * (0.1 + i * 0.2), cy = h * (0.27 + j * 0.46), r = Math.min(w / 12, h / 5);
      g.fillStyle = '#b8ab90'; g.beginPath(); g.arc(cx, cy, r * 1.15, 0, Math.PI * 2); g.fill();
      const grd = g.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
      grd.addColorStop(0, '#fbeedd'); grd.addColorStop(1, '#c89a6a');
      g.fillStyle = grd; g.beginPath(); g.ellipse(cx, cy, r * 0.85, r, 0, 0, Math.PI * 2); g.fill();
    }
  } else {
    g.fillStyle = '#5a1a1a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 22; i++) ART.strawberry(g, w * (0.06 + ((i * 0.37) % 1) * 0.88), h * (0.15 + ((i * 0.61) % 1) * 0.7), Math.min(w, h) * 0.3, p);
  }
  // Film sheen and the label across.
  g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(0, 0, w, h * 0.3);
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(w * 0.3, h * 0.38, w * 0.4, h * 0.24);
  logo(g, p, w * 0.5, h * 0.5, w * 0.36, h * 0.18, p.look.label);
}

function skin(g, p, w, h) { (SKINS[p.look.art] || SKINS.apple)(g, w, h); }

const PAINT = { front, back, side, top, lid, jarLid, cap: capSide, capTop, sticker, tie, sleeve, crust, band, film, skin };

/** The shelf-edge price tag: names on white, the price in red, tax note and a mini barcode. */
function tag(g, p, x, y, w, h) {
  g.fillStyle = '#fdfcf6'; g.fillRect(x, y, w, h);
  const accent = lum(p.look.label) > 225 ? p.look.color : p.look.label;
  g.fillStyle = accent; g.fillRect(x, y, w * 0.035, h);
  g.fillStyle = '#f7d84a'; g.fillRect(x + w * 0.035, y, w * 0.965, h * 0.2);
  g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillStyle = '#26262b';
  fit(g, `${p.brand} ${p.look.jp}`, w * 0.9, h * 0.15, 700); g.fillText(`${p.brand} ${p.look.jp}`, x + w * 0.06, y + h * 0.1);
  fit(g, p.name, w * 0.56, h * 0.26, 700); g.fillText(p.name, x + w * 0.06, y + h * 0.42);
  g.globalAlpha = 0.6; fit(g, amount(p), w * 0.3, h * 0.16, 500); g.fillText(amount(p), x + w * 0.06, y + h * 0.68); g.globalAlpha = 1;
  g.fillStyle = '#111111';
  for (let k = 0, bx = x + w * 0.06; k < 26; k++) { const bw = (1 + (hash(p.id + k) % 3)) * w * 0.003; if (k % 2 === 0) g.fillRect(bx, y + h * 0.8, bw, h * 0.14); bx += bw + w * 0.0025; }
  g.textAlign = 'right'; g.fillStyle = '#d0202c';
  fit(g, String(p.price), w * 0.26, h * 0.62, 900); g.fillText(String(p.price), x + w * 0.9, y + h * 0.56);
  // The coin mark (a small diamond, as the HUD's ◈) and the tax note.
  const cx = x + w * 0.95, cy = y + h * 0.56, r = h * 0.1;
  g.beginPath(); g.moveTo(cx, cy - r); g.lineTo(cx + r * 0.7, cy); g.lineTo(cx, cy + r); g.lineTo(cx - r * 0.7, cy); g.closePath(); g.fill();
  g.fillStyle = '#26262b'; fit(g, '税込', w * 0.12, h * 0.13, 700); g.fillText('税込', x + w * 0.97, y + h * 0.88);
}

/** Paint every product's cell onto a 2048² canvas context (pure canvas: previews and tests use it too). */
export function paintGroceries(g, items) {
  const C = SIZE / CELLS, inner = C * (1 - 2 * INSET), P = inner * PRINT_V;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, SIZE, SIZE);
  items.slice(0, CELLS * CELLS).forEach((p, n) => {
    // Cell (i, j) is sampled from the bottom of the canvas up (flipped upload).
    const x0 = (n % CELLS) * C + C * INSET, y0 = (CELLS - 1 - Math.floor(n / CELLS)) * C + C * INSET;
    for (const reg of Object.values(LAYOUTS[p.look.shape] || LAYOUTS.pack)) {
      if (!reg.paint) continue;
      const [rx, ry, rw, rh] = reg.r, [mw, mh] = reg.mm;
      const px = x0 + rx * inner, py = y0 + ry * P, pw = rw * inner, ph = rh * P;
      g.save();
      g.beginPath(); g.rect(px, py, pw, ph); g.clip();
      // Millimetres of the pack's surface → this region's pixels (stretched back by the uv mapping).
      g.translate(px, py); g.scale(pw / mw, ph / mh);
      PAINT[reg.paint](g, p, mw, mh);
      g.restore();
    }
    g.save();
    g.beginPath(); g.rect(x0, y0 + P, inner, inner - P); g.clip();
    tag(g, p, x0, y0 + P, inner, inner - P);
    g.restore();
  });
}

let atlas = null;

/** The groceries' label atlas (painted once per trip). `items` = MallCatalog GROCERIES. */
export function groceryAtlas(scene, items) {
  if (atlas) return atlas;
  atlas = new DynamicTexture('groceryLabels', { width: SIZE, height: SIZE }, scene, true);
  atlas.anisotropicFilteringLevel = 4;
  paintGroceries(atlas.getContext(), items);
  atlas.update();
  return atlas;
}

export function disposeGroceryAtlas() {
  atlas?.dispose();
  atlas = null;
}
