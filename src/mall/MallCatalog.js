/**
 * What Hikari Mall sells. Plain data (no Babylon / DOM), shared by the
 * supermarket, the clothing store, the shoppers and the receipt.
 *
 * Grocery products: { id, name, brand, aisle, price, look: { shape, color,
 *   label, size }, kind?, boost? }
 *   shape  carton | bottle | bigBottle | can | tub | block | bag | box | jar |
 *          loaf | bun | fruit | tray | roll | pack
 *   color  package colour, label: the printed band's colour
 *   kind / boost: as ShopData items (drinks run faster, food jumps higher);
 *   everything else goes to the pantry in her Bag.
 * Clothing: { id, name, kind: top | bottom | shoes, color, price, rack }
 *   worn like Sakura Threads clothes (the colour of that part of her outfit).
 */

const g = (id, name, brand, aisle, price, shape, color, label, extra = {}) => ({ id, name, brand, aisle, price, look: { shape, color, label }, ...extra });

export const AISLES = {
  drinks: 'Drinks',
  dairy: 'Dairy & eggs',
  bakery: 'Bakery',
  produce: 'Fruit & vegetables',
  snacks: 'Snacks & sweets',
  pantry: 'Pantry',
  frozen: 'Frozen',
  household: 'Household',
};

export const GROCERIES = [
  // Drinks
  g('kumoCola', 'Kumo Cola', 'Kumo', 'drinks', 3, 'can', '#b3202a', '#f4f1ea', { kind: 'drink', boost: { run: 30 } }),
  g('kumoColaZero', 'Kumo Cola Zero', 'Kumo', 'drinks', 3, 'can', '#1d1d1f', '#c8202c', { kind: 'drink', boost: { run: 30 } }),
  g('kumoColaBig', 'Kumo Cola 1.5 L', 'Kumo', 'drinks', 6, 'bigBottle', '#5a1a14', '#b3202a', { kind: 'drink', boost: { run: 60 } }),
  g('sakuraSoda', 'Sakura Soda', 'Hanami', 'drinks', 3, 'can', '#f2a7bd', '#ffffff', { kind: 'drink', boost: { run: 30 } }),
  g('yuzuLemon', 'Yuzu Lemonade', 'Hanami', 'drinks', 4, 'bottle', '#f3d54a', '#3d7a3a', { kind: 'drink', boost: { run: 40 } }),
  g('melonCream', 'Melon Cream Soda', 'Hanami', 'drinks', 4, 'bottle', '#7fd17a', '#ffffff', { kind: 'drink', boost: { run: 40 } }),
  g('mugiTea', 'Barley Tea 2 L', 'Ochaya', 'drinks', 5, 'bigBottle', '#c08a4a', '#2e5a3a', { kind: 'drink', boost: { run: 60 } }),
  g('greenTeaBottle', 'Green Tea', 'Ochaya', 'drinks', 3, 'bottle', '#7fb069', '#ffffff', { kind: 'drink', boost: { run: 40 } }),
  g('mineralWater', 'Mount Aso Water', 'Aso', 'drinks', 2, 'bottle', '#cfe8f3', '#2f6fa8', { kind: 'drink', boost: { run: 20 } }),
  g('orangeJuice', 'Orange Juice', 'Sunny Grove', 'drinks', 5, 'carton', '#f29a2e', '#ffffff', { kind: 'drink', boost: { run: 45 } }),
  g('appleJuice', 'Apple Juice', 'Sunny Grove', 'drinks', 5, 'carton', '#e3c04a', '#c0392b', { kind: 'drink', boost: { run: 45 } }),
  g('canCoffeeBlack', 'Black Can Coffee', 'Boss Bean', 'drinks', 3, 'can', '#2a211c', '#d9a066', { kind: 'drink', boost: { run: 50 } }),
  g('energyMax', 'Genki MAX', 'Genki', 'drinks', 4, 'can', '#f2d43a', '#1d1d1f', { kind: 'drink', boost: { run: 75 } }),
  // Dairy & eggs
  g('butterSalted', 'Salted Butter', 'Hokkaido Farm', 'dairy', 6, 'block', '#f6e7a8', '#1f5aa6'),
  g('butterUnsalted', 'Unsalted Butter', 'Hokkaido Farm', 'dairy', 6, 'block', '#f6e7a8', '#3a8f5c'),
  g('butterSpread', 'Spreadable Butter', 'Meadowcream', 'dairy', 5, 'tub', '#fff4c8', '#e2a53a'),
  g('milk', 'Fresh Milk 1 L', 'Hokkaido Farm', 'dairy', 4, 'carton', '#ffffff', '#1f5aa6'),
  g('milkLow', 'Low-fat Milk 1 L', 'Hokkaido Farm', 'dairy', 4, 'carton', '#ffffff', '#3aa6d9'),
  g('strawberryMilk', 'Strawberry Milk', 'Meadowcream', 'dairy', 3, 'carton', '#f7c6d3', '#d34f5f', { kind: 'drink', boost: { run: 30 } }),
  g('yogurt', 'Plain Yogurt', 'Meadowcream', 'dairy', 3, 'tub', '#ffffff', '#5b8fd1'),
  g('yogurtPeach', 'Peach Yogurt', 'Meadowcream', 'dairy', 3, 'tub', '#ffd9b3', '#f08a4b'),
  g('cheeseSlices', 'Cheese Slices', 'Alpine Bell', 'dairy', 5, 'pack', '#f2c94c', '#c0392b'),
  g('camembert', 'Camembert', 'Alpine Bell', 'dairy', 8, 'tub', '#f4efe2', '#2e7d32'),
  g('eggs', 'Free-range Eggs ×10', 'Sunny Grove', 'dairy', 5, 'tray', '#e9dcc4', '#c0802f'),
  // Bakery
  g('shokupan', 'Shokupan Loaf', 'Komorebi Bakery', 'bakery', 4, 'loaf', '#f4e2b8', '#c08a4a', { kind: 'food', boost: { jump: 30 } }),
  g('melonpanBag', 'Melon Pan', 'Komorebi Bakery', 'bakery', 2, 'bun', '#e9c46a', '#3d7a3a', { kind: 'food', boost: { jump: 45 } }),
  g('curryPan', 'Curry Pan', 'Komorebi Bakery', 'bakery', 3, 'bun', '#c98a4b', '#b3202a', { kind: 'food', boost: { jump: 45 } }),
  g('croissants', 'Croissants ×4', 'Komorebi Bakery', 'bakery', 5, 'pack', '#d9a066', '#5a3a1c', { kind: 'food', boost: { jump: 40 } }),
  g('baguette', 'Baguette', 'Komorebi Bakery', 'bakery', 3, 'loaf', '#d9a066', '#5a3a1c'),
  // Fruit & vegetables
  g('apples', 'Fuji Apples', 'Aomori', 'produce', 4, 'fruit', '#c8323a', '#2e7d32', { kind: 'food', boost: { jump: 30 } }),
  g('bananas', 'Bananas', 'Sunny Grove', 'produce', 3, 'fruit', '#f2d43a', '#4a7a2a', { kind: 'food', boost: { jump: 30 } }),
  g('mandarins', 'Mandarins', 'Ehime', 'produce', 4, 'fruit', '#f29a2e', '#3d7a3a', { kind: 'food', boost: { jump: 30 } }),
  g('strawberryPunnet', 'Strawberries', 'Tochigi', 'produce', 7, 'tray', '#e0525e', '#2e7d32', { kind: 'food', boost: { jump: 60 } }),
  g('tomatoes', 'Tomatoes', 'Kumamoto', 'produce', 4, 'fruit', '#e24a3b', '#2e7d32'),
  g('cabbage', 'Cabbage', 'Gunma', 'produce', 3, 'fruit', '#a8d08d', '#5a8f3a'),
  g('carrots', 'Carrots', 'Hokkaido Farm', 'produce', 2, 'bag', '#f08a2e', '#3d7a3a'),
  g('negi', 'Green Onions', 'Saitama', 'produce', 2, 'roll', '#e8f0d8', '#4a8f3a'),
  // Snacks & sweets
  g('chipsSalt', 'Potato Chips Salt', 'Crunchi', 'snacks', 3, 'bag', '#f2d43a', '#c0392b', { kind: 'food', boost: { jump: 25 } }),
  g('chipsNori', 'Potato Chips Nori', 'Crunchi', 'snacks', 3, 'bag', '#3d7a3a', '#f2d43a', { kind: 'food', boost: { jump: 25 } }),
  g('pockyChoco', 'Choco Sticks', 'Pokki', 'snacks', 2, 'box', '#c0392b', '#f4f1ea', { kind: 'food', boost: { jump: 25 } }),
  g('pockyBerry', 'Strawberry Sticks', 'Pokki', 'snacks', 2, 'box', '#f7a8c0', '#c0392b', { kind: 'food', boost: { jump: 25 } }),
  g('mochiIce', 'Mochi Ice ×6', 'Yuki', 'frozen', 5, 'box', '#fbe3ec', '#8a5a9c', { kind: 'food', boost: { jump: 50 } }),
  g('senbei', 'Rice Crackers', 'Kurogane', 'snacks', 3, 'bag', '#c08a4a', '#1d1d1f', { kind: 'food', boost: { jump: 25 } }),
  g('gummies', 'Fruit Gummies', 'Kumo', 'snacks', 2, 'bag', '#9c6ad1', '#f2d43a', { kind: 'food', boost: { jump: 25 } }),
  // Pantry
  g('rice5kg', 'Koshihikari Rice 5 kg', 'Niigata', 'pantry', 18, 'bag', '#f4f1ea', '#2e7d32'),
  g('soySauce', 'Soy Sauce', 'Kikko', 'pantry', 4, 'bottle', '#3a1a12', '#c0392b'),
  g('miso', 'Miso Paste', 'Shinshu', 'pantry', 5, 'tub', '#b07a3a', '#ffffff'),
  g('curryRoux', 'Curry Roux', 'Golden', 'pantry', 4, 'box', '#e8a32a', '#b3202a'),
  g('instantRamen', 'Instant Ramen ×5', 'Nissho', 'pantry', 5, 'pack', '#e24a3b', '#f4f1ea', { kind: 'food', boost: { jump: 40 } }),
  g('strawberryJam', 'Strawberry Jam', 'Meadowcream', 'pantry', 4, 'jar', '#b8202f', '#f4f1ea'),
  g('honey', 'Honey', 'Meadowcream', 'pantry', 6, 'jar', '#e8a32a', '#3d2a1c'),
  // Frozen
  g('gyoza', 'Frozen Gyoza', 'Yuki', 'frozen', 5, 'box', '#e8f0f8', '#c0392b'),
  g('frozenPizza', 'Margherita Pizza', 'Yuki', 'frozen', 6, 'box', '#c0392b', '#f4f1ea'),
  g('edamame', 'Frozen Edamame', 'Yuki', 'frozen', 3, 'bag', '#7fb069', '#ffffff'),
  // Household
  g('detergent', 'Laundry Detergent', 'Fresh', 'household', 7, 'bigBottle', '#3aa6d9', '#ffffff'),
  g('tissues', 'Tissues ×5', 'Soft', 'household', 4, 'pack', '#f4f1ea', '#5b8fd1'),
  g('dishSoap', 'Dish Soap', 'Fresh', 'household', 3, 'bottle', '#7fd17a', '#ffffff'),
  g('toiletPaper', 'Toilet Paper ×12', 'Soft', 'household', 6, 'pack', '#ffffff', '#f2a7bd'),
];

export const RACKS = {
  tees: 'T-shirts',
  hoodies: 'Hoodies & sweats',
  blouses: 'Blouses',
  shorts: 'Shorts',
  jeans: 'Jeans',
  skirts: 'Skirts',
  sneakers: 'Sneakers',
};

const c = (id, name, kind, color, price, rack) => ({ id, name, kind, color, price, rack });

export const CLOTHES = [
  c('mallTeeSky', 'Sky tee', 'top', '#9fd0f0', 18, 'tees'),
  c('mallTeeLemon', 'Lemon tee', 'top', '#f6e27a', 18, 'tees'),
  c('mallTeeMint', 'Mint tee', 'top', '#a8e0c4', 18, 'tees'),
  c('mallTeeBlack', 'Black tee', 'top', '#2a2a2e', 18, 'tees'),
  c('mallTeeCoral', 'Coral tee', 'top', '#f08a7a', 18, 'tees'),
  c('mallHoodieGrey', 'Grey hoodie', 'top', '#9a9aa2', 34, 'hoodies'),
  c('mallHoodieNavy', 'Navy hoodie', 'top', '#2c3a5c', 34, 'hoodies'),
  c('mallHoodieLilac', 'Lilac hoodie', 'top', '#c4b2e8', 34, 'hoodies'),
  c('mallSweatSage', 'Sage sweatshirt', 'top', '#a3b899', 30, 'hoodies'),
  c('mallBlouseIvory', 'Ivory blouse', 'top', '#f3ecdc', 28, 'blouses'),
  c('mallBlouseRose', 'Rose blouse', 'top', '#f2b8c6', 28, 'blouses'),
  c('mallBlouseSky', 'Powder-blue blouse', 'top', '#c2d8ec', 28, 'blouses'),
  c('mallShortsDenim', 'Denim shorts', 'bottom', '#5a7aa6', 22, 'shorts'),
  c('mallShortsKhaki', 'Khaki shorts', 'bottom', '#b8a47a', 22, 'shorts'),
  c('mallShortsWhite', 'White shorts', 'bottom', '#f2f0ea', 22, 'shorts'),
  c('mallJeansIndigo', 'Indigo jeans', 'bottom', '#2e3f66', 36, 'jeans'),
  c('mallJeansLight', 'Light-wash jeans', 'bottom', '#8fa8c8', 36, 'jeans'),
  c('mallJeansBlack', 'Black jeans', 'bottom', '#1f1f24', 36, 'jeans'),
  c('mallSkirtPlaid', 'Plaid skirt', 'bottom', '#8a3a4a', 26, 'skirts'),
  c('mallSkirtPleat', 'Pleated cream skirt', 'bottom', '#e8dcc4', 26, 'skirts'),
  c('mallSkirtNavy', 'Navy skirt', 'bottom', '#283656', 26, 'skirts'),
  c('mallSneakRed', 'Red sneakers', 'shoes', '#c8323a', 40, 'sneakers'),
  c('mallSneakWhite', 'White sneakers', 'shoes', '#f4f2ec', 40, 'sneakers'),
  c('mallSneakPastel', 'Pastel sneakers', 'shoes', '#f2c4d8', 40, 'sneakers'),
  c('mallSneakBlack', 'Black sneakers', 'shoes', '#222226', 40, 'sneakers'),
];

/** Money for one trip (mall gift card); what isn't spent stays at the mall. */
export const TRIP_BUDGET = 400;

export const GROCERY_BY_ID = Object.fromEntries(GROCERIES.map((p) => [p.id, p]));
export const CLOTHES_BY_ID = Object.fromEntries(CLOTHES.map((p) => [p.id, p]));
