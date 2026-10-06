/**
 * Save data format: plain JSON, versioned, validated on load. No three.js or
 * DOM here, so it is unit tested in Node (scripts/save-system.test.mjs).
 *
 *   save    — the current playthrough: where she is, what she found, which
 *             favors are done, coins, moved cars, and this run's stats.
 *   profile — lasts across New Game: lifetime stats and play history.
 */
export const SAVE_VERSION = 1;
export const SAVE_KEY = 'hikari.save';
export const PROFILE_KEY = 'hikari.profile';

/** Counters (summed), maxima and sets tracked per run and for the lifetime. */
export const STAT_SUMS = ['playTime', 'walked', 'ran', 'driven', 'cycled', 'jumps', 'climbs', 'crashes',
  'dodges', 'fragments', 'favors', 'coinsEarned', 'talks', 'completions', 'purchases', 'coinsSpent', 'treats'];
export const STAT_MAX = ['topSpeed'];
export const STAT_SETS = ['residentsMet', 'districts', 'shopsVisited'];

export function emptyStats() {
  const s = {};
  for (const k of STAT_SUMS) s[k] = 0;
  for (const k of STAT_MAX) s[k] = 0;
  for (const k of STAT_SETS) s[k] = [];
  s.bestCompletion = null;   // seconds of play to open the portal, best run
  return s;
}

export function emptyProfile(now = Date.now()) {
  return { version: SAVE_VERSION, firstPlayed: now, lastPlayed: now, sessions: 0, games: 0, lifetime: emptyStats(), settings: {} };
}

export function newSave(now = Date.now()) {
  return {
    version: SAVE_VERSION,
    created: now,
    savedAt: now,
    player: null,           // { x, y, z, yaw }
    camera: null,           // { yaw, pitch }
    fragments: [],          // collected flags, by fragment index
    portalActive: false,
    completed: false,
    missions: {},           // { [id]: { status, completed: [objectiveId] } }
    tracked: null,
    coins: 0,
    vehicles: [],           // [{ id, x, z, yaw }] cars the player left somewhere
    shop: null,             // { owned: [itemId], inventory: { itemId: n }, outfit: { part: itemId } }
    stats: emptyStats(),
  };
}

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v) => (typeof v === 'string' ? v : null);

function cleanStats(s) {
  const out = emptyStats();
  if (!s || typeof s !== 'object') return out;
  for (const k of [...STAT_SUMS, ...STAT_MAX]) out[k] = Math.max(0, num(s[k]));
  for (const k of STAT_SETS) out[k] = Array.isArray(s[k]) ? [...new Set(s[k].filter((x) => typeof x === 'string'))] : [];
  out.bestCompletion = s.bestCompletion == null ? null : Math.max(0, num(s.bestCompletion, 0)) || null;
  return out;
}

function cleanShop(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const ids = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []);
  const inventory = {};
  if (raw.inventory && typeof raw.inventory === 'object') {
    for (const [id, n] of Object.entries(raw.inventory)) if (Number.isFinite(n) && n > 0) inventory[id] = Math.floor(n);
  }
  const outfit = {};
  if (raw.outfit && typeof raw.outfit === 'object') {
    for (const [part, id] of Object.entries(raw.outfit)) if (typeof id === 'string') outfit[part] = id;
  }
  return { owned: ids(raw.owned), inventory, outfit };
}

const STATUSES = new Set(['available', 'active', 'ready', 'completed']);

/**
 * Validate / migrate a parsed save. Anything malformed falls back to its
 * default, so a damaged field never breaks loading the rest. Returns null
 * when it isn't a save at all.
 */
export function cleanSave(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.version !== 'number') return null;
  // Future migrations: if (raw.version < 2) { ...; raw.version = 2; }
  const s = newSave(num(raw.created, Date.now()));
  s.savedAt = num(raw.savedAt, s.created);
  const p = raw.player;
  if (p && [p.x, p.y, p.z, p.yaw].every((v) => typeof v === 'number' && Number.isFinite(v))) {
    s.player = { x: p.x, y: p.y, z: p.z, yaw: p.yaw };
  }
  const c = raw.camera;
  if (c && Number.isFinite(c.yaw) && Number.isFinite(c.pitch)) s.camera = { yaw: c.yaw, pitch: c.pitch };
  s.fragments = Array.isArray(raw.fragments) ? raw.fragments.map(Boolean) : [];
  s.portalActive = !!raw.portalActive;
  s.completed = !!raw.completed;
  if (raw.missions && typeof raw.missions === 'object') {
    for (const [id, r] of Object.entries(raw.missions)) {
      if (!r || !STATUSES.has(r.status)) continue;
      s.missions[id] = { status: r.status, completed: Array.isArray(r.completed) ? r.completed.filter((x) => typeof x === 'string') : [] };
    }
  }
  s.tracked = str(raw.tracked);
  s.coins = Math.max(0, Math.round(num(raw.coins)));
  s.vehicles = Array.isArray(raw.vehicles)
    ? raw.vehicles.filter((v) => v && [v.id, v.x, v.z, v.yaw].every(Number.isFinite)).map(({ id, x, z, yaw }) => ({ id, x, z, yaw }))
    : [];
  s.shop = cleanShop(raw.shop);
  s.stats = cleanStats(raw.stats);
  return s;
}

export function cleanProfile(raw) {
  const p = emptyProfile();
  if (!raw || typeof raw !== 'object') return p;
  p.firstPlayed = num(raw.firstPlayed, p.firstPlayed);
  p.lastPlayed = num(raw.lastPlayed, p.lastPlayed);
  p.sessions = Math.max(0, Math.round(num(raw.sessions)));
  p.games = Math.max(0, Math.round(num(raw.games)));
  p.lifetime = cleanStats(raw.lifetime);
  p.settings = raw.settings && typeof raw.settings === 'object' ? { ...raw.settings } : {};
  return p;
}

/** Parse JSON text into a clean save / profile; null / fresh on any error. */
export function parseSave(text) {
  try { return text ? cleanSave(JSON.parse(text)) : null; } catch { return null; }
}
export function parseProfile(text) {
  try { return cleanProfile(text ? JSON.parse(text) : null); } catch { return cleanProfile(null); }
}

/** Stat helpers: every change goes to this run and to the lifetime totals. */
export function addStat(stats, key, n = 1) { stats[key] = (stats[key] || 0) + n; }
export function maxStat(stats, key, v) { if (v > (stats[key] || 0)) stats[key] = v; }
export function addToSet(stats, key, id) {
  if (!stats[key].includes(id)) { stats[key].push(id); return true; }
  return false;
}

// ---------------------------------------------------------------- display
export function formatDuration(s) {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h) return `${h} h ${m} min`;
  if (m) return `${m} min`;
  return `${s} s`;
}

export function formatDistance(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.round(m)} m`;
}

export function formatAgo(t, now = Date.now()) {
  const s = Math.max(0, (now - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

/** One-line summary of a save for the title screen. */
export function describeSave(save, { fragmentsTotal = 5, favorsTotal = 0, now = Date.now() } = {}) {
  const frags = save.fragments.filter(Boolean).length;
  const favors = Object.values(save.missions).filter((m) => m.status === 'completed').length;
  const parts = [`${frags}/${fragmentsTotal} fragments`];
  if (favorsTotal) parts.push(`${favors}/${favorsTotal} favors`);
  parts.push(`${save.coins} coins`, formatDuration(save.stats.playTime));
  return { line: parts.join(' · '), saved: `Saved ${formatAgo(save.savedAt, now)}` };
}

/** Rows for the stats panel: [label, this game, lifetime]. */
export function statRows(run, life) {
  const kmh = (v) => `${Math.round(v * 3.6)} km/h`;
  return [
    ['Time played', formatDuration(run.playTime), formatDuration(life.playTime)],
    ['Walked', formatDistance(run.walked), formatDistance(life.walked)],
    ['Ran', formatDistance(run.ran), formatDistance(life.ran)],
    ['Driven', formatDistance(run.driven), formatDistance(life.driven)],
    ['Cycled', formatDistance(run.cycled), formatDistance(life.cycled)],
    ['Top speed', kmh(run.topSpeed), kmh(life.topSpeed)],
    ['Fragments found', run.fragments, life.fragments],
    ['Favors done', run.favors, life.favors],
    ['Coins earned', run.coinsEarned, life.coinsEarned],
    ['Coins spent', run.coinsSpent, life.coinsSpent],
    ['Things bought', run.purchases, life.purchases],
    ['Snacks + drinks enjoyed', run.treats, life.treats],
    ['Shops visited', run.shopsVisited.length, life.shopsVisited.length],
    ['Residents met', run.residentsMet.length, life.residentsMet.length],
    ['Districts visited', run.districts.length, life.districts.length],
    ['Chats', run.talks, life.talks],
    ['Jumps', run.jumps, life.jumps],
    ['Climbs', run.climbs, life.climbs],
    ['Bumps in cars', run.crashes, life.crashes],
    ['Residents who leapt clear', run.dodges, life.dodges],
    ['Portal opened', run.completions, life.completions],
    ['Fastest portal', run.bestCompletion ? formatDuration(run.bestCompletion) : '—', life.bestCompletion ? formatDuration(life.bestCompletion) : '—'],
  ];
}
