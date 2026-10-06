/** A small quest tracker, contextual action and keyboard-accessible conversation. */
export class SideMissionUI {
  constructor(root, { onInteract, onClose }) {
    this.root = root;
    this.onClose = onClose;
    this.el = document.createElement('div');
    this.el.className = 'mission-ui hidden';
    this.el.innerHTML = `
      <aside class="mission-tracker" aria-label="Side mission tracker">
        <div class="mission-tracker-top"><span>NEIGHBORHOOD STORIES</span><b class="mission-wallet">0 coins</b></div>
        <b class="mission-tracker-title">Meet your neighbors</b>
        <span class="mission-tracker-objective">Talk to residents marked ! to discover side missions.</span>
        <div class="mission-tracker-bottom"><span class="mission-tracker-count">0 / 4 complete</span><span class="mission-tracker-distance"></span></div>
        <div class="mission-progress"><i></i></div>
      </aside>
      <button class="mission-action hidden" type="button"><kbd class="only-mouse">F</kbd><span class="mission-action-icon" aria-hidden="true">✦</span><span class="mission-action-label"></span></button>
      <div class="mission-dialog-overlay hidden">
        <section class="mission-dialog" role="dialog" aria-modal="true" aria-labelledby="mission-speaker" aria-describedby="mission-dialog-text" tabindex="-1">
          <button class="mission-dialog-close" type="button" aria-label="Close conversation">×</button>
          <div class="mission-speaker-row"><span class="mission-portrait" aria-hidden="true"></span><div><span class="mission-speaker-role"></span><h2 id="mission-speaker"></h2></div></div>
          <div class="mission-dialog-heading"></div>
          <p id="mission-dialog-text"></p>
          <div class="mission-dialog-reward"></div>
          <div class="mission-dialog-choices"></div>
          <span class="mission-dialog-help only-mouse">Enter to choose · Esc to close</span>
        </section>
      </div>`;
    root.appendChild(this.el);
    this.tracker = this.el.querySelector('.mission-tracker');
    // Tap the compact chip to read the objective again.
    this.tracker.style.pointerEvents = 'auto';
    this.tracker.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.tracker.classList.add('expanded');
      clearTimeout(this._collapse);
      this._collapse = setTimeout(() => this.tracker.classList.remove('expanded'), 7000);
    });
    this.action = this.el.querySelector('.mission-action');
    this.overlay = this.el.querySelector('.mission-dialog-overlay');
    this.dialog = this.el.querySelector('.mission-dialog');
    this.choices = this.el.querySelector('.mission-dialog-choices');
    this.title = this.el.querySelector('.mission-tracker-title');
    this.objective = this.el.querySelector('.mission-tracker-objective');
    this.count = this.el.querySelector('.mission-tracker-count');
    this.distance = this.el.querySelector('.mission-tracker-distance');
    this.progress = this.el.querySelector('.mission-progress i');
    this.wallet = this.el.querySelector('.mission-wallet');
    this.action.addEventListener('pointerdown', (event) => event.stopPropagation());
    this.action.addEventListener('click', (event) => { event.stopPropagation(); onInteract(); });
    this.overlay.addEventListener('pointerdown', (event) => event.stopPropagation());
    this.overlay.addEventListener('click', (event) => { if (event.target === this.overlay) onClose(); });
    this.el.querySelector('.mission-dialog-close').addEventListener('click', onClose);
  }

  setVisible(visible) { this.el.classList.toggle('hidden', !visible); }

  setPrompt(label) {
    if (this._prompt === label) return;
    this._prompt = label;
    this.action.classList.toggle('hidden', !label);
    this.el.querySelector('.mission-action-label').textContent = label || '';
    this.action.setAttribute('aria-label', label ? `${label} (F)` : 'Talk');
  }

  renderTracker({ mission, completed, total, coins, distance, activeCount }) {
    this.wallet.textContent = `${coins} coins`;
    this.count.textContent = `${completed} / ${total} complete${activeCount > 1 ? ` · ${activeCount} active` : ''}`;
    this.title.textContent = mission?.title || (completed === total ? 'A friend of Hikari' : 'Meet your neighbors');
    this.objective.textContent = mission?.objective || (completed === total
      ? 'Every neighborhood story is complete. Enjoy the district!'
      : 'Talk to residents marked ! to discover side missions.');
    this.distance.textContent = Number.isFinite(distance) ? `${Math.round(distance)} m` : '';
    const progress = mission ? mission.progress / Math.max(1, mission.total) : completed / total;
    this.progress.style.transform = `scaleX(${progress})`;
    this.tracker.classList.toggle('is-ready', mission?.status === 'ready');
    const sig = `${this.title.textContent}|${this.objective.textContent}|${completed}|${mission?.status}`;
    if (sig !== this._sig) {
      this._sig = sig;
      this.tracker.classList.add('expanded');
      clearTimeout(this._collapse);
      this._collapse = setTimeout(() => this.tracker.classList.remove('expanded'), 7000);
    }
  }

  showDialog({ name, role, title, text, reward, color, choices }) {
    this.previousFocus = document.activeElement;
    this.overlay.classList.remove('hidden');
    this.tracker.classList.add('hidden');
    this.setPrompt(null);
    this.dialog.style.setProperty('--mission-color', color || '#ffd38b');
    this.el.querySelector('#mission-speaker').textContent = name;
    this.el.querySelector('.mission-speaker-role').textContent = role || 'Hikari resident';
    this.el.querySelector('.mission-portrait').textContent = name.slice(0, 1);
    this.el.querySelector('.mission-dialog-heading').textContent = title || 'A moment in Hikari';
    this.el.querySelector('#mission-dialog-text').textContent = text;
    this.el.querySelector('.mission-dialog-reward').textContent = reward ? `✦ ${reward} coins` : '';
    this.choices.replaceChildren();
    choices.forEach((choice, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `mission-choice${index === 0 ? ' primary' : ''}`;
      button.textContent = choice.label;
      button.addEventListener('click', choice.action);
      this.choices.appendChild(button);
    });
    this.choices.querySelector('button')?.focus({ preventScroll: true });
  }

  hideDialog() {
    this.overlay.classList.add('hidden');
    this.tracker.classList.remove('hidden');
    if (this.previousFocus?.isConnected) this.previousFocus.focus?.({ preventScroll: true });
    this.previousFocus = null;
  }

  /** Keep Tab inside the modal, and let Enter activate its focused choice. */
  handleDialogKey(event) {
    if (event.code === 'Escape' || event.code === 'KeyF') { this.onClose(); return; }
    const buttons = [...this.dialog.querySelectorAll('button')];
    if (event.code === 'Tab') {
      const index = buttons.indexOf(document.activeElement);
      const next = (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
      buttons[next]?.focus({ preventScroll: true });
    } else if (event.code === 'Enter' || event.code === 'NumpadEnter' || event.code === 'Space') {
      const focused = buttons.includes(document.activeElement) ? document.activeElement : this.choices.querySelector('button');
      focused?.click();
    }
  }
}
