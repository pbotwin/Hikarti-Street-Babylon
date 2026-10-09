import { DynamicTexture, PBRMaterial, Texture } from '@babylonjs/core';
import { AISLES } from './MallCatalog.js';
import { AISLE_LANES, CHECKOUT_X } from './MallPlan.js';
import { pictures } from './MallPictures.js';
import { FONT } from '../interiors/Labels.js';

/**
 * Every sign and picture in Hikari Mall painted once into one atlas
 * (4096 × 2048): the HIKARI MALL letters, shop names, aisle and department
 * boards, wayfinding, lane numbers, lot markings, posters, the register
 * screens, and the pictures of goods and rooms (MallPictures). One self-lit
 * material draws the signs (they read the same under the sunset and the
 * store lights) and one lit material the printed goods, so all of it costs
 * two draws per zone.
 *
 * A sign is listed as [width, height, painter, density = 1]: designed at
 * width × height and painted at density times that (the painter draws in
 * its design units, scaled), so it can be made sharper without changing
 * its look or its shape. Densities lift the signs and pictures that were
 * smeared even on a phone to 105–180 texels a metre as built (s_density):
 * at 2048² the shop fascias had 76, the upper floor's 60, the logo 81 and
 * the goods behind the shop windows 66; the rooms upstairs, only seen from
 * the far side of the atrium, went from 40 to 60. All of it fills about
 * 94 % of the atlas's height.
 */
const W = 4096, H = 2048;

const AISLE_COLORS = { drinks: '#2f7fc1', dairy: '#5aa9d6', bakery: '#c98a4b', produce: '#4f9a4a', snacks: '#e2574c', pantry: '#d99a2b', frozen: '#6fb7d8', household: '#7a5fb3' };

/** Shrink a font until `text` fits `w` px; returns the size. */
function fit(g, text, w, size, weight) {
  g.font = `${weight} ${size}px ${FONT}`;
  while (g.measureText(text).width > w && size > 8) { size -= 2; g.font = `${weight} ${size}px ${FONT}`; }
  return size;
}

function rounded(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/** A five-petal sakura mark. */
function sakura(g, cx, cy, r, color) {
  g.fillStyle = color;
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + i * Math.PI * 2 / 5;
    g.beginPath(); g.ellipse(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55, r * 0.5, r * 0.32, a, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(cx, cy, r * 0.16, 0, Math.PI * 2); g.fill();
}

function centred(g, text, x, y, w, size, weight, color) {
  fit(g, text, w, size, weight);
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x + w / 2, y);
}

/** Board: coloured ground, title and an optional small line under it. */
const board = (bg, fg, title, sub = '', accent = null) => (g, x, y, w, h) => {
  g.fillStyle = bg; g.fillRect(x, y, w, h);
  if (accent) { g.fillStyle = accent; g.fillRect(x, y + h - h * 0.12, w, h * 0.12); }
  centred(g, title, x + w * 0.05, y + h * (sub ? 0.42 : 0.5), w * 0.9, h * (sub ? 0.46 : 0.58), 800, fg);
  if (sub) { g.globalAlpha = 0.85; centred(g, sub, x + w * 0.05, y + h * 0.78, w * 0.9, h * 0.2, 700, fg); g.globalAlpha = 1; }
};

/** A shop's fascia: its colour, name, a line under it and a small mark on the left. */
const brand = (bg, fg, name, sub, mark) => (g, x, y, w, h) => {
  g.fillStyle = bg; g.fillRect(x, y, w, h);
  const m = h * 0.9;
  if (mark) mark(g, x + h * 0.55, y + h / 2, h * 0.36);
  const tx = x + (mark ? m : w * 0.05), tw = w - (mark ? m : w * 0.05) - w * 0.04;
  centred(g, name, tx, y + h * (sub ? 0.4 : 0.52), tw, h * (sub ? 0.5 : 0.6), 900, fg);
  if (sub) { g.globalAlpha = 0.85; centred(g, sub, tx, y + h * 0.8, tw, h * 0.2, 700, fg); g.globalAlpha = 1; }
};
const dot = (color) => (g, cx, cy, r) => { g.fillStyle = color; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill(); };
const ring = (color) => (g, cx, cy, r) => { g.strokeStyle = color; g.lineWidth = r * 0.3; g.beginPath(); g.arc(cx, cy, r * 0.8, 0, Math.PI * 2); g.stroke(); };
const kanji = (ch, bg, fg) => (g, cx, cy, r) => {
  g.fillStyle = bg; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  g.font = `900 ${r * 1.2}px ${FONT}`; g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, cx, cy + r * 0.05);
};
const flower = (color) => (g, cx, cy, r) => sakura(g, cx, cy, r, color);

/** Wayfinding: a dark blade with a pictogram square and a name. */
const way = (icon, name, sub) => (g, x, y, w, h) => {
  g.fillStyle = '#26324a'; g.fillRect(x, y, w, h);
  g.fillStyle = '#fff8ee'; g.fillRect(x + h * 0.12, y + h * 0.12, h * 0.76, h * 0.76);
  centred(g, icon, x + h * 0.12, y + h * 0.52, h * 0.76, h * 0.5, 900, '#26324a');
  g.textAlign = 'left';
  fit(g, name, w - h * 1.2, h * 0.36, 800);
  g.fillStyle = '#fff8ee'; g.textBaseline = 'middle'; g.fillText(name, x + h * 1.05, y + h * (sub ? 0.36 : 0.5));
  if (sub) { fit(g, sub, w - h * 1.2, h * 0.2, 700); g.fillStyle = '#c9d3e6'; g.fillText(sub, x + h * 1.05, y + h * 0.72); }
};

/** The floor guide: a plan of the ground floor and the floors above. */
function guide(g, x, y, w, h) {
  g.fillStyle = '#f7f4ee'; g.fillRect(x, y, w, h);
  g.fillStyle = '#26324a'; g.fillRect(x, y, w, h * 0.12);
  centred(g, 'FLOOR GUIDE  フロアガイド', x, y + h * 0.06, w, h * 0.06, 900, '#fff8ee');
  const px = x + w * 0.06, py = y + h * 0.17, pw = w * 0.88, ph = h * 0.46;
  g.fillStyle = '#e8e2d8'; g.fillRect(px, py, pw, ph);
  // Anchors at the back, the concourse, the shop row by the doors.
  g.fillStyle = '#2f8f5b'; g.fillRect(px, py, pw * 0.47, ph * 0.55);
  g.fillStyle = '#c9ced6'; g.fillRect(px + pw * 0.475, py, pw * 0.1, ph * 0.55);
  g.fillStyle = '#e27c9a'; g.fillRect(px + pw * 0.58, py, pw * 0.42, ph * 0.33);
  g.fillStyle = '#fbf8f2'; g.fillRect(px, py + ph * 0.56, pw, ph * 0.22);
  const units = ['#26324a', '#f2c230', '#e27c9a', '#e2574c', null, '#c98a4b', null, '#2f6fb3', '#7a5fb3', '#c0392b', '#1f6f8b'];
  units.forEach((c, i) => { if (c) { g.fillStyle = c; g.fillRect(px + pw * i / units.length + 2, py + ph * 0.79, pw / units.length - 4, ph * 0.21); } });
  g.fillStyle = '#e2574c'; g.beginPath(); g.arc(px + pw * 0.4, py + ph * 0.67, w * 0.025, 0, Math.PI * 2); g.fill();
  centred(g, '現在地 YOU ARE HERE', px, py + ph * 0.67, pw * 0.36, h * 0.03, 800, '#e2574c');
  const rows = [['3F', 'Hikari Cinema · Food Court', '#c9a227'], ['2F', 'Fashion · Sports · Kids Park', '#e27c9a'], ['1F', 'Fresh Market · Sakura Style · Shops', '#2f8f5b']];
  rows.forEach(([f, t, c], i) => {
    const ry = y + h * (0.7 + i * 0.095);
    g.fillStyle = c; g.fillRect(x + w * 0.06, ry, w * 0.14, h * 0.075);
    centred(g, f, x + w * 0.06, ry + h * 0.04, w * 0.14, h * 0.05, 900, '#ffffff');
    g.textAlign = 'left'; fit(g, t, w * 0.7, h * 0.04, 700); g.fillStyle = '#26324a'; g.textBaseline = 'middle'; g.fillText(t, x + w * 0.24, ry + h * 0.04);
  });
}

/** The sign list: id → [width, height, painter, density]. */
function signs() {
  const list = {
    ...pictures(),
    guide: [240, 320, guide],
    // Shop fascias (the shop row) and the upper floor's.
    books: [384, 68, brand('#26324a', '#fff8ee', 'Hikari Books', '本 · 雑誌 · 文具', kanji('本', '#c9a227', '#26324a')), 1.75],
    denki: [384, 68, brand('#f2c230', '#141518', 'DENKI PLAZA', 'TV · PC · スマホ · 家電', kanji('電', '#e2574c', '#ffffff')), 1.75],
    drug: [384, 68, brand('#ffffff', '#2f6fb3', 'Kirei Drug', 'コスメ · くすり · 日用品', kanji('薬', '#2f6fb3', '#ffffff')), 1.75],
    hyaku: [384, 68, brand('#e2574c', '#ffffff', 'Everything ¥100', '100円ショップ', kanji('¥', '#ffffff', '#e2574c')), 1.75],
    cafe: [384, 68, brand('#f6dbe3', '#5b3b2e', 'Sakura Bakery Café', 'パン · ケーキ · コーヒー', flower('#e27c9a')), 1.75],
    toys: [384, 68, brand('#2f6fb3', '#ffffff', 'Toy Planet', 'おもちゃ · ゲーム · ぬいぐるみ', ring('#f2c230')), 1.75],
    shoes: [384, 68, brand('#3b3f46', '#ffffff', 'ASHI Shoes', 'スニーカー · ブーツ', dot('#e2574c')), 1.75],
    ramen: [384, 68, brand('#7a2e2e', '#fff3dc', 'Ramen Ichiban', 'らーめん 一番', kanji('麺', '#fff3dc', '#7a2e2e')), 1.75],
    games: [384, 68, brand('#141518', '#ff8ad8', 'GAME HIKARI', 'UFOキャッチャー · プリクラ', ring('#4fe3ff')), 1.75],
    sports: [320, 60, brand('#1f6f8b', '#ffffff', 'Hikari Sports', '', dot('#f2c230')), 1.75],
    home: [320, 60, brand('#efe6d0', '#5b4632', 'Living & Home', '', null), 1.75],
    optical: [320, 60, brand('#ffffff', '#26324a', 'Mirai Optical', '', ring('#26324a')), 1.75],
    foodcourt: [512, 75, brand('#e8892f', '#ffffff', 'Food Court  HIKARI DINING', 'フードコート 2F', null), 1.5],
    kids: [320, 60, brand('#f2c230', '#2f6fb3', 'Kids Park', '', flower('#e2574c')), 1.75],
    wear: [320, 60, brand('#3b3f46', '#ffffff', 'basics wear', '', null), 1.75],
    cinema: [512, 75, brand('#141518', '#c9a227', 'HIKARI CINEMA', '映画館 · 8 SCREENS', null), 1.5],
    salon: [320, 60, brand('#f6dbe3', '#3a2430', 'Hair Salon Rin', '', flower('#e27c9a')), 1.75],
    tea: [320, 60, brand('#2f6b3a', '#fff8ee', 'Matcha Tea House', '', null), 1.75],
    music: [320, 60, brand('#7a2e8a', '#ffffff', 'Sound Box', '', dot('#4fe3ff')), 1.75],
    home2: [320, 60, brand('#d6b58a', '#3b2a1e', 'Nordic Living', '', null), 1.75],
    bags: [320, 60, brand('#26324a', '#f6dbe3', 'Bag & Travel', '', null), 1.75],
    // The food court's stalls, the closed fronts upstairs (a hoarding, a note on a shutter).
    takoSign: [320, 60, brand('#e8892f', '#ffffff', 'Tako Tako', 'たこ焼き · タピオカ', kanji('た', '#ffffff', '#e8892f')), 1.5],
    udonSign: [320, 60, brand('#1d2433', '#fff8ee', 'Udon Kaze', '讃岐うどん', kanji('う', '#a9cde6', '#1d2433')), 1.5],
    'soon:optical': [512, 128, (g, x, y, w, h) => {
      g.fillStyle = '#ffffff'; g.fillRect(x, y, w, h);
      g.fillStyle = '#26324a'; g.fillRect(x, y + h * 0.8, w, h * 0.2);
      ring('#26324a')(g, x + w * 0.2, y + h * 0.3, h * 0.17);
      centred(g, 'Mirai Optical', x + w * 0.28, y + h * 0.3, w * 0.5, h * 0.3, 900, '#26324a');
      centred(g, 'NEW OPEN  11.1 SAT', x + w * 0.2, y + h * 0.62, w * 0.6, h * 0.2, 900, '#e27c9a');
      centred(g, 'COMING SOON · 近日オープン · メガネ · コンタクト', x + w * 0.05, y + h * 0.9, w * 0.9, h * 0.11, 800, '#fff8ee');
    }, 1.5],
    closedToday: [96, 128, (g, x, y, w, h) => {
      g.fillStyle = '#fbf8f2'; g.fillRect(x, y, w, h);
      centred(g, '本日休業', x, y + h * 0.2, w, h * 0.16, 900, '#c0392b');
      centred(g, 'Closed today', x, y + h * 0.38, w, h * 0.1, 800, '#26324a');
      g.fillStyle = '#c9c4b8'; for (let i = 0; i < 3; i++) g.fillRect(x + w * 0.15, y + h * (0.55 + i * 0.1), w * 0.7, 3);
      centred(g, 'Sound Box', x, y + h * 0.9, w, h * 0.08, 800, '#7a2e8a');
    }, 2],
    // Wayfinding and notices.
    wayMarket: [320, 70, way('F', 'Hikari Fresh Market', 'スーパーマーケット'), 1.5],
    wayStyle: [320, 70, way('S', 'Sakura Style', 'ファッション'), 1.5],
    wayWC: [320, 70, way('WC', 'Restrooms · お手洗い', 'Baby room · Lockers'), 1.5],
    wayUp: [320, 70, way('2F', 'Food Court · Cinema 3F', 'エスカレーター · エレベーター'), 1.5],
    wayExit: [320, 70, way('P', 'Exit · Parking', '出口 · 駐車場'), 1.5],
    info: [192, 72, board('#2f6fb3', '#ffffff', 'i  Information', '案内所')],
    marketEntry: [384, 72, board('#2f8f5b', '#ffffff', 'ENTRANCE 入口', '', '#f6d24a'), 1.5],
    westDoor: [384, 72, board('#26324a', '#fff8ee', 'WEST ENTRANCE · 西口'), 1.5],
    eastDoor: [384, 72, board('#26324a', '#fff8ee', 'EAST ENTRANCE · 東口'), 1.5],
    open: [96, 48, board('#2f8f5b', '#ffffff', 'OPEN')],
    gachaSign: [384, 72, board('#f2c230', '#e2574c', 'GACHA GACHA', 'ガチャガチャの森'), 1.5],
    crepe: [192, 72, board('#f6c1d1', '#7a2e8a', 'Crêpe', 'クレープ')],
    puriHood: [192, 48, board('#e27c9a', '#ffffff', 'PURI ♡ PHOTO')],
    logo: [896, 176, (g, x, y, w, h) => {
      g.fillStyle = '#26324a'; g.fillRect(x, y, w, h);
      sakura(g, x + h * 0.55, y + h * 0.5, h * 0.36, '#f3a9be');
      fit(g, 'HIKARI MALL', w - h * 1.3, h * 0.62, 800);
      g.fillStyle = '#fff8ee'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText('HIKARI MALL', x + h * 1.05, y + h * 0.53);
    }, 1.5],
    market: [896, 156, board('#2f8f5b', '#ffffff', 'Hikari Fresh Market', 'SUPERMARKET · OPEN 9:00 – 22:00', '#f6d24a'), 1.25],
    style: [896, 156, (g, x, y, w, h) => {
      g.fillStyle = '#fbe9ee'; g.fillRect(x, y, w, h);
      sakura(g, x + h * 0.5, y + h * 0.5, h * 0.3, '#e27c9a');
      g.fillStyle = '#3a2430'; g.textAlign = 'center'; g.textBaseline = 'middle';
      fit(g, 'Sakura Style', w * 0.7, h * 0.5, 800); g.fillText('Sakura Style', x + w / 2, y + h * 0.42);
      fit(g, 'FASHION · SHOES · ACCESSORIES', w * 0.7, h * 0.17, 700); g.fillText('FASHION · SHOES · ACCESSORIES', x + w / 2, y + h * 0.78);
    }, 1.25],
    welcome: [512, 96, board('#26324a', '#fff8ee', 'WELCOME · いらっしゃいませ')],
    restrooms: [512, 128, board('#5b6475', '#ffffff', 'Restrooms · お手洗い', 'Baby room · Lockers')],
    fitting: [512, 112, board('#3a2430', '#fbe9ee', 'FITTING ROOMS', 'max. 3 items')],
    cartReturn: [512, 128, board('#2f8f5b', '#ffffff', 'CART RETURN', 'カート置き場', '#f6d24a')],
    exit: [256, 128, board('#2f8f5b', '#ffffff', 'EXIT  →', 'Thank you!')],
    deptBakery: [512, 112, board('#c98a4b', '#fff8ee', 'Bakery', 'Fresh every morning')],
    deptDrinks: [512, 112, board('#2f7fc1', '#ffffff', 'Drinks', 'Ice cold')],
    deptProduce: [512, 112, board('#4f9a4a', '#ffffff', 'Fruit & Vegetables', 'From local farms'), 1.25],
    pylon: [192, 384, (g, x, y, w, h) => {
      g.fillStyle = '#26324a'; g.fillRect(x, y, w, h);
      sakura(g, x + w / 2, y + h * 0.16, w * 0.22, '#f3a9be');
      centred(g, 'HIKARI', x, y + h * 0.36, w, w * 0.24, 800, '#fff8ee');
      centred(g, 'MALL', x, y + h * 0.47, w, w * 0.24, 800, '#fff8ee');
      g.fillStyle = '#2f8f5b'; g.fillRect(x + w * 0.08, y + h * 0.58, w * 0.84, h * 0.15);
      centred(g, 'Fresh Market', x + w * 0.08, y + h * 0.655, w * 0.84, w * 0.12, 800, '#ffffff');
      g.fillStyle = '#fbe9ee'; g.fillRect(x + w * 0.08, y + h * 0.77, w * 0.84, h * 0.15);
      centred(g, 'Sakura Style', x + w * 0.08, y + h * 0.845, w * 0.84, w * 0.12, 800, '#3a2430');
    }, 1.5],
    sale: [192, 288, (g, x, y, w, h) => {
      g.fillStyle = '#e2574c'; g.fillRect(x, y, w, h);
      centred(g, 'SALE', x, y + h * 0.3, w, w * 0.34, 800, '#ffffff');
      centred(g, 'up to 30% off', x, y + h * 0.5, w, w * 0.1, 700, '#ffe7c2');
      sakura(g, x + w / 2, y + h * 0.75, w * 0.18, '#ffd1dc');
    }],
    season: [192, 288, (g, x, y, w, h) => {
      const gr = g.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, '#f8d6e0'); gr.addColorStop(1, '#c4b2e8');
      g.fillStyle = gr; g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(255,255,255,0.65)'; g.beginPath(); g.ellipse(x + w / 2, y + h * 0.42, w * 0.22, h * 0.26, 0, 0, Math.PI * 2); g.fill();
      centred(g, 'NEW SEASON', x, y + h * 0.82, w, w * 0.12, 800, '#3a2430');
    }],
    screen: [128, 96, (g, x, y, w, h) => {
      g.fillStyle = '#1d2c44'; g.fillRect(x, y, w, h);
      g.fillStyle = '#4fb3e8'; g.fillRect(x + 6, y + 6, w - 12, 16);
      g.fillStyle = '#d9e6f2'; for (let i = 0; i < 4; i++) g.fillRect(x + 8, y + 30 + i * 14, w * (0.4 + (i % 2) * 0.2), 6);
      g.fillStyle = '#7bd389'; g.fillRect(x + w - 44, y + h - 22, 36, 14);
    }],
    accessible: [128, 128, (g, x, y, w, h) => {
      g.fillStyle = '#2f6fb3'; g.fillRect(x, y, w, h);
      g.strokeStyle = '#ffffff'; g.fillStyle = '#ffffff'; g.lineWidth = w * 0.07; g.lineCap = 'round';
      g.beginPath(); g.arc(x + w * 0.52, y + h * 0.2, w * 0.07, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(x + w * 0.5, y + h * 0.32); g.lineTo(x + w * 0.5, y + h * 0.58); g.lineTo(x + w * 0.7, y + h * 0.58); g.lineTo(x + w * 0.78, y + h * 0.78); g.stroke();
      g.beginPath(); g.arc(x + w * 0.44, y + h * 0.66, w * 0.2, Math.PI * 0.1, Math.PI * 1.55); g.stroke();
    }, 1.5],
    arrow: [128, 128, (g, x, y, w, h) => {
      g.fillStyle = '#ffffff';
      g.beginPath(); g.moveTo(x + w * 0.5, y + h * 0.06); g.lineTo(x + w * 0.86, y + h * 0.46); g.lineTo(x + w * 0.62, y + h * 0.46);
      g.lineTo(x + w * 0.62, y + h * 0.94); g.lineTo(x + w * 0.38, y + h * 0.94); g.lineTo(x + w * 0.38, y + h * 0.46); g.lineTo(x + w * 0.14, y + h * 0.46); g.closePath(); g.fill();
    }],
  };
  for (const a of AISLE_LANES) {
    list[`aisle${a.n}`] = [512, 96, (g, x, y, w, h) => {
      g.fillStyle = '#fbfaf6'; g.fillRect(x, y, w, h);
      g.fillStyle = AISLE_COLORS[a.aisle]; g.fillRect(x, y, h, h); g.fillRect(x, y + h - 10, w, 10);
      centred(g, String(a.n), x, y + h * 0.5, h, h * 0.66, 800, '#ffffff');
      g.textAlign = 'left';
      fit(g, AISLES[a.aisle], w - h * 1.25, h * 0.36, 800);
      g.fillStyle = '#26324a'; g.textBaseline = 'middle'; g.fillText(AISLES[a.aisle], x + h * 1.15, y + h * 0.48);
    }];
  }
  CHECKOUT_X.forEach((_, i) => {
    list[`lane${i + 1}`] = [128, 128, (g, x, y, w, h) => {
      g.fillStyle = '#1d2433'; g.fillRect(x, y, w, h);
      rounded(g, x + 8, y + 8, w - 16, h - 16, 18); g.fillStyle = '#3fbf6e'; g.fill();
      centred(g, String(i + 1), x, y + h * 0.53, w, h * 0.66, 800, '#ffffff');
    }];
  });
  return list;
}

export class MallSigns {
  constructor(scene) {
    const tex = new DynamicTexture('mall:signs', { width: W, height: H }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
    // Fascias and hanging boards are mostly seen at a slant along the concourse and aisles.
    tex.anisotropicFilteringLevel = 8;
    tex.wrapU = tex.wrapV = Texture.CLAMP_ADDRESSMODE;
    const g = tex.getContext();
    g.fillStyle = '#808080'; g.fillRect(0, 0, W, H);
    this.rects = {};
    this.aspects = {};
    // Skyline packing, tallest (then widest) first: each sign goes where the
    // stack under it is lowest (and, of equals, wastes the least room under it).
    const STEP = 4, pad = 2, sky = new Int32Array(W / STEP);
    const entries = Object.entries(signs()).map(([id, [w, h, paint, d = 1]]) => [id, w, h, paint, d, Math.ceil(w * d), Math.ceil(h * d)])
      .sort((a, b) => b[6] - a[6] || b[5] - a[5]);
    for (const [id, dw, dh, paint, d, w, h] of entries) {
      const cols = Math.ceil((w + pad) / STEP);
      let best = -1, bestY = Infinity, bestWaste = Infinity;
      for (let c = 0; c + cols <= sky.length; c++) {
        let top = 0, waste = 0;
        for (let k = c; k < c + cols; k++) top = Math.max(top, sky[k]);
        for (let k = c; k < c + cols; k++) waste += top - sky[k];
        if (top < bestY || (top === bestY && waste < bestWaste)) { bestY = top; best = c; bestWaste = waste; }
      }
      const x = best * STEP, y = bestY;
      if (best < 0 || y + h > H) throw new Error(`mall sign atlas full at ${id}`);
      for (let k = best; k < best + cols; k++) sky[k] = y + h + pad;
      g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
      g.translate(x, y); g.scale(d, d);
      paint(g, 0, 0, dw, dh);
      g.restore();
      // v runs up the canvas (DynamicTexture's flip); a hair inside, so mips don't bleed.
      this.aspects[id] = dw / dh;
      this.rects[id] = [(x + 1) / W, 1 - (y + h - 1) / H, (x + w - 1) / W, 1 - (y + 1) / H];
    }
    tex.update();
    this.texture = tex;
    // Self-lit (no light or shadow on them): signs glow a little at dusk and read the same indoors.
    const m = new PBRMaterial('mall:signs', scene);
    m.albedoTexture = tex;
    m.unlit = true;
    this.material = m;
    // Printed goods and rooms, lit like the shelves they stand on (same picture).
    const p = new PBRMaterial('mall:print', scene);
    p.albedoTexture = tex;
    p.roughness = 0.75;
    p.metallic = 0;
    this.print = p;
  }

  /** uv rectangle [u0, v0, u1, v1] of a sign. */
  rect(id) { return this.rects[id]; }

  /** A sign's width over its height (as painted). */
  aspect(id) { return this.aspects[id]; }

  dispose() {
    this.material.dispose();
    this.print.dispose();
    this.texture.dispose();
  }
}
