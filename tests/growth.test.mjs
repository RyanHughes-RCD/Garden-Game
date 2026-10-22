import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CROPS, CROP_BY_ID } from '../src/data/crops.js';
import { HOUR, GROWTH_STAGES, GUESS_BONUS } from '../src/data/config.js';
import { newState, sanitize } from '../src/core/state.js';
import * as G from '../src/core/game.js';
import { stageGrid, cropGrid, setOverride, clearOverrides, familyOf, STAGE_NAMES } from '../src/art/sprites.js';
import { FAMILIES } from '../src/art/growthArt.js';
import { framesFromRGBA, scaleGrid } from '../src/art/pixel.js';
import { Bitmap, decodePNG } from '../tools/png.mjs';
import { checkArt } from '../tools/sprites.mjs';

const T0 = Date.UTC(2026, 0, 1, 12);
const key = (g) => g.px.join(',');

test('crops grow through 5 named stages at the configured thresholds', () => {
  assert.equal(STAGE_NAMES.length, 5);
  const s = newState(T0, 7);
  G.plant(s, 0, 'sprout', T0);
  const c = s.plots[0].crop;
  const at = (f) => G.cropStatus(c, T0 + c.duration * f).stage;
  assert.equal(at(0), 0);
  assert.equal(at(GROWTH_STAGES[0] - 0.01), 0);
  assert.equal(at(GROWTH_STAGES[0] + 0.01), 1);
  assert.equal(at(GROWTH_STAGES[1] + 0.01), 2);
  assert.equal(at(GROWTH_STAGES[2] + 0.01), 3);
  assert.equal(at(0.99), 3);
  assert.equal(at(1.0), 4);
});

test('every crop has 5 distinct stage sprites; families look different early on', () => {
  for (const c of CROPS) {
    const frames = [0, 1, 2, 3, 4].map((s) => key(stageGrid(c.id, s)));
    assert.equal(new Set(frames).size, 5, `${c.name} stages are distinct`);
    assert.equal(frames[4], key(cropGrid(c.id)));
  }
  // small stage silhouettes differ between families
  const shapes = new Set();
  for (const fam of FAMILIES) {
    const c = CROPS.find((x) => familyOf(x.id) === fam);
    shapes.add(stageGrid(c.id, 1).px.map((p) => (p ? 1 : 0)).join(''));
  }
  assert.equal(shapes.size, FAMILIES.length);
  // the large stage keeps the final silhouette but hides most of its colour
  const rose = CROPS.find((c) => c.key === 'velvet-rose');
  const large = stageGrid(rose.id, 3);
  const final = cropGrid(rose.id);
  assert.deepEqual(large.px.map(Boolean), final.px.map(Boolean));
  assert.notEqual(key(large), key(final));
});

test('guessing: only discovered crops, bonus by stage, locks at bloom', () => {
  const s = newState(T0, 99);
  G.plant(s, 0, 'sprout', T0);
  const c = s.plots[0].crop;
  const actual = c.cropId;
  const other = CROPS.find((x) => x.id !== actual).id;
  assert.equal(G.guessCrop(s, 0, actual, T0).ok, false, 'must be discovered first');
  s.discovered[actual] = { firstAt: T0, count: 1, best: 1, total: 1 };
  s.discovered[other] = { firstAt: T0, count: 1, best: 1, total: 1 };
  // guess wrong at seedling, then change to right at medium stage
  assert.equal(G.guessCrop(s, 0, other, T0).stage, 0);
  const tMedium = T0 + c.duration * (GROWTH_STAGES[1] + 0.05);
  assert.equal(G.guessCrop(s, 0, actual, tMedium).stage, 2);
  const preview = G.harvestPreview(s, c).value;
  const done = G.cropTiming(c).harvestAt;
  assert.equal(G.guessCrop(s, 0, other, done).ok, false, 'no guessing after bloom');
  const r = G.harvest(s, 0, done);
  assert.equal(r.guess.correct, true);
  assert.equal(r.value, Math.round(preview * (1 + GUESS_BONUS[2])));
  assert.equal(s.stats.correctGuesses, 1);
  assert.equal(s.stats.guesses, 1);
  // a wrong guess changes nothing but the stats
  G.plant(s, 0, 'sprout', T0);
  const c2 = s.plots[0].crop;
  const wrong = [actual, other].find((id) => id !== c2.cropId);
  G.guessCrop(s, 0, wrong, T0);
  const p2 = G.harvestPreview(s, c2).value;
  const r2 = G.harvest(s, 0, T0 + 30 * HOUR);
  assert.equal(r2.guess.correct, false);
  assert.equal(r2.value, p2);
  assert.equal(s.stats.guesses, 2);
});

test('guesses survive save sanitising; bad guesses are dropped', () => {
  const s = newState(T0, 5);
  G.plant(s, 0, 'sprout', T0);
  G.plant(s, 1, 'sprout', T0);
  s.plots[0].crop.guess = 3; s.plots[0].crop.guessStage = 1;
  s.plots[1].crop.guess = 999; s.plots[1].crop.guessStage = 1;
  const out = sanitize(JSON.parse(JSON.stringify(s)), T0);
  assert.equal(out.plots[0].crop.guess, 3);
  assert.equal(out.plots[0].crop.guessStage, 1);
  assert.equal(out.plots[1].crop.guess, undefined);
});

test('PNG overrides replace sprites (5-frame strips, final-only, any size)', () => {
  const rose = CROP_BY_ID[31];
  try {
    // 32px final-only override: stages 0-2 generated, stage 3 derived from it
    const big = scaleGrid(cropGrid(31), 2);
    setOverride('crops', rose.key, [big]);
    assert.equal(cropGrid(31).w, 32);
    assert.equal(stageGrid(31, 3).w, 32);
    assert.equal(stageGrid(31, 0).w, 16);
    // full strip
    const strip = [0, 1, 2, 3, 4].map((s) => ({ w: 8, h: 8, px: new Array(64).fill(s % 2 ? '#ff0000' : '#00ff00') }));
    setOverride('crops', rose.key, strip);
    assert.equal(stageGrid(31, 2), strip[2]);
  } finally {
    clearOverrides();
  }
  assert.equal(cropGrid(31).w, 16);
});

test('PNG encode/decode round trip into frames', () => {
  const frames = [0, 1, 2, 3, 4].map((s) => stageGrid(1, s));
  const bmp = new Bitmap(80, 16);
  frames.forEach((g, i) => bmp.blit(g, i * 16, 0, 1));
  const dir = mkdtempSync(join(tmpdir(), 'lg-'));
  writeFileSync(join(dir, 'x.png'), bmp.png());
  const { width, height, data } = decodePNG(bmp.png());
  const back = framesFromRGBA(width, height, data);
  assert.equal(back.length, 5);
  back.forEach((g, i) => assert.equal(key(g), key(frames[i])));
});

test('committed art overrides are valid', () => {
  assert.deepEqual(checkArt(), []);
});
