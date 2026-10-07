import { AISLES, CLOTHES, GROCERIES, RACKS } from './MallCatalog.js';

/**
 * What a shopper says when she talks to them at the mall: a short line
 * about their trip, recommending something from the catalog (with its
 * aisle and price, so the tip is useful), or about what they are doing now.
 */
const pick = (list) => list[Math.floor(Math.random() * list.length)];

const TIPS = [
  (p) => `Have you tried ${p.name}? It's in ${AISLES[p.aisle]}, only ${p.price} coins.`,
  (p) => `${p.name} is my favourite. ${AISLES[p.aisle]}, if you're looking.`,
  (p) => `I always get ${p.name} here. ${p.price} coins, can't beat that.`,
  (p) => `If you see ${p.name} in ${AISLES[p.aisle]}, grab one before they're gone!`,
];
const FASHION = [
  (c) => `The ${c.name} over in ${RACKS[c.rack]} would really suit you.`,
  (c) => `I can't decide on the ${c.name}. ${c.price} coins… what do you think?`,
  (c) => `Try things on before you buy. The ${c.name} runs a little small.`,
];
const DOING = {
  arrive: ['Big shop today. I made a list, and I\'ve already forgotten it.', 'The mall\'s busy this afternoon!'],
  shop: ['Somehow my cart is always fuller than I planned.', 'I only came in for one thing…'],
  queue: ['The line\'s moving quickly today, at least.', 'Almost my turn. Do you have everything?'],
  leave: ['That\'s everything. See you back on Hikari Street!', 'Time to get all this home before the ice cream melts.'],
};

/** A line for shopper `s` (stage: 'arrive' | 'shop' | 'queue' | 'leave', clothes: browsing the racks). */
export function shopperLine(s) {
  if (s.clothes && Math.random() < 0.7) return pick(FASHION)(pick(CLOTHES));
  if (Math.random() < 0.55) return pick(TIPS)(pick(GROCERIES));
  return pick(DOING[s.stage] || DOING.shop);
}
