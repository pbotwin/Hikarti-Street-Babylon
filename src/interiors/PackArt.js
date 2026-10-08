/**
 * Illustrations for the grocery packs (GroceryPrint paints them into the
 * label atlas): the product "photo" on a pack (ART, by the catalog's
 * look.art), the emblem by a brand's name (MARKS, by BRANDS[].mark) and the
 * skins of loose produce (SKINS). Plain 2D canvas drawing, painted once per
 * trip; a pack's detail lives here, in the texture, not in triangles.
 *
 * Every function draws centred on (x, y) at size s (its diameter, in the
 * caller's units: millimetres of the pack).
 */

const TAU = Math.PI * 2;

/** `hex` mixed with white (k > 0) or black (k < 0). */
export function tone(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const t = k > 0 ? 255 : 0, a = Math.abs(k);
  const c = (v) => Math.round(v + (t - v) * a);
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

/** Relative luminance 0..255 (picks readable ink on a ground). */
export const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11;
};

function ellipse(g, x, y, rx, ry, rot = 0) {
  g.beginPath();
  g.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, TAU);
}

/** A glossy round thing: lit from the top left, darker at the rim. */
function ball(g, x, y, r, hex, ry = r, rot = 0) {
  const grd = g.createRadialGradient(x - r * 0.35, y - ry * 0.4, r * 0.05, x, y, Math.max(r, ry) * 1.05);
  grd.addColorStop(0, tone(hex, 0.55));
  grd.addColorStop(0.35, hex);
  grd.addColorStop(1, tone(hex, -0.45));
  g.fillStyle = grd;
  ellipse(g, x, y, r, ry, rot);
  g.fill();
}

/** A pointed leaf from (x, y) along `a` (radians), with its midrib. */
function leaf(g, x, y, len, a, hex, wide = 0.32) {
  g.save();
  g.translate(x, y); g.rotate(a);
  g.fillStyle = hex;
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(len * 0.45, -len * wide, len, 0);
  g.quadraticCurveTo(len * 0.45, len * wide, 0, 0);
  g.fill();
  g.strokeStyle = tone(hex, -0.3); g.lineWidth = len * 0.04;
  g.beginPath(); g.moveTo(len * 0.05, 0); g.lineTo(len * 0.9, 0); g.stroke();
  g.restore();
}

/** Small white sparkle (a glint on glossy art). */
function glint(g, x, y, r) {
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath();
  g.moveTo(x, y - r); g.quadraticCurveTo(x, y, x + r, y); g.quadraticCurveTo(x, y, x, y + r);
  g.quadraticCurveTo(x, y, x - r, y); g.quadraticCurveTo(x, y, x, y - r);
  g.fill();
}

/** A five-petal flower (sakura when notched). */
function flower(g, x, y, r, petal, centre, notch = true) {
  g.fillStyle = petal;
  for (let k = 0; k < 5; k++) {
    g.save();
    g.translate(x, y); g.rotate((k / 5) * TAU);
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(-r * 0.55, -r * 0.35, -r * 0.5, -r * 1.0, notch ? -r * 0.12 : 0, -r);
    if (notch) g.lineTo(0, -r * 0.84), g.lineTo(r * 0.12, -r);
    g.bezierCurveTo(r * 0.5, -r * 1.0, r * 0.55, -r * 0.35, 0, 0);
    g.fill();
    g.restore();
  }
  g.fillStyle = centre;
  g.beginPath(); g.arc(x, y, r * 0.18, 0, TAU); g.fill();
}

function strawberry(g, x, y, s) {
  const r = s / 2;
  const grd = g.createRadialGradient(x - r * 0.3, y - r * 0.1, r * 0.1, x, y, r * 1.1);
  grd.addColorStop(0, '#ff6b72'); grd.addColorStop(0.6, '#d8202f'); grd.addColorStop(1, '#8e0f1a');
  g.fillStyle = grd;
  g.beginPath();
  g.moveTo(x - r * 0.85, y - r * 0.45);
  g.bezierCurveTo(x - r * 0.95, y + r * 0.3, x - r * 0.2, y + r * 0.95, x, y + r);
  g.bezierCurveTo(x + r * 0.2, y + r * 0.95, x + r * 0.95, y + r * 0.3, x + r * 0.85, y - r * 0.45);
  g.quadraticCurveTo(x, y - r * 0.75, x - r * 0.85, y - r * 0.45);
  g.fill();
  g.fillStyle = '#f7e27a';
  for (let i = 0; i < 14; i++) {
    const a = i * 2.4, d = 0.15 + (i % 5) * 0.14;
    ellipse(g, x + Math.cos(a) * r * d * 0.8, y + Math.sin(a) * r * d * 0.75 + r * 0.05, r * 0.035, r * 0.055);
    g.fill();
  }
  for (let k = 0; k < 5; k++) leaf(g, x, y - r * 0.55, r * 0.55, -Math.PI / 2 + (k - 2) * 0.55, '#3d8a35', 0.4);
}

function slice(g, x, y, r, rind, flesh, seg = 10) {
  g.fillStyle = rind; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.fillStyle = '#fff6d8'; g.beginPath(); g.arc(x, y, r * 0.9, 0, TAU); g.fill();
  g.fillStyle = flesh;
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * TAU + 0.05, a1 = ((k + 1) / seg) * TAU - 0.05;
    g.beginPath(); g.moveTo(x, y); g.arc(x, y, r * 0.82, a0, a1); g.closePath(); g.fill();
  }
  g.fillStyle = '#fffbea'; g.beginPath(); g.arc(x, y, r * 0.1, 0, TAU); g.fill();
}

function bowl(g, x, y, s, hex, fill) {
  const r = s / 2;
  g.fillStyle = fill;
  ellipse(g, x, y - r * 0.15, r, r * 0.3); g.fill();
  const grd = g.createLinearGradient(x - r, 0, x + r, 0);
  grd.addColorStop(0, tone(hex, -0.3)); grd.addColorStop(0.4, tone(hex, 0.3)); grd.addColorStop(1, tone(hex, -0.35));
  g.fillStyle = grd;
  g.beginPath();
  g.moveTo(x - r, y - r * 0.15);
  g.bezierCurveTo(x - r * 0.95, y + r * 0.75, x + r * 0.95, y + r * 0.75, x + r, y - r * 0.15);
  g.bezierCurveTo(x + r * 0.6, y + r * 0.1, x - r * 0.6, y + r * 0.1, x - r, y - r * 0.15);
  g.fill();
}

function bubbles(g, x, y, s, n, seed = 1) {
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996 + seed, d = Math.sqrt((i + 0.5) / n) * s * 0.5;
    const r = s * (0.03 + ((i * 7 + seed) % 5) * 0.015);
    const bx = x + Math.cos(a) * d, by = y + Math.sin(a) * d;
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = r * 0.25;
    g.beginPath(); g.arc(bx, by, r, 0, TAU); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(bx - r * 0.3, by - r * 0.3, r * 0.3, 0, TAU); g.fill();
  }
}

function stick(g, x0, y0, x1, y1, w, hex, coat, coated = 0.75) {
  g.lineCap = 'round';
  g.strokeStyle = '#e6c27a'; g.lineWidth = w;
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  g.strokeStyle = coat; g.lineWidth = w * 1.15;
  g.beginPath(); g.moveTo(x0 + (x1 - x0) * (1 - coated), y0 + (y1 - y0) * (1 - coated)); g.lineTo(x1, y1); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = w * 0.25;
  g.beginPath(); g.moveTo(x0 + (x1 - x0) * 0.3 - w * 0.2, y0 + (y1 - y0) * 0.3 - w * 0.2); g.lineTo(x1 - w * 0.2, y1 - w * 0.2); g.stroke();
  g.lineCap = 'butt';
}

/** Product illustrations, by look.art. */
export const ART = {
  cola(g, x, y, s) {
    // A glass of cola with ice and fizz.
    const w = s * 0.42, h = s * 0.7, top = y - h / 2;
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath(); g.moveTo(x - w / 2, top); g.lineTo(x - w * 0.42, top + h); g.lineTo(x + w * 0.42, top + h); g.lineTo(x + w / 2, top); g.fill();
    const grd = g.createLinearGradient(0, top + h * 0.15, 0, top + h);
    grd.addColorStop(0, '#7a2a12'); grd.addColorStop(1, '#2a0d06');
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(x - w * 0.48, top + h * 0.15); g.lineTo(x - w * 0.41, top + h * 0.97); g.lineTo(x + w * 0.41, top + h * 0.97); g.lineTo(x + w * 0.48, top + h * 0.15); g.fill();
    g.fillStyle = 'rgba(230,245,255,0.75)';
    for (const [dx, dy, a] of [[-0.12, 0.3, 0.3], [0.1, 0.38, -0.2], [-0.02, 0.22, 0.1]]) {
      g.save(); g.translate(x + dx * s, top + dy * h); g.rotate(a); g.fillRect(-w * 0.16, -w * 0.16, w * 0.32, w * 0.32); g.restore();
    }
    bubbles(g, x, top + h * 0.6, w * 0.8, 9, 3);
    g.fillStyle = '#f2d43a'; g.beginPath(); g.arc(x + w * 0.45, top + h * 0.05, w * 0.28, Math.PI * 0.1, Math.PI * 1.1); g.fill();
    glint(g, x - w * 0.3, top + h * 0.3, w * 0.12);
  },
  blossom(g, x, y, s) {
    flower(g, x - s * 0.12, y + s * 0.05, s * 0.3, '#ffd0de', '#e2557c');
    flower(g, x + s * 0.24, y - s * 0.2, s * 0.18, '#ffffff', '#f08bb0');
    flower(g, x + s * 0.22, y + s * 0.28, s * 0.13, '#f9b4c8', '#d0436a');
    bubbles(g, x, y, s, 6, 2);
  },
  yuzu(g, x, y, s) {
    ball(g, x - s * 0.12, y + s * 0.05, s * 0.3, '#f2c21a');
    slice(g, x + s * 0.2, y + s * 0.18, s * 0.2, '#e8b416', '#f7d84a');
    leaf(g, x - s * 0.05, y - s * 0.22, s * 0.3, -0.5, '#3d7a3a');
  },
  melon(g, x, y, s) {
    // A soda float: green soda, a scoop of vanilla, a cherry.
    const w = s * 0.4, h = s * 0.55, top = y - s * 0.15;
    const grd = g.createLinearGradient(0, top, 0, top + h);
    grd.addColorStop(0, '#9be86a'); grd.addColorStop(1, '#2f9a3a');
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(x - w / 2, top); g.lineTo(x - w * 0.35, top + h); g.lineTo(x + w * 0.35, top + h); g.lineTo(x + w / 2, top); g.fill();
    bubbles(g, x, top + h * 0.55, w * 0.7, 7, 5);
    ball(g, x, top - s * 0.02, s * 0.2, '#fff6e0', s * 0.15);
    ball(g, x + s * 0.06, top - s * 0.2, s * 0.06, '#d8202f');
    g.strokeStyle = '#3d7a3a'; g.lineWidth = s * 0.015;
    g.beginPath(); g.moveTo(x + s * 0.06, top - s * 0.25); g.quadraticCurveTo(x + s * 0.12, top - s * 0.35, x + s * 0.18, top - s * 0.33); g.stroke();
  },
  barley(g, x, y, s) {
    for (const [dx, a] of [[-0.15, -0.25], [0, 0], [0.15, 0.25]]) {
      g.save(); g.translate(x + dx * s, y + s * 0.4); g.rotate(a);
      g.strokeStyle = '#b7863e'; g.lineWidth = s * 0.02;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -s * 0.75); g.stroke();
      for (let k = 0; k < 7; k++) {
        const yy = -s * (0.4 + k * 0.06);
        for (const side of [-1, 1]) { g.fillStyle = k % 2 ? '#d9a14a' : '#c88d36'; ellipse(g, side * s * 0.035, yy, s * 0.03, s * 0.05, side * 0.4); g.fill(); }
      }
      g.restore();
    }
  },
  tea(g, x, y, s) {
    // A tea cup with green tea, leaves behind it.
    leaf(g, x - s * 0.1, y - s * 0.05, s * 0.45, -2.2, '#3f8f3a', 0.3);
    leaf(g, x + s * 0.05, y - s * 0.1, s * 0.42, -1.0, '#5aa84a', 0.3);
    bowl(g, x, y + s * 0.12, s * 0.62, '#f4efe2', '#a8c86a');
  },
  mountain(g, x, y, s) {
    const grd = g.createLinearGradient(0, y - s * 0.4, 0, y + s * 0.3);
    grd.addColorStop(0, '#5a86c8'); grd.addColorStop(1, '#2f5a96');
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(x - s * 0.5, y + s * 0.3); g.lineTo(x - s * 0.1, y - s * 0.35); g.lineTo(x + s * 0.08, y - s * 0.12); g.lineTo(x + s * 0.2, y - s * 0.25); g.lineTo(x + s * 0.5, y + s * 0.3); g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(x - s * 0.18, y - s * 0.22); g.lineTo(x - s * 0.1, y - s * 0.35); g.lineTo(x + s * 0.0, y - s * 0.2); g.lineTo(x - s * 0.06, y - s * 0.24); g.fill();
    g.fillStyle = '#7cc0e8';
    g.beginPath(); g.moveTo(x, y + s * 0.05); g.bezierCurveTo(x - s * 0.12, y + s * 0.2, x - s * 0.1, y + s * 0.35, x, y + s * 0.35); g.bezierCurveTo(x + s * 0.1, y + s * 0.35, x + s * 0.12, y + s * 0.2, x, y + s * 0.05); g.fill();
    glint(g, x - s * 0.03, y + s * 0.24, s * 0.04);
  },
  orange(g, x, y, s) {
    ball(g, x - s * 0.15, y - s * 0.02, s * 0.3, '#f28a1e', s * 0.27);
    slice(g, x + s * 0.18, y + s * 0.15, s * 0.22, '#f28a1e', '#f9a83a');
    leaf(g, x - s * 0.1, y - s * 0.28, s * 0.25, -0.6, '#3d7a3a');
  },
  apple(g, x, y, s) {
    ball(g, x - s * 0.08, y, s * 0.33, '#d0262f', s * 0.3);
    g.strokeStyle = '#5a3a1c'; g.lineWidth = s * 0.025;
    g.beginPath(); g.moveTo(x - s * 0.08, y - s * 0.25); g.quadraticCurveTo(x - s * 0.06, y - s * 0.35, x - s * 0.02, y - s * 0.4); g.stroke();
    leaf(g, x - s * 0.06, y - s * 0.33, s * 0.2, -0.4, '#4a8f3a');
    // A cut half beside it.
    g.fillStyle = '#c8202c'; ellipse(g, x + s * 0.25, y + s * 0.15, s * 0.19, s * 0.18); g.fill();
    g.fillStyle = '#fff3cf'; ellipse(g, x + s * 0.25, y + s * 0.15, s * 0.165, s * 0.155); g.fill();
    g.fillStyle = '#5a3a1c'; for (const d of [-1, 1]) { ellipse(g, x + s * 0.25 + d * s * 0.03, y + s * 0.15, s * 0.012, s * 0.025); g.fill(); }
    glint(g, x - s * 0.22, y - s * 0.12, s * 0.05);
  },
  beans(g, x, y, s) {
    for (const [dx, dy, a] of [[-0.18, 0.05, 0.4], [0.05, -0.12, -0.3], [0.2, 0.12, 0.9], [-0.02, 0.2, -1.1]]) {
      const bx = x + dx * s, by = y + dy * s;
      ball(g, bx, by, s * 0.14, '#6a3a1e', s * 0.1, a);
      g.strokeStyle = '#2a140a'; g.lineWidth = s * 0.015;
      g.beginPath(); g.moveTo(bx - Math.cos(a) * s * 0.11, by - Math.sin(a) * s * 0.11);
      g.quadraticCurveTo(bx, by + s * 0.02, bx + Math.cos(a) * s * 0.11, by + Math.sin(a) * s * 0.11); g.stroke();
    }
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = s * 0.02;
    for (const dx of [-0.1, 0.05]) { g.beginPath(); g.moveTo(x + dx * s, y - s * 0.3); g.bezierCurveTo(x + dx * s - s * 0.06, y - s * 0.38, x + dx * s + s * 0.06, y - s * 0.44, x + dx * s, y - s * 0.52); g.stroke(); }
  },
  bolt(g, x, y, s) {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(x + s * 0.1, y - s * 0.45); g.lineTo(x - s * 0.2, y + s * 0.05); g.lineTo(x - s * 0.01, y + s * 0.05);
    g.lineTo(x - s * 0.12, y + s * 0.45); g.lineTo(x + s * 0.22, y - s * 0.08); g.lineTo(x + s * 0.03, y - s * 0.08); g.closePath();
    g.fill();
    g.strokeStyle = '#d92b2b'; g.lineWidth = s * 0.04; g.stroke();
  },
  butter(g, x, y, s) {
    // A pat of butter on a slice of toast.
    g.fillStyle = '#d99a4a'; g.beginPath(); g.roundRect(x - s * 0.38, y - s * 0.22, s * 0.76, s * 0.5, s * 0.1); g.fill();
    g.fillStyle = '#f6e3b0'; g.beginPath(); g.roundRect(x - s * 0.32, y - s * 0.16, s * 0.64, s * 0.38, s * 0.06); g.fill();
    g.fillStyle = '#ffe680';
    g.beginPath(); g.moveTo(x - s * 0.14, y - s * 0.1); g.lineTo(x + s * 0.12, y - s * 0.14); g.lineTo(x + s * 0.16, y + s * 0.06); g.lineTo(x - s * 0.1, y + s * 0.1); g.closePath(); g.fill();
    g.fillStyle = '#fff3b8'; g.beginPath(); g.moveTo(x - s * 0.14, y - s * 0.1); g.lineTo(x + s * 0.12, y - s * 0.14); g.lineTo(x + s * 0.1, y - s * 0.1); g.lineTo(x - s * 0.12, y - s * 0.06); g.fill();
  },
  milk(g, x, y, s) {
    // A glass of milk and a splash crown.
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(x - s * 0.2, y - s * 0.2); g.lineTo(x - s * 0.17, y + s * 0.38); g.lineTo(x + s * 0.17, y + s * 0.38); g.lineTo(x + s * 0.2, y - s * 0.2); g.fill();
    g.strokeStyle = 'rgba(120,150,190,0.6)'; g.lineWidth = s * 0.02; g.stroke();
    for (let k = 0; k < 7; k++) {
      const a = Math.PI + (k / 6) * Math.PI;
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(x + Math.cos(a) * s * 0.28, y - s * 0.22 + Math.sin(a) * s * 0.18, s * (0.035 + (k % 2) * 0.02), 0, TAU); g.fill();
    }
    g.fillStyle = '#ffffff'; ellipse(g, x, y - s * 0.22, s * 0.28, s * 0.07); g.fill();
    g.strokeStyle = 'rgba(120,150,190,0.5)'; g.stroke();
  },
  strawberry(g, x, y, s) {
    strawberry(g, x - s * 0.12, y + s * 0.05, s * 0.5);
    strawberry(g, x + s * 0.2, y - s * 0.1, s * 0.36);
    leaf(g, x + s * 0.05, y + s * 0.3, s * 0.2, 0.3, '#3d8a35');
  },
  yogurt(g, x, y, s) {
    bowl(g, x, y + s * 0.08, s * 0.7, '#cfe0f4', '#fbfbf6');
    g.fillStyle = '#ffffff'; ellipse(g, x - s * 0.05, y - s * 0.12, s * 0.12, s * 0.05); g.fill();
    g.fillStyle = '#c8cdd6'; g.save(); g.translate(x + s * 0.15, y - s * 0.12); g.rotate(-0.7);
    g.fillRect(-s * 0.015, -s * 0.35, s * 0.03, s * 0.3); ellipse(g, 0, -s * 0.02, s * 0.06, s * 0.08); g.fill(); g.restore();
    ball(g, x + s * 0.2, y - s * 0.22, s * 0.05, '#4a3a8a');
    ball(g, x + s * 0.27, y - s * 0.18, s * 0.05, '#4a3a8a');
  },
  peach(g, x, y, s) {
    ball(g, x - s * 0.05, y, s * 0.32, '#f7a08a');
    g.fillStyle = 'rgba(240,90,90,0.35)'; ellipse(g, x + s * 0.05, y + s * 0.05, s * 0.2, s * 0.22); g.fill();
    g.strokeStyle = 'rgba(160,60,50,0.5)'; g.lineWidth = s * 0.02;
    g.beginPath(); g.moveTo(x - s * 0.05, y - s * 0.3); g.quadraticCurveTo(x - s * 0.2, y, x - s * 0.08, y + s * 0.28); g.stroke();
    leaf(g, x, y - s * 0.3, s * 0.28, -0.3, '#4a8f3a');
  },
  cheese(g, x, y, s) {
    g.fillStyle = '#f7c84a';
    g.beginPath(); g.moveTo(x - s * 0.4, y + s * 0.2); g.lineTo(x + s * 0.38, y + s * 0.2); g.lineTo(x + s * 0.38, y - s * 0.05); g.lineTo(x - s * 0.4, y - s * 0.02); g.fill();
    g.fillStyle = '#fbe08a';
    g.beginPath(); g.moveTo(x - s * 0.4, y - s * 0.02); g.lineTo(x + s * 0.38, y - s * 0.05); g.lineTo(x + s * 0.1, y - s * 0.3); g.fill();
    g.fillStyle = '#e0a830';
    for (const [dx, dy, r] of [[-0.2, 0.08, 0.05], [0.1, 0.1, 0.04], [0.25, 0.05, 0.03], [-0.02, 0.02, 0.025], [0.05, -0.12, 0.03]]) { ellipse(g, x + dx * s, y + dy * s, r * s, r * s * 0.8); g.fill(); }
  },
  egg(g, x, y, s) {
    for (const [dx, dy, k] of [[-0.18, 0.05, 0], [0.12, -0.04, 1], [0.0, 0.18, 0]]) ball(g, x + dx * s, y + dy * s, s * 0.17, k ? '#f4e6d0' : '#e8c9a0', s * 0.22);
    g.fillStyle = '#ffffff'; ellipse(g, x + s * 0.28, y + s * 0.2, s * 0.17, s * 0.12); g.fill();
    ball(g, x + s * 0.28, y + s * 0.2, s * 0.07, '#f7b21a');
  },
  bread(g, x, y, s) {
    g.fillStyle = '#c98a3e';
    g.beginPath(); g.moveTo(x - s * 0.36, y + s * 0.35); g.lineTo(x - s * 0.36, y - s * 0.12);
    g.bezierCurveTo(x - s * 0.42, y - s * 0.45, x - s * 0.02, y - s * 0.45, x, y - s * 0.22);
    g.bezierCurveTo(x + s * 0.02, y - s * 0.45, x + s * 0.42, y - s * 0.45, x + s * 0.36, y - s * 0.12);
    g.lineTo(x + s * 0.36, y + s * 0.35); g.fill();
    g.fillStyle = '#fbf0d8';
    g.beginPath(); g.moveTo(x - s * 0.31, y + s * 0.31); g.lineTo(x - s * 0.31, y - s * 0.1);
    g.bezierCurveTo(x - s * 0.35, y - s * 0.38, x - s * 0.03, y - s * 0.38, x, y - s * 0.17);
    g.bezierCurveTo(x + s * 0.03, y - s * 0.38, x + s * 0.35, y - s * 0.38, x + s * 0.31, y - s * 0.1);
    g.lineTo(x + s * 0.31, y + s * 0.31); g.fill();
    g.fillStyle = 'rgba(200,160,110,0.35)';
    for (let i = 0; i < 18; i++) { ellipse(g, x + ((i * 37) % 50 - 25) / 100 * s, y + ((i * 23) % 50 - 18) / 100 * s, s * 0.012, s * 0.008); g.fill(); }
  },
  melonpan(g, x, y, s) {
    ball(g, x, y, s * 0.4, '#efc768', s * 0.3);
    g.save(); ellipse(g, x, y, s * 0.4, s * 0.3); g.clip();
    g.strokeStyle = 'rgba(170,110,40,0.55)'; g.lineWidth = s * 0.02;
    for (let k = -4; k <= 4; k++) {
      g.beginPath(); g.moveTo(x + k * s * 0.1 - s * 0.4, y - s * 0.4); g.lineTo(x + k * s * 0.1 + s * 0.4, y + s * 0.4); g.stroke();
      g.beginPath(); g.moveTo(x + k * s * 0.1 + s * 0.4, y - s * 0.4); g.lineTo(x + k * s * 0.1 - s * 0.4, y + s * 0.4); g.stroke();
    }
    g.restore();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 20; i++) { g.fillRect(x + ((i * 41) % 70 - 35) / 100 * s, y + ((i * 29) % 50 - 25) / 100 * s, s * 0.012, s * 0.012); }
  },
  currypan(g, x, y, s) {
    ball(g, x, y, s * 0.42, '#b86a2a', s * 0.27);
    g.fillStyle = 'rgba(240,190,110,0.8)';
    for (let i = 0; i < 40; i++) { const a = i * 2.4, d = Math.sqrt(i / 40); g.fillRect(x + Math.cos(a) * d * s * 0.36, y + Math.sin(a) * d * s * 0.22, s * 0.025, s * 0.015); }
    // Cut open: the curry inside.
    g.fillStyle = '#8a4a14'; ellipse(g, x + s * 0.3, y + s * 0.15, s * 0.15, s * 0.1); g.fill();
    g.fillStyle = '#f2c46a'; ellipse(g, x + s * 0.3, y + s * 0.15, s * 0.12, s * 0.07); g.fill();
  },
  croissant(g, x, y, s) {
    const segs = [[-0.32, 0.12, 0.13], [-0.17, 0.0, 0.17], [0, -0.05, 0.2], [0.17, 0.0, 0.17], [0.32, 0.12, 0.13]];
    for (const [dx, dy, r] of segs) ball(g, x + dx * s, y + dy * s, r * s, '#d08a3a', r * s * 0.85);
    g.strokeStyle = 'rgba(120,60,20,0.5)'; g.lineWidth = s * 0.015;
    for (const [dx, dy, r] of segs.slice(1, 4)) { g.beginPath(); g.arc(x + dx * s, y + dy * s, r * s * 0.9, 0.4 * Math.PI, 0.6 * Math.PI); g.stroke(); }
  },
  baguette(g, x, y, s) {
    g.save(); g.translate(x, y); g.rotate(-0.35);
    ball(g, 0, 0, s * 0.5, '#d08a3a', s * 0.12);
    g.strokeStyle = '#f2d090'; g.lineWidth = s * 0.03;
    for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(k * s * 0.17 - s * 0.06, -s * 0.06); g.lineTo(k * s * 0.17 + s * 0.06, s * 0.04); g.stroke(); }
    g.restore();
  },
  banana(g, x, y, s) {
    for (let k = 0; k < 3; k++) {
      g.save(); g.translate(x, y - s * 0.1 + k * s * 0.08); g.rotate(-0.15 + k * 0.12);
      const grd = g.createLinearGradient(0, -s * 0.15, 0, s * 0.15);
      grd.addColorStop(0, '#fff07a'); grd.addColorStop(1, '#d9a81a');
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(-s * 0.42, -s * 0.05);
      g.quadraticCurveTo(0, s * 0.35, s * 0.42, -s * 0.08);
      g.quadraticCurveTo(0, s * 0.18, -s * 0.42, -s * 0.05); g.fill();
      g.fillStyle = '#4a3a1c'; g.fillRect(-s * 0.46, -s * 0.07, s * 0.06, s * 0.04);
      g.restore();
    }
  },
  tomato(g, x, y, s) {
    ball(g, x - s * 0.1, y + s * 0.05, s * 0.32, '#e2322a', s * 0.28);
    for (let k = 0; k < 5; k++) leaf(g, x - s * 0.1, y - s * 0.2, s * 0.14, (k / 5) * TAU, '#3d8a35', 0.35);
    ball(g, x + s * 0.27, y + s * 0.22, s * 0.13, '#e2322a');
    glint(g, x - s * 0.22, y - s * 0.06, s * 0.05);
  },
  cabbage(g, x, y, s) {
    ball(g, x, y, s * 0.4, '#a8d08d');
    g.strokeStyle = 'rgba(240,255,220,0.8)'; g.lineWidth = s * 0.02;
    for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(x, y + s * 0.3); g.quadraticCurveTo(x + (k - 2) * s * 0.18, y, x + (k - 2) * s * 0.12, y - s * 0.35); g.stroke(); }
  },
  carrot(g, x, y, s) {
    for (const [dx, a] of [[-0.15, 0.3], [0.05, -0.1], [0.22, -0.4]]) {
      g.save(); g.translate(x + dx * s, y); g.rotate(a);
      const grd = g.createLinearGradient(-s * 0.06, 0, s * 0.06, 0);
      grd.addColorStop(0, '#f7a03a'); grd.addColorStop(1, '#d0601a');
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(-s * 0.07, -s * 0.25); g.lineTo(s * 0.07, -s * 0.25); g.lineTo(0, s * 0.4); g.fill();
      for (let k = -1; k <= 1; k++) leaf(g, 0, -s * 0.25, s * 0.18, -Math.PI / 2 + k * 0.4, '#4a9a3a', 0.25);
      g.restore();
    }
  },
  negi(g, x, y, s) {
    for (const dx of [-0.1, 0, 0.1]) {
      const grd = g.createLinearGradient(0, y - s * 0.45, 0, y + s * 0.45);
      grd.addColorStop(0, '#3d8a35'); grd.addColorStop(0.45, '#a8d08d'); grd.addColorStop(0.55, '#f4f6ea'); grd.addColorStop(1, '#ffffff');
      g.fillStyle = grd; g.fillRect(x + dx * s - s * 0.04, y - s * 0.45, s * 0.08, s * 0.9);
    }
  },
  chips(g, x, y, s, p) {
    const nori = lum(p.look.color) < 120;
    // Wavy, irregular crisps piled up, salt or nori flecks on them.
    for (let k = 0; k < 7; k++) {
      const a = k * 2.2, d = (k % 3) * s * 0.13, r = s * (0.17 + (k % 2) * 0.04);
      g.save(); g.translate(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8); g.rotate(a * 1.7);
      const grd = g.createRadialGradient(-r * 0.25, -r * 0.25, r * 0.1, 0, 0, r);
      grd.addColorStop(0, '#fde9a0'); grd.addColorStop(0.65, '#f2c454'); grd.addColorStop(1, '#c98a2a');
      g.fillStyle = grd;
      g.beginPath();
      for (let i = 0; i < 10; i++) { const t = (i / 10) * TAU, rr = r * (0.82 + 0.18 * Math.sin(i * 2.7 + k)); g.lineTo(Math.cos(t) * rr, Math.sin(t) * rr * 0.78); }
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(150,90,25,0.35)'; g.lineWidth = r * 0.05;
      for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(-r * 0.65, i * r * 0.28); g.quadraticCurveTo(0, i * r * 0.28 - r * 0.14, r * 0.65, i * r * 0.28); g.stroke(); }
      g.fillStyle = nori ? '#2f5a22' : 'rgba(255,255,255,0.9)';
      for (let i = 0; i < 6; i++) g.fillRect(Math.cos(i * 2.4) * r * 0.5, Math.sin(i * 2.4) * r * 0.4, r * 0.07, r * 0.07);
      g.restore();
    }
  },
  sticks(g, x, y, s, p) {
    const coat = p.look.color === '#c0392b' ? '#4a2414' : '#f48aa8';
    for (let k = 0; k < 5; k++) stick(g, x - s * 0.4 + k * s * 0.05, y + s * 0.42, x - s * 0.05 + k * s * 0.1, y - s * 0.42, s * 0.05, '#e6c27a', coat, 0.7);
  },
  mochi(g, x, y, s) {
    ball(g, x - s * 0.18, y + s * 0.05, s * 0.2, '#fbf3ea', s * 0.17);
    ball(g, x + s * 0.12, y - s * 0.02, s * 0.2, '#f7c6d6', s * 0.17);
    g.fillStyle = '#fbf3ea'; ellipse(g, x + s * 0.2, y + s * 0.25, s * 0.15, s * 0.11); g.fill();
    g.fillStyle = '#fff6e8'; ellipse(g, x + s * 0.2, y + s * 0.25, s * 0.11, s * 0.08); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)'; for (let i = 0; i < 8; i++) g.fillRect(x - s * 0.3 + i * s * 0.08, y - s * 0.3 + (i % 3) * s * 0.05, s * 0.015, s * 0.015);
  },
  senbei(g, x, y, s) {
    for (const [dx, dy] of [[-0.15, 0.05], [0.15, -0.05]]) {
      ball(g, x + dx * s, y + dy * s, s * 0.25, '#b8762e', s * 0.24);
      g.fillStyle = '#1f2a1c'; g.fillRect(x + dx * s - s * 0.08, y + dy * s - s * 0.25, s * 0.16, s * 0.5);
    }
  },
  gummies(g, x, y, s) {
    const cols = ['#e83a5a', '#f2b21a', '#5ac84a', '#9c6ad1', '#ff7a2f'];
    for (let k = 0; k < 7; k++) {
      const a = k * 2.4, d = (k % 3) * s * 0.12;
      const bx = x + Math.cos(a) * d, by = y + Math.sin(a) * d;
      g.globalAlpha = 0.9; ball(g, bx, by, s * 0.1, cols[k % cols.length], s * 0.12);
      g.globalAlpha = 1;
    }
  },
  rice(g, x, y, s) {
    bowl(g, x, y + s * 0.12, s * 0.7, '#2a3a6a', '#ffffff');
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(x, y + s * 0.02, s * 0.3, Math.PI, 0); g.fill();
    g.fillStyle = 'rgba(200,200,190,0.6)';
    for (let i = 0; i < 24; i++) { const a = Math.PI + (i / 24) * Math.PI; ellipse(g, x + Math.cos(a) * s * 0.2 * ((i % 3) / 3 + 0.4), y + s * 0.02 + Math.sin(a) * s * 0.18 * ((i % 4) / 4 + 0.3), s * 0.02, s * 0.01, a); g.fill(); }
  },
  soy(g, x, y, s) {
    g.fillStyle = '#ffffff'; ellipse(g, x, y + s * 0.15, s * 0.36, s * 0.12); g.fill();
    g.fillStyle = '#2a0f08'; ellipse(g, x, y + s * 0.15, s * 0.3, s * 0.09); g.fill();
    g.fillStyle = '#3a1a0c';
    g.beginPath(); g.moveTo(x - s * 0.02, y - s * 0.4); g.bezierCurveTo(x - s * 0.08, y - s * 0.2, x - s * 0.06, y - s * 0.05, x, y + s * 0.1); g.bezierCurveTo(x + s * 0.06, y - s * 0.05, x + s * 0.08, y - s * 0.2, x + s * 0.02, y - s * 0.4); g.fill();
    glint(g, x - s * 0.1, y + s * 0.12, s * 0.04);
  },
  miso(g, x, y, s) {
    bowl(g, x, y + s * 0.1, s * 0.72, '#8a2a1c', '#c88a4a');
    g.fillStyle = '#f4efe2'; for (const [dx, dy] of [[-0.1, -0.05], [0.08, -0.08], [0.02, 0.0]]) { g.fillRect(x + dx * s, y + dy * s, s * 0.06, s * 0.05); }
    g.fillStyle = '#3d7a3a'; for (const dx of [-0.18, 0.15]) { ellipse(g, x + dx * s, y - s * 0.04, s * 0.05, s * 0.02); g.fill(); }
  },
  curry(g, x, y, s) {
    g.fillStyle = '#ffffff'; ellipse(g, x, y + s * 0.1, s * 0.45, s * 0.2); g.fill();
    g.fillStyle = '#fbf8f0'; ellipse(g, x - s * 0.15, y + s * 0.06, s * 0.2, s * 0.12); g.fill();
    g.fillStyle = '#9a5a1a'; ellipse(g, x + s * 0.12, y + s * 0.1, s * 0.25, s * 0.13); g.fill();
    for (const [dx, c] of [[0.05, '#f08a2e'], [0.2, '#e8c86a'], [0.12, '#8a3a1a']]) { g.fillStyle = c; g.fillRect(x + dx * s, y + s * 0.05, s * 0.06, s * 0.05); }
  },
  ramen(g, x, y, s) {
    bowl(g, x, y + s * 0.1, s * 0.78, '#b3202a', '#c8803a');
    g.strokeStyle = '#f6dc8a'; g.lineWidth = s * 0.018;
    for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(x - s * 0.25, y - s * 0.02 + k * s * 0.015); g.bezierCurveTo(x - s * 0.1, y - s * 0.08, x + s * 0.05, y + s * 0.04, x + s * 0.25, y - s * 0.03 + k * s * 0.012); g.stroke(); }
    g.fillStyle = '#ffffff'; ellipse(g, x + s * 0.12, y - s * 0.04, s * 0.08, s * 0.05); g.fill();
    g.fillStyle = '#f2a21a'; ellipse(g, x + s * 0.12, y - s * 0.04, s * 0.04, s * 0.03); g.fill();
    g.fillStyle = '#c86a6a'; ellipse(g, x - s * 0.14, y - s * 0.05, s * 0.09, s * 0.05); g.fill();
    g.fillStyle = '#2a3a2a'; g.fillRect(x - s * 0.02, y - s * 0.2, s * 0.08, s * 0.14);
  },
  jam(g, x, y, s) {
    g.fillStyle = '#ffe9c8'; g.beginPath(); g.roundRect(x - s * 0.38, y - s * 0.12, s * 0.5, s * 0.4, s * 0.06); g.fill();
    g.fillStyle = '#b8202f'; g.beginPath(); g.roundRect(x - s * 0.33, y - s * 0.08, s * 0.4, s * 0.3, s * 0.08); g.fill();
    strawberry(g, x + s * 0.22, y - s * 0.12, s * 0.36);
  },
  honey(g, x, y, s) {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
      const hx = x - s * 0.3 + c * s * 0.16 + (r % 2) * s * 0.08, hy = y - s * 0.2 + r * s * 0.14;
      g.fillStyle = r === 1 && c === 2 ? '#f7c23a' : '#e89a1a';
      g.beginPath();
      for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + Math.PI / 6; g.lineTo(hx + Math.cos(a) * s * 0.085, hy + Math.sin(a) * s * 0.085); }
      g.fill();
    }
    g.fillStyle = '#f2a81a';
    g.beginPath(); g.moveTo(x + s * 0.1, y + s * 0.1); g.bezierCurveTo(x + s * 0.05, y + s * 0.3, x + s * 0.2, y + s * 0.4, x + s * 0.12, y + s * 0.45); g.lineTo(x + s * 0.16, y + s * 0.1); g.fill();
  },
  gyoza(g, x, y, s) {
    for (let k = 0; k < 4; k++) {
      const gx = x - s * 0.3 + k * s * 0.2, gy = y + (k % 2) * s * 0.06;
      ball(g, gx, gy, s * 0.13, '#f4e6c8', s * 0.2, 0.2);
      g.fillStyle = 'rgba(190,120,50,0.8)'; ellipse(g, gx + s * 0.02, gy + s * 0.12, s * 0.1, s * 0.06, 0.2); g.fill();
      g.strokeStyle = 'rgba(180,150,110,0.6)'; g.lineWidth = s * 0.012;
      for (let p = -1; p <= 1; p++) { g.beginPath(); g.moveTo(gx + p * s * 0.04, gy - s * 0.18); g.lineTo(gx + p * s * 0.05, gy - s * 0.08); g.stroke(); }
    }
  },
  pizza(g, x, y, s) {
    g.fillStyle = '#d9a05a'; g.beginPath(); g.arc(x, y, s * 0.44, 0, TAU); g.fill();
    g.fillStyle = '#c8302a'; g.beginPath(); g.arc(x, y, s * 0.38, 0, TAU); g.fill();
    g.fillStyle = '#fbf3d8';
    for (const [dx, dy] of [[-0.15, -0.1], [0.12, -0.15], [0.05, 0.12], [-0.18, 0.15], [0.22, 0.08]]) { ellipse(g, x + dx * s, y + dy * s, s * 0.08, s * 0.065); g.fill(); }
    for (const [dx, dy, a] of [[0, -0.02, 0.5], [-0.2, 0.0, 1.2], [0.2, -0.05, 2.2]]) leaf(g, x + dx * s, y + dy * s, s * 0.1, a, '#3d8a35');
  },
  edamame(g, x, y, s) {
    for (const [dx, dy, a] of [[-0.12, -0.05, -0.4], [0.1, 0.08, 0.3], [0.0, -0.18, 0.1]]) {
      g.save(); g.translate(x + dx * s, y + dy * s); g.rotate(a);
      g.fillStyle = '#6aa83a'; g.beginPath(); g.roundRect(-s * 0.25, -s * 0.07, s * 0.5, s * 0.14, s * 0.07); g.fill();
      for (let k = -1; k <= 1; k++) ball(g, k * s * 0.15, 0, s * 0.065, '#8ad04a');
      g.restore();
    }
  },
  bubbles(g, x, y, s) {
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath(); g.roundRect(x - s * 0.3, y - s * 0.05, s * 0.4, s * 0.3, s * 0.03); g.fill();
    g.strokeStyle = '#8ab8e8'; g.lineWidth = s * 0.012;
    for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(x - s * 0.28, y + k * s * 0.07); g.lineTo(x + s * 0.08, y + k * s * 0.07); g.stroke(); }
    bubbles(g, x + s * 0.12, y - s * 0.12, s * 0.6, 12, 1);
  },
  lime(g, x, y, s) {
    slice(g, x - s * 0.1, y, s * 0.3, '#5aa83a', '#a8e05a');
    bubbles(g, x + s * 0.18, y - s * 0.1, s * 0.5, 8, 4);
  },
  tissue(g, x, y, s) {
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(x - s * 0.15, y + s * 0.1); g.bezierCurveTo(x - s * 0.2, y - s * 0.3, x + s * 0.05, y - s * 0.2, x, y - s * 0.4);
    g.bezierCurveTo(x + s * 0.2, y - s * 0.25, x + s * 0.1, y, x + s * 0.18, y + s * 0.1); g.fill();
    g.strokeStyle = 'rgba(120,150,200,0.4)'; g.lineWidth = s * 0.01; g.stroke();
    flower(g, x - s * 0.25, y + s * 0.2, s * 0.12, '#f9c8d6', '#f2a7bd', false);
    flower(g, x + s * 0.25, y + s * 0.25, s * 0.09, '#cfe0f8', '#8ab8e8', false);
  },
  roll(g, x, y, s) {
    for (const [dx, dy] of [[-0.18, 0], [0.18, 0], [0, -0.2]]) {
      g.fillStyle = '#ffffff'; ellipse(g, x + dx * s, y + dy * s, s * 0.17, s * 0.17); g.fill();
      g.strokeStyle = 'rgba(160,160,170,0.6)'; g.lineWidth = s * 0.01; g.stroke();
      g.fillStyle = '#d9c8b0'; ellipse(g, x + dx * s, y + dy * s, s * 0.06, s * 0.06); g.fill();
    }
  },
};

/** Brand emblems, by BRANDS[].mark, in `ink`. */
export const MARKS = {
  none() {},
  cloud(g, x, y, s, ink) {
    g.fillStyle = ink;
    for (const [dx, dy, r] of [[-0.22, 0.08, 0.2], [0, -0.05, 0.27], [0.24, 0.08, 0.19]]) { g.beginPath(); g.arc(x + dx * s, y + dy * s, r * s, 0, TAU); g.fill(); }
    g.fillRect(x - s * 0.4, y + s * 0.05, s * 0.8, s * 0.22);
  },
  blossom(g, x, y, s, ink) { flower(g, x, y, s * 0.5, ink, '#ffffff'); },
  flower(g, x, y, s, ink) { flower(g, x, y, s * 0.5, ink, '#f7d36b', false); },
  leaf(g, x, y, s, ink) { leaf(g, x - s * 0.4, y + s * 0.3, s * 0.95, -0.75, ink, 0.35); },
  mountain(g, x, y, s, ink) {
    g.fillStyle = ink;
    g.beginPath(); g.moveTo(x - s * 0.5, y + s * 0.3); g.lineTo(x - s * 0.08, y - s * 0.32); g.lineTo(x + s * 0.12, y - s * 0.05); g.lineTo(x + s * 0.24, y - s * 0.18); g.lineTo(x + s * 0.5, y + s * 0.3); g.fill();
  },
  sun(g, x, y, s, ink) {
    g.fillStyle = ink;
    g.beginPath(); g.arc(x, y, s * 0.24, 0, TAU); g.fill();
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU;
      g.beginPath(); g.moveTo(x + Math.cos(a - 0.12) * s * 0.3, y + Math.sin(a - 0.12) * s * 0.3);
      g.lineTo(x + Math.cos(a) * s * 0.5, y + Math.sin(a) * s * 0.5); g.lineTo(x + Math.cos(a + 0.12) * s * 0.3, y + Math.sin(a + 0.12) * s * 0.3); g.fill();
    }
  },
  bean(g, x, y, s, ink) {
    g.fillStyle = ink; ellipse(g, x, y, s * 0.3, s * 0.45, 0.4); g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = s * 0.06;
    g.beginPath(); g.moveTo(x - s * 0.15, y - s * 0.38); g.bezierCurveTo(x + s * 0.12, y - s * 0.1, x - s * 0.12, y + s * 0.1, x + s * 0.15, y + s * 0.38); g.stroke();
  },
  bolt(g, x, y, s, ink) {
    g.fillStyle = ink;
    g.beginPath();
    g.moveTo(x + s * 0.1, y - s * 0.5); g.lineTo(x - s * 0.22, y + s * 0.06); g.lineTo(x - s * 0.01, y + s * 0.06);
    g.lineTo(x - s * 0.12, y + s * 0.5); g.lineTo(x + s * 0.24, y - s * 0.1); g.lineTo(x + s * 0.03, y - s * 0.1); g.closePath(); g.fill();
  },
  cow(g, x, y, s, ink) {
    // A cow's head: face, ears, horns, nose band.
    g.fillStyle = '#ffffff'; ellipse(g, x, y, s * 0.3, s * 0.36); g.fill();
    g.strokeStyle = ink; g.lineWidth = s * 0.05; g.stroke();
    g.fillStyle = ink;
    ellipse(g, x - s * 0.38, y - s * 0.15, s * 0.14, s * 0.07, -0.3); g.fill();
    ellipse(g, x + s * 0.38, y - s * 0.15, s * 0.14, s * 0.07, 0.3); g.fill();
    ellipse(g, x + s * 0.1, y - s * 0.12, s * 0.12, s * 0.1); g.fill();
    ellipse(g, x, y + s * 0.2, s * 0.22, s * 0.13); g.fill();
    g.fillStyle = '#ffffff'; for (const d of [-1, 1]) { ellipse(g, x + d * s * 0.08, y + s * 0.2, s * 0.03, s * 0.04); g.fill(); }
  },
  bell(g, x, y, s, ink) {
    g.fillStyle = ink;
    g.beginPath(); g.moveTo(x - s * 0.35, y + s * 0.3); g.bezierCurveTo(x - s * 0.3, y - s * 0.5, x + s * 0.3, y - s * 0.5, x + s * 0.35, y + s * 0.3); g.closePath(); g.fill();
    g.beginPath(); g.arc(x, y + s * 0.38, s * 0.08, 0, TAU); g.fill();
  },
  wheat(g, x, y, s, ink) {
    g.strokeStyle = ink; g.lineWidth = s * 0.05;
    g.beginPath(); g.moveTo(x, y + s * 0.5); g.lineTo(x, y - s * 0.45); g.stroke();
    g.fillStyle = ink;
    for (let k = 0; k < 4; k++) for (const d of [-1, 1]) { ellipse(g, x + d * s * 0.1, y - s * (0.35 - k * 0.17), s * 0.07, s * 0.13, d * 0.5); g.fill(); }
  },
  origin(g, x, y, s, ink) {
    // The co-op's round stamp.
    g.strokeStyle = ink; g.lineWidth = s * 0.07;
    g.beginPath(); g.arc(x, y, s * 0.42, 0, TAU); g.stroke();
    leaf(g, x - s * 0.22, y + s * 0.15, s * 0.5, -0.8, ink, 0.4);
  },
  rice(g, x, y, s, ink) {
    g.fillStyle = ink;
    for (let k = 0; k < 5; k++) { ellipse(g, x + Math.sin(k) * s * 0.06, y - s * 0.35 + k * s * 0.15, s * 0.07, s * 0.11, 0.6 - k * 0.2); g.fill(); }
  },
  burst(g, x, y, s, ink) {
    g.fillStyle = ink;
    g.beginPath();
    for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU, r = k % 2 ? s * 0.34 : s * 0.5; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    g.fill();
  },
  snow(g, x, y, s, ink) {
    g.strokeStyle = ink; g.lineWidth = s * 0.07; g.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI;
      g.beginPath(); g.moveTo(x - Math.cos(a) * s * 0.45, y - Math.sin(a) * s * 0.45); g.lineTo(x + Math.cos(a) * s * 0.45, y + Math.sin(a) * s * 0.45); g.stroke();
    }
    g.lineCap = 'butt';
  },
  hex(g, x, y, s, ink) {
    g.strokeStyle = ink; g.lineWidth = s * 0.08;
    g.beginPath();
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; g.lineTo(x + Math.cos(a) * s * 0.42, y + Math.sin(a) * s * 0.42); }
    g.closePath(); g.stroke();
  },
  drop(g, x, y, s, ink) {
    g.fillStyle = ink;
    g.beginPath(); g.moveTo(x, y - s * 0.5); g.bezierCurveTo(x - s * 0.4, y, x - s * 0.35, y + s * 0.45, x, y + s * 0.45); g.bezierCurveTo(x + s * 0.35, y + s * 0.45, x + s * 0.4, y, x, y - s * 0.5); g.fill();
    glint(g, x - s * 0.1, y + s * 0.15, s * 0.1);
  },
};

/**
 * Loose produce skins, painted over a whole region that wraps a ball (u
 * round it, v pole to pole) or a bent tube (bananas).
 */
export const SKINS = {
  apple(g, w, h) {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#e2b84a'); grd.addColorStop(0.18, '#c92a2e'); grd.addColorStop(0.75, '#a8161e'); grd.addColorStop(1, '#c87a2a');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    // Fine streaks down from the stalk, pale lenticels, the stalk's dark hollow.
    g.globalAlpha = 0.18;
    for (let i = 0; i < 90; i++) { g.fillStyle = i % 3 ? '#7a0c14' : '#f2c24a'; g.fillRect((i * 37.3) % w, h * 0.08, w * 0.004, h * (0.4 + (i % 5) * 0.1)); }
    g.globalAlpha = 0.5; g.fillStyle = '#f7e0a0';
    for (let i = 0; i < 160; i++) g.fillRect((i * 53.7) % w, (i * 31.1) % h, w * 0.004, w * 0.004);
    g.globalAlpha = 1;
    g.fillStyle = '#4a2a10'; g.fillRect(0, 0, w, h * 0.035);
  },
  orange(g, w, h) {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#d8701a'); grd.addColorStop(0.3, '#f28a1e'); grd.addColorStop(1, '#e27a1a');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,200,120,0.5)';
    for (let i = 0; i < 400; i++) { g.beginPath(); g.arc((i * 37) % w, (i * 53) % h, 0.5, 0, TAU); g.fill(); }
    g.fillStyle = '#3d6a2a'; g.fillRect(0, 0, w, h * 0.03);
  },
  tomato(g, w, h) {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#c82a22'); grd.addColorStop(0.5, '#e2322a'); grd.addColorStop(1, '#c82a22');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    // The green calyx at the stalk end (the top pole).
    g.fillStyle = '#3d8a35';
    for (let k = 0; k < 5; k++) { const x = (k + 0.5) * w / 5; g.beginPath(); g.moveTo(x - w * 0.08, 0); g.lineTo(x, h * 0.22); g.lineTo(x + w * 0.08, 0); g.fill(); }
  },
  cabbage(g, w, h) {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#d8ecc0'); grd.addColorStop(0.5, '#a8d08d'); grd.addColorStop(1, '#7ab05a');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(240,255,225,0.85)'; g.lineWidth = 1.2;
    for (let k = 0; k < 9; k++) {
      const x = (k + 0.5) * w / 9;
      g.beginPath(); g.moveTo(x, h); g.quadraticCurveTo(x + w * 0.04, h * 0.5, x - w * 0.02, 0); g.stroke();
      for (let j = 1; j < 5; j++) { g.beginPath(); g.moveTo(x, h * j / 5); g.lineTo(x + w * 0.04, h * j / 5 - h * 0.06); g.stroke(); }
    }
    g.strokeStyle = 'rgba(70,120,50,0.5)';
    for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(0, h * (0.3 + k * 0.15)); g.bezierCurveTo(w * 0.3, h * (0.2 + k * 0.15), w * 0.7, h * (0.4 + k * 0.15), w, h * (0.3 + k * 0.15)); g.stroke(); }
  },
  banana(g, w, h) {
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, '#5a6a1a'); grd.addColorStop(0.08, '#e8d040'); grd.addColorStop(0.5, '#f7de4a'); grd.addColorStop(0.92, '#e8c83a'); grd.addColorStop(1, '#3a2a10');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(110,70,20,0.55)';
    for (let i = 0; i < 40; i++) { g.beginPath(); g.arc((i * 37) % w, (i * 53) % h, 0.7, 0, TAU); g.fill(); }
    g.strokeStyle = 'rgba(160,130,30,0.5)'; g.lineWidth = 0.8;
    for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(0, (k + 0.5) * h / 5); g.lineTo(w, (k + 0.5) * h / 5); g.stroke(); }
  },
  negi(g, w, h) {
    // Along the stalk: white root end at the top of the region (the front), green leaves at the bottom.
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.5, '#eef4dc'); grd.addColorStop(0.62, '#a8d08d'); grd.addColorStop(1, '#2f7a2a');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(150,180,120,0.35)'; g.lineWidth = w * 0.004;
    for (let k = 0; k < 10; k++) { g.beginPath(); g.moveTo((k + 0.5) * w / 10, 0); g.lineTo((k + 0.5) * w / 10, h); g.stroke(); }
  },
};
