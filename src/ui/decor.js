// Decor screen: buy decorations, manage storage, see score thresholds.
import { h, clear } from './dom.js';
import { app, toast } from './app.js';
import * as G from '../core/game.js';
import { SCORE_THRESHOLDS, RARITIES, DUPLICATE_FALLOFF } from '../data/config.js';
import { DECORATIONS } from '../data/decorations.js';
import { CROP_BY_ID, ULTRA_TROPHY } from '../data/crops.js';
import { decorImg, rarityTag, coinAmount } from './render.js';
import { startPlacing } from './garden.js';
import { sfx } from './audio.js';

let tab = 'shop';

export function render(root) {
  const s = app.state;
  const score = G.decorScore(s);
  const next = G.nextThreshold(s);
  const prev = SCORE_THRESHOLDS[s.thresholdsAwarded - 1] || 0;
  const pct = next ? Math.min(100, ((s.bestScore - prev) / (next - prev)) * 100) : 100;
  const wrap = h('div', { class: 'screen-pad' });

  wrap.append(h('div', { class: 'panel' },
    h('h2', {}, 'Decorations'),
    h('div', { style: { display: 'flex', justifyContent: 'space-between' } },
      h('b', {}, `Garden score: ${score}`), h('span', { class: 'muted small' }, `Best: ${s.bestScore}`)),
    h('div', { class: 'progress', style: { margin: '6px 0' } }, h('i', { style: { width: `${pct}%`, background: '#ffd23f' } })),
    h('div', { class: 'muted small' }, next
      ? `Next random garden bonus at ${next} (best score counts). ${s.thresholdsAwarded}/${SCORE_THRESHOLDS.length} bonuses earned.`
      : 'Every threshold reached. What a garden!'),
    h('div', { class: 'threshold-list' }, SCORE_THRESHOLDS.map((t, i) => h('span', { class: i < s.thresholdsAwarded ? 'done' : '' }, t))),
    h('p', { class: 'muted small', style: { marginBottom: 0 } },
      `Only placed decorations count. Each extra copy of the same item counts ×${DUPLICATE_FALLOFF} of the previous one, so variety scores best.`)));

  const tabs = h('div', { class: 'tabs' });
  for (const [k, label] of [['shop', 'Shop'], ['owned', 'My items'], ['trophies', 'Trophies']]) {
    tabs.append(h('button', { class: `chip${tab === k ? ' on' : ''}`, onclick: () => { tab = k; clear(root); render(root); } }, label));
  }
  wrap.append(tabs);

  const grid = h('div', { class: 'decor-grid' });
  const placed = G.placedCounts(s);
  const freeSpots = s.decorTiles.filter((t) => !t).length;

  if (tab === 'shop') {
    const items = DECORATIONS.filter((d) => !d.trophy).sort((a, b) => RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity) || a.price - b.price);
    for (const d of items) {
      const price = G.decorPrice(s, d.id);
      const owned = s.decorOwned[d.id] || 0;
      const avail = G.availableDecor(s, d.id);
      grid.append(card(d, `Score +${d.score} · owned ${owned}`,
        h('div', { class: 'btn-row' },
          h('button', {
            class: 'btn gold', disabled: s.coins < price,
            onclick: () => {
              const r = app.commit((st) => G.buyDecor(st, d.id));
              if (r.ok) { sfx('buy'); toast(`Bought ${d.name}!`); }
            },
          }, coinAmount(price)),
          avail > 0 ? h('button', { class: 'btn', onclick: () => place(d.id, freeSpots) }, 'Place') : null)));
    }
  } else if (tab === 'owned') {
    const items = DECORATIONS.filter((d) => s.decorOwned[d.id]);
    if (!items.length) wrap.append(h('p', { class: 'muted' }, 'Nothing yet. Buy decorations in the shop.'));
    for (const d of items) {
      const avail = G.availableDecor(s, d.id);
      grid.append(card(d, `Placed ${placed[d.id] || 0} · in storage ${avail}`,
        avail > 0 ? h('button', { class: 'btn', onclick: () => place(d.id, freeSpots) }, 'Place') : h('div', { class: 'muted small' }, 'All placed')));
    }
  } else {
    wrap.append(h('p', { class: 'muted small' }, 'The first harvest of each ultra-rare crop awards its unique decoration. They cannot be bought.'));
    for (const [cropId, id] of Object.entries(ULTRA_TROPHY)) {
      const d = DECORATIONS.find((x) => x.id === id);
      const have = !!s.decorOwned[id];
      const avail = G.availableDecor(s, id);
      grid.append(card(d, have ? `Score +${d.score}` : `Harvest a ${CROP_BY_ID[cropId].name}`,
        have ? (avail > 0 ? h('button', { class: 'btn', onclick: () => place(id, freeSpots) }, 'Place') : h('div', { class: 'muted small' }, 'Placed in garden')) : h('div', { class: 'muted small' }, 'Locked'),
        !have));
    }
  }
  wrap.append(grid);
  root.append(wrap);
}

function card(d, meta, actions, locked = false) {
  return h('div', { class: `decor-card${locked ? ' locked' : ''}` },
    h('div', { class: 'top' }, decorImg(d.id),
      h('div', {}, h('div', { class: 'name' }, locked ? '???' : d.name), rarityTag(d.rarity))),
    h('div', { class: 'meta' }, meta),
    actions);
}

function place(id, freeSpots) {
  if (!freeSpots) toast('Garden is full: tap a decoration to swap it.');
  startPlacing(id);
}
