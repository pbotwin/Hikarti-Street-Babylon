/**
 * Single source of truth for the district's layout (metres).
 *
 *            N (+Z)          railway overpass at z≈47
 *   ┌────────┬───┬────────┐
 *   │  W4    │   │  E4    │
 *   │  W3    │ R │  E3    │
 *   │  Café  │ O │ ═════════ alley (east) → small shrine
 *   │  Park  │ A │  Konbini
 *   │  W1    │ D │  E1    │
 *   └────────┴───┴────────┘
 *            S (−Z)          cross street at z≈-48
 */
const cityRoads = [
  { id: 'central-avenue', x0: -4.5, x1: 4.5, z0: 142, z1: 360 },
  { id: 'west-boulevard', x0: -84.5, x1: -75.5, z0: 154, z1: 344 },
  { id: 'east-boulevard', x0: 75.5, x1: 84.5, z0: 154, z1: 344 },
  ...[164, 244, 324].map((z) => ({ id: `cross-street-${z}`, x0: -118, x1: 118, z0: z - 4.5, z1: z + 4.5 })),
];

// The map and the world use the very same building footprints.
const cityBlocks = [];
const palettes = ['#d9c6ad', '#c1d0c7', '#ddc2b6', '#bfcbd4', '#d4cfad', '#c7becd'];
const names = ['MORI MARKET', 'SUNDAY COFFEE', 'AOBA BOOKS', 'MIZU STUDIO', 'LITTLE BAKERY', 'NORTH RECORDS', 'KASA GOODS', 'YORI KITCHEN'];
function cityBlock(x0, x1, z0, z1, district, options = {}) {
  const i = cityBlocks.length;
  const cx = (x0 + x1) / 2;
  cityBlocks.push({ id: `city-building-${i}`, x0, x1, z0, z1, floors: 2 + i % 3,
    color: palettes[i % palettes.length], accent: ['#64877a', '#af795e', '#738698', '#ad828c'][i % 4],
    name: names[i % names.length], district,
    front: cx < -90 || (cx > -45 && cx < 0) || (cx > 40 && cx < 90) ? '+x' : '-x', ...options });
}
for (const [x0, x1] of [[-120, -96], [-68, -46], [-36, -12], [12, 36], [46, 68], [94, 118]]) {
  cityBlock(x0, x1, 146, 156, x0 < 0 ? 'residential' : 'canal', { floors: 1 + cityBlocks.length % 2, front: '+z' });
}
for (const [z0, z1] of [[176, 193], [209, 230]]) {
  for (const [x0, x1] of [[-68, -46], [-36, -12], [12, 36], [46, 68]]) {
    cityBlock(x0, x1, z0, z1, x0 < 0 ? 'residential' : 'canal');
  }
}
cityBlock(-121, -96, 176, 194, 'residential', { name: 'AOBA COMMUNITY', floors: 2 });
cityBlock(120, 127, 178, 185, 'canal', { name: 'CANAL COFFEE', floors: 0 });
cityBlock(120, 127, 222, 230, 'canal', { name: 'RIVER GOODS', floors: 0 });
cityBlock(-68, -12, 254, 270, 'civic', { name: 'HIKARI LIBRARY', floors: 2, front: '+z', color: '#d6d8ca' });
cityBlock(12, 68, 254, 270, 'civic', { name: 'NORTH ARTS HALL', floors: 2, front: '+z', color: '#d7c6bb' });
for (const [z0, z1] of [[254, 270], [286, 308], [334, 352]]) {
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -122 : 94;
    cityBlock(x0, x0 + 12, z0, z1, 'civic', { floors: 2 });
    cityBlock(x0 + 16, x0 + 28, z0, z1, 'civic', { floors: 3 });
  }
}
for (const [x0, x1] of [[-68, -46], [-36, -12], [12, 36], [46, 68]]) {
  cityBlock(x0, x1, 334, 353, 'civic', { floors: 2, front: '-z' });
}

const cityBridges = [
  { id: 'canal-south-bridge', x0: 98, x1: 114, z0: 184, z1: 192 },
  { id: 'canal-north-bridge', x0: 98, x1: 114, z0: 212, z1: 220 },
];
const citySurfaces = [
  { id: 'residential-court', x0: -68, x1: -12, z0: 196, z1: 206, type: 'grass' },
  { id: 'canal-court', x0: 12, x1: 68, z0: 196, z1: 206, type: 'stone' },
  { id: 'aoba-playground', x0: -121, x1: -93, z0: 204, z1: 232, type: 'grass' },
  { id: 'playground-floor', x0: -117, x1: -98, z0: 208, z1: 226, type: 'sand' },
  { id: 'canal-promenade', x0: 88, x1: 99, z0: 174, z1: 234, type: 'stone' },
  { id: 'canal-east-promenade', x0: 113, x1: 128, z0: 174, z1: 234, type: 'stone' },
  { id: 'library-park', x0: -68, x1: -12, z0: 276, z1: 316, type: 'grass' },
  { id: 'civic-park', x0: 12, x1: 68, z0: 276, z1: 316, type: 'grass' },
  { id: 'library-walk', x0: -42, x1: -38, z0: 271, z1: 320, type: 'dirt' },
  { id: 'civic-walk', x0: 38, x1: 42, z0: 271, z1: 320, type: 'stone' },
  { id: 'library-cross-path', x0: -71, x1: -9, z0: 294, z1: 298, type: 'dirt' },
  { id: 'civic-cross-path', x0: 9, x1: 71, z0: 294, z1: 298, type: 'stone' },
  { id: 'civic-square', x0: 28, x1: 52, z0: 284, z1: 308, type: 'stone' },
  ...cityBridges.map((b) => ({ ...b, type: 'wood' })),
];

export const L = {
  roadHalf: 4.5,
  walkOuter: 8.5,         // building frontage line
  curbH: 0.15,
  playMinZ: -43,
  playMaxZ: 360,
  alley: { z0: -11, z1: -6.5, x1: 32 },
  park: { z0: -27, z1: -7, x0: -30 },
  crosswalks: [-35, 24],
  expansion: { x0: -40, x1: 40, z0: 43, z1: 142 },
  market: { x0: -38, x1: 38, z0: 72, z1: 102 },
  garden: { x0: -38, x1: 38, z0: 108, z1: 138 },
  city: { x0: -128, x1: 128, z0: 142, z1: 360 },
  cityRoads,
  cityBlocks,
  cityCanal: { x0: 100, x1: 112, z0: 176, z1: 232 },
  cityBridges,
  citySurfaces,
  cityLandmarks: [
    { id: 'aoba-playground', name: 'Aoba Playground', x: -107, z: 217, kind: 'playground' },
    { id: 'canal-walk', name: 'Canal Walk', x: 94, z: 202, kind: 'canal' },
    { id: 'hikari-library', name: 'Hikari Library', x: -40, z: 266, kind: 'library' },
    { id: 'arts-hall', name: 'Arts Hall', x: 40, z: 266, kind: 'arts' },
    { id: 'civic-monument', name: 'Harmony Square', x: 40, z: 296, kind: 'monument' },
    { id: 'library-park', name: 'Library Park', x: -40, z: 296, kind: 'park' },
  ],
  mapBounds: { x0: -134, x1: 134, z0: -46, z1: 366 },
  districts: [
    { id: 'hikari', name: 'Hikari Street', description: 'Neighborhood shops, a hidden shrine, and familiar faces.', x0: -32, x1: 33, z0: -43, z1: 44, color: '#c69c78' },
    { id: 'station', name: 'Station Walk', description: 'Coffee shops and new neighbors beyond the railway.', x0: -40, x1: 40, z0: 44, z1: 72, color: '#8db4c2' },
    { id: 'market', name: 'Komorebi Market', description: 'Vintage finds, local makers, and favors to return.', x0: -40, x1: 40, z0: 72, z1: 106, color: '#dbab77' },
    { id: 'garden', name: 'Sakura Gardens', description: 'Cherry blossoms, quiet paths, and a place to slow down.', x0: -40, x1: 40, z0: 106, z1: 142, color: '#95bc99' },
    { id: 'residential', name: 'Aoba Neighborhood', description: 'Garden courtyards, local shops, and streets to call home.', x0: -128, x1: -10, z0: 142, z1: 244, color: '#bea888' },
    { id: 'canal', name: 'Mizuki Canal', description: 'Cross the footbridges and take the long way by the water.', x0: 10, x1: 128, z0: 142, z1: 244, color: '#82abb0' },
    { id: 'avenue', name: 'North Avenue', description: 'A whole city ahead, with a new turn at every crossing.', x0: -10, x1: 10, z0: 142, z1: 244, color: '#aeb9b0' },
    { id: 'civic', name: 'Hikari Commons', description: 'The library, the arts, and wide green spaces to explore.', x0: -128, x1: 128, z0: 244, z1: 360, color: '#91af95' },
  ],
};
