/**
 * What Hikari Mall sells. Plain data (no Babylon / DOM), shared by the
 * supermarket, the clothing store, the shoppers and the receipt.
 *
 * Grocery products: { id, name, brand, aisle, price, look: { shape, color,
 *   label, jp, art, size }, kind?, boost? }
 *   shape  carton | bottle | bigBottle | squareBottle | jug | can | tub |
 *          block | bag | box | jar | loaf | baguette | bun | fruit | banana |
 *          head | tray | roll | pack (src/interiors/Products.js PACKS)
 *   color  package colour (a PET bottle's: its drink's), label: the printed
 *          band's / accent colour
 *   jp     the name printed in Japanese, art: the illustration on the pack
 *          (src/interiors/PackArt.js); the brand's look is in BRANDS
 *   size   scale of the shape's standard pack (big packs: rice 5 kg, ×12 rolls)
 *   kind / boost: as ShopData items (drinks run faster, food jumps higher);
 *   everything else goes to the pantry in her Bag.
 * Clothing: { id, name, kind: top | bottom | shoes, garment, color, price, rack,
 *   style: { brand, fabric, pattern?, accent?, print? } }
 *   garment: the 3D garment she wears (src/player/Garments.js):
 *   tee | hoodie | sweatshirt | blouse | shorts | jeans | skirt | sneakers,
 *   in that colour.
 *   style: how it looks on the rack (src/mall/ClothesModels.js): the label
 *   (FASHION_BRANDS), the cloth (jersey | fleece | denim | woven | twill |
 *   canvas), a woven / printed pattern in the accent colour (stripes |
 *   plaid | dots | pinstripe | heather | wash) and the print on the chest,
 *   the shoes' side or the jeans' patch (src/mall/FashionBrands.js PRINTS).
 */

const g = (id, name, brand, aisle, price, shape, color, label, { size, jp, art, ...extra } = {}) => ({ id, name, brand, aisle, price, look: { shape, color, label, jp, art, ...(size && { size }) }, ...extra });

/**
 * The grocery brands' identities, so every pack of a brand reads as one
 * family on the shelf: jp (the name in Japanese), logo (lettering: script |
 * round | block | serif | seal | farm), mark (the emblem by the name, see
 * PackArt), ink (the logo's colour, null: the pack's label colour) and
 * layout (band | panel | full | frame | stripe | vertical).
 */
export const BRANDS = {
  Kumo: { jp: 'クモ', logo: 'script', mark: 'cloud', ink: '#ffffff', layout: 'full' },
  Hanami: { jp: 'ハナミ', logo: 'round', mark: 'blossom', ink: '#d0436a', layout: 'panel' },
  Ochaya: { jp: '茶屋', logo: 'seal', mark: 'leaf', ink: '#2e5a3a', layout: 'vertical' },
  Aso: { jp: '阿蘇', logo: 'serif', mark: 'mountain', ink: '#2f6fa8', layout: 'frame' },
  'Sunny Grove': { jp: 'サニーグローブ', logo: 'round', mark: 'sun', ink: '#e2662a', layout: 'panel' },
  'Mame Roast': { jp: 'マメロースト', logo: 'block', mark: 'bean', ink: '#d9a066', layout: 'stripe' },
  Genki: { jp: '元気', logo: 'block', mark: 'bolt', ink: '#1d1d1f', layout: 'stripe' },
  'Hokkaido Farm': { jp: '北海道ファーム', logo: 'serif', mark: 'cow', ink: '#1f5aa6', layout: 'frame' },
  Meadowcream: { jp: 'メドウクリーム', logo: 'script', mark: 'flower', ink: '#7a4a2a', layout: 'panel' },
  'Alpine Bell': { jp: 'アルパインベル', logo: 'serif', mark: 'bell', ink: '#2e7d32', layout: 'frame' },
  'Komorebi Bakery': { jp: '木漏れ日ベーカリー', logo: 'serif', mark: 'wheat', ink: '#5a3a1c', layout: 'panel' },
  Aomori: { jp: '青森県産', logo: 'farm', mark: 'origin', ink: '#2e7d32', layout: 'band' },
  Ehime: { jp: '愛媛県産', logo: 'farm', mark: 'origin', ink: '#3d7a3a', layout: 'band' },
  Tochigi: { jp: '栃木県産', logo: 'farm', mark: 'origin', ink: '#2e7d32', layout: 'band' },
  Kumamoto: { jp: '熊本県産', logo: 'farm', mark: 'origin', ink: '#2e7d32', layout: 'band' },
  Gunma: { jp: '群馬県産', logo: 'farm', mark: 'origin', ink: '#5a8f3a', layout: 'band' },
  Saitama: { jp: '埼玉県産', logo: 'farm', mark: 'origin', ink: '#4a8f3a', layout: 'band' },
  Niigata: { jp: '新潟県産', logo: 'seal', mark: 'rice', ink: '#2e7d32', layout: 'vertical' },
  Crunchi: { jp: 'クランチ', logo: 'block', mark: 'burst', ink: '#c0392b', layout: 'full' },
  Sticko: { jp: 'スティッコ', logo: 'script', mark: 'none', ink: '#ffffff', layout: 'full' },
  Yuki: { jp: '雪', logo: 'round', mark: 'snow', ink: '#1f5aa6', layout: 'band' },
  Kurogane: { jp: '黒金', logo: 'seal', mark: 'none', ink: '#1d1d1f', layout: 'vertical' },
  Kamegura: { jp: '亀蔵', logo: 'seal', mark: 'hex', ink: '#c0392b', layout: 'vertical' },
  Shinshu: { jp: '信州', logo: 'seal', mark: 'mountain', ink: '#7a2a1c', layout: 'vertical' },
  Golden: { jp: 'ゴールデン', logo: 'block', mark: 'burst', ink: '#b3202a', layout: 'stripe' },
  Nissho: { jp: '日昇', logo: 'block', mark: 'sun', ink: '#b3202a', layout: 'band' },
  Fresh: { jp: 'フレッシュ', logo: 'round', mark: 'drop', ink: '#1f6fb8', layout: 'panel' },
  Soft: { jp: 'ソフト', logo: 'script', mark: 'cloud', ink: '#5b8fd1', layout: 'panel' },
};

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
  g('kumoCola', 'Kumo Cola', 'Kumo', 'drinks', 3, 'can', '#b3202a', '#f4f1ea', { jp: 'クモコーラ', art: 'cola', kind: 'drink', boost: { run: 30 } }),
  g('kumoColaZero', 'Kumo Cola Zero', 'Kumo', 'drinks', 3, 'can', '#1d1d1f', '#c8202c', { jp: 'クモコーラ ゼロ', art: 'cola', kind: 'drink', boost: { run: 30 } }),
  g('kumoColaBig', 'Kumo Cola 1.5 L', 'Kumo', 'drinks', 6, 'bigBottle', '#5a1a14', '#b3202a', { jp: 'クモコーラ', art: 'cola', kind: 'drink', boost: { run: 60 } }),
  g('sakuraSoda', 'Sakura Soda', 'Hanami', 'drinks', 3, 'can', '#f2a7bd', '#ffffff', { jp: 'さくらソーダ', art: 'blossom', kind: 'drink', boost: { run: 30 } }),
  g('yuzuLemon', 'Yuzu Lemonade', 'Hanami', 'drinks', 4, 'bottle', '#f3d54a', '#3d7a3a', { jp: 'ゆずレモネード', art: 'yuzu', kind: 'drink', boost: { run: 40 } }),
  g('melonCream', 'Melon Cream Soda', 'Hanami', 'drinks', 4, 'bottle', '#7fd17a', '#ffffff', { jp: 'メロンクリームソーダ', art: 'melon', kind: 'drink', boost: { run: 40 } }),
  g('mugiTea', 'Barley Tea 2 L', 'Ochaya', 'drinks', 5, 'squareBottle', '#c08a4a', '#2e5a3a', { jp: '香ばし麦茶', art: 'barley', kind: 'drink', boost: { run: 60 } }),
  g('greenTeaBottle', 'Green Tea', 'Ochaya', 'drinks', 3, 'bottle', '#7fb069', '#ffffff', { jp: '一番摘み緑茶', art: 'tea', kind: 'drink', boost: { run: 40 } }),
  g('mineralWater', 'Mount Aso Water', 'Aso', 'drinks', 2, 'bottle', '#cfe8f3', '#2f6fa8', { jp: '阿蘇の天然水', art: 'mountain', kind: 'drink', boost: { run: 20 } }),
  g('orangeJuice', 'Orange Juice', 'Sunny Grove', 'drinks', 5, 'carton', '#f29a2e', '#ffffff', { jp: 'オレンジ 100%', art: 'orange', kind: 'drink', boost: { run: 45 } }),
  g('appleJuice', 'Apple Juice', 'Sunny Grove', 'drinks', 5, 'carton', '#e3c04a', '#c0392b', { jp: 'りんご 100%', art: 'apple', kind: 'drink', boost: { run: 45 } }),
  g('canCoffeeBlack', 'Black Can Coffee', 'Mame Roast', 'drinks', 3, 'can', '#2a211c', '#d9a066', { jp: 'ブラック無糖', art: 'beans', kind: 'drink', boost: { run: 50 } }),
  g('energyMax', 'Genki MAX', 'Genki', 'drinks', 4, 'can', '#f2d43a', '#1d1d1f', { jp: '元気MAX', art: 'bolt', kind: 'drink', boost: { run: 75 } }),
  // Dairy & eggs
  g('butterSalted', 'Salted Butter', 'Hokkaido Farm', 'dairy', 6, 'block', '#f6e7a8', '#1f5aa6', { jp: '有塩バター', art: 'butter' }),
  g('butterUnsalted', 'Unsalted Butter', 'Hokkaido Farm', 'dairy', 6, 'block', '#f6e7a8', '#3a8f5c', { jp: '食塩不使用バター', art: 'butter' }),
  g('butterSpread', 'Spreadable Butter', 'Meadowcream', 'dairy', 5, 'tub', '#fff4c8', '#e2a53a', { jp: 'ぬりやすいバター', art: 'butter' }),
  g('milk', 'Fresh Milk 1 L', 'Hokkaido Farm', 'dairy', 4, 'carton', '#ffffff', '#1f5aa6', { jp: '北海道牛乳', art: 'milk' }),
  g('milkLow', 'Low-fat Milk 1 L', 'Hokkaido Farm', 'dairy', 4, 'carton', '#ffffff', '#3aa6d9', { jp: '低脂肪乳', art: 'milk' }),
  g('strawberryMilk', 'Strawberry Milk', 'Meadowcream', 'dairy', 3, 'carton', '#f7c6d3', '#d34f5f', { jp: 'いちごミルク', art: 'strawberry', size: 0.62, kind: 'drink', boost: { run: 30 } }),
  g('yogurt', 'Plain Yogurt', 'Meadowcream', 'dairy', 3, 'tub', '#ffffff', '#5b8fd1', { jp: 'プレーンヨーグルト', art: 'yogurt' }),
  g('yogurtPeach', 'Peach Yogurt', 'Meadowcream', 'dairy', 3, 'tub', '#ffd9b3', '#f08a4b', { jp: '白桃ヨーグルト', art: 'peach' }),
  g('cheeseSlices', 'Cheese Slices', 'Alpine Bell', 'dairy', 5, 'pack', '#f2c94c', '#c0392b', { jp: 'スライスチーズ', art: 'cheese' }),
  g('camembert', 'Camembert', 'Alpine Bell', 'dairy', 8, 'tub', '#f4efe2', '#2e7d32', { jp: 'カマンベール', art: 'cheese' }),
  g('eggs', 'Free-range Eggs ×10', 'Sunny Grove', 'dairy', 5, 'tray', '#e9dcc4', '#c0802f', { jp: '平飼いたまご', art: 'egg' }),
  // Bakery
  g('shokupan', 'Shokupan Loaf', 'Komorebi Bakery', 'bakery', 4, 'loaf', '#f4e2b8', '#c08a4a', { jp: '湯種食パン', art: 'bread', kind: 'food', boost: { jump: 30 } }),
  g('melonpanBag', 'Melon Pan', 'Komorebi Bakery', 'bakery', 2, 'bun', '#e9c46a', '#3d7a3a', { jp: 'メロンパン', art: 'melonpan', kind: 'food', boost: { jump: 45 } }),
  g('curryPan', 'Curry Pan', 'Komorebi Bakery', 'bakery', 3, 'bun', '#c98a4b', '#b3202a', { jp: 'カレーパン', art: 'currypan', kind: 'food', boost: { jump: 45 } }),
  g('croissants', 'Croissants ×4', 'Komorebi Bakery', 'bakery', 5, 'pack', '#d9a066', '#5a3a1c', { jp: 'クロワッサン', art: 'croissant', kind: 'food', boost: { jump: 40 } }),
  g('baguette', 'Baguette', 'Komorebi Bakery', 'bakery', 3, 'baguette', '#d9a066', '#5a3a1c', { jp: 'バゲット', art: 'baguette' }),
  // Fruit & vegetables
  g('apples', 'Fuji Apples', 'Aomori', 'produce', 4, 'fruit', '#c8323a', '#2e7d32', { jp: 'ふじりんご', art: 'apple', kind: 'food', boost: { jump: 30 } }),
  g('bananas', 'Bananas', 'Sunny Grove', 'produce', 3, 'banana', '#f2d43a', '#4a7a2a', { jp: 'バナナ', art: 'banana', kind: 'food', boost: { jump: 30 } }),
  g('mandarins', 'Mandarins', 'Ehime', 'produce', 4, 'fruit', '#f29a2e', '#3d7a3a', { jp: 'みかん', art: 'orange', kind: 'food', boost: { jump: 30 } }),
  g('strawberryPunnet', 'Strawberries', 'Tochigi', 'produce', 7, 'tray', '#e0525e', '#2e7d32', { jp: 'とちおとめ', art: 'strawberry', kind: 'food', boost: { jump: 60 } }),
  g('tomatoes', 'Tomatoes', 'Kumamoto', 'produce', 4, 'fruit', '#e24a3b', '#2e7d32', { jp: '完熟トマト', art: 'tomato' }),
  g('cabbage', 'Cabbage', 'Gunma', 'produce', 3, 'head', '#a8d08d', '#5a8f3a', { jp: 'キャベツ', art: 'cabbage' }),
  g('carrots', 'Carrots', 'Hokkaido Farm', 'produce', 2, 'bag', '#f08a2e', '#3d7a3a', { jp: 'にんじん', art: 'carrot' }),
  g('negi', 'Green Onions', 'Saitama', 'produce', 2, 'roll', '#e8f0d8', '#4a8f3a', { jp: '長ねぎ', art: 'negi' }),
  // Snacks & sweets
  g('chipsSalt', 'Potato Chips Salt', 'Crunchi', 'snacks', 3, 'bag', '#f2d43a', '#c0392b', { jp: 'ポテトチップス うすしお', art: 'chips', kind: 'food', boost: { jump: 25 } }),
  g('chipsNori', 'Potato Chips Nori', 'Crunchi', 'snacks', 3, 'bag', '#3d7a3a', '#f2d43a', { jp: 'ポテトチップス のりしお', art: 'chips', kind: 'food', boost: { jump: 25 } }),
  g('pockyChoco', 'Choco Sticks', 'Sticko', 'snacks', 2, 'box', '#c0392b', '#f4f1ea', { jp: 'チョコスティック', art: 'sticks', kind: 'food', boost: { jump: 25 } }),
  g('pockyBerry', 'Strawberry Sticks', 'Sticko', 'snacks', 2, 'box', '#f7a8c0', '#c0392b', { jp: 'いちごスティック', art: 'sticks', kind: 'food', boost: { jump: 25 } }),
  g('mochiIce', 'Mochi Ice ×6', 'Yuki', 'frozen', 5, 'box', '#fbe3ec', '#8a5a9c', { jp: 'もちアイス', art: 'mochi', kind: 'food', boost: { jump: 50 } }),
  g('senbei', 'Rice Crackers', 'Kurogane', 'snacks', 3, 'bag', '#c08a4a', '#1d1d1f', { jp: 'しょうゆせんべい', art: 'senbei', kind: 'food', boost: { jump: 25 } }),
  g('gummies', 'Fruit Gummies', 'Kumo', 'snacks', 2, 'bag', '#9c6ad1', '#f2d43a', { jp: 'フルーツグミ', art: 'gummies', kind: 'food', boost: { jump: 25 } }),
  // Pantry
  g('rice5kg', 'Koshihikari Rice 5 kg', 'Niigata', 'pantry', 18, 'bag', '#f4f1ea', '#2e7d32', { jp: '新潟県産コシヒカリ', art: 'rice', size: 2 }),
  g('soySauce', 'Soy Sauce', 'Kamegura', 'pantry', 4, 'bottle', '#3a1a12', '#c0392b', { jp: 'こいくちしょうゆ', art: 'soy' }),
  g('miso', 'Miso Paste', 'Shinshu', 'pantry', 5, 'tub', '#b07a3a', '#ffffff', { jp: '信州合わせみそ', art: 'miso' }),
  g('curryRoux', 'Curry Roux', 'Golden', 'pantry', 4, 'box', '#e8a32a', '#b3202a', { jp: 'カレールウ 中辛', art: 'curry' }),
  g('instantRamen', 'Instant Ramen ×5', 'Nissho', 'pantry', 5, 'pack', '#e24a3b', '#f4f1ea', { jp: 'しょうゆラーメン', art: 'ramen', kind: 'food', boost: { jump: 40 } }),
  g('strawberryJam', 'Strawberry Jam', 'Meadowcream', 'pantry', 4, 'jar', '#b8202f', '#f4f1ea', { jp: 'いちごジャム', art: 'jam' }),
  g('honey', 'Honey', 'Meadowcream', 'pantry', 6, 'jar', '#e8a32a', '#3d2a1c', { jp: '純粋はちみつ', art: 'honey' }),
  // Frozen
  g('gyoza', 'Frozen Gyoza', 'Yuki', 'frozen', 5, 'box', '#e8f0f8', '#c0392b', { jp: '焼くだけ餃子', art: 'gyoza' }),
  g('frozenPizza', 'Margherita Pizza', 'Yuki', 'frozen', 6, 'box', '#c0392b', '#f4f1ea', { jp: 'マルゲリータ', art: 'pizza', size: 1.6 }),
  g('edamame', 'Frozen Edamame', 'Yuki', 'frozen', 3, 'bag', '#7fb069', '#ffffff', { jp: '塩ゆで枝豆', art: 'edamame' }),
  // Household
  g('detergent', 'Laundry Detergent', 'Fresh', 'household', 7, 'jug', '#3aa6d9', '#ffffff', { jp: '衣料用洗剤', art: 'bubbles' }),
  g('tissues', 'Tissues ×5', 'Soft', 'household', 4, 'pack', '#f4f1ea', '#5b8fd1', { jp: 'ボックスティッシュ', art: 'tissue' }),
  g('dishSoap', 'Dish Soap', 'Fresh', 'household', 3, 'bottle', '#7fd17a', '#ffffff', { jp: '食器用洗剤', art: 'lime' }),
  g('toiletPaper', 'Toilet Paper ×12', 'Soft', 'household', 6, 'pack', '#ffffff', '#f2a7bd', { jp: 'トイレットペーパー', art: 'roll', size: 2 }),
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

const GARMENT = { tees: 'tee', hoodies: 'hoodie', blouses: 'blouse', shorts: 'shorts', jeans: 'jeans', skirts: 'skirt', sneakers: 'sneakers' };
const c = (id, name, kind, color, price, rack, style, garment = GARMENT[rack]) => ({ id, name, kind, garment, color, price, rack, style });

/** The clothing labels Sakura Style carries: name, Japanese name, house colours (logos in FashionBrands). */
export const FASHION_BRANDS = {
  'Sakura Style': { jp: 'サクラスタイル', ink: '#b8486a', paper: '#fbeef2' },
  'Nami Surf Co.': { jp: '波サーフ', ink: '#1f5f8b', paper: '#eef6fa' },
  'Hoshi Athletic': { jp: 'ホシ', ink: '#c8202c', paper: '#f4f4f6' },
  'Mori & Co.': { jp: '森', ink: '#3d5a3a', paper: '#f2efe4' },
  'Kumo Records': { jp: 'クモ', ink: '#1d1d1f', paper: '#f0f0f0' },
  'Tsubame Denim': { jp: '燕デニム', ink: '#8a5a2a', paper: '#efe2cc' },
  Kaze: { jp: '風', ink: '#1d1d1f', paper: '#f6f6f2' },
};

export const CLOTHES = [
  c('mallTeeSky', 'Sky tee', 'top', '#9fd0f0', 18, 'tees', { brand: 'Nami Surf Co.', fabric: 'jersey', print: 'surf' }),
  c('mallTeeLemon', 'Lemon tee', 'top', '#f6e27a', 18, 'tees', { brand: 'Hoshi Athletic', fabric: 'jersey', print: 'chestStar' }),
  c('mallTeeMint', 'Mint tee', 'top', '#a8e0c4', 18, 'tees', { brand: 'Mori & Co.', fabric: 'jersey', print: 'botanical' }),
  c('mallTeeBlack', 'Black tee', 'top', '#2a2a2e', 18, 'tees', { brand: 'Kumo Records', fabric: 'jersey', print: 'records' }),
  c('mallTeeCoral', 'Coral tee', 'top', '#f08a7a', 18, 'tees', { brand: 'Sakura Style', fabric: 'jersey', pattern: 'stripes', accent: '#fbf6ee', print: 'chestSakura' }),
  c('mallHoodieGrey', 'Grey hoodie', 'top', '#9a9aa2', 34, 'hoodies', { brand: 'Hoshi Athletic', fabric: 'fleece', pattern: 'heather', print: 'college' }),
  c('mallHoodieNavy', 'Navy hoodie', 'top', '#2c3a5c', 34, 'hoodies', { brand: 'Hoshi Athletic', fabric: 'fleece', print: 'bigStar' }),
  c('mallHoodieLilac', 'Lilac hoodie', 'top', '#c4b2e8', 34, 'hoodies', { brand: 'Sakura Style', fabric: 'fleece', print: 'chestSakura' }),
  c('mallSweatSage', 'Sage sweatshirt', 'top', '#a3b899', 30, 'hoodies', { brand: 'Mori & Co.', fabric: 'fleece', print: 'sunday' }, 'sweatshirt'),
  c('mallBlouseIvory', 'Ivory blouse', 'top', '#f3ecdc', 28, 'blouses', { brand: 'Mori & Co.', fabric: 'woven' }),
  c('mallBlouseRose', 'Rose blouse', 'top', '#f2b8c6', 28, 'blouses', { brand: 'Sakura Style', fabric: 'woven', pattern: 'dots', accent: '#fbf3f4' }),
  c('mallBlouseSky', 'Powder-blue blouse', 'top', '#c2d8ec', 28, 'blouses', { brand: 'Mori & Co.', fabric: 'woven', pattern: 'pinstripe', accent: '#f8fbfd' }),
  c('mallShortsDenim', 'Denim shorts', 'bottom', '#5a7aa6', 22, 'shorts', { brand: 'Tsubame Denim', fabric: 'denim', pattern: 'wash', print: 'patch' }),
  c('mallShortsKhaki', 'Khaki shorts', 'bottom', '#b8a47a', 22, 'shorts', { brand: 'Mori & Co.', fabric: 'twill' }),
  c('mallShortsWhite', 'White shorts', 'bottom', '#f2f0ea', 22, 'shorts', { brand: 'Sakura Style', fabric: 'twill' }),
  c('mallJeansIndigo', 'Indigo jeans', 'bottom', '#2e3f66', 36, 'jeans', { brand: 'Tsubame Denim', fabric: 'denim', print: 'patch' }),
  c('mallJeansLight', 'Light-wash jeans', 'bottom', '#8fa8c8', 36, 'jeans', { brand: 'Tsubame Denim', fabric: 'denim', pattern: 'wash', print: 'patch' }),
  c('mallJeansBlack', 'Black jeans', 'bottom', '#1f1f24', 36, 'jeans', { brand: 'Tsubame Denim', fabric: 'denim', print: 'patch' }),
  c('mallSkirtPlaid', 'Plaid skirt', 'bottom', '#8a3a4a', 26, 'skirts', { brand: 'Sakura Style', fabric: 'woven', pattern: 'plaid', accent: '#2a3a5c' }),
  c('mallSkirtPleat', 'Pleated cream skirt', 'bottom', '#e8dcc4', 26, 'skirts', { brand: 'Mori & Co.', fabric: 'woven' }),
  c('mallSkirtNavy', 'Navy skirt', 'bottom', '#283656', 26, 'skirts', { brand: 'Sakura Style', fabric: 'woven' }),
  c('mallSneakRed', 'Red sneakers', 'shoes', '#c8323a', 40, 'sneakers', { brand: 'Kaze', fabric: 'canvas', accent: '#fbfaf6', print: 'kaze' }),
  c('mallSneakWhite', 'White sneakers', 'shoes', '#f4f2ec', 40, 'sneakers', { brand: 'Kaze', fabric: 'canvas', accent: '#1f5f8b', print: 'kaze' }),
  c('mallSneakPastel', 'Pastel sneakers', 'shoes', '#f2c4d8', 40, 'sneakers', { brand: 'Kaze', fabric: 'canvas', accent: '#ffffff', print: 'kaze' }),
  c('mallSneakBlack', 'Black sneakers', 'shoes', '#222226', 40, 'sneakers', { brand: 'Kaze', fabric: 'canvas', accent: '#e8e4da', print: 'kaze' }),
];

/** Money for one trip (mall gift card); what isn't spent stays at the mall. */
export const TRIP_BUDGET = 400;

export const GROCERY_BY_ID = Object.fromEntries(GROCERIES.map((p) => [p.id, p]));
export const CLOTHES_BY_ID = Object.fromEntries(CLOTHES.map((p) => [p.id, p]));
