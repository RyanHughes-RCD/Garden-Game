import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CROPS, ULTRA_TROPHY } from '../src/data/crops.js';
import { DECORATIONS } from '../src/data/decorations.js';
import { RARITIES, SEED_TIERS, HOUR, MINUTE, SCORE_THRESHOLDS, BONUS_TYPES, WATERING } from '../src/data/config.js';
import { newState, parseSave, saveState, loadState, sanitize, STORAGE_KEY } from '../src/core/state.js';
import * as G from '../src/core/game.js';
import { makeRng } from '../src/core/rng.js';

const T0 = Date.UTC(2026, 0, 1, 12);

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
}

test('collection has exactly 100 unique crops with 5 ultra-rares', () => {
  assert.equal(CROPS.length, 100);
  assert.equal(new Set(CROPS.map((c) => c.name)).size, 100);
  assert.equal(new Set(CROPS.map((c) => c.key)).size, 100);
  const counts = Object.fromEntries(RARITIES.map((r) => [r, CROPS.filter((c) => c.rarity === r).length]));
  assert.equal(counts.ultra, 5);
  assert.deepEqual(counts, { common: 30, uncommon: 25, rare: 20, epic: 13, legendary: 7, ultra: 5 });
  for (const c of CROPS) {
    assert.ok(c.hours >= 1, `${c.name} grows for hours`);
    assert.ok(c.value > 0);
  }
  assert.equal(Object.keys(ULTRA_TROPHY).length, 5);
});

test('every tier can roll every rarity it has odds for, and odds sum to 100', () => {
  for (const t of SEED_TIERS) {
    const sum = Object.values(t.odds).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 100) < 1e-9, `${t.id} sums to ${sum}`);
    for (const r of RARITIES) {
      if (t.odds[r] > 0) assert.ok(G.eligibleCrops(r, t.tier).length > 0, `${t.id} has ${r} crops`);
    }
    assert.ok(t.odds.ultra < 100 && t.odds.ultra > 0, 'ultra never guaranteed');
  }
});

test('higher tiers have better odds and higher expected profit', () => {
  let prevProfit = -Infinity;
  let prevRare = -Infinity;
  for (const t of SEED_TIERS) {
    const { ev } = G.expectedSeedValue(t.id);
    const profit = ev - t.price;
    const rarePlus = t.odds.rare + t.odds.epic + t.odds.legendary + t.odds.ultra;
    assert.ok(ev > t.price, `${t.id} is profitable`);
    assert.ok(profit > prevProfit, `${t.id} profit increases`);
    assert.ok(rarePlus > prevRare, `${t.id} rare odds increase`);
    prevProfit = profit;
    prevRare = rarePlus;
  }
});

test('crop tier odds per crop sum to tier odds', () => {
  for (const t of SEED_TIERS) {
    const sum = CROPS.reduce((a, c) => a + G.cropTierOdds(c).find((o) => o.tier === t.id).pct, 0);
    assert.ok(Math.abs(sum - 100) < 1e-6, `${t.id} -> ${sum}`);
  }
});

test('discovery bonus favours undiscovered crops but allows duplicates', () => {
  const s = newState(T0, 1234);
  // discover half the commons
  const commons = CROPS.filter((c) => c.rarity === 'common');
  commons.slice(0, 15).forEach((c) => { s.discovered[c.id] = { firstAt: T0, count: 1, best: 1, total: 1 }; });
  const rng = makeRng(99);
  let newHits = 0;
  let dupes = 0;
  for (let i = 0; i < 4000; i++) {
    const c = G.rollCrop(s, 'sprout', rng);
    if (c.rarity !== 'common') continue;
    if (s.discovered[c.id]) dupes++; else newHits++;
  }
  // with weight 3 vs 1 on 15/15 split, ~75% of commons should be new
  const share = newHits / (newHits + dupes);
  assert.ok(share > 0.68 && share < 0.82, `share ${share}`);
  assert.ok(dupes > 0);
});

test('buying seeds never goes negative', () => {
  const s = newState(T0, 1);
  s.coins = 25;
  assert.ok(G.buySeeds(s, 'sprout', 2).ok);
  assert.equal(s.coins, 5);
  assert.equal(G.buySeeds(s, 'sprout', 1).ok, false);
  assert.equal(s.coins, 5);
  assert.equal(G.buySeeds(s, 'garden', 1).ok, false);
  assert.equal(G.buySeeds(s, 'sprout', -3).ok, false);
  assert.equal(s.seeds.sprout, 5);
});

test('planting is deterministic and survives save/load without reroll', () => {
  const a = newState(T0, 777);
  const b = newState(T0, 777);
  const ra = G.plant(a, 0, 'sprout', T0);
  const rb = G.plant(b, 0, 'sprout', T0);
  assert.ok(ra.ok);
  assert.equal(ra.crop.id, rb.crop.id);
  assert.equal(a.seeds.sprout, 2);
  const storage = memoryStorage();
  saveState(a, storage);
  const loaded = loadState(T0 + 1000, storage).state;
  assert.equal(loaded.plots[0].crop.cropId, ra.crop.id);
  assert.equal(loaded.counters.plant, 1);
  // planting again uses the next counter, not the same roll
  assert.ok(G.plant(loaded, 1, 'sprout', T0).ok);
  assert.equal(loaded.counters.plant, 2);
});

test('growth uses real timestamps; watering windows and harvest', () => {
  const s = newState(T0, 42);
  G.plant(s, 0, 'sprout', T0);
  const c = s.plots[0].crop;
  const D = c.duration;
  let st = G.cropStatus(c, T0);
  assert.equal(st.ready, false);
  assert.ok(st.open && st.open.index === 0);
  assert.ok(G.water(s, 0, T0 + 1000).ok);
  assert.equal(G.water(s, 0, T0 + 2000).ok, false, 'cannot double-water a checkpoint');
  // skip checkpoint 1 entirely (missed), water checkpoint 2
  st = G.cropStatus(c, T0 + D * 0.65);
  assert.equal(st.open.index, 2);
  assert.ok(G.water(s, 0, T0 + D * 0.65).ok);
  assert.equal(G.harvest(s, 0, T0 + D * 0.7).ok, false);
  const t = G.cropTiming(c);
  assert.ok(Math.abs(t.growMs - D * WATERING.timeMult ** 2) < 1);
  const coins = s.coins;
  const preview = G.harvestPreview(s, c);
  const res = G.harvest(s, 0, t.harvestAt + 1);
  assert.ok(res.ok);
  assert.equal(res.value, preview.value);
  assert.equal(s.coins, coins + res.value);
  assert.equal(G.harvest(s, 0, t.harvestAt + 2).ok, false, 'no duplicate harvest');
  assert.ok(s.discovered[res.crop.id]);
  assert.equal(res.isNew, true);
});

test('missing all watering only forgoes bonuses', () => {
  const s = newState(T0, 5);
  G.plant(s, 0, 'sprout', T0);
  G.plant(s, 1, 'sprout', T0);
  const c0 = s.plots[0].crop;
  // copy crop to compare same roll watered vs not
  s.plots[1].crop = { ...c0, waters: [null, null, null] };
  G.water(s, 0, T0);
  G.water(s, 0, T0 + c0.duration * 0.31);
  G.water(s, 0, T0 + c0.duration * 0.61);
  const watered = G.harvestPreview(s, s.plots[0].crop);
  const dry = G.harvestPreview(s, s.plots[1].crop);
  assert.ok(watered.value > dry.value * 1.8);
  assert.ok(dry.value > 0);
  // long absence: dry crop is still harvestable, never lost
  const res = G.harvest(s, 1, T0 + 30 * 24 * HOUR);
  assert.ok(res.ok);
});

test('decoration score uses placed items with duplicate falloff; thresholds award once', () => {
  const s = newState(T0, 9);
  s.coins = 100000;
  G.buyDecor(s, 'gnome');
  G.buyDecor(s, 'gnome');
  G.buyDecor(s, 'fountain');
  assert.equal(G.placeDecor(s, 0, 'gnome', T0).ok, true);
  assert.equal(G.decorScore(s), 12);
  G.placeDecor(s, 1, 'gnome', T0);
  assert.equal(G.decorScore(s), Math.round(12 + 12 * 0.6));
  assert.equal(G.placeDecor(s, 2, 'gnome', T0).ok, false, 'only 2 owned');
  const r = G.placeDecor(s, 2, 'fountain', T0);
  assert.ok(r.ok);
  const score = G.decorScore(s);
  const expectedAwards = SCORE_THRESHOLDS.filter((t) => t <= score).length;
  assert.equal(s.bonuses.length, expectedAwards);
  G.removeDecor(s, 2);
  assert.equal(G.decorScore(s), Math.round(12 + 7.2));
  // re-placing does not award again
  G.placeDecor(s, 2, 'fountain', T0);
  assert.equal(s.bonuses.length, expectedAwards);
  assert.equal(G.buyDecor(s, 'trophy-rainbow').ok, false);
});

test('bonus awards are deterministic and respect max stacks', () => {
  const s = newState(T0, 31337);
  s.bestScore = 99999;
  const awards = G.checkThresholds(s, T0);
  assert.equal(awards.length, SCORE_THRESHOLDS.length);
  const stacks = G.bonusStacks(s);
  for (const [k, n] of Object.entries(stacks)) assert.ok(n <= BONUS_TYPES[k].maxStacks);
  const s2 = newState(T0, 31337);
  s2.bestScore = 99999;
  assert.deepEqual(G.checkThresholds(s2, T0).map((a) => a.type), awards.map((a) => a.type));
  const v = G.bonusValues(s);
  assert.ok(v.cheaperSeeds <= 0.2 && v.fasterGrowth <= 0.25);
});

test('rare odds bonus never makes ultra guaranteed', () => {
  const s = newState(T0, 1);
  for (let i = 0; i < 5; i++) s.bonuses.push({ type: 'rareOdds' });
  for (const t of SEED_TIERS) {
    const odds = G.rarityOdds(s, t.id);
    const sum = Object.values(odds).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 100) < 1e-9);
    assert.ok(odds.ultra < 10);
    assert.ok(odds.ultra >= t.odds.ultra);
  }
});

test('ultra harvest awards a unique trophy once', () => {
  const s = newState(T0, 3);
  s.plots[0].crop = { cropId: 96, tier: 'moonlit', plantedAt: T0, duration: HOUR, waters: [null, null, null], boostMs: 0, qty: 1, variance: 1, rollSeed: 0 };
  const r = G.harvest(s, 0, T0 + HOUR);
  assert.equal(r.trophy, 'trophy-rainbow');
  assert.equal(s.decorOwned['trophy-rainbow'], 1);
  s.plots[0].crop = { cropId: 96, tier: 'moonlit', plantedAt: T0, duration: HOUR, waters: [null, null, null], boostMs: 0, qty: 1, variance: 1, rollSeed: 0 };
  const r2 = G.harvest(s, 0, T0 + HOUR);
  assert.equal(r2.trophy, null);
  assert.equal(s.decorOwned['trophy-rainbow'], 1);
  assert.ok(G.placeDecor(s, 0, 'trophy-rainbow', T0).ok);
  assert.equal(G.decorScore(s), 80);
});

test('visitors: at most one waits during offline time; gifts are deterministic', () => {
  const s = newState(T0, 11);
  G.tick(s, T0 + 48 * HOUR);
  assert.ok(s.visitor.current);
  G.tick(s, T0 + 96 * HOUR);
  const coins = s.coins;
  const r = G.greetVisitor(s, T0 + 96 * HOUR);
  assert.ok(r.ok);
  assert.equal(s.visitor.current, null);
  assert.ok(s.visitor.nextAt > T0 + 96 * HOUR);
  assert.ok(s.coins >= coins);
  assert.equal(G.greetVisitor(s, T0 + 96 * HOUR).ok, false);
});

test('hurry visitor shortens growth but not below a floor', () => {
  const s = newState(T0, 2);
  G.plant(s, 0, 'sprout', T0);
  const c = s.plots[0].crop;
  const before = G.cropTiming(c).harvestAt;
  c.boostMs += 15 * MINUTE;
  assert.equal(G.cropTiming(c).harvestAt, before - 15 * MINUTE);
  c.boostMs += 100 * HOUR;
  assert.ok(G.cropTiming(c).growMs >= c.duration * 0.25);
});

test('plot unlocking costs coins and is capped', () => {
  const s = newState(T0, 2);
  s.coins = 0;
  assert.equal(G.unlockPlot(s).ok, false);
  s.coins = 1e6;
  let n = 0;
  while (G.unlockPlot(s).ok) n++;
  assert.equal(n, 8);
  assert.ok(s.plots.every((p) => p.unlocked));
});

test('sanitize repairs corrupted saves', () => {
  const s = newState(T0, 2);
  const bad = JSON.parse(JSON.stringify(s));
  bad.coins = -50;
  bad.seeds.sprout = 'lots';
  bad.decorTiles[0] = 'gnome'; // not owned
  bad.plots[0].crop = { cropId: 9999 };
  bad.discovered = { 5: { count: 2 }, 999: {} };
  const fixed = sanitize(bad, T0);
  assert.equal(fixed.coins, 0);
  assert.equal(fixed.seeds.sprout, 0);
  assert.equal(fixed.decorTiles[0], null);
  assert.equal(fixed.plots[0].crop, null);
  assert.deepEqual(Object.keys(fixed.discovered), ['5']);
});

test('save refuses to overwrite a newer revision from another tab; backup fallback', () => {
  const storage = memoryStorage();
  const a = newState(T0, 2);
  saveState(a, storage);
  const b = loadState(T0, storage).state;
  b.coins = 999;
  assert.ok(saveState(b, storage));
  a.coins = 1;
  assert.equal(saveState(a, storage), false);
  assert.equal(loadState(T0, storage).state.coins, 999);
  storage.setItem(STORAGE_KEY, '{corrupt');
  const res = loadState(T0, storage);
  assert.equal(res.source, 'littleGarden.save.backup');
});

test('unversioned legacy save migrates', () => {
  const legacy = { coins: 77, seeds: { sprout: 1 } };
  const s = parseSave(JSON.stringify(legacy), T0);
  assert.equal(s.version, 1);
  assert.equal(s.coins, 77);
  assert.equal(s.plots.length, 12);
});

test('decorations have unique ids and trophies are not purchasable', () => {
  assert.equal(new Set(DECORATIONS.map((d) => d.id)).size, DECORATIONS.length);
  assert.ok(DECORATIONS.length >= 30);
  for (const id of Object.values(ULTRA_TROPHY)) assert.ok(DECORATIONS.find((d) => d.id === id && d.trophy));
});

test('simulated week of play progresses without exploits', () => {
  // A player who checks in every 3 hours, buys the best affordable seed and
  // waters whatever is open. Must make progress and never go negative.
  const s = newState(T0, 2024);
  let now = T0;
  for (let step = 0; step < 7 * 8; step++) {
    G.tick(s, now);
    if (s.visitor.current) G.greetVisitor(s, now);
    s.plots.forEach((p, i) => { if (p.crop && G.cropStatus(p.crop, now).ready) G.harvest(s, i, now); });
    s.plots.forEach((p, i) => { if (p.crop) G.water(s, i, now); });
    const price = G.nextPlotPrice(s);
    if (price && s.coins > price * 2) G.unlockPlot(s);
    s.plots.forEach((p, i) => {
      if (!p.unlocked || p.crop) return;
      const tier = [...SEED_TIERS].reverse().find((t) => G.seedPrice(s, t.id) <= s.coins * 0.5) || SEED_TIERS[0];
      if (!s.seeds[tier.id]) G.buySeeds(s, tier.id, 1);
      const have = SEED_TIERS.find((t) => s.seeds[t.id] > 0);
      if (have) G.plant(s, i, have.id, now);
    });
    assert.ok(s.coins >= 0);
    now += 3 * HOUR;
  }
  const found = Object.keys(s.discovered).length;
  assert.ok(found >= 15, `discovered ${found}`);
  assert.ok(found < 100, 'not everything in a week');
  assert.ok(s.plots.filter((p) => p.unlocked).length > 4);
});
