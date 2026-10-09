/**
 * Shops and what they sell. Plain data (no three.js / DOM) so it is unit
 * tested in Node. Where each shop stands is in ShopSystem (SHOP_SPOTS).
 *
 * Item kinds:
 *   drink     — consumable: runs faster for a while (`boost.run`, seconds)
 *   food      — consumable: jumps higher for a while (`boost.jump`)
 *   read      — magazine / book: kept, readable from the Bag
 *   top / bottom / shoes / hair — outfit colour, kept, worn from the Bag
 *   vehicle   — the keys to a showroom vehicle (it is locked until bought)
 *   pantry    — groceries from Hikari Mall with no effect (kept, counted)
 *   goods     — anything else from Hikari Mall's shops (kept, counted)
 */
import { GROCERIES, CLOTHES, SHOP_GOODS } from '../mall/MallCatalog.js';

export const ITEMS = {
  // Drinks (vending machines, konbini, café)
  ramune: { name: 'Ramune', kind: 'drink', price: 6, icon: '🫧', text: 'Fizzy marble soda. Run faster for a minute.', boost: { run: 60 } },
  greentea: { name: 'Cold green tea', kind: 'drink', price: 5, icon: '🍵', text: 'Bottled sencha. Run faster for 45 s.', boost: { run: 45 } },
  canCoffee: { name: 'Can coffee', kind: 'drink', price: 7, icon: '☕', text: 'Hot from the machine. Run faster for 90 s.', boost: { run: 90 } },
  latte: { name: 'Sakura latte', kind: 'drink', price: 14, icon: '🌸', text: 'The café special. Run faster for 2 minutes.', boost: { run: 120 } },
  energy: { name: 'Genki energy drink', kind: 'drink', price: 15, icon: '⚡', text: 'Fizzy and very yellow. Run faster for 2½ minutes.', boost: { run: 150 } },
  melonSoda: { name: 'Melon soda float', kind: 'drink', price: 12, icon: '🍈', text: 'Green, sweet, ice cream on top. Run faster for 90 s.', boost: { run: 90 } },
  // Food (konbini, market, bakery)
  onigiri: { name: 'Onigiri', kind: 'food', price: 8, icon: '🍙', text: 'Salmon rice ball. Jump higher for a minute.', boost: { jump: 60 } },
  melonpan: { name: 'Melon pan', kind: 'food', price: 9, icon: '🍞', text: 'Crisp sweet bun. Jump higher for 75 s.', boost: { jump: 75 } },
  takoyaki: { name: 'Takoyaki', kind: 'food', price: 12, icon: '🐙', text: 'Six piping-hot octopus balls. Jump higher for 90 s.', boost: { jump: 90 } },
  taiyaki: { name: 'Taiyaki', kind: 'food', price: 10, icon: '🐟', text: 'Fish-shaped cake with red bean. Jump higher for 75 s.', boost: { jump: 75 } },
  strawberries: { name: 'Strawberry punnet', kind: 'food', price: 15, icon: '🍓', text: 'From the market farm stall. Jump higher for 2 minutes.', boost: { jump: 120 } },
  ramenBowl: { name: 'Shoyu ramen', kind: 'food', price: 16, icon: '🍜', text: 'Slurp it while it’s hot. Jump higher for 2 minutes.', boost: { jump: 120 } },
  bento: { name: 'Bento box', kind: 'food', price: 18, icon: '🍱', text: 'A proper lunch: run faster and jump higher for 90 s.', boost: { run: 90, jump: 90 } },
  // Reading (konbini rack, bookshop)
  walker: { name: 'Hikari Walker', kind: 'read', price: 20, icon: '📰', text: 'The neighbourhood magazine.',
    pages: ['This month: the cherry trees in Sakura Gardens bloom early. Locals say the light on the main street at 17:20 is the best in the city.', 'Komorebi Market adds a farm stall on weekends. Try the strawberries.'] },
  gazette: { name: 'Canal Gazette', kind: 'read', price: 15, icon: '🗞', text: 'News from Mizuki Canal.',
    pages: ['Two footbridges, one canal, and a café that only opens when it feels like it.', 'Rumour: someone keeps leaving origami cranes on the north bridge rail.'] },
  manga: { name: 'Shooting Star vol. 1', kind: 'read', price: 25, icon: '📕', text: 'A shoujo manga everyone on the street is reading.',
    pages: ['A girl finds glowing fragments in her city, and every one of them remembers someone.', 'To be continued in volume 2 (sold out).'] },
  fashion: { name: 'Street Snap', kind: 'read', price: 22, icon: '📒', text: 'Fashion magazine.',
    pages: ['This season: pastel tops and white sneakers. Sakura Threads has the colours.', 'Hair: soft pinks and honey browns. Ask at Kaminari Salon.'] },
  cityguide: { name: 'Hikari City Guide', kind: 'read', price: 30, icon: '🗺', text: 'Every district in one book.',
    pages: ['Hikari Street — where it all starts. Station Walk — coffee beyond the railway. Komorebi Market — makers and favors.', 'Sakura Gardens, Aoba Neighborhood, Mizuki Canal, North Avenue and Hikari Commons: the library and the arts hall.'] },
  // Clothes (Sakura Threads). `color` is applied to that part of her outfit.
  topWhite: { name: 'White tee', kind: 'top', price: 0, icon: '👕', color: '#f6f5f1', text: 'The one she arrived in.' },
  topSakura: { name: 'Sakura pink tee', kind: 'top', price: 40, icon: '👕', color: '#f4b8c8', text: 'Soft pink cotton.' },
  topSky: { name: 'Sky blue tee', kind: 'top', price: 40, icon: '👕', color: '#9ccbea', text: 'Clear-day blue.' },
  topMint: { name: 'Mint tee', kind: 'top', price: 40, icon: '👕', color: '#a9dcc4', text: 'Fresh mint green.' },
  topLemon: { name: 'Lemon tee', kind: 'top', price: 45, icon: '👕', color: '#f3dd7f', text: 'Sunny yellow.' },
  topLilac: { name: 'Lilac tee', kind: 'top', price: 45, icon: '👕', color: '#c4b2e8', text: 'Evening lilac.' },
  topNavy: { name: 'Navy tee', kind: 'top', price: 50, icon: '👕', color: '#3b4a6b', text: 'Deep navy.' },
  bottomBlack: { name: 'Black shorts', kind: 'bottom', price: 0, icon: '🩳', color: null, text: 'The ones she arrived in.' },
  bottomDenim: { name: 'Denim shorts', kind: 'bottom', price: 55, icon: '🩳', color: '#41618f', text: 'Washed denim.' },
  bottomKhaki: { name: 'Khaki shorts', kind: 'bottom', price: 50, icon: '🩳', color: '#b59d72', text: 'Sand khaki.' },
  bottomPlum: { name: 'Plum shorts', kind: 'bottom', price: 55, icon: '🩳', color: '#552a4c', text: 'Deep plum.' },
  shoesClassic: { name: 'Classic sneakers', kind: 'shoes', price: 0, icon: '👟', color: null, text: 'Her own.' },
  shoesRed: { name: 'Red sneakers', kind: 'shoes', price: 45, icon: '👟', color: '#d24b4b', text: 'Bright red canvas.' },
  shoesTeal: { name: 'Teal sneakers', kind: 'shoes', price: 45, icon: '👟', color: '#3f9c9a', text: 'Teal canvas.' },
  // Hair dye (Kaminari Salon)
  hairNatural: { name: 'Natural brown', kind: 'hair', price: 0, icon: '💇', color: null, text: 'Her own colour.' },
  hairHoney: { name: 'Honey brown', kind: 'hair', price: 60, icon: '💇', color: '#b07a45', text: 'Warm honey.' },
  hairPink: { name: 'Sakura pink', kind: 'hair', price: 80, icon: '💇', color: '#e79ab4', text: 'Cherry-blossom pink.' },
  hairBlack: { name: 'Raven black', kind: 'hair', price: 60, icon: '💇', color: '#25232b', text: 'Glossy black.' },
  hairSilver: { name: 'Moon silver', kind: 'hair', price: 90, icon: '💇', color: '#c9ccd6', text: 'Silver-grey.' },
  hairBlue: { name: 'Twilight blue', kind: 'hair', price: 90, icon: '💇', color: '#5873b8', text: 'Blue like 19:00.' },
  // Vehicles (Hikari Motors): unlock the showroom vehicle with that `vehicle` key.
  keysScooter: { name: 'Showroom scooter', kind: 'vehicle', price: 120, icon: '🛵', vehicle: 'showroom-scooter', text: 'The keys to the cream scooter on the lot.' },
  keysKei: { name: 'Showroom kei car', kind: 'vehicle', price: 220, icon: '🚗', vehicle: 'showroom-kei', text: 'The keys to the pink kei car on the lot.' },
};

// Hikari Mall's goods (shopping mode), kept in her Bag like everything else:
// drinks and snacks with their boost, the rest in the pantry, clothes worn.
const AISLE_ICON = { drinks: '🥤', dairy: '🧈', bakery: '🥐', produce: '🍎', snacks: '🍪', pantry: '🍚', frozen: '🧊', household: '🧴' };
const PART_ICON = { top: '👕', bottom: '👖', shoes: '👟' };
for (const p of GROCERIES) {
  ITEMS[p.id] = { name: p.name, kind: p.kind || 'pantry', price: p.price, icon: AISLE_ICON[p.aisle], text: `${p.brand} · Hikari Mall`, ...(p.boost && { boost: p.boost }), mall: true };
}
const GOODS_ICON = { book: '📕', magazine: '📒', box: '📦', dye: '🎀', jar: '🫙', bottle: '🧴', bun: '🥐', cup: '🥤', bowl: '🍜', bag: '👜' };
for (const g of SHOP_GOODS) {
  ITEMS[g.id] = { name: g.name, kind: g.kind, price: g.price, icon: GOODS_ICON[g.look.shape], text: 'From Hikari Mall.', ...(g.boost && { boost: g.boost }), mall: true };
}
for (const c of CLOTHES) ITEMS[c.id] = { name: c.name, kind: c.kind, garment: c.garment, price: c.price, icon: PART_ICON[c.kind], color: c.color, text: 'From Hikari Mall.', mall: true };

/** Shop types: name, sign colour and stock. */
export const SHOPS = {
  vending: { name: 'Vending machine', kind: 'vending', color: '#6fb3e0', stock: ['greentea', 'ramune', 'canCoffee'], greet: 'Irasshaimase! (beep)' },
  konbini: { name: 'Hikari Mart', kind: 'konbini', color: '#59b37a', stock: ['onigiri', 'bento', 'melonpan', 'greentea', 'canCoffee', 'walker', 'gazette', 'manga'], greet: 'Welcome! Open 24 hours.' },
  cafe: { name: 'Sunday Coffee', kind: 'cafe', color: '#b98a5e', stock: ['latte', 'melonSoda', 'canCoffee', 'melonpan'], greet: 'Something sweet today?' },
  bakery: { name: 'Little Bakery', kind: 'bakery', color: '#e0a66a', stock: ['melonpan', 'taiyaki', 'latte'], greet: 'Fresh out of the oven.' },
  market: { name: 'Komorebi Stalls', kind: 'market', color: '#dbab77', stock: ['takoyaki', 'taiyaki', 'strawberries', 'ramune', 'melonSoda'], greet: 'Hot takoyaki! Fresh strawberries!' },
  books: { name: 'Aoba Books', kind: 'books', color: '#738698', stock: ['manga', 'cityguide', 'walker', 'gazette', 'fashion'], greet: 'Take your time browsing.' },
  boutique: { name: 'Sakura Threads', kind: 'boutique', color: '#e79ab4', stock: ['topSakura', 'topSky', 'topMint', 'topLemon', 'topLilac', 'topNavy', 'bottomDenim', 'bottomKhaki', 'bottomPlum', 'shoesRed', 'shoesTeal', 'fashion'], greet: 'New colours just came in!' },
  salon: { name: 'Kaminari Salon', kind: 'salon', color: '#c4b2e8', stock: ['hairHoney', 'hairPink', 'hairBlack', 'hairSilver', 'hairBlue'], greet: 'A new colour? Sit right down.' },
  ramen: { name: 'Ramen Akari', kind: 'ramen', color: '#c8553d', stock: ['ramenBowl', 'onigiri', 'greentea'], greet: 'Irasshai! One bowl coming up.' },
  drugstore: { name: 'Drugstore Midori', kind: 'drugstore', color: '#59b37a', stock: ['energy', 'greentea', 'ramune', 'onigiri', 'walker'], greet: 'Need a pick-me-up?' },
  foodhall: { name: 'Plaza Food Hall', kind: 'foodhall', color: '#cf8a4c', stock: ['takoyaki', 'bento', 'ramenBowl', 'taiyaki', 'melonSoda'], greet: 'Grab a tray, find a seat!' },
  tea: { name: 'Cha Cha Tea', kind: 'tea', color: '#5f9c74', stock: ['greentea', 'melonSoda', 'latte', 'ramune'], greet: 'Iced, hot, or a float?' },
  motors: { name: 'Hikari Motors', kind: 'motors', color: '#d24b4b', stock: ['keysScooter', 'keysKei'], greet: 'Both on the lot are ready to go.' },
};

/** Clothing she starts with (owned and worn). */
export const DEFAULT_OUTFIT = { top: 'topWhite', bottom: 'bottomBlack', shoes: 'shoesClassic', hair: 'hairNatural' };
export const WEARABLE = new Set(['top', 'bottom', 'shoes', 'hair']);

/** Coins for exploring, on top of favor rewards. */
export const REWARDS = { fragment: 30, district: 20 };

/**
 * Buying rules (pure): returns { ok, reason } and, when ok, the new wallet.
 * Kept items (clothes, reading, keys) can be bought once.
 */
export function canBuy(itemId, { coins, owned = [] }) {
  const item = ITEMS[itemId];
  if (!item) return { ok: false, reason: 'Not for sale' };
  const keeps = item.kind !== 'drink' && item.kind !== 'food';
  if (keeps && owned.includes(itemId)) return { ok: false, reason: 'Owned' };
  if (coins < item.price) return { ok: false, reason: `Need ${item.price - coins} more coins` };
  return { ok: true, coins: coins - item.price, keeps };
}
