/**
 * Everything residents can *use* in town (benches, vending machines, café
 * tables, shop doors, ...). The original game's builders registered these
 * while building the city; here they come from the exported city data
 * (city.json `places`), loaded once by NPCSystem. Each place has one or more
 * slots: where to stand / sit, which way to face, which pose, and who has
 * reserved it.
 *
 * Place types (and what a resident does there, see Life.js):
 *   bench     sit: rest, read, phone, drink, chat with a neighbour
 *   cafe      sit at a terrace table with a coffee
 *   vending   buy a can, then drink it somewhere
 *   trash     throw the empty can away
 *   bus       wait at the stop (stand / sit), check the time
 *   shrine    bow, clap twice, pray
 *   fountain  sit on the rim
 *   postbox   post a letter
 *   shop      go inside for a while, come out with a bag
 *   view      admire the blossoms / canal / view, take a photo
 *   stall     browse the market goods
 */
export const places = [];

/**
 * Fill the registry from the exported data. Ids are indices into `places`
 * (Mind.js looks places up by id), and every slot starts unreserved.
 */
export function loadPlaces(list) {
  places.length = 0;
  for (const p of list) places[p.id] = { ...p, slots: p.slots.map((s) => ({ ...s, by: null })) };
}

/** Free slot nearest to (x, z) at a place, or null. */
export function freeSlot(place, x = place.x, z = place.z) {
  let best = null, bd = Infinity;
  for (const s of place.slots) {
    if (s.by) continue;
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}
