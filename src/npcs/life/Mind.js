import { places } from './Places.js';

/**
 * What residents know and remember — saved between play sessions.
 *
 *   knows      places they know (start: near home / work; learned by seeing
 *              them while out, by exploring, and from friends' gossip)
 *   seen       coarse 20 m map cells they have been to ("knows the town")
 *   player     their memory of the heroine: met, talks, missions done for
 *              them, things they saw her do, how much they like her
 *   news       facts heard from others (about her, about places), each with
 *              who told them, so it spreads from person to person
 *
 * Life.js asks: which places can I choose from, should I go exploring, how
 * do I feel about her. SideMissionSystem asks for a conversation line.
 */
const KEY = 'hikari.minds.v1';
const SEE = 7;          // metres: places noticed while walking past
const CELL = 20;

export class Minds {
  constructor(state) {
    this.state = state;
    this.by = new Map();
    this.clock = 0;
    this.playerCells = new Set();
    this._dirty = false;
    this._saveT = 0;
    this._load();
    // Spatial bins of places for cheap "what can I see" queries.
    this._bins = null;
  }

  // ------------------------------------------------------------ setup / persistence
  init(item) {
    const saved = this._saved?.[item.id];
    const m = {
      knows: new Set(saved?.knows || []),
      seen: new Set(saved?.seen || []),
      learned: saved?.learned || [],          // [{ place, t }] recent discoveries
      player: Object.assign({ met: false, talks: 0, lastTalk: -1, missions: [], saw: {}, affinity: 0, firstDay: null }, saved?.player || {}),
      news: saved?.news || [],                 // [{ kind, about, text, from, t }]
    };
    item.mind = m;
    this.by.set(item.id, m);
    if (!saved) {
      // Start: the neighbourhood around home.
      const h = item.life?.home || item.position;
      for (const p of places) if (Math.hypot(p.x - h.x, p.z - h.z) < 28) m.knows.add(p.id);
    }
  }

  _load() {
    try { this._saved = JSON.parse(localStorage.getItem(KEY) || 'null')?.residents || null; } catch { this._saved = null; }
    try { const pc = JSON.parse(localStorage.getItem(KEY) || 'null')?.playerCells; if (pc) for (const c of pc) this.playerCells.add(c); } catch { /* fresh */ }
  }

  save() {
    const residents = {};
    for (const [id, m] of this.by) {
      residents[id] = { knows: [...m.knows], seen: [...m.seen], learned: m.learned.slice(-12), player: m.player, news: m.news.slice(-24) };
    }
    try { localStorage.setItem(KEY, JSON.stringify({ v: 1, residents, playerCells: [...this.playerCells].slice(-600) })); } catch { /* storage full / private */ }
    this._dirty = false;
  }

  /** Forget everything (game restart). */
  wipe() {
    try { localStorage.removeItem(KEY); } catch { /* private */ }
    this._saved = null;
    this.playerCells.clear();
  }

  // ------------------------------------------------------------ learning the town
  _bin(x, z) { return `${Math.floor(x / 16)},${Math.floor(z / 16)}`; }
  _ensureBins() {
    if (this._bins) return;
    this._bins = new Map();
    for (const p of places) {
      const k = this._bin(p.x, p.z);
      if (!this._bins.has(k)) this._bins.set(k, []);
      this._bins.get(k).push(p);
    }
  }

  /** Called ~once a second per resident: notice nearby places, mark the area as known. */
  look(item) {
    this._ensureBins();
    const m = item.mind, p = item.position;
    m.seen.add(`${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}`);
    const bx = Math.floor(p.x / 16), bz = Math.floor(p.z / 16);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const pl of this._bins.get(`${bx + i},${bz + j}`) || []) {
        if (m.knows.has(pl.id) || Math.hypot(pl.x - p.x, pl.z - p.z) > SEE) continue;
        this.learn(item, pl, 'saw');
      }
    }
  }

  learn(item, pl, how = 'saw', from = null) {
    const m = item.mind;
    if (m.knows.has(pl.id)) return false;
    m.knows.add(pl.id);
    m.learned.push({ place: pl.id, t: Date.now(), how, from });
    if (m.learned.length > 16) m.learned.shift();
    this._dirty = true;
    return true;
  }

  knows(item, pl) { return item.mind.knows.has(pl.id); }

  /** A place they don't know yet, within reach, to go and explore. */
  unexplored(item, range) {
    const m = item.mind, p = item.position, h = item.life.home;
    let best = null, bd = Infinity;
    for (const pl of places) {
      if (m.knows.has(pl.id)) continue;
      const fromHome = Math.hypot(pl.x - h.x, pl.z - h.z);
      if (fromHome > range) continue;
      const d = Math.hypot(pl.x - p.x, pl.z - p.z) * (0.7 + Math.random() * 0.6);
      if (d < bd) { bd = d; best = pl; }
    }
    return best;
  }

  /** How well they know the town (0..1), from areas visited. */
  familiarity(item) { return Math.min(1, item.mind.seen.size / 60); }

  // ------------------------------------------------------------ the heroine
  playerAt(x, z) { this.playerCells.add(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`); }

  /** Something happened involving her; witnesses within `radius` remember it. */
  witness(items, at, kind, radius, text, affinity = 0) {
    for (const it of items) {
      if (!it.mind || it.life?.hidden) continue;
      if (Math.hypot(it.position.x - at.x, it.position.z - at.z) > radius) continue;
      const P = it.mind.player;
      P.saw[kind] = (P.saw[kind] || 0) + 1;
      P.affinity = clamp(P.affinity + affinity, -1, 1);
      if (text) this.hear(it, { kind, about: 'player', text, from: 'self' });
    }
    this._dirty = true;
  }

  talked(item) {
    const P = item.mind.player;
    if (!P.met) { P.met = true; P.firstDay = new Date().toDateString(); }
    P.talks++;
    P.prevTalk = P.lastTalk;
    P.lastTalk = Date.now();
    P.affinity = clamp(P.affinity + 0.04, -1, 1);
    this._dirty = true;
  }

  helped(item, mission) {
    const P = item.mind.player;
    if (!P.missions.includes(mission.title)) P.missions.push(mission.title);
    P.affinity = clamp(P.affinity + 0.45, -1, 1);
    this._dirty = true;
  }

  hear(item, fact) {
    const m = item.mind;
    if (m.news.some((n) => n.text === fact.text)) return false;
    m.news.push({ ...fact, t: Date.now() });
    if (m.news.length > 24) m.news.shift();
    this._dirty = true;
    return true;
  }

  /**
   * Two residents chatting share news: a couple of places one knows and the
   * other doesn't, and what they know about the heroine.
   */
  gossip(a, b) {
    const shared = [];
    for (const [x, y] of [[a, b], [b, a]]) {
      // Places: their favourites first (recently learned ones).
      let n = 0;
      for (const l of [...x.mind.learned].reverse()) {
        const pl = places[l.place];
        if (pl && this.learn(y, pl, 'told', x.id) && ++n >= 2) break;
      }
      // About the heroine.
      for (const f of x.mind.news) {
        if (f.about !== 'player') continue;
        const txt = f.from === 'self' ? f.text : f.text;
        if (this.hear(y, { kind: f.kind, about: 'player', text: txt, from: f.from === 'self' ? x.id : f.from, via: x.id })) shared.push(f.kind);
      }
      // Opinions rub off a little.
      if (x.mind.player.met) y.mind.player.affinity = clamp(y.mind.player.affinity + (x.mind.player.affinity - y.mind.player.affinity) * 0.15, -1, 1);
    }
    return shared;
  }

  tick(dt) {
    this._saveT += dt;
    if (this._dirty && this._saveT > 10) { this._saveT = 0; this.save(); }
  }
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
