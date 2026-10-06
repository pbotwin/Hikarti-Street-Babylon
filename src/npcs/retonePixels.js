/**
 * Re-tone RGBA pixels (in place) toward a target colour given as HSV in 0…1:
 * hue set to the target, saturation and brightness scaled so the painted
 * pixels' averages match it. Shading and folds painted into the texture are
 * preserved. Shared by the worker and the main-thread fallback.
 */
export function retonePixels(px, th, ts, tv, { whites = false } = {}) {
  let ss = 0, sv = 0, n = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    ss += mx > 0 ? (mx - mn) / mx : 0; sv += mx / 255; n++;
  }
  const kS = n ? ts / Math.max(ss / n, 0.02) : 1;
  const mv = n ? sv / n : 0.5;
  // `whites`: a near-white texture (white sneakers) takes the target colour
  // too; otherwise its unsaturated pixels would stay white. Dark parts
  // (soles, laces) stay neutral.
  const paleSource = whites && n && ss / n < 0.15;
  // Very dark sources (black hair, navy uniforms) get a lift, not a multiply,
  // so they can become brown / grey / pastel without crushing detail.
  const k6 = Math.floor(th * 6), f = th * 6 - k6;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 8) continue;
    const mx = Math.max(px[i], px[i + 1], px[i + 2]), mn = Math.min(px[i], px[i + 1], px[i + 2]);
    const s = mx > 0 ? (mx - mn) / mx : 0, v = mx / 255;
    const nv = mv < 0.25 ? Math.min(1, tv * (0.35 + v / Math.max(mv, 0.02) * 0.65)) : Math.min(1, v * tv / Math.max(mv, 0.02));
    const ns = paleSource ? ts * Math.min(1, Math.max(0, (v - 0.25) / 0.4))
      : Math.min(1, mv < 0.25 ? ts * (0.8 + 0.2 * v) : s * kS);
    // HSV → RGB with the (constant) target hue.
    const p = nv * (1 - ns), q = nv * (1 - ns * f), t = nv * (1 - ns * (1 - f));
    let r, g, b;
    switch (k6 % 6) {
      case 0: r = nv; g = t; b = p; break;
      case 1: r = q; g = nv; b = p; break;
      case 2: r = p; g = nv; b = t; break;
      case 3: r = p; g = q; b = nv; break;
      case 4: r = t; g = p; b = nv; break;
      default: r = nv; g = p; b = q;
    }
    px[i] = r * 255; px[i + 1] = g * 255; px[i + 2] = b * 255;
  }
  return px;
}
