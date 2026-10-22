// Pure game rules. Every function takes the state plus an explicit `now`
// timestamp so the logic is deterministic and testable. Functions mutate the
// state object passed in and return a result object ({ ok, error, ... }).
import { hash32, makeRng, weightedPick } from './rng.js';
import {
  HOUR, MINUTE, RARITIES, RARITY_INFO, SEED_TIERS, DISCOVERY_WEIGHT, WATERING, PLOT_PRICES,
  DUPLICATE_FALLOFF, SCORE_THRESHOLDS, GROWTH_STAGES, GUESS_BONUS, BONUS_TYPES, BONUS_FALLBACK_COINS, VISITORS,
} from '../data/config.js';
import { CROPS, CROP_BY_ID, ULTRA_TROPHY } from '../data/crops.js';
import { DECOR_BY_ID } from '../data/decorations.js';
import { VISITOR_TYPES, VISITOR_BY_ID } from '../data/visitors.js';

export const TIER_BY_ID = Object.fromEntries(SEED_TIERS.map((t) => [t.id, t]));

const fail = (error) => ({ ok: false, error });

function spend(state, amount) {
  if (!(amount >= 0) || state.coins < amount) return false;
  state.coins -= amount;
  state.stats.coinsSpent += amount;
  return true;
}

function earn(state, amount) {
  const n = Math.max(0, Math.round(amount));
  state.coins += n;
  state.stats.coinsEarned += n;
  return n;
}

// ---------------------------------------------------------------- bonuses

export function bonusStacks(state) {
  const stacks = Object.fromEntries(Object.keys(BONUS_TYPES).map((k) => [k, 0]));
  for (const b of state.bonuses) if (b.type in stacks) stacks[b.type] += 1;
  for (const k of Object.keys(stacks)) stacks[k] = Math.min(stacks[k], BONUS_TYPES[k].maxStacks);
  return stacks;
}

export function bonusValues(state) {
  const stacks = bonusStacks(state);
  return Object.fromEntries(Object.entries(stacks).map(([k, n]) => [k, n * BONUS_TYPES[k].per]));
}

// ---------------------------------------------------------------- seeds

export function seedPrice(state, tierId) {
  const tier = TIER_BY_ID[tierId];
  const discount = bonusValues(state).cheaperSeeds;
  return Math.max(1, Math.round(tier.price * (1 - discount)));
}

export function buySeeds(state, tierId, count = 1) {
  const tier = TIER_BY_ID[tierId];
  if (!tier) return fail('Unknown seed');
  count = Math.floor(count);
  if (count < 1) return fail('Invalid amount');
  const cost = seedPrice(state, tierId) * count;
  if (!spend(state, cost)) return fail('Not enough coins');
  state.seeds[tierId] = (state.seeds[tierId] || 0) + count;
  state.stats.seedsBought += count;
  return { ok: true, cost };
}

// Rarity odds for a tier, after the "Lucky Soil" bonus. The bonus multiplies
// the weight of every rarity above the tier's base rarities, then renormalises.
export function rarityOdds(state, tierId) {
  const tier = TIER_BY_ID[tierId];
  const luck = bonusValues(state).rareOdds;
  const lowest = RARITIES.findIndex((r) => tier.odds[r] > 0);
  const boostFrom = Math.max(2, lowest + 1);
  const w = RARITIES.map((r, i) => tier.odds[r] * (i >= boostFrom ? 1 + luck : 1));
  const total = w.reduce((a, b) => a + b, 0);
  return Object.fromEntries(RARITIES.map((r, i) => [r, (w[i] / total) * 100]));
}

export function eligibleCrops(rarity, tierNum) {
  return CROPS.filter((c) => c.rarity === rarity && c.minTier <= tierNum);
}

// Choose a crop for a seed. The rarity roll uses the tier odds only; the
// discovery bonus only re-weights crops *within* the rolled rarity.
export function rollCrop(state, tierId, rng) {
  const tier = TIER_BY_ID[tierId];
  const odds = rarityOdds(state, tierId);
  let rarityIdx = RARITIES.indexOf(weightedPick(RARITIES.map((r) => ({ item: r, weight: odds[r] })), rng.next()));
  let pool = eligibleCrops(RARITIES[rarityIdx], tier.tier);
  while (!pool.length && rarityIdx > 0) {
    rarityIdx -= 1;
    pool = eligibleCrops(RARITIES[rarityIdx], tier.tier);
  }
  const entries = pool.map((c) => ({ item: c, weight: state.discovered[c.id] ? 1 : DISCOVERY_WEIGHT }));
  return weightedPick(entries, rng.next());
}

// Base (no-bonus, no-discovery) probability of each crop for each tier, in %.
export function cropTierOdds(crop) {
  return SEED_TIERS.map((t) => {
    if (crop.minTier > t.tier) return { tier: t.id, pct: 0 };
    const pool = eligibleCrops(crop.rarity, t.tier);
    return { tier: t.id, pct: (t.odds[crop.rarity] || 0) / pool.length };
  });
}

// ---------------------------------------------------------------- plots

export function nextPlotIndex(state) {
  return state.plots.findIndex((p) => !p.unlocked);
}

export function nextPlotPrice(state) {
  const unlocked = state.plots.filter((p) => p.unlocked).length;
  const idx = unlocked - (state.plots.length - PLOT_PRICES.length);
  return idx >= 0 && idx < PLOT_PRICES.length ? PLOT_PRICES[idx] : null;
}

export function unlockPlot(state) {
  const idx = nextPlotIndex(state);
  if (idx < 0) return fail('All plots unlocked');
  const price = nextPlotPrice(state);
  if (!spend(state, price)) return fail('Not enough coins');
  state.plots[idx].unlocked = true;
  return { ok: true, index: idx, price };
}

export function plant(state, plotIdx, tierId, now) {
  const plot = state.plots[plotIdx];
  if (!plot || !plot.unlocked) return fail('Plot is locked');
  if (plot.crop) return fail('Plot is not empty');
  if (!TIER_BY_ID[tierId]) return fail('Unknown seed');
  if ((state.seeds[tierId] || 0) < 1) return fail('No seeds of that kind');

  const rollSeed = hash32(state.seed, 'plant', state.counters.plant);
  state.counters.plant += 1;
  const rng = makeRng(rollSeed);
  const crop = rollCrop(state, tierId, rng);
  const [qMin, qMax] = RARITY_INFO[crop.rarity].qty;
  const growth = bonusValues(state).fasterGrowth;

  state.seeds[tierId] -= 1;
  plot.crop = {
    cropId: crop.id,
    tier: tierId,
    plantedAt: now,
    duration: Math.round(crop.hours * HOUR * (1 - growth)),
    waters: WATERING.checkpoints.map(() => null),
    boostMs: 0,
    qty: rng.int(qMin, qMax),
    variance: Math.round(rng.range(0.9, 1.15) * 1000) / 1000,
    rollSeed,
  };
  state.stats.plantings += 1;
  state.tutorial.planted = true;
  return { ok: true, crop, plot: plot.crop };
}

export function waterCount(c) {
  return c.waters.filter((w) => w != null).length;
}

// Timing of a planted crop: harvest time and the watering windows.
export function cropTiming(c) {
  const w = waterCount(c);
  const growMs = Math.max(c.duration * 0.25, c.duration * WATERING.timeMult ** w - c.boostMs);
  const harvestAt = c.plantedAt + growMs;
  const cps = WATERING.checkpoints;
  const windows = [];
  for (let i = 0; i < cps.length; i++) {
    const openAt = c.plantedAt + c.duration * cps[i];
    const nextOpen = i + 1 < cps.length ? c.plantedAt + c.duration * cps[i + 1] : Infinity;
    const closeAt = Math.min(nextOpen, harvestAt);
    windows.push({ index: i, openAt, closeAt, watered: c.waters[i] != null, valid: openAt < harvestAt });
  }
  return { harvestAt, growMs, windows };
}

export function cropStatus(c, now) {
  const t = cropTiming(c);
  const elapsed = Math.max(0, now - c.plantedAt);
  const progress = Math.min(1, elapsed / t.growMs);
  const ready = now >= t.harvestAt;
  const open = ready ? null : t.windows.find((w) => w.valid && !w.watered && now >= w.openAt && now < w.closeAt) || null;
  const upcoming = ready ? null : t.windows.find((w) => w.valid && !w.watered && w.openAt > now) || null;
  // 0 seedling, 1 small, 2 medium, 3 large, 4 final form (ready)
  const stage = ready ? 4 : GROWTH_STAGES.filter((t) => progress >= t).length;
  return { ...t, progress, ready, open, upcoming, stage };
}

export function water(state, plotIdx, now) {
  const plot = state.plots[plotIdx];
  if (!plot || !plot.crop) return fail('Nothing planted');
  const st = cropStatus(plot.crop, now);
  if (st.ready) return fail('Ready to harvest');
  if (!st.open) return fail('Not thirsty right now');
  plot.crop.waters[st.open.index] = now;
  state.stats.waterings += 1;
  state.tutorial.watered = true;
  return { ok: true, checkpoint: st.open.index };
}

// Guess what a growing crop is. `cropId` must be a crop already discovered;
// pass null to clear the guess. The bonus is locked to the current stage.
export function guessCrop(state, plotIdx, cropId, now) {
  const plot = state.plots[plotIdx];
  if (!plot || !plot.crop) return fail('Nothing planted');
  const st = cropStatus(plot.crop, now);
  if (st.ready) return fail('It has already bloomed!');
  if (cropId == null) {
    delete plot.crop.guess;
    delete plot.crop.guessStage;
    return { ok: true, cleared: true };
  }
  if (!CROP_BY_ID[cropId]) return fail('Unknown crop');
  if (!state.discovered[cropId]) return fail('You can only guess crops you have discovered');
  if (plot.crop.guess === cropId) return { ok: true, stage: plot.crop.guessStage, unchanged: true };
  plot.crop.guess = cropId;
  plot.crop.guessStage = st.stage;
  return { ok: true, stage: st.stage, bonus: GUESS_BONUS[st.stage] };
}

export function harvestPreview(state, c) {
  const crop = CROP_BY_ID[c.cropId];
  const [qMin, qMax] = RARITY_INFO[crop.rarity].qty;
  const w = waterCount(c);
  const qty = c.qty + (w === WATERING.checkpoints.length ? 1 : 0);
  const unit = (crop.value / ((qMin + qMax) / 2)) * c.variance;
  const mult = WATERING.yieldMult ** w * (1 + bonusValues(state).harvestValue);
  return { qty, value: Math.max(1, Math.round(unit * qty * mult)), waters: w };
}

function recordTop(list, entry, n = 5) {
  list.push(entry);
  list.sort((a, b) => b.value - a.value || a.at - b.at);
  list.length = Math.min(list.length, n);
}

export function harvest(state, plotIdx, now) {
  const plot = state.plots[plotIdx];
  if (!plot || !plot.crop) return fail('Nothing to harvest');
  const c = plot.crop;
  if (!cropStatus(c, now).ready) return fail('Not ready yet');
  const crop = CROP_BY_ID[c.cropId];
  const base = harvestPreview(state, c);
  const { qty, waters } = base;
  let value = base.value;
  let guess = null;
  if (c.guess != null) {
    const correct = c.guess === crop.id;
    const bonus = correct ? GUESS_BONUS[c.guessStage] || 0 : 0;
    value = Math.round(value * (1 + bonus));
    guess = { cropId: c.guess, correct, bonus, stage: c.guessStage, extra: value - base.value };
    state.stats.guesses += 1;
    if (correct) state.stats.correctGuesses += 1;
  }

  plot.crop = null; // cleared before rewards: the same crop can never pay twice
  earn(state, value);
  const s = state.stats;
  s.harvests += 1;
  s.coinsFromHarvests += value;
  s.itemsHarvested += qty;
  const entry = { cropId: crop.id, value, qty, at: now };
  const newBest = !s.bestSingle || value > s.bestSingle.value;
  if (newBest) s.bestSingle = entry;
  if (!s.largestHaul || qty > s.largestHaul.qty || (qty === s.largestHaul.qty && value > s.largestHaul.value)) s.largestHaul = entry;
  recordTop(s.topHarvests, { ...entry });

  const isNew = !state.discovered[crop.id];
  const d = state.discovered[crop.id] || { firstAt: now, count: 0, best: 0, total: 0 };
  d.count += 1;
  d.best = Math.max(d.best, value);
  d.total += value;
  state.discovered[crop.id] = d;

  let trophy = null;
  if (ULTRA_TROPHY[crop.id] && !state.trophies[crop.id]) {
    trophy = ULTRA_TROPHY[crop.id];
    state.trophies[crop.id] = true;
    state.decorOwned[trophy] = (state.decorOwned[trophy] || 0) + 1;
  }
  state.tutorial.harvested = true;
  return { ok: true, crop, value, qty, waters, isNew, trophy, newBest, guess };
}

// ---------------------------------------------------------------- decorations

export function placedCounts(state) {
  const counts = {};
  for (const id of state.decorTiles) if (id) counts[id] = (counts[id] || 0) + 1;
  return counts;
}

export function decorScore(state) {
  let score = 0;
  for (const [id, n] of Object.entries(placedCounts(state))) {
    const base = DECOR_BY_ID[id].score;
    for (let k = 0; k < n; k++) score += base * DUPLICATE_FALLOFF ** k;
  }
  return Math.round(score);
}

// Each extra copy of a decoration costs 50% more than the base price.
export function decorPrice(state, id) {
  const d = DECOR_BY_ID[id];
  return Math.round(d.price * (1 + 0.5 * (state.decorOwned[id] || 0)));
}

export function buyDecor(state, id) {
  const d = DECOR_BY_ID[id];
  if (!d) return fail('Unknown decoration');
  if (d.trophy) return fail('Trophies cannot be bought');
  if (!spend(state, decorPrice(state, id))) return fail('Not enough coins');
  state.decorOwned[id] = (state.decorOwned[id] || 0) + 1;
  return { ok: true };
}

export function availableDecor(state, id) {
  return (state.decorOwned[id] || 0) - (placedCounts(state)[id] || 0);
}

export function placeDecor(state, tileIdx, id, now) {
  if (tileIdx < 0 || tileIdx >= state.decorTiles.length) return fail('Bad tile');
  if (!DECOR_BY_ID[id]) return fail('Unknown decoration');
  const previous = state.decorTiles[tileIdx];
  if (previous === id) return { ok: true, awards: [] };
  if (availableDecor(state, id) < 1) return fail('None left to place');
  state.decorTiles[tileIdx] = id;
  return { ok: true, replaced: previous, awards: checkThresholds(state, now) };
}

export function removeDecor(state, tileIdx) {
  const id = state.decorTiles[tileIdx];
  if (!id) return fail('Nothing here');
  state.decorTiles[tileIdx] = null;
  return { ok: true, id };
}

// Award a bonus for every threshold the best-ever score has passed.
export function checkThresholds(state, now) {
  const score = decorScore(state);
  state.bestScore = Math.max(state.bestScore, score);
  const awards = [];
  while (state.thresholdsAwarded < SCORE_THRESHOLDS.length
    && state.bestScore >= SCORE_THRESHOLDS[state.thresholdsAwarded]) {
    const idx = state.thresholdsAwarded;
    const stacks = bonusStacks(state);
    const pool = Object.keys(BONUS_TYPES).filter((k) => stacks[k] < BONUS_TYPES[k].maxStacks);
    const rng = makeRng(hash32(state.seed, 'bonus', idx));
    let award;
    if (pool.length) {
      award = { type: rng.pick(pool), threshold: SCORE_THRESHOLDS[idx], at: now };
    } else {
      award = { type: 'coins', amount: BONUS_FALLBACK_COINS, threshold: SCORE_THRESHOLDS[idx], at: now };
      earn(state, BONUS_FALLBACK_COINS);
    }
    state.bonuses.push(award);
    state.thresholdsAwarded += 1;
    awards.push(award);
  }
  return awards;
}

export function nextThreshold(state) {
  return SCORE_THRESHOLDS[state.thresholdsAwarded] ?? null;
}

// ---------------------------------------------------------------- visitors

export function visitorFrequency(state) {
  const fromDecor = Math.min(VISITORS.decorFreqCap, decorScore(state) * VISITORS.decorFreqPerPoint);
  return 1 + bonusValues(state).visitors + fromDecor;
}

function scheduleVisitor(state, from) {
  const rng = makeRng(hash32(state.seed, 'visit-time', state.counters.visitor));
  const interval = rng.range(VISITORS.minInterval, VISITORS.maxInterval) / visitorFrequency(state);
  state.visitor.nextAt = from + interval;
}

// Bring in a visitor if one is due. Offline time yields at most one visitor.
export function updateVisitors(state, now) {
  const v = state.visitor;
  if (v.current) return null;
  if (!Number.isFinite(v.nextAt)) scheduleVisitor(state, now);
  if (now < v.nextAt) return null;
  const rng = makeRng(hash32(state.seed, 'visitor', state.counters.visitor));
  const type = weightedPick(VISITOR_TYPES.map((t) => ({ item: t, weight: t.weight })), rng.next());
  v.current = { type: type.id, arrivedAt: Math.min(now, v.nextAt), line: rng.int(0, type.lines.length - 1) };
  return v.current;
}

export function visitorCoinMultiplier(state) {
  return Math.min(4, 1 + decorScore(state) / 150);
}

export function greetVisitor(state, now) {
  const cur = state.visitor.current;
  if (!cur) return fail('Nobody is visiting');
  const type = VISITOR_BY_ID[cur.type];
  const rng = makeRng(hash32(state.seed, 'visitor-gift', state.counters.visitor));
  const result = { ok: true, visitor: type, coins: 0, watered: 0, hurried: 0, seed: null };

  if (type.effect === 'coins' || type.effect === 'water') {
    result.coins = earn(state, type.base * visitorCoinMultiplier(state) * rng.range(0.8, 1.3));
  }
  if (type.effect === 'water') {
    state.plots.forEach((p, i) => {
      if (p.crop && water(state, i, now).ok) result.watered += 1;
    });
  }
  if (type.effect === 'hurry') {
    for (const p of state.plots) {
      if (p.crop && !cropStatus(p.crop, now).ready) {
        p.crop.boostMs += type.minutes * MINUTE;
        result.hurried += 1;
      }
    }
    if (!result.hurried) result.coins = earn(state, 10 * visitorCoinMultiplier(state));
  }
  if (type.effect === 'seed') {
    state.seeds[type.tier] = (state.seeds[type.tier] || 0) + 1;
    result.seed = type.tier;
  }

  state.visitorLog[type.id] = (state.visitorLog[type.id] || 0) + 1;
  state.stats.visitors += 1;
  state.counters.visitor += 1;
  state.visitor.current = null;
  scheduleVisitor(state, now);
  return result;
}

// ---------------------------------------------------------------- misc

export function tick(state, now) {
  const arrived = updateVisitors(state, now);
  state.lastSeenAt = Math.max(state.lastSeenAt, now);
  return { arrived };
}

export function collectionProgress(state) {
  const found = Object.keys(state.discovered).length;
  return { found, total: CROPS.length, pct: Math.round((found / CROPS.length) * 100) };
}

export function rarestDiscoveries(state, n = 6) {
  return Object.keys(state.discovered)
    .map((id) => CROP_BY_ID[id])
    .sort((a, b) => RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity) || b.value - a.value)
    .slice(0, n);
}

// Expected coin value of one seed of a tier (no bonuses, average variance and
// no watering), used for balance checks and the shop's "avg value" hint.
export function expectedSeedValue(tierId) {
  const tier = TIER_BY_ID[tierId];
  let ev = 0;
  let hours = 0;
  for (const r of RARITIES) {
    const p = (tier.odds[r] || 0) / 100;
    if (!p) continue;
    const pool = eligibleCrops(r, tier.tier);
    const avgV = pool.reduce((a, c) => a + c.value, 0) / pool.length;
    const avgH = pool.reduce((a, c) => a + c.hours, 0) / pool.length;
    ev += p * avgV * 1.025; // mean variance of U(0.9, 1.15)
    hours += p * avgH;
  }
  return { ev, hours };
}
