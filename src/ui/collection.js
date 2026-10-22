// Collection: the 100-crop discovery log.
import { h, clear } from './dom.js';
import { app, openSheet } from './app.js';
import * as G from '../core/game.js';
import { RARITIES, RARITY_INFO, SEED_TIERS } from '../data/config.js';
import { CROPS } from '../data/crops.js';
import { PACKET_FOR_TIER } from '../art/uiArt.js';
import { cropImg, stageImg, uiImg, rarityTag, stars, fmtNum, fmtDate, rarityColor } from './render.js';
import { STAGE_NAMES } from '../art/sprites.js';

let filter = 'all';

export function render(root) {
  const s = app.state;
  const prog = G.collectionProgress(s);
  const wrap = h('div', { class: 'screen-pad' });
  wrap.append(h('div', { class: 'panel' },
    h('h2', {}, 'Collection'),
    h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '6px' } },
      h('b', {}, `${prog.found} / ${prog.total} discovered`), h('span', {}, `${prog.pct}%`)),
    h('div', { class: 'progress' }, h('i', { style: { width: `${prog.pct}%` } }))));

  const chips = h('div', { class: 'filters' });
  const addChip = (key, label) => chips.append(h('button', {
    class: `chip${filter === key ? ' on' : ''}`,
    onclick: () => { filter = key; clear(root); render(root); },
  }, label));
  addChip('all', `All ${prog.found}/100`);
  for (const r of RARITIES) {
    const all = CROPS.filter((c) => c.rarity === r);
    addChip(r, `${RARITY_INFO[r].name} ${all.filter((c) => s.discovered[c.id]).length}/${all.length}`);
  }
  addChip('found', 'Found');
  addChip('missing', 'Missing');
  wrap.append(chips);

  const grid = h('div', { class: 'dex-grid' });
  for (const c of CROPS) {
    const found = !!s.discovered[c.id];
    if (filter === 'found' && !found) continue;
    if (filter === 'missing' && found) continue;
    if (RARITIES.includes(filter) && c.rarity !== filter) continue;
    const card = h('button', {
      class: `dex-card ${found ? '' : 'locked'} ${c.rarity === 'ultra' ? 'ultra' : ''}`,
      style: { '--c': rarityColor(c.rarity) },
      'aria-label': found ? c.name : `Undiscovered #${c.id}`,
      onclick: () => (found ? openDetail(c) : openLocked(c)),
    },
    h('span', { class: 'num' }, String(c.id).padStart(3, '0')),
    found ? cropImg(c.id) : h('span', { class: 'q' }, '?'));
    grid.append(card);
  }
  wrap.append(grid);
  root.append(wrap);
}

function oddsTable(c) {
  const table = h('table', { class: 'odds-table' });
  for (const o of G.cropTierOdds(c)) {
    const t = SEED_TIERS.find((x) => x.id === o.tier);
    table.append(h('tr', {},
      h('td', {}, uiImg(PACKET_FOR_TIER[t.id]), ` ${t.name}`),
      h('td', {}, o.pct === 0 ? (c.minTier > t.tier ? 'not found in this seed' : '—') : `${o.pct < 0.01 ? o.pct.toFixed(4) : o.pct < 1 ? o.pct.toFixed(2) : o.pct.toFixed(1)}%`)));
  }
  return table;
}

function openDetail(c) {
  const d = app.state.discovered[c.id];
  openSheet(null, h('div', {},
    h('div', { class: 'detail-head' }, cropImg(c.id),
      h('div', {},
        h('div', { class: 'muted small' }, `#${String(c.id).padStart(3, '0')} · ${c.category}`),
        h('div', { style: { fontSize: '20px', fontWeight: 700 } }, c.name),
        h('div', { style: { margin: '4px 0' } }, rarityTag(c.rarity), ' ', stars(c.rarity)),
        h('div', { class: 'small' }, `“${c.desc}”`))),
    h('dl', { class: 'kv' },
      h('dt', {}, 'Base grow time'), h('dd', {}, `${c.hours} hour${c.hours === 1 ? '' : 's'}`),
      h('dt', {}, 'Base value'), h('dd', {}, `${fmtNum(c.value)} coins`),
      h('dt', {}, 'Times harvested'), h('dd', {}, d.count),
      h('dt', {}, 'Best yield'), h('dd', {}, `${fmtNum(d.best)} coins`),
      h('dt', {}, 'Total earned'), h('dd', {}, `${fmtNum(d.total)} coins`),
      h('dt', {}, 'First discovered'), h('dd', {}, fmtDate(d.firstAt))),
    h('h3', { style: { margin: '12px 0 0' } }, 'How it grows'),
    h('div', { class: 'muted small' }, 'Learn these stages to guess crops before they bloom.'),
    h('div', { class: 'growth-strip' }, STAGE_NAMES.map((n, k) => h('div', {}, stageImg(c.id, k), n))),
    h('h3', { style: { margin: '12px 0 0' } }, 'Seed odds'),
    h('div', { class: 'muted small' }, 'Base chance per seed (before bonuses and the discovery boost).'),
    oddsTable(c)));
}

function openLocked(c) {
  const info = RARITY_INFO[c.rarity];
  const best = [...G.cropTierOdds(c)].sort((a, b) => b.pct - a.pct)[0];
  const tier = SEED_TIERS.find((t) => t.id === best.tier);
  openSheet(`#${String(c.id).padStart(3, '0')} · Undiscovered`, h('div', {},
    h('p', {}, 'This ', rarityTag(c.rarity), ` crop hasn't been discovered yet.`),
    h('p', { class: 'muted small' }, `Best chance: ${tier.name}. ${c.rarity === 'ultra' ? 'Ultra-rare harvests also award a unique decoration!' : `${info.name} crops are ${info.stars <= 2 ? 'common in cheaper seeds' : 'more likely in pricier seeds'}.`}`)));
}
