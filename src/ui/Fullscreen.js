/**
 * Full screen on phones. Android browsers take the page full screen
 * (requestFullscreen, entered on the title's buttons and from a small
 * button whenever the player has left it: back gesture, app switch). iPhone
 * Safari has no full screen for pages: the game runs full screen only from
 * the home screen (the manifest's display: fullscreen), so there the button
 * explains how to add it. Hidden on desktop, when already full screen and
 * when launched from the home screen.
 */
const root = document.documentElement;
const request = root.requestFullscreen || root.webkitRequestFullscreen;
const current = () => document.fullscreenElement || document.webkitFullscreenElement;
const installed = () => matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone === true;

export class Fullscreen {
  /** @param {HTMLElement} ui the UI root; @param {(title: string, sub: string) => void} toast */
  constructor(ui, toast) {
    this.toast = toast;
    ui.insertAdjacentHTML('beforeend', '<button class="fullscreen-btn only-touch" type="button" aria-label="Full screen"><svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg></button>');
    this.button = ui.lastElementChild;
    this.button.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.button.addEventListener('click', (e) => { e.stopPropagation(); this.enter(true); });
    for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(ev, () => this._show());
    this._show();
  }

  /** Full screen on a touch device (from a tap); `explain`: the iPhone tip if it can't. */
  enter(explain = false) {
    if (current() || installed() || !matchMedia('(pointer: coarse)').matches) return;
    if (request) {
      // No orientation lock: the game plays in portrait and landscape.
      request.call(root, { navigationUI: 'hide' })?.catch?.(() => {});
    } else if (explain) {
      this.toast('Play full screen', 'Tap Share, then “Add to Home Screen”, and open Hikari from there');
    }
  }

  _show() { this.button.hidden = !!current() || installed(); }
}
