// Garden screen: a hand-drawn garden scene with crop beds, decorations in
// nooks, visitors and ambient life.
import { h, clear } from './dom.js';
import { app, openSheet, closeOverlay, closeAllOverlays, toast, flyCoins } from './app.js';
import * as G from '../core/game.js';
import { PLOT_TILES, GARDEN_COLS, GARDEN_ROWS, SEED_TIERS, MINUTE, RARITY_INFO, WATERING, GUESS_BONUS } from '../data/config.js';
import { NOOKS } from '../data/garden.js';
import { CROP_BY_ID } from '../data/crops.js';
import { DECOR_BY_ID } from '../data/decorations.js';
import { VISITOR_BY_ID } from '../data/visitors.js';
import { uiGrid, visitorGrid, sceneGrid, familyOf, STAGE_NAMES } from '../art/sprites.js';
import { mountAmbient, updateAmbient } from './ambient.js';
import { PACKET_FOR_TIER } from '../art/uiArt.js';
import {
  img, uiImg, stageImg, cropImg, decorImg, visitorImg, gridURL, coinAmount, fmtDuration, fmtClock, rarityTag, fmtNum,
} from './render.js';
import { showPlanted, showHarvestResult, showHarvestSummary, showVisitor, showBonusAwards } from './modals.js';
import { sfx } from './audio.js';

let view = null; // { root, scene, plots: [], decor: [], hint, fx, visitorEl }
let justPlanted = -1;

const artPx = (n) => `calc(var(--tile) * ${n / 16})`;

export function render(root) {
  const wrap = h('div', { class: 'garden-wrap' });
  const banner = h('div', { class: 'place-banner', hidden: true });
  const scene = h('div', { class: 'scene' });
  const fx = h('div', { class: 'fx-layer' });
  const frame = h('div', { class: 'scene-frame' }, scene);
  const hint = h('div', { class: 'garden-hint' });
  wrap.append(banner, frame, hint);
  root.append(wrap);

  scene.append(img(sceneGrid(), 'scene-bg'));
  const ambientLayer = h('div', { class: 'ambient' });
  scene.append(ambientLayer);
  view = { root, wrap, scene, frame, fx, hint, banner, plots: [], decor: [], visitorEl: null, visitorSpot: -1, ambientLayer };

  PLOT_TILES.forEach(([x, y]) => {
    const el = h('div', { class: 'tile plot' });
    el.style.left = artPx(x * 16);
    el.style.top = artPx(y * 16);
    scene.append(el);
    view.plots.push({ el, sig: '' });
  });
  NOOKS.forEach((n, i) => {
    const el = h('div', { class: 'nook' });
    el.style.left = artPx(n.x - 8);
    el.style.top = artPx(n.y - 15);
    el.style.zIndex = String(10 + n.y);
    scene.append(el);
    view.decor.push({ el, sig: '', nook: n, index: i });
  });
  scene.append(fx);
  mountAmbient(ambientLayer, scene);
  sizeScene();
  update(root);
}

export function sizeScene() {
  if (!view) return;
  const root = view.root;
  const bannerH = app.moving != null ? 64 : 0;
  const availW = Math.min(root.clientWidth, 640) - 16 - 22;
  const availH = root.clientHeight - 22 - 20 - 84 - bannerH;
  let tile = Math.floor(Math.min(availW / GARDEN_COLS, availH / GARDEN_ROWS) / 8) * 8;
  tile = Math.max(40, Math.min(112, tile));
  document.documentElement.style.setProperty('--tile', `${tile}px`);
}

function plotSig(i, now) {
  const p = app.state.plots[i];
  if (!p.unlocked) {
    const next = G.nextPlotIndex(app.state) === i;
    return `locked|${next}|${next ? G.nextPlotPrice(app.state) : ''}`;
  }
  if (!p.crop) return 'empty';
  const st = G.cropStatus(p.crop, now);
  const last = Math.max(0, ...p.crop.waters.filter((w) => w != null));
  const wet = last && now - last < 40 * MINUTE;
  return `crop|${p.crop.cropId}|${p.crop.plantedAt}|${st.stage}|${st.ready}|${!!st.open}|${wet}|${p.crop.guess}`;
}

function buildPlot(i, now) {
  const p = app.state.plots[i];
  const els = [];
  if (!p.unlocked) {
    els.push(uiImg('soil-locked', 'layer'));
    const isNext = G.nextPlotIndex(app.state) === i;
    if (isNext) {
      els.push(uiImg('lock', 'lock-icon'));
      els.push(h('div', { class: 'lock-label' }, fmtNum(G.nextPlotPrice(app.state))));
    }
    return { els, cls: 'locked' };
  }
  if (!p.crop) {
    els.push(uiImg('soil', 'layer'));
    els.push(h('div', { class: 'plus' }, '+'));
    return { els, cls: 'empty' };
  }
  const c = p.crop;
  const st = G.cropStatus(c, now);
  const last = Math.max(0, ...c.waters.filter((w) => w != null));
  const wet = last && now - last < 40 * MINUTE;
  els.push(uiImg(wet ? 'soil-wet' : 'soil', 'layer'));
  els.push(stageImg(c.cropId, st.stage, 'layer plant'));
  if (c.guess != null && !st.ready) els.push(h('div', { class: 'guess-chip' }, cropImg(c.guess)));
  if (st.ready) {
    els.push(h('div', { class: 'badge ready' }, uiImg('basket')));
  } else {
    if (st.open) els.push(h('div', { class: 'badge water' }, uiImg('drop')));
    els.push(h('div', { class: 'bar' }, h('i', { style: { width: `${Math.round(st.progress * 100)}%` } })));
  }
  return { els, cls: st.ready ? 'ready' : 'growing' };
}

// Decorations that belong to a completed matching set get a gentle sparkle.
function completedSetItems() {
  const ids = new Set();
  for (const set of G.setProgress(app.state)) if (set.complete) set.items.forEach((id) => ids.add(id));
  return ids;
}

function buildNook(v, inSet) {
  const id = app.state.decorTiles[v.index];
  const moving = app.moving;
  const els = [];
  let cls = 'nook';
  if (id) {
    els.push(h('i', { class: 'nook-shadow' }), decorImg(id, 'layer decor-img'));
    if (inSet) { els.push(h('i', { class: 'set-sparkle' }), h('i', { class: 'set-sparkle s2' })); cls += ' in-set'; }
    cls += ' filled';
    if (moving === v.index) cls += ' lifted';
  } else if (moving != null) {
    els.push(h('i', { class: 'nook-marker' }));
    cls += ' free';
  }
  const interactive = id || moving != null;
  if (interactive) {
    els.push(h('button', {
      class: 'hit',
      'aria-label': id ? `${DECOR_BY_ID[id].name} (spot ${v.index + 1})` : `Empty spot ${v.index + 1}`,
      onclick: () => tapDecor(v.index, v.el),
    }));
  }
  return { els, cls };
}

export function update(root) {
  if (!view || view.root !== root || !root.contains(view.wrap)) return;
  const now = app.now();
  const s = app.state;

  // move-mode banner
  if (app.moving != null && s.decorTiles[app.moving]) {
    const d = DECOR_BY_ID[s.decorTiles[app.moving]];
    clear(view.banner);
    view.banner.hidden = false;
    view.banner.append(decorImg(d.id), h('div', { class: 'text' }, h('b', {}, `Moving: ${d.name}`), h('br'), 'Tap a sparkle, or another decoration to swap.'),
      h('button', { class: 'btn small plain', onclick: () => { app.moving = null; sizeScene(); app.refresh(); } }, 'Cancel'));
  } else {
    if (app.moving != null) { app.moving = null; sizeScene(); }
    view.banner.hidden = true;
  }

  view.plots.forEach((t, i) => {
    const sig = plotSig(i, now);
    if (sig !== t.sig) {
      t.sig = sig;
      const built = buildPlot(i, now);
      clear(t.el);
      t.el.className = `tile plot ${built.cls}`;
      if (i === justPlanted) {
        t.el.classList.add('just-planted');
        justPlanted = -1;
      }
      t.el.append(...built.els, h('button', {
        class: 'hit',
        'aria-label': `Plot ${i + 1}`,
        onclick: () => tapPlot(i, t.el),
      }));
    } else {
      const p = s.plots[i];
      const bar = t.el.querySelector('.bar i');
      if (bar && p.crop) bar.style.width = `${Math.round(G.cropStatus(p.crop, now).progress * 100)}%`;
    }
  });

  const inSet = completedSetItems();
  for (const v of view.decor) {
    const id = s.decorTiles[v.index];
    const sig = `${id || ''}|${app.moving}|${id && inSet.has(id)}`;
    if (sig === v.sig) continue;
    v.sig = sig;
    const built = buildNook(v, id && inSet.has(id));
    clear(v.el);
    v.el.className = built.cls;
    v.el.append(...built.els);
  }
  updateAmbient(now);
  updateVisitor();
  updateHint(now);
}

// ---------------------------------------------------------------- visitor

function updateVisitor() {
  const cur = app.state.visitor.current;
  if (!cur) {
    if (view.visitorEl) { view.visitorEl.remove(); view.visitorEl = null; }
    return;
  }
  if (view.visitorEl && view.visitorEl.dataset.type === cur.type) return;
  if (view.visitorEl) view.visitorEl.remove();
  const type = VISITOR_BY_ID[cur.type];
  const el = h('div', { class: 'visitor', dataset: { type: cur.type } },
    visitorImg(type.id, 0, 'sprite'),
    h('div', { class: 'bubble' }, '!'),
    h('button', { 'aria-label': `Greet ${type.name}`, onclick: () => greet() }));
  view.scene.append(el);
  view.visitorEl = el;
  moveVisitor(true);
  let frame = 0;
  el._blink = setInterval(() => {
    if (!el.isConnected) { clearInterval(el._blink); return; }
    frame = 1 - frame;
    el.querySelector('img.sprite').src = gridURL(frame ? visitorGrid(type.id, 1) : visitorGrid(type.id, 0));
  }, 1600);
}

// Visitors wander between free nooks (or anywhere if the garden is full).
function moveVisitor(initial) {
  const el = view && view.visitorEl;
  if (!el) return;
  const empty = NOOKS.map((n, i) => i).filter((i) => !app.state.decorTiles[i]);
  const pool = empty.length ? empty : NOOKS.map((n, i) => i);
  let spot = pool[Math.floor(Math.random() * pool.length)];
  if (pool.length > 1 && spot === view.visitorSpot) spot = pool[(pool.indexOf(spot) + 1) % pool.length];
  view.visitorSpot = spot;
  const n = NOOKS[spot];
  if (initial) el.style.transition = 'none';
  el.style.left = artPx(n.x - 8);
  el.style.top = artPx(n.y - 15);
  el.style.zIndex = String(11 + n.y);
  if (initial) requestAnimationFrame(() => { el.style.transition = ''; });
}

setInterval(() => {
  if (view && view.visitorEl && Math.random() < 0.5) moveVisitor(false);
}, 5000);

function greet() {
  const res = app.commit((s, now) => G.greetVisitor(s, now));
  if (!res.ok) return;
  sfx('visitor');
  showVisitor(res);
  if (res.coins) flyCoins(view.visitorEl || view.scene, gridURL(uiGrid('coin')), 5);
}

// ---------------------------------------------------------------- hint bar

function updateHint(now) {
  const s = app.state;
  const plots = s.plots.map((p, i) => ({ p, i, st: p.crop ? G.cropStatus(p.crop, now) : null }));
  const ready = plots.filter((x) => x.st && x.st.ready);
  const thirsty = plots.filter((x) => x.st && x.st.open);
  const empty = plots.filter((x) => x.p.unlocked && !x.p.crop);
  const seedCount = SEED_TIERS.reduce((a, t) => a + (s.seeds[t.id] || 0), 0);
  const growing = plots.filter((x) => x.st && !x.st.ready);

  let icon = 'sparkle';
  let text = '';
  let action = null;
  const sig = [];

  if (app.moving != null) {
    icon = 'star';
    text = h('span', {}, h('b', {}, 'Rearranging'), h('br'), 'Decorations score the same wherever they stand.');
  } else if (s.visitor.current) {
    const v = VISITOR_BY_ID[s.visitor.current.type];
    icon = 'heart';
    text = h('span', {}, h('b', {}, `${v.name} is visiting!`), h('br'), 'Tap them to say hello.');
    action = h('button', { class: 'btn small pink', onclick: greet }, 'Say hi');
  } else if (ready.length) {
    icon = 'basket';
    text = h('span', {}, h('b', {}, `${ready.length} crop${ready.length > 1 ? 's' : ''} ready!`), h('br'), 'Tap to harvest and reveal.');
    action = h('button', { class: 'btn small gold', onclick: harvestAll }, ready.length > 1 ? 'Harvest all' : 'Harvest');
  } else if (thirsty.length) {
    icon = 'drop';
    text = h('span', {}, h('b', {}, `${thirsty.length} plant${thirsty.length > 1 ? 's are' : ' is'} thirsty`), h('br'),
      `Water now for ×${WATERING.yieldMult} harvest value.`);
    action = h('button', { class: 'btn small blue', onclick: waterAll }, thirsty.length > 1 ? 'Water all' : 'Water');
  } else if (empty.length && seedCount) {
    icon = 'seed';
    text = h('span', {}, h('b', {}, `${empty.length} empty plot${empty.length > 1 ? 's' : ''}`), h('br'), 'Tap one to plant a mystery seed.');
  } else if (empty.length) {
    icon = 'seed';
    text = h('span', {}, h('b', {}, 'Out of seeds'), h('br'), 'Buy more in the seed shop.');
    action = h('button', { class: 'btn small', onclick: () => app.setTab('seeds') }, 'Seeds');
  } else if (growing.length) {
    icon = 'clock';
    const next = growing.reduce((a, b) => (a.st.harvestAt < b.st.harvestAt ? a : b));
    const water = growing.filter((x) => x.st.upcoming).map((x) => x.st.upcoming.openAt).sort((a, b) => a - b)[0];
    text = h('span', {}, h('b', {}, `Next harvest in ${fmtDuration(next.st.harvestAt - now)}`), h('br'),
      water ? `Next watering in ${fmtDuration(water - now)}` : `Ready at ${fmtClock(next.st.harvestAt)}`);
  } else {
    text = h('span', {}, h('b', {}, 'Your garden awaits'));
  }
  sig.push(icon, typeof text === 'string' ? text : text.textContent, action ? action.textContent : '');
  const key = sig.join('|');
  if (view.hint.dataset.sig === key) return;
  view.hint.dataset.sig = key;
  clear(view.hint);
  view.hint.append(uiImg(icon, '', ''), h('div', { class: 'text' }, text));
  if (action) view.hint.append(action);
  view.hint.querySelector('img').style.cssText = 'width:32px;height:32px;flex:none';
}

// ---------------------------------------------------------------- plot actions

function tileEl(kind, index) {
  return kind === 'plot' ? view.plots[index].el : view.decor[index].el;
}

function tapPlot(i, el) {
  sfx('tap');
  if (app.moving != null) {
    toast('Decorations go on the lawn, not in the beds.');
    return;
  }
  const s = app.state;
  const p = s.plots[i];
  const now = app.now();
  if (!p.unlocked) return openUnlockSheet(i);
  if (!p.crop) return openSeedPicker(i);
  const st = G.cropStatus(p.crop, now);
  if (st.ready) return harvestOne(i, el);
  if (st.open) return waterOne(i, el);
  return openPlotInfo(i);
}

function openUnlockSheet(i) {
  const s = app.state;
  if (G.nextPlotIndex(s) !== i) {
    toast('Unlock the plot with the price tag first.');
    return;
  }
  const price = G.nextPlotPrice(s);
  const entry = openSheet('Expand your garden', h('div', {},
    h('p', {}, 'Clear this patch of weeds to make a new plot. More plots mean more crops growing at once.'),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn plain', onclick: () => closeOverlay(entry) }, 'Not now'),
      h('button', {
        class: 'btn gold', disabled: s.coins < price,
        onclick: () => {
          closeOverlay(entry);
          const r = app.commit((st) => G.unlockPlot(st));
          if (r.ok) { sfx('buy'); toast('New plot unlocked!'); }
        },
      }, 'Unlock ', coinAmount(price)))));
}

export function openSeedPicker(i) {
  const s = app.state;
  const body = h('div', {});
  for (const t of SEED_TIERS) {
    const owned = s.seeds[t.id] || 0;
    const price = G.seedPrice(s, t.id);
    const odds = G.rarityOdds(s, t.id);
    const best = ['ultra', 'legendary', 'epic', 'rare'].filter((r) => odds[r] > 0)
      .map((r) => `${RARITY_INFO[r].name} ${odds[r] < 1 ? odds[r].toFixed(2) : odds[r].toFixed(1)}%`).slice(0, 2).join(' · ');
    const btn = owned
      ? h('button', { class: 'btn small', onclick: () => doPlant(i, t.id, false) }, 'Plant')
      : h('button', { class: 'btn small gold', disabled: s.coins < price, onclick: () => doPlant(i, t.id, true) }, 'Buy ', coinAmount(price));
    body.append(h('div', { class: 'record-row' },
      uiImg(PACKET_FOR_TIER[t.id]),
      h('div', { class: 'grow' }, h('b', {}, t.name), h('span', { class: 'muted small' }, `Owned ×${owned} · ${best}`)),
      btn));
  }
  body.append(h('p', { class: 'muted small' }, 'Every seed is a mystery: check back as it grows and try to guess what it will become. Pricier seeds have better odds.'));
  const entry = openSheet(`Plant in plot ${i + 1}`, body);
  function doPlant(idx, tierId, buy) {
    closeOverlay(entry);
    if (buy) {
      const b = app.commit((st) => G.buySeeds(st, tierId, 1));
      if (!b.ok) return;
    }
    plantSeed(idx, tierId);
  }
}

function plantSeed(i, tierId) {
  const res = app.commit((s, now) => G.plant(s, i, tierId, now));
  if (!res.ok) return;
  sfx('plant');
  justPlanted = i;
  app.refresh();
  showPlanted(res, tierId, {
    onWater: () => waterOne(i, tileEl('plot', i)),
  });
}

function waterOne(i, el) {
  const res = app.commit((s, now) => G.water(s, i, now));
  if (!res.ok) return false;
  sfx('water');
  waterFx(el || tileEl('plot', i));
  return true;
}

function waterAll() {
  const now = app.now();
  const idx = app.state.plots.map((p, i) => i).filter((i) => {
    const p = app.state.plots[i];
    return p.crop && G.cropStatus(p.crop, now).open;
  });
  if (!idx.length) return;
  app.commit((s, t) => {
    idx.forEach((i) => G.water(s, i, t));
    return { ok: true };
  });
  sfx('water');
  idx.forEach((i, k) => setTimeout(() => waterFx(tileEl('plot', i)), k * 120));
}

function harvestOne(i, el) {
  const res = app.commit((s, now) => G.harvest(s, i, now));
  if (!res.ok) return;
  sfx(res.isNew ? 'discover' : 'harvest');
  harvestFx(el || tileEl('plot', i), res.value);
  flyCoins(el, gridURL(uiGrid('coin')), Math.min(10, 3 + Math.floor(Math.log10(res.value + 1) * 2)));
  setTimeout(() => showHarvestResult(res), 350);
}

function harvestAll() {
  const now = app.now();
  const idx = app.state.plots.map((p, i) => i).filter((i) => {
    const p = app.state.plots[i];
    return p.crop && G.cropStatus(p.crop, now).ready;
  });
  if (idx.length === 1) return harvestOne(idx[0], tileEl('plot', idx[0]));
  const results = [];
  app.commit((s, t) => {
    for (const i of idx) {
      const r = G.harvest(s, i, t);
      if (r.ok) results.push(r);
    }
    return { ok: true };
  });
  if (!results.length) return;
  sfx(results.some((r) => r.isNew) ? 'discover' : 'harvest');
  idx.forEach((i, k) => setTimeout(() => harvestFx(tileEl('plot', i), results[k] && results[k].value), k * 90));
  flyCoins(view.scene, gridURL(uiGrid('coin')), 10);
  setTimeout(() => showHarvestSummary(results), 450);
}

const FAMILY_LABELS = {
  bloom: 'Flowers', tall: 'Tall stalks', root: 'Roots', rosette: 'Leafy', bush: 'Bushes', vine: 'Vines',
  fungus: 'Mushrooms', crystal: 'Crystals', cactus: 'Cacti', tree: 'Trees', pod: 'Pods & curls', aquatic: 'Water plants',
};

function stageTrack(stage) {
  return h('div', { class: 'stage-track' }, STAGE_NAMES.map((n, k) => h('span', { class: k < stage ? 'done' : k === stage ? 'now' : '' }, n)));
}

function openPlotInfo(i) {
  const p = app.state.plots[i];
  const c = p.crop;
  const tier = SEED_TIERS.find((t) => t.id === c.tier);
  const body = h('div', {});
  let shownSig = '';
  const live = {};
  const build = (st) => {
    clear(body);
    live.progressText = h('span', {});
    live.bar = h('i', {});
    live.readyIn = h('dd', {});
    live.windows = h('div', {});
    const guessBox = h('div', { class: 'panel guess-panel' });
    const g = c.guess != null ? CROP_BY_ID[c.guess] : null;
    if (st.ready) {
      guessBox.append(h('b', {}, 'It has bloomed!'), h('div', { class: 'small' }, 'Harvest it to find out what it is.'));
    } else if (g) {
      guessBox.append(
        h('div', { class: 'guess-row' }, cropImg(g.id),
          h('div', { class: 'grow' }, h('div', { class: 'muted small' }, 'Your guess'), h('b', {}, g.name),
            h('div', { class: 'small' }, `Locked at ${STAGE_NAMES[c.guessStage].toLowerCase()}: +${Math.round(GUESS_BONUS[c.guessStage] * 100)}% coins if right`))),
        h('div', { class: 'btn-row', style: { marginTop: '8px' } },
          h('button', { class: 'btn small plain', onclick: () => { app.commit((s, t) => G.guessCrop(s, i, null, t)); shownSig = ''; tick(); } }, 'Clear'),
          h('button', { class: 'btn small', onclick: () => openGuessPicker(i, () => { shownSig = ''; tick(); }) }, 'Change guess')));
    } else {
      const canGuess = Object.keys(app.state.discovered).length > 0;
      guessBox.append(
        h('b', {}, 'What do you think it is?'),
        h('div', { class: 'small' }, `Guess now for +${Math.round(GUESS_BONUS[st.stage] * 100)}% coins if you're right. Earlier guesses pay more (seedling & small +${Math.round(GUESS_BONUS[0] * 100)}%, medium +${Math.round(GUESS_BONUS[2] * 100)}%, large +${Math.round(GUESS_BONUS[3] * 100)}%).`),
        canGuess
          ? h('button', { class: 'btn small gold', style: { marginTop: '8px' }, onclick: () => openGuessPicker(i, () => { shownSig = ''; tick(); }) }, 'Make a guess')
          : h('div', { class: 'muted small', style: { marginTop: '6px' } }, 'Discover crops by harvesting them, then you can start guessing.'));
    }
    body.append(
      h('div', { class: 'detail-head' },
        stageImg(c.cropId, st.stage),
        h('div', {},
          h('div', { style: { fontSize: '18px', fontWeight: 700 } }, 'Mystery plant'),
          h('div', { class: 'small', style: { margin: '4px 0' } }, STAGE_NAMES[st.stage]),
          h('div', { class: 'muted small' }, live.progressText),
          h('div', { class: 'muted small', style: { display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' } },
            uiImg(PACKET_FOR_TIER[tier.id], 'mini'), `From a ${tier.name}`))),
      stageTrack(st.stage),
      h('div', { class: 'progress', style: { marginTop: '8px' } }, live.bar),
      h('dl', { class: 'kv' },
        h('dt', {}, 'Ready in'), live.readyIn,
        h('dt', {}, 'Ready at'), h('dd', {}, fmtClock(st.harvestAt)),
        h('dt', {}, 'Waterings'), h('dd', {}, `${G.waterCount(c)} / ${WATERING.checkpoints.length}`),
        h('dt', {}, 'Planted'), h('dd', {}, fmtClock(c.plantedAt))),
      guessBox,
      h('h3', { style: { margin: '12px 0 4px' } }, 'Watering schedule'),
      live.windows,
      h('p', { class: 'muted small' }, `Each watering gives ×${WATERING.yieldMult} harvest value and makes the crop grow ${Math.round((1 - WATERING.timeMult) * 100)}% faster. Missing a window never hurts your crop.`),
    );
  };
  const tick = () => {
    const now = app.now();
    if (!p.crop || p.crop !== c) { closeOverlay(entry); return; }
    const st = G.cropStatus(c, now);
    const sig = `${st.stage}|${st.ready}|${c.guess}|${c.guessStage}|${G.waterCount(c)}`;
    if (sig !== shownSig) { shownSig = sig; build(st); }
    live.progressText.textContent = `${Math.floor(st.progress * 100)}% grown`;
    live.bar.style.width = `${st.progress * 100}%`;
    live.readyIn.textContent = st.ready ? 'Now!' : fmtDuration(st.harvestAt - now);
    clear(live.windows);
    for (const w of st.windows.filter((x) => x.valid)) {
      let label;
      if (w.watered) label = '✓ Watered';
      else if (now >= w.closeAt) label = 'Missed (no penalty)';
      else if (now >= w.openAt) label = `Open now · closes in ${fmtDuration(w.closeAt - now)}`;
      else label = `Opens in ${fmtDuration(w.openAt - now)} (${fmtClock(w.openAt)})`;
      live.windows.append(h('div', { class: 'bonus-row' }, h('span', {}, uiImg('drop', 'mini'), ` Checkpoint ${w.index + 1}`), h('span', { class: 'small' }, label)));
    }
  };
  const entry = openSheet('Growing plot', body, { onClose: () => clearInterval(timer) });
  tick();
  const timer = setInterval(tick, 1000);
}

// Pick a guess from the crops already discovered.
function openGuessPicker(i, onDone) {
  const s = app.state;
  const found = Object.keys(s.discovered).map((id) => CROP_BY_ID[id]).sort((a, b) => a.id - b.id);
  let family = 'all';
  const grid = h('div', { class: 'dex-grid' });
  const chips = h('div', { class: 'filters' });
  const fams = [...new Set(found.map((c) => familyOf(c.id)))];
  const renderGrid = () => {
    clear(chips);
    for (const f of ['all', ...fams]) {
      chips.append(h('button', { class: `chip${family === f ? ' on' : ''}`, onclick: () => { family = f; renderGrid(); } }, f === 'all' ? `All ${found.length}` : FAMILY_LABELS[f]));
    }
    clear(grid);
    for (const c of found.filter((x) => family === 'all' || familyOf(x.id) === family)) {
      grid.append(h('button', {
        class: 'dex-card', 'aria-label': `Guess ${c.name}`,
        onclick: () => {
          closeOverlay(entry);
          const r = app.commit((st, now) => G.guessCrop(st, i, c.id, now));
          if (r.ok && !r.unchanged) { sfx('place'); toast(`Guessed ${c.name}!`); }
          if (onDone) onDone();
        },
      }, h('span', { class: 'num' }, String(c.id).padStart(3, '0')), cropImg(c.id), h('span', { class: 'dex-name' }, c.name)));
    }
  };
  renderGrid();
  const entry = openSheet('What is it growing into?', h('div', {},
    h('p', { class: 'muted small', style: { marginTop: 0 } }, 'Pick from crops you have discovered. Study their growth stages in the Collection to get better at this!'),
    chips, grid));
}

// ---------------------------------------------------------------- decor actions

function tapDecor(i, el) {
  sfx('tap');
  const s = app.state;
  if (app.moving != null) {
    const from = app.moving;
    app.moving = null;
    const res = app.commit((st) => G.moveDecor(st, from, i));
    sizeScene();
    app.refresh();
    if (res.ok && from !== i) { sfx('place'); sparkFx(el); }
    return;
  }
  const id = s.decorTiles[i];
  if (!id) return;
  const d = DECOR_BY_ID[id];
  const set = G.setProgress(s).find((x) => x.items.includes(id));
  const entry = openSheet(d.name, h('div', {},
    h('div', { class: 'detail-head' }, decorImg(id),
      h('div', {}, rarityTag(d.rarity), h('p', { class: 'muted small' }, d.desc), h('div', { class: 'small' }, `Base score +${d.score}`))),
    set ? setPanel(set) : null,
    h('div', { class: 'btn-row', style: { marginTop: '12px' } },
      h('button', { class: 'btn plain', onclick: () => { closeOverlay(entry); app.commit((st) => G.removeDecor(st, i)); toast(`${d.name} moved to storage.`); } }, 'Store'),
      h('button', { class: 'btn', onclick: () => { closeOverlay(entry); app.moving = i; sizeScene(); app.refresh(); } }, 'Move'))));
}

// A small panel showing a matching set's pieces.
export function setPanel(set) {
  return h('div', { class: `panel set-panel${set.complete ? ' complete' : ''}` },
    h('div', { class: 'set-head' }, h('b', {}, set.name), h('span', { class: 'small' }, set.complete ? `Complete! +${set.bonus} score` : `${set.have.length}/${set.items.length} · +${set.bonus} when complete`)),
    h('div', { class: 'set-items' }, set.items.map((id) => {
      const im = decorImg(id, set.have.includes(id) ? '' : 'missing', DECOR_BY_ID[id].name);
      im.title = DECOR_BY_ID[id].name;
      return im;
    })));
}

// Put a stored decoration into the garden automatically and show it there.
export function placeNow(id, { goToGarden = true } = {}) {
  const doneBefore = new Set(G.setProgress(app.state).filter((x) => x.complete).map((x) => x.id));
  const res = app.commit((st, now) => G.autoPlaceDecor(st, id, now));
  if (!res.ok) return res;
  sfx('place');
  if (goToGarden) {
    closeAllOverlays();
    app.setTab('garden');
    requestAnimationFrame(() => view && sparkFx(view.decor[res.nook].el, 10));
  }
  for (const set of G.setProgress(app.state)) {
    if (set.complete && !doneBefore.has(set.id)) { sfx('bonus'); toast(`${set.name} complete! +${set.bonus} score`); }
  }
  if (res.awards && res.awards.length) showBonusAwards(res.awards);
  return res;
}

// ---------------------------------------------------------------- effects

function relPos(el) {
  const sr = view.scene.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height };
}

function waterFx(el) {
  if (!el || !view) return;
  const p = relPos(el);
  const can = img(uiGrid('watering-can'), 'fx-can');
  can.style.left = `${p.x + p.w * 0.35}px`;
  can.style.top = `${p.y - p.h * 0.45}px`;
  view.fx.append(can);
  for (let k = 0; k < 7; k++) {
    const d = h('i', { class: 'fx-drop' });
    d.style.left = `${p.x + p.w * (0.25 + Math.random() * 0.4)}px`;
    d.style.top = `${p.y + p.h * 0.05}px`;
    d.style.animationDelay = `${0.35 + k * 0.08}s`;
    view.fx.append(d);
    setTimeout(() => d.remove(), 1400);
  }
  setTimeout(() => can.remove(), 1100);
}

function sparkFx(el, n = 8) {
  if (!el || !view) return;
  const p = relPos(el);
  for (let k = 0; k < n; k++) {
    const s = img(uiGrid('sparkle'), 'fx-spark');
    const a = (k / n) * Math.PI * 2;
    s.style.left = `${p.x + p.w / 2 - 7}px`;
    s.style.top = `${p.y + p.h / 2 - 7}px`;
    s.style.setProperty('--dx', `${Math.cos(a) * p.w * 0.6}px`);
    s.style.setProperty('--dy', `${Math.sin(a) * p.h * 0.6}px`);
    view.fx.append(s);
    setTimeout(() => s.remove(), 900);
  }
}

function harvestFx(el, value) {
  if (!el || !view) return;
  sparkFx(el, 10);
  if (value) {
    const p = relPos(el);
    const t = h('div', { class: 'fx-float-text' }, `+${fmtNum(value)}`);
    t.style.left = `${p.x + p.w / 2}px`;
    t.style.top = `${p.y}px`;
    view.fx.append(t);
    setTimeout(() => t.remove(), 1300);
  }
}
