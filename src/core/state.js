// Save state: creation, schema migration, validation and localStorage I/O.
import { randomSeed } from './rng.js';
import {
  START_COINS, START_SEEDS, START_PLOTS, PLOT_TILES, GARDEN_COLS, GARDEN_ROWS, SEED_TIERS,
} from '../data/config.js';
import { CROP_BY_ID } from '../data/crops.js';
import { DECOR_BY_ID } from '../data/decorations.js';

export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = 'littleGarden.save';
export const BACKUP_KEY = 'littleGarden.save.backup';

// Decoration tiles are every garden tile that is not a plot.
export const DECOR_TILES = (() => {
  const plotSet = new Set(PLOT_TILES.map(([x, y]) => `${x},${y}`));
  const tiles = [];
  for (let y = 0; y < GARDEN_ROWS; y++) {
    for (let x = 0; x < GARDEN_COLS; x++) {
      if (!plotSet.has(`${x},${y}`)) tiles.push([x, y]);
    }
  }
  return tiles;
})();

export function emptyStats() {
  return {
    plantings: 0, harvests: 0, waterings: 0, visitors: 0,
    coinsEarned: 0, coinsFromHarvests: 0, coinsSpent: 0, seedsBought: 0, itemsHarvested: 0,
    bestSingle: null,   // { cropId, value, qty, at }
    largestHaul: null,  // { cropId, value, qty, at }
    topHarvests: [],    // top 5 by value: { cropId, value, qty, at }
  };
}

export function newState(now = Date.now(), seed = randomSeed()) {
  return {
    version: SCHEMA_VERSION,
    seed,
    createdAt: now,
    lastSeenAt: now,
    rev: 0,
    coins: START_COINS,
    seeds: Object.fromEntries(SEED_TIERS.map((t) => [t.id, START_SEEDS[t.id] || 0])),
    plots: PLOT_TILES.map((_, i) => ({ unlocked: i < START_PLOTS, crop: null })),
    decorTiles: DECOR_TILES.map(() => null),
    decorOwned: {},
    discovered: {},        // cropId -> { firstAt, count, best, total }
    bonuses: [],           // [{ type, threshold, at }] or { type: 'coins', amount }
    bestScore: 0,
    thresholdsAwarded: 0,
    trophies: {},          // cropId -> true once its trophy decoration was awarded
    visitor: { nextAt: now + 3 * 60 * 1000, current: null },
    visitorLog: {},        // visitor type -> count
    counters: { plant: 0, visitor: 0 },
    stats: emptyStats(),
    settings: { sound: true, gardenName: 'My Little Garden' },
    tutorial: { planted: false, watered: false, harvested: false },
  };
}

// Migrations from older schema versions. Each entry upgrades version n -> n+1.
// (Version 1 is the first released schema; future versions append here.)
const MIGRATIONS = {
  // 0: legacy/unversioned saves -> 1
  0: (s) => ({ ...newState(s.createdAt || Date.now(), s.seed || randomSeed()), ...s, version: 1 }),
};

export function migrate(raw) {
  let s = raw;
  let v = Number.isInteger(s.version) ? s.version : 0;
  while (v < SCHEMA_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`No migration from version ${v}`);
    s = step(s);
    v = s.version;
  }
  return s;
}

const num = (v, def = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : def);
const nonNeg = (v, def = 0) => Math.max(0, num(v, def));

// Repair anything malformed so the game never crashes on a damaged save.
export function sanitize(s, now = Date.now()) {
  const base = newState(now, s.seed);
  const out = { ...base, ...s };
  out.seed = (num(s.seed, base.seed) >>> 0);
  out.coins = Math.floor(nonNeg(s.coins, START_COINS));
  out.rev = nonNeg(s.rev);
  out.lastSeenAt = num(s.lastSeenAt, now);
  out.createdAt = num(s.createdAt, now);
  out.seeds = { ...base.seeds };
  for (const t of SEED_TIERS) out.seeds[t.id] = Math.floor(nonNeg(s.seeds && s.seeds[t.id]));

  out.plots = base.plots.map((p, i) => {
    const sp = Array.isArray(s.plots) ? s.plots[i] : null;
    if (!sp) return p;
    const plot = { unlocked: !!sp.unlocked, crop: null };
    const c = sp.crop;
    if (plot.unlocked && c && CROP_BY_ID[c.cropId] && Number.isFinite(c.plantedAt) && c.duration > 0) {
      plot.crop = {
        cropId: c.cropId,
        tier: c.tier,
        plantedAt: c.plantedAt,
        duration: c.duration,
        waters: Array.isArray(c.waters) ? c.waters.map((w) => (Number.isFinite(w) ? w : null)) : [],
        boostMs: nonNeg(c.boostMs),
        qty: Math.max(1, Math.floor(nonNeg(c.qty, 1))),
        variance: num(c.variance, 1),
        rollSeed: num(c.rollSeed, 0) >>> 0,
      };
    }
    return plot;
  });

  out.decorOwned = {};
  if (s.decorOwned && typeof s.decorOwned === 'object') {
    for (const [id, n] of Object.entries(s.decorOwned)) {
      if (DECOR_BY_ID[id] && nonNeg(n) > 0) out.decorOwned[id] = Math.floor(n);
    }
  }
  // Placed decorations must be owned; drop any excess.
  const placedCount = {};
  out.decorTiles = base.decorTiles.map((_, i) => {
    const id = Array.isArray(s.decorTiles) ? s.decorTiles[i] : null;
    if (!id || !DECOR_BY_ID[id]) return null;
    placedCount[id] = (placedCount[id] || 0) + 1;
    if (placedCount[id] > (out.decorOwned[id] || 0)) return null;
    return id;
  });

  out.discovered = {};
  if (s.discovered && typeof s.discovered === 'object') {
    for (const [id, d] of Object.entries(s.discovered)) {
      if (CROP_BY_ID[id] && d) {
        out.discovered[id] = {
          firstAt: num(d.firstAt, now), count: Math.max(1, nonNeg(d.count, 1)),
          best: nonNeg(d.best), total: nonNeg(d.total),
        };
      }
    }
  }
  out.bonuses = Array.isArray(s.bonuses) ? s.bonuses.filter((b) => b && typeof b.type === 'string') : [];
  out.bestScore = nonNeg(s.bestScore);
  out.thresholdsAwarded = Math.floor(nonNeg(s.thresholdsAwarded));
  out.trophies = s.trophies && typeof s.trophies === 'object' ? { ...s.trophies } : {};
  const vis = s.visitor && typeof s.visitor === 'object' ? s.visitor : {};
  out.visitor = {
    nextAt: num(vis.nextAt, now + 3 * 60 * 1000),
    current: vis.current && typeof vis.current.type === 'string' ? vis.current : null,
  };
  out.visitorLog = s.visitorLog && typeof s.visitorLog === 'object' ? { ...s.visitorLog } : {};
  out.counters = { ...base.counters, ...(s.counters || {}) };
  out.stats = { ...emptyStats(), ...(s.stats || {}) };
  if (!Array.isArray(out.stats.topHarvests)) out.stats.topHarvests = [];
  out.settings = { ...base.settings, ...(s.settings || {}) };
  out.tutorial = { ...base.tutorial, ...(s.tutorial || {}) };
  out.version = SCHEMA_VERSION;
  return out;
}

function getStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export function parseSave(json, now = Date.now()) {
  const raw = JSON.parse(json);
  if (!raw || typeof raw !== 'object') throw new Error('Invalid save');
  return sanitize(migrate(raw), now);
}

// Load the save; falls back to the backup copy, then to a fresh game.
export function loadState(now = Date.now(), storage = getStorage()) {
  if (storage) {
    for (const key of [STORAGE_KEY, BACKUP_KEY]) {
      try {
        const json = storage.getItem(key);
        if (json) return { state: parseSave(json, now), source: key };
      } catch (err) {
        console.warn('Could not load save from', key, err);
      }
    }
  }
  return { state: newState(now), source: 'new' };
}

export function storedRev(storage = getStorage()) {
  try {
    const json = storage && storage.getItem(STORAGE_KEY);
    return json ? (JSON.parse(json).rev || 0) : -1;
  } catch {
    return -1;
  }
}

// Persist. Returns false if another tab has written a newer revision (the
// caller should then reload instead of overwriting newer progress).
export function saveState(state, storage = getStorage()) {
  if (!storage) return true;
  const current = storedRev(storage);
  if (current > state.rev) return false;
  state.rev += 1;
  const json = JSON.stringify(state);
  try {
    storage.setItem(STORAGE_KEY, json);
    if (state.rev % 5 === 1) storage.setItem(BACKUP_KEY, json);
  } catch (err) {
    console.warn('Save failed', err);
    state.rev -= 1;
  }
  return true;
}
