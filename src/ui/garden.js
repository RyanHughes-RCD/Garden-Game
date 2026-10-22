// Garden screen: the 5x7 tile scene with plots, decorations and visitors.
import { h, clear } from './dom.js';
import { app, openSheet, closeOverlay, closeAllOverlays, toast, flyCoins } from './app.js';
import * as G from '../core/game.js';
import { DECOR_TILES } from '../core/state.js';
import { PLOT_TILES, GARDEN_COLS, GARDEN_ROWS, SEED_TIERS, MINUTE, RARITY_INFO, WATERING } from '../data/config.js';
import { CROP_BY_ID } from '../data/crops.js';
import { DECOR_BY_ID, DECORATIONS } from '../data/decorations.js';
import { VISITOR_BY_ID } from '../data/visitors.js';
import { uiGrid, visitorGrid } from '../art/sprites.js';
import { PACKET_FOR_TIER } from '../art/uiArt.js';
import {
  img, uiImg, stageImg, decorImg, visitorImg, gridURL, coinAmount, fmtDuration, fmtClock, rarityTag, stars, fmtNum,
} from './render.js';
import { showPlantReveal, showHarvestResult, showHarvestSummary, showVisitor, showBonusAwards } from './modals.js';
import { sfx } from './audio.js';

const tileMap = new Map(); // "x,y" -> { kind: 'plot'|'decor', index }
PLOT_TILES.forEach(([x, y], i) => tileMap.set(`${x},${y}`, { kind: 'plot', index: i }));
DECOR_TILES.forEach(([x, y], i) => tileMap.set(`${x},${y}`, { kind: 'decor', index: i }));

const GRASS = ['grass1', 'grass2', 'grass3'];
const grassFor = (x, y) => GRASS[(x * 7 + y * 13 + ((x * y) % 3)) % 3];

let view = null; // { root, scene, tiles: Map, hint, fx, visitorEl }
let justPlanted = -1;

export function render(root) {
  const wrap = h('div', { class: 'garden-wrap' });
  const banner = h('div', { class: 'place-banner', hidden: true });
  const scene = h('div', { class: 'scene' });
  const fx = h('div', { class: 'fx-layer' });
  const frame = h('div', { class: 'scene-frame' }, scene);
  scene.append(fx);
  const hint = h('div', { class: 'garden-hint' });
  wrap.append(banner, frame, hint);
  root.append(wrap);

  view = { root, wrap, scene, frame, fx, hint, banner, tiles: new Map(), visitorEl: null, visitorSpot: -1 };
  for (let y = 0; y < GARDEN_ROWS; y++) {
    for (let x = 0; x < GARDEN_COLS; x++) {
      const el = h('div', { class: 'tile' });
      el.style.backgroundImage = `url(${gridURL(uiGrid(grassFor(x, y)))})`;
      scene.insertBefore(el, fx);
      view.tiles.set(`${x},${y}`, { el, sig: '' });
    }
  }
  sizeScene();
  update(root);
}

export function sizeScene() {
  if (!view) return;
  const root = view.root;
  const bannerH = app.placing ? 64 : 0;
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
  if (!p.crop) return `empty|${app.placing ? 'p' : ''}`;
  const st = G.cropStatus(p.crop, now);
  const last = Math.max(0, ...p.crop.waters.filter((w) => w != null));
  const wet = last && now - last < 40 * MINUTE;
  return `crop|${p.crop.cropId}|${p.crop.plantedAt}|${st.stage}|${st.ready}|${!!st.open}|${wet}`;
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
  const rarity = CROP_BY_ID[c.cropId].rarity;
  els.push(h('i', { class: `rarity-dot ${rarity}`, style: { '--c': RARITY_INFO[rarity].color } }));
  if (st.ready) {
    els.push(h('div', { class: 'badge ready' }, uiImg('basket')));
  } else {
    if (st.open) els.push(h('div', { class: 'badge water' }, uiImg('drop')));
    els.push(h('div', { class: 'bar' }, h('i', { style: { width: `${Math.round(st.progress * 100)}%` } })));
  }
  return { els, cls: st.ready ? 'ready' : 'growing' };
}

function decorSig(i) {
  return `d|${app.state.decorTiles[i] || ''}|${app.placing || ''}`;
}

function buildDecor(i) {
  const id = app.state.decorTiles[i];
  const els = [];
  let cls = id ? 'decor' : 'decor-empty';
  if (id) els.push(decorImg(id, 'layer'));
  if (app.placing) cls += id ? ' placing-swap' : ' placing';
  return { els, cls };
}

export function update(root) {
  if (!view || view.root !== root || !root.contains(view.wrap)) return;
  const now = app.now();
  const s = app.state;

  // placement banner
  if (app.placing) {
    const d = DECOR_BY_ID[app.placing];
    clear(view.banner);
    view.banner.hidden = false;
    view.banner.append(decorImg(d.id), h('div', { class: 'text' }, h('b', {}, `Placing: ${d.name}`), h('br'), `Tap a spot. ${G.availableDecor(s, d.id)} left to place.`),
      h('button', { class: 'btn small plain', onclick: () => { app.placing = null; sizeScene(); app.refresh(); } }, 'Done'));
  } else {
    view.banner.hidden = true;
  }

  for (const [key, t] of view.tiles) {
    const info = tileMap.get(key);
    const sig = info.kind === 'plot' ? plotSig(info.index, now) : decorSig(info.index);
    if (sig !== t.sig) {
      t.sig = sig;
      const built = info.kind === 'plot' ? buildPlot(info.index, now) : buildDecor(info.index);
      clear(t.el);
      t.el.className = `tile ${info.kind} ${built.cls}`;
      if (info.kind === 'plot' && info.index === justPlanted) {
        t.el.classList.add('just-planted');
        justPlanted = -1;
      }
      t.el.append(...built.els, h('button', {
        class: 'hit',
        'aria-label': info.kind === 'plot' ? `Plot ${info.index + 1}` : `Decoration spot ${info.index + 1}`,
        onclick: () => (info.kind === 'plot' ? tapPlot(info.index, t.el) : tapDecor(info.index, t.el)),
      }));
    } else if (info.kind === 'plot') {
      const p = s.plots[info.index];
      const bar = t.el.querySelector('.bar i');
      if (bar && p.crop) bar.style.width = `${Math.round(G.cropStatus(p.crop, now).progress * 100)}%`;
    }
  }
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

function moveVisitor(initial) {
  const el = view && view.visitorEl;
  if (!el) return;
  const empty = DECOR_TILES.map((t, i) => i).filter((i) => !app.state.decorTiles[i]);
  const pool = empty.length ? empty : DECOR_TILES.map((t, i) => i);
  let spot = pool[Math.floor(Math.random() * pool.length)];
  if (pool.length > 1 && spot === view.visitorSpot) spot = pool[(pool.indexOf(spot) + 1) % pool.length];
  view.visitorSpot = spot;
  const [x, y] = DECOR_TILES[spot];
  if (initial) el.style.transition = 'none';
  el.style.left = `calc(var(--tile) * ${x})`;
  el.style.top = `calc(var(--tile) * ${y})`;
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

  if (app.placing) {
    icon = 'star';
    text = h('span', {}, h('b', {}, 'Decorating'), h('br'), 'Each decoration adds to your score. Duplicates count for less.');
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
  const pos = kind === 'plot' ? PLOT_TILES[index] : DECOR_TILES[index];
  return view.tiles.get(`${pos[0]},${pos[1]}`).el;
}

function tapPlot(i, el) {
  sfx('tap');
  if (app.placing) {
    toast('Decorations go on the grass, not in plots.');
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
  body.append(h('p', { class: 'muted small' }, 'The crop stays a mystery until it blooms. Pricier seeds have better odds.'));
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
  showPlantReveal(res, tierId, {
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

function openPlotInfo(i) {
  const p = app.state.plots[i];
  const c = p.crop;
  const crop = CROP_BY_ID[c.cropId];
  const body = h('div', {});
  const refreshBody = () => {
    const now = app.now();
    if (!p.crop || p.crop !== c) { closeOverlay(entry); return; }
    const st = G.cropStatus(c, now);
    clear(body);
    const stageNames = ['Seed', 'Sprout', 'Young plant', 'Budding', 'Ready!'];
    body.append(
      h('div', { class: 'detail-head' },
        stageImg(c.cropId, st.stage),
        h('div', {},
          h('div', { style: { fontSize: '18px', fontWeight: 700 } }, 'Mystery crop'),
          h('div', { style: { margin: '4px 0' } }, rarityTag(crop.rarity), ' ', stars(crop.rarity)),
          h('div', { class: 'muted small' }, `${stageNames[st.stage]} · ${Math.floor(st.progress * 100)}% grown`))),
      h('div', { class: 'progress', style: { marginTop: '10px' } }, h('i', { style: { width: `${st.progress * 100}%` } })),
      h('dl', { class: 'kv' },
        h('dt', {}, 'Ready in'), h('dd', {}, st.ready ? 'Now!' : fmtDuration(st.harvestAt - now)),
        h('dt', {}, 'Harvest at'), h('dd', {}, fmtClock(st.harvestAt)),
        h('dt', {}, 'Waterings'), h('dd', {}, `${G.waterCount(c)} / ${WATERING.checkpoints.length}`),
        h('dt', {}, 'Planted'), h('dd', {}, fmtClock(c.plantedAt))),
      h('h3', { style: { margin: '12px 0 4px' } }, 'Watering schedule'),
      ...st.windows.filter((w) => w.valid).map((w) => {
        let label;
        if (w.watered) label = '✓ Watered';
        else if (now >= w.closeAt) label = 'Missed (no penalty)';
        else if (now >= w.openAt) label = `Open now · closes in ${fmtDuration(w.closeAt - now)}`;
        else label = `Opens in ${fmtDuration(w.openAt - now)} (${fmtClock(w.openAt)})`;
        return h('div', { class: 'bonus-row' }, h('span', {}, uiImg('drop'), ` Checkpoint ${w.index + 1}`), h('span', { class: 'small' }, label));
      }),
      h('p', { class: 'muted small' }, `Each watering gives ×${WATERING.yieldMult} harvest value and makes the crop grow ${Math.round((1 - WATERING.timeMult) * 100)}% faster. Missing a window never hurts your crop.`),
    );
    body.querySelectorAll('.bonus-row img').forEach((im) => { im.style.width = '16px'; im.style.verticalAlign = 'middle'; });
  };
  const entry = openSheet('Growing plot', body, { onClose: () => clearInterval(timer) });
  refreshBody();
  const timer = setInterval(refreshBody, 1000);
}

// ---------------------------------------------------------------- decor actions

function tapDecor(i, el) {
  sfx('tap');
  const s = app.state;
  if (app.placing) {
    const id = app.placing;
    const res = app.commit((st, now) => G.placeDecor(st, i, id, now));
    if (!res.ok) return;
    sfx('place');
    sparkFx(el);
    if (G.availableDecor(app.state, id) < 1) {
      app.placing = null;
      sizeScene();
      app.refresh();
    }
    if (res.awards && res.awards.length) showBonusAwards(res.awards);
    return;
  }
  const id = s.decorTiles[i];
  if (!id) return openPlaceList(i);
  const d = DECOR_BY_ID[id];
  const entry = openSheet(d.name, h('div', {},
    h('div', { class: 'detail-head' }, decorImg(id),
      h('div', {}, rarityTag(d.rarity), h('p', { class: 'muted small' }, d.desc), h('div', { class: 'small' }, `Base score +${d.score}`))),
    h('div', { class: 'btn-row', style: { marginTop: '12px' } },
      h('button', { class: 'btn plain', onclick: () => { closeOverlay(entry); app.commit((st) => G.removeDecor(st, i)); toast(`${d.name} moved to storage.`); } }, 'Store'),
      h('button', { class: 'btn', onclick: () => { closeOverlay(entry); openPlaceList(i); } }, 'Swap'))));
}

function openPlaceList(i) {
  const s = app.state;
  const avail = DECORATIONS.filter((d) => G.availableDecor(s, d.id) > 0);
  const body = h('div', {});
  if (!avail.length) {
    body.append(h('p', {}, 'You have no decorations in storage. Buy some in the Decor shop!'),
      h('button', { class: 'btn block gold', onclick: () => { closeAllOverlays(); app.setTab('decor'); } }, 'Open Decor shop'));
  } else {
    const grid = h('div', { class: 'decor-grid' });
    for (const d of avail) {
      grid.append(h('button', {
        class: 'decor-card', style: { textAlign: 'left' },
        onclick: () => {
          closeOverlay(entry);
          const res = app.commit((st, now) => G.placeDecor(st, i, d.id, now));
          if (res.ok) {
            sfx('place');
            sparkFx(tileEl('decor', i));
            if (res.awards && res.awards.length) showBonusAwards(res.awards);
          }
        },
      }, h('div', { class: 'top' }, decorImg(d.id), h('div', {}, h('div', { class: 'name' }, d.name), h('div', { class: 'meta' }, `×${G.availableDecor(s, d.id)} · +${d.score}`)))));
    }
    body.append(grid);
  }
  const entry = openSheet('Place a decoration', body);
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

export function startPlacing(id) {
  app.placing = id;
  closeAllOverlays();
  app.setTab('garden');
  sizeScene();
  app.refresh();
}
