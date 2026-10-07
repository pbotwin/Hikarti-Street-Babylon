import { DynamicTexture, PBRMaterial, Texture } from '@babylonjs/core';
import { AISLES } from './MallCatalog.js';
import { AISLE_LANES, CHECKOUT_X } from './MallPlan.js';
import { FONT } from '../interiors/Labels.js';

/**
 * Every sign in Hikari Mall painted once into one atlas (2048 × 1024): the
 * HIKARI MALL letters, shop names, aisle and department boards, lane
 * numbers, lot markings, posters, the register screens. One self-lit
 * material draws them all, so signs cost one draw per zone and read the
 * same under the sunset and the store lights.
 */
const W = 2048, H = 1024;

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

/** The sign list: id → [width, height, painter]. */
function signs() {
  const list = {
    logo: [896, 176, (g, x, y, w, h) => {
      g.fillStyle = '#26324a'; g.fillRect(x, y, w, h);
      sakura(g, x + h * 0.55, y + h * 0.5, h * 0.36, '#f3a9be');
      fit(g, 'HIKARI MALL', w - h * 1.3, h * 0.62, 800);
      g.fillStyle = '#fff8ee'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText('HIKARI MALL', x + h * 1.05, y + h * 0.53);
    }],
    market: [896, 156, board('#2f8f5b', '#ffffff', 'Hikari Fresh Market', 'SUPERMARKET · OPEN 9:00 – 22:00', '#f6d24a')],
    style: [896, 156, (g, x, y, w, h) => {
      g.fillStyle = '#fbe9ee'; g.fillRect(x, y, w, h);
      sakura(g, x + h * 0.5, y + h * 0.5, h * 0.3, '#e27c9a');
      g.fillStyle = '#3a2430'; g.textAlign = 'center'; g.textBaseline = 'middle';
      fit(g, 'Sakura Style', w * 0.7, h * 0.5, 800); g.fillText('Sakura Style', x + w / 2, y + h * 0.42);
      fit(g, 'FASHION · SHOES · ACCESSORIES', w * 0.7, h * 0.17, 700); g.fillText('FASHION · SHOES · ACCESSORIES', x + w / 2, y + h * 0.78);
    }],
    welcome: [512, 96, board('#26324a', '#fff8ee', 'WELCOME · いらっしゃいませ')],
    restrooms: [512, 128, board('#5b6475', '#ffffff', 'Restrooms · お手洗い', 'Baby room · Lockers')],
    fitting: [512, 112, board('#3a2430', '#fbe9ee', 'FITTING ROOMS', 'max. 4 items')],
    cartReturn: [512, 128, board('#2f8f5b', '#ffffff', 'CART RETURN', 'カート置き場', '#f6d24a')],
    exit: [256, 128, board('#2f8f5b', '#ffffff', 'EXIT  →', 'Thank you!')],
    deptBakery: [512, 112, board('#c98a4b', '#fff8ee', 'Bakery', 'Fresh every morning')],
    deptDrinks: [512, 112, board('#2f7fc1', '#ffffff', 'Drinks', 'Ice cold')],
    deptProduce: [512, 112, board('#4f9a4a', '#ffffff', 'Fruit & Vegetables', 'From local farms')],
    pylon: [192, 384, (g, x, y, w, h) => {
      g.fillStyle = '#26324a'; g.fillRect(x, y, w, h);
      sakura(g, x + w / 2, y + h * 0.16, w * 0.22, '#f3a9be');
      centred(g, 'HIKARI', x, y + h * 0.36, w, w * 0.24, 800, '#fff8ee');
      centred(g, 'MALL', x, y + h * 0.47, w, w * 0.24, 800, '#fff8ee');
      g.fillStyle = '#2f8f5b'; g.fillRect(x + w * 0.08, y + h * 0.58, w * 0.84, h * 0.15);
      centred(g, 'Fresh Market', x + w * 0.08, y + h * 0.655, w * 0.84, w * 0.12, 800, '#ffffff');
      g.fillStyle = '#fbe9ee'; g.fillRect(x + w * 0.08, y + h * 0.77, w * 0.84, h * 0.15);
      centred(g, 'Sakura Style', x + w * 0.08, y + h * 0.845, w * 0.84, w * 0.12, 800, '#3a2430');
    }],
    directory: [192, 288, (g, x, y, w, h) => {
      g.fillStyle = '#f7f4ee'; g.fillRect(x, y, w, h);
      g.fillStyle = '#26324a'; g.fillRect(x, y, w, h * 0.16);
      centred(g, 'FLOOR GUIDE', x, y + h * 0.08, w, h * 0.08, 800, '#fff8ee');
      g.fillStyle = '#2f8f5b'; g.fillRect(x + w * 0.08, y + h * 0.24, w * 0.4, h * 0.5);
      g.fillStyle = '#c9ced6'; g.fillRect(x + w * 0.5, y + h * 0.24, w * 0.08, h * 0.5);
      g.fillStyle = '#e27c9a'; g.fillRect(x + w * 0.6, y + h * 0.24, w * 0.32, h * 0.3);
      g.fillStyle = '#e8e2d8'; g.fillRect(x + w * 0.08, y + h * 0.76, w * 0.84, h * 0.08);
      centred(g, 'Fresh Market', x + w * 0.08, y + h * 0.88, w * 0.42, h * 0.045, 700, '#2f8f5b');
      centred(g, 'Sakura Style', x + w * 0.5, y + h * 0.88, w * 0.42, h * 0.045, 700, '#c0577a');
      g.fillStyle = '#e2574c'; g.beginPath(); g.arc(x + w * 0.45, y + h * 0.8, w * 0.03, 0, Math.PI * 2); g.fill();
    }],
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
    fresh: [192, 288, (g, x, y, w, h) => {
      g.fillStyle = '#f6d24a'; g.fillRect(x, y, w, h);
      g.fillStyle = '#e2574c'; g.beginPath(); g.arc(x + w * 0.38, y + h * 0.36, w * 0.17, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#f29a2e'; g.beginPath(); g.arc(x + w * 0.62, y + h * 0.4, w * 0.15, 0, Math.PI * 2); g.fill();
      centred(g, 'FRESH', x, y + h * 0.66, w, w * 0.2, 800, '#2f6b3a');
      centred(g, 'every day', x, y + h * 0.78, w, w * 0.1, 700, '#2f6b3a');
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
    }],
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
    tex.anisotropicFilteringLevel = 4;
    tex.wrapU = tex.wrapV = Texture.CLAMP_ADDRESSMODE;
    const g = tex.getContext();
    g.fillStyle = '#808080'; g.fillRect(0, 0, W, H);
    this.rects = {};
    // Skyline packing, tallest first: each sign goes where the stack under it
    // is lowest (and, of equals, wastes the least room under it).
    const STEP = 4, pad = 2, sky = new Int32Array(W / STEP);
    const entries = Object.entries(signs()).sort((a, b) => b[1][1] - a[1][1]);
    for (const [id, [w, h, paint]] of entries) {
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
      paint(g, x, y, w, h);
      g.restore();
      // v runs up the canvas (DynamicTexture's flip); a hair inside, so mips don't bleed.
      this.rects[id] = [(x + 1) / W, 1 - (y + h - 1) / H, (x + w - 1) / W, 1 - (y + 1) / H];
    }
    tex.update();
    this.texture = tex;
    // Self-lit (no light or shadow on them): signs glow a little at dusk and read the same indoors.
    const m = new PBRMaterial('mall:signs', scene);
    m.albedoTexture = tex;
    m.unlit = true;
    this.material = m;
  }

  /** uv rectangle [u0, v0, u1, v1] of a sign. */
  rect(id) { return this.rects[id]; }

  dispose() {
    this.material.dispose();
    this.texture.dispose();
  }
}
