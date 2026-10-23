import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOOKS, DECOR_SETS, SCENE_W, SCENE_H } from '../src/data/garden.js';
import { DECOR_BY_ID, DECORATIONS } from '../src/data/decorations.js';
import { DECOR_TILES, newState } from '../src/core/state.js';
import { PLOT_TILES } from '../src/data/config.js';
import * as G from '../src/core/game.js';

const T0 = Date.UTC(2026, 0, 1, 12);

test('there is one nook per decoration spot, all on the lawn and off the crop beds', () => {
  assert.equal(NOOKS.length, DECOR_TILES.length);
  const zones = new Set(['back', 'side', 'path', 'corner']);
  for (const n of NOOKS) {
    assert.ok(zones.has(n.zone));
    assert.ok(n.x >= 4 && n.x <= SCENE_W - 4 && n.y >= 10 && n.y <= SCENE_H, `nook ${n.x},${n.y} inside the scene`);
    const onBed = PLOT_TILES.some(([px, py]) => n.x > px * 16 && n.x < px * 16 + 16 && n.y > py * 16 + 2 && n.y < py * 16 + 16);
    assert.ok(!onBed, `nook ${n.x},${n.y} is not on a crop bed`);
  }
});

test('every decoration has a zone; sets use real, distinct decorations', () => {
  for (const d of DECORATIONS) assert.ok(['back', 'side', 'path', 'corner'].includes(d.spot), d.id);
  const seen = new Set();
  for (const set of DECOR_SETS) {
    assert.ok(set.items.length >= 3 && set.bonus > 0);
    for (const id of set.items) {
      assert.ok(DECOR_BY_ID[id] && !DECOR_BY_ID[id].trophy, `${set.id}: ${id}`);
      assert.ok(!seen.has(id), `${id} is only in one set`);
      seen.add(id);
    }
  }
});

test('buying then auto-placing puts decorations in their favourite zone', () => {
  const s = newState(T0, 1);
  s.coins = 1e6;
  for (const id of ['picket-fence', 'bench', 'pond', 'gnome']) {
    G.buyDecor(s, id);
    const r = G.autoPlaceDecor(s, id, T0);
    assert.ok(r.ok);
    assert.equal(NOOKS[r.nook].zone, DECOR_BY_ID[id].spot, id);
  }
  assert.equal(G.autoPlaceDecor(s, 'gnome', T0).ok, false, 'nothing left in storage');
});

test('a full zone falls back to others; a full garden refuses politely', () => {
  const s = newState(T0, 2);
  s.coins = 1e7;
  const backNooks = NOOKS.filter((n) => n.zone === 'back').length;
  for (let k = 0; k < backNooks + 1; k++) { G.buyDecor(s, 'picket-fence'); G.autoPlaceDecor(s, 'picket-fence', T0); }
  const zones = s.decorTiles.map((id, i) => (id ? NOOKS[i].zone : null)).filter(Boolean);
  assert.equal(zones.filter((z) => z === 'back').length, backNooks);
  assert.equal(zones.filter((z) => z === 'side').length, 1, 'overflow went beside the beds');
  while (s.decorTiles.some((t) => !t)) { G.buyDecor(s, 'clay-pot'); G.autoPlaceDecor(s, 'clay-pot', T0); }
  G.buyDecor(s, 'bench');
  const full = G.autoPlaceDecor(s, 'bench', T0);
  assert.equal(full.ok, false);
  assert.match(full.error, /full/);
});

test('completing a set adds its bonus once; removing a piece takes it away', () => {
  const s = newState(T0, 3);
  s.coins = 1e6;
  const set = DECOR_SETS.find((x) => x.id === 'cottage');
  for (const id of set.items) { G.buyDecor(s, id); G.autoPlaceDecor(s, id, T0); }
  const base = set.items.reduce((a, id) => a + DECOR_BY_ID[id].score, 0);
  assert.equal(G.decorScore(s), base + set.bonus);
  assert.ok(G.setProgress(s).find((x) => x.id === 'cottage').complete);
  const i = s.decorTiles.indexOf('bench');
  G.removeDecor(s, i);
  assert.equal(G.decorScore(s), base - DECOR_BY_ID.bench.score);
  assert.equal(G.setProgress(s).find((x) => x.id === 'cottage').have.length, 3);
});

test('moving a decoration swaps nooks without changing the score', () => {
  const s = newState(T0, 4);
  s.coins = 1e6;
  G.buyDecor(s, 'gnome'); G.autoPlaceDecor(s, 'gnome', T0);
  G.buyDecor(s, 'pond'); G.autoPlaceDecor(s, 'pond', T0);
  const a = s.decorTiles.indexOf('gnome');
  const b = s.decorTiles.indexOf('pond');
  const score = G.decorScore(s);
  assert.ok(G.moveDecor(s, a, b).ok);
  assert.equal(s.decorTiles[a], 'pond');
  assert.equal(s.decorTiles[b], 'gnome');
  const empty = s.decorTiles.indexOf(null);
  assert.ok(G.moveDecor(s, a, empty).ok);
  assert.equal(s.decorTiles[empty], 'pond');
  assert.equal(s.decorTiles[a], null);
  assert.equal(G.decorScore(s), score);
  assert.equal(G.moveDecor(s, a, b).ok, false, 'cannot move from an empty nook');
});
