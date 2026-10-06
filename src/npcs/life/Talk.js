import { places } from './Places.js';

/**
 * What a resident says when the heroine talks to them, built from what they
 * remember (Mind.js), what they are doing (Life.js) and what they know about
 * the town. Every line is short and specific to this resident.
 */

/** Neighbourhood name for a point (same districts as the map). */
export function district(x, z) {
  if (z < 47) {
    if (x < -8.5 && z > -27 && z < -7) return 'the pocket park';
    if (x > 8.5 && z > -10 && z < -7.5 + 2) return 'the alley';
    return 'Hikari Street';
  }
  if (z < 60) return 'the railway underpass';
  if (z < 102) return 'the market';
  if (z < 142) return 'Sakura Gardens';
  if (z < 240) return x < -40 ? 'the west residential streets' : x > 40 ? 'the canal' : 'the avenue';
  if (z < 315) return 'the civic quarter';
  return 'the northern park';
}

const KIND = {
  bench: 'a quiet bench', cafe: 'a café table', vending: 'the vending machines', trash: '',
  bus: 'the bus stop', shrine: 'the little shrine', fountain: 'the fountain', postbox: 'the postbox',
};

export function describe(pl) {
  if (!pl) return 'somewhere nice';
  const where = district(pl.x, pl.z);
  if (pl.type === 'shop') return pl.name ? `${titleCase(pl.name)} in ${where}` : `a little shop in ${where}`;
  return `${KIND[pl.type] || 'a nice spot'} in ${where}`;
}

const titleCase = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const DOING = {
  drink: 'I was just about to get something to drink.',
  cafe: 'I was on my way for a coffee.',
  rest: 'I was going to sit down for a bit — my feet are tired.',
  shop: 'I have a little shopping to do.',
  post: 'I was off to post a letter.',
  bus: 'I’m catching the bus in a bit.',
  shrine: 'I was going to say a quick prayer at the shrine.',
  view: 'The blossoms are perfect today — I was going to look at them.',
  stroll: 'Just out for a walk.',
  visit: 'I was going to see a friend.',
  work: 'Work never really stops around here!',
  home: 'I was just heading home.',
  explore: 'I’m exploring a part of town I don’t know yet.',
};

/**
 * A fact about the heroine as this listener would say it. `from` = who saw
 * it / told them ('self' = they saw it themselves).
 */
function telling(fact, listener, nameOf) {
  const [kind, a, b] = fact.text.split(':');
  const who = fact.from && fact.from !== 'self' ? nameOf(fact.from) : null;
  const subj = (id) => (id === listener.id ? 'me' : nameOf(id));
  switch (kind) {
    case 'helped': return who
      ? (a === fact.from ? `${who} told me you helped her with “${b}”.` : `${who} told me you helped ${subj(a)} with “${b}”.`)
      : (a === listener.id ? null : `I saw you helping ${nameOf(a)} with “${b}”.`);
    case 'reckless': return who ? `${who} said someone nearly ran ${subj(a)} over with a car… that was you?` : null;
    case 'fragment': return who ? `${who} says you’ve been collecting those glowing crystals.` : 'I saw you pick up one of those glowing crystals! What are they?';
    case 'climb': return who ? `${who} saw you climbing on the cars!` : 'I saw you climbing on the cars earlier. Ha!';
    default: return null;
  }
}

/** A conversational line for this resident right now. */
export function lineFor(item, minds, ctx = {}) {
  const m = item.mind, P = m.player, L = item.life, sp = item.spec;
  const out = [];
  const others = ctx.byId || new Map();
  const nameOf = (id) => others.get(id)?.name || id;

  // How they feel about her.
  const wary = P.saw.reckless && P.affinity < 0;
  if (wary) out.push(P.met
    ? pick(['You nearly ran me over earlier… please be careful with that.', 'Oh — it’s you. Please drive more slowly around here.'])
    : `Hey — you’re the one who nearly ran me over! I’m ${sp.name}, by the way. Please be more careful.`);

  if (!P.met && !wary) {
    out.push(pick([`Oh, hello! I don’t think we’ve met. I’m ${sp.name} — ${sp.role.toLowerCase()}.`, `Hi there, you’re new around here? I’m ${sp.name}.`]));
    // Heard about her already?
  }
  if (!P.met) {
    const heard = m.news.find((n) => n.about === 'player' && n.from !== 'self' && telling(n, item, nameOf));
    if (heard) out.push(`Wait — ${telling(heard, item, nameOf)}`);
  } else if (!wary) {
    const n = P.talks;
    if (P.missions.length) out.push(pick([`It’s you! I still remember “${P.missions[P.missions.length - 1]}”. Thank you again.`, `My favourite helper is back!`]));
    else if (n > 6) out.push(pick(['Back again? You’re becoming a regular face around here.', 'Hi again! You really do get around this town.']));
    else if (Date.now() - P.prevTalk < 10 * 60 * 1000) out.push(pick(['Oh, you again! Did you forget something?', 'Hi again — back so soon?']));
    else out.push(pick(['Oh, hello again!', 'Nice to see you again.', 'Good to see you!']));
    // Gossip about her from someone else.
    // Something they heard or saw — newest first, not the same one twice in a row.
    const news = m.news.filter((x) => x.about === 'player' && telling(x, item, nameOf) && x.text + x.from !== m.lastTold);
    if (news.length && Math.random() < 0.75) {
      const f = news[news.length - 1];
      m.lastTold = f.text + f.from;
      out.push(telling(f, item, nameOf));
    }
  }

  // ---- Things that matter in the game, most useful first (max two) ----
  const useful = [];
  const g = ctx.game;
  const knowsArea = (x, z) => m.seen.has(`${Math.floor(x / 20)},${Math.floor(z / 20)}`) ||
    Math.hypot(x - L.home.x, z - L.home.z) < 30;
  // 1. A fragment she hasn't collected, somewhere they know.
  const frags = g?.collectibles?.items?.filter((f) => !f.collected) || [];
  const seenFrag = frags.find((f) => knowsArea(f.base.x, f.base.z));
  if (seenFrag) {
    const f = seenFrag.base, here = Math.hypot(f.x - item.position.x, f.z - item.position.z) < 25;
    const high = f.y > 1.6 ? ' It’s up high — you’ll have to climb.' : '';
    useful.push(`${here ? 'There’s a strange glowing light just around here' : `I saw a strange glowing light in ${district(f.x, f.z)}`}.${high}`);
  } else if (g?.collectibles && frags.length === 0) {
    useful.push(g.portal?.active ? 'Did you see the gate that opened on the main street? Everyone’s talking about it!' : 'I heard all the glowing crystals have been found!');
  }
  // 2. Someone who needs her help (a mission she hasn't taken), that they know of.
  const recs = g?.missions?.records;
  if (recs && ctx.missionsData) {
    for (const ms of ctx.missionsData) {
      const st = recs[ms.id]?.status;
      if (ms.giver === item.id || st !== 'available') continue;
      const giver = others.get(ms.giver);
      if (!giver) continue;
      const knowsThem = m.player && (L.friends?.includes(giver) || knowsArea(giver.position.x, giver.position.z));
      if (!knowsThem) continue;
      useful.push(`${giver.name} in ${district(giver.position.x, giver.position.z)} was looking for someone to help — “${ms.title}”.`);
      break;
    }
  }
  // 3. What they're doing / need right now (their own life).
  if (L?.intent && DOING[L.intent]) useful.push(DOING[L.intent]);
  out.push(...useful.slice(0, 2));

  if (out.length >= 3) return out.slice(0, 3).join(' ');
  // A tip from what they know: a place they discovered recently, or one she
  // probably hasn't been to (her visited map cells).
  const recent = m.learned.slice().reverse().map((l) => ({ ...l, pl: places[l.place] })).find((l) => l.pl && l.pl.type !== 'trash');
  if (recent && Math.random() < 0.6) {
    const via = recent.how === 'told' && recent.from ? `${nameOf(recent.from)} told me about` : 'I just found';
    out.push(`${via} ${describe(recent.pl)}. ${pick(['You should take a look!', 'It’s lovely.', 'Worth a visit.'])}`);
  } else {
    // Somewhere they know that she hasn't been (not the same tip again).
    const worth = ['cafe', 'shrine', 'fountain', 'shop', 'bus', 'bench'];
    const unseen = places.filter((pl) => m.knows.has(pl.id) && worth.includes(pl.type) && pl.id !== m.lastTip && !minds.playerCells.has(`${Math.floor(pl.x / 20)},${Math.floor(pl.z / 20)}`));
    if (unseen.length) {
      const tip = pick(unseen);
      m.lastTip = tip.id;
      out.push(`Have you been to ${describe(tip)}? I don’t think I’ve seen you there.`);
    }
  }

  return out.slice(0, 3).join(' ');
}
