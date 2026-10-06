/**
 * Tiny event bus + state machine shared by every system. Systems never talk
 * to each other directly; they emit and listen here, which keeps them
 * swappable as the game grows.
 */
export const Phase = Object.freeze({
  LOADING: 'loading',
  TITLE: 'title',
  PLAYING: 'playing',
  COMPLETE: 'complete',
});

export class GameState {
  constructor() {
    this.phase = Phase.LOADING;
    this.fragmentsTotal = 5;
    this.fragmentsCollected = 0;
    this.portalActive = false;
    this._listeners = new Map();
  }

  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(fn);
    return () => this._listeners.get(event).delete(fn);
  }

  emit(event, payload) {
    const set = this._listeners.get(event);
    if (set) for (const fn of set) fn(payload);
  }

  setPhase(phase) {
    if (this.phase === phase) return;
    const prev = this.phase;
    this.phase = phase;
    this.emit('phase', { phase, prev });
  }

  collectFragment(position) {
    this.fragmentsCollected++;
    this.emit('fragment:collected', {
      count: this.fragmentsCollected,
      total: this.fragmentsTotal,
      position,
    });
    if (this.fragmentsCollected >= this.fragmentsTotal && !this.portalActive) {
      this.portalActive = true;
      this.emit('portal:activated');
    }
  }

  complete() {
    if (this.phase !== Phase.PLAYING) return;
    this.setPhase(Phase.COMPLETE);
    this.emit('game:complete');
  }

  reset() {
    this.fragmentsCollected = 0;
    this.portalActive = false;
    this.emit('game:reset');
    this.setPhase(Phase.PLAYING);
  }
}
