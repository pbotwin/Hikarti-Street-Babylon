import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * The phone's real thermal state when the game runs as the Android app
 * (android/, ThermalPlugin.java); nothing in a browser. Reported as the
 * same pressure states as Chrome's Compute Pressure API, so
 * AdaptivePerformance treats both alike:
 *   nominal < fair < serious (step quality down) < critical (step down now).
 */
const Thermal = registerPlugin('Thermal');
const POLL_MS = 2000;   // Android allows a headroom query about once a second

// Android thermal status: 0 none, 1 light, 2 moderate, 3 severe, 4+ critical.
// Headroom (10 s forecast): 1.0 = severe throttling expected.
function toPressure({ status = 0, headroom }) {
  const h = headroom ?? 0;
  if (status >= 3 || h >= 0.95) return 'critical';
  if (status >= 2 || h >= 0.8) return 'serious';
  if (status >= 1 || h >= 0.65) return 'fair';
  return 'nominal';
}

/** Calls onPressure(state, raw) every two seconds, in the Android app only. */
export function watchNativeThermal(onPressure) {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('Thermal')) return false;
  const poll = () => Thermal.getState().then((raw) => onPressure(toPressure(raw), raw)).catch(() => {});
  poll();
  setInterval(poll, POLL_MS);
  return true;
}
