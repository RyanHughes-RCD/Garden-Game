// Central tuning values. Everything gameplay-related that is a number lives here
// (or in the crop / decoration / visitor data tables) so balance can be changed
// without touching game logic.

export const HOUR = 3600 * 1000;
export const MINUTE = 60 * 1000;

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'ultra'];

export const RARITY_INFO = {
  common:    { name: 'Common',     color: '#7cc35a', dark: '#3f7a35', stars: 1, qty: [3, 5] },
  uncommon:  { name: 'Uncommon',   color: '#3fb0d9', dark: '#22678a', stars: 2, qty: [2, 4] },
  rare:      { name: 'Rare',       color: '#9a76e0', dark: '#5a3f99', stars: 3, qty: [2, 3] },
  epic:      { name: 'Epic',       color: '#ee5d9c', dark: '#9c2a62', stars: 4, qty: [1, 3] },
  legendary: { name: 'Legendary',  color: '#f5b83d', dark: '#a8691b', stars: 5, qty: [1, 2] },
  ultra:     { name: 'Ultra Rare', color: '#ff6f8a', dark: '#7a2bbf', stars: 6, qty: [1, 1] },
};

// Seed tiers. `odds` are rarity probabilities in percent (each row sums to 100).
// The rarity is rolled first, then a crop of that rarity is picked (see game.js).
// An ultra-rare is never guaranteed: even the best seed is 1%.
export const SEED_TIERS = [
  { id: 'sprout',    name: 'Sprout Seed',    price: 10,  tier: 1,
    odds: { common: 72.445, uncommon: 23, rare: 4, epic: 0.5, legendary: 0.05, ultra: 0.005 },
    blurb: 'A humble paper packet. Mostly garden classics.' },
  { id: 'garden',    name: 'Garden Seed',    price: 32,  tier: 2,
    odds: { common: 42, uncommon: 38, rare: 16, epic: 3.47, legendary: 0.5, ultra: 0.03 },
    blurb: 'Hand-sorted seeds with a hint of something special.' },
  { id: 'heirloom',  name: 'Heirloom Seed',  price: 95,  tier: 3,
    odds: { common: 14, uncommon: 35, rare: 36, epic: 13.08, legendary: 1.8, ultra: 0.12 },
    blurb: 'Passed down for generations. Unusual flora sprout often.' },
  { id: 'starlight', name: 'Starlight Seed', price: 210, tier: 4,
    odds: { common: 0, uncommon: 18, rare: 45, epic: 30.6, legendary: 6, ultra: 0.4 },
    blurb: 'Faintly glowing. Rare and magical plants favoured.' },
  { id: 'moonlit',   name: 'Moonlit Seed',   price: 380, tier: 5,
    odds: { common: 0, uncommon: 0, rare: 34, epic: 50, legendary: 15, ultra: 1 },
    blurb: 'Gathered under a full moon. The best odds money can buy.' },
];

// Discovery bonus: within the rolled rarity, each eligible crop the player has
// never harvested gets this weight multiplier. Duplicates stay possible; the
// rarity roll itself is never changed by discovery state (no pity system).
export const DISCOVERY_WEIGHT = 3;

// Watering: checkpoints are fractions of the crop's planned grow time.
// Window i is open from CHECKPOINTS[i] until the next checkpoint (or harvest).
// Each watering multiplies yield value and shortens the remaining grow time.
export const WATERING = {
  checkpoints: [0, 0.3, 0.6],
  yieldMult: 1.15,  // multiplicative per watering: 1.15, 1.32, 1.52
  timeMult: 0.95,   // total grow time multiplier per watering
};

// Plot layout: the garden is a 5x7 tile grid; plots occupy the centre 3x4 block.
export const GARDEN_COLS = 5;
export const GARDEN_ROWS = 7;
export const PLOT_TILES = [
  [1, 1], [2, 1], [3, 1],
  [1, 2], [2, 2], [3, 2],
  [1, 3], [2, 3], [3, 3],
  [1, 4], [2, 4], [3, 4],
];
export const START_PLOTS = 4;
// Cost to unlock plot index START_PLOTS, START_PLOTS+1, ...
export const PLOT_PRICES = [60, 200, 500, 1200, 2500, 5000, 9000, 15000];

export const START_COINS = 40;
export const START_SEEDS = { sprout: 3 };

// Decoration score: each placed copy of the same decoration counts for less.
// copy n (1-based) contributes base * DUPLICATE_FALLOFF^(n-1).
export const DUPLICATE_FALLOFF = 0.6;

// Thresholds are evaluated against the best decoration score ever reached, so a
// bonus is awarded once per threshold, permanently. Moving decorations around
// cannot reroll or farm bonuses; decorations cannot be sold for coins.
export const SCORE_THRESHOLDS = [10, 25, 45, 70, 100, 140, 190, 250, 320, 400, 500, 620, 760, 900];

// Bonus pool. Each threshold awards one random bonus type that is not yet at
// its max stacks. Stacks add linearly and are capped at maxStacks.
export const BONUS_TYPES = {
  cheaperSeeds: { name: 'Thrifty Gardener', per: 0.04, maxStacks: 5, unit: '% cheaper seeds',
    describe: (v) => `Seeds cost ${Math.round(v * 100)}% less` },
  fasterGrowth: { name: 'Green Thumb', per: 0.05, maxStacks: 5, unit: '% faster growth',
    describe: (v) => `Crops grow ${Math.round(v * 100)}% faster` },
  rareOdds:     { name: 'Lucky Soil', per: 0.08, maxStacks: 5, unit: '% rare luck',
    describe: (v) => `Rare+ crops ${Math.round(v * 100)}% more likely` },
  harvestValue: { name: 'Market Darling', per: 0.05, maxStacks: 5, unit: '% harvest coins',
    describe: (v) => `Harvests earn ${Math.round(v * 100)}% more coins` },
  visitors:     { name: 'Welcoming Garden', per: 0.2, maxStacks: 4, unit: '% visitor frequency',
    describe: (v) => `Visitors arrive ${Math.round(v * 100)}% more often` },
};
// If every bonus type is maxed, a threshold awards coins instead.
export const BONUS_FALLBACK_COINS = 500;

// Visitors: one visitor at a time. While none is present, the next arrival is
// scheduled at a random interval (divided by the visitor frequency multiplier).
// Offline time can bring at most one waiting visitor.
export const VISITORS = {
  minInterval: 25 * MINUTE,
  maxInterval: 70 * MINUTE,
  firstVisitDelay: 3 * MINUTE,
  decorFreqPerPoint: 1 / 600, // +1% frequency per 6 decoration points, capped below
  decorFreqCap: 0.5,
};
