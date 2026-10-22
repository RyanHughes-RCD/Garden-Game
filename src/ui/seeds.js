// Seed shop: buy seeds from the price tiers, with transparent rarity odds.
import { h } from './dom.js';
import { app, toast } from './app.js';
import * as G from '../core/game.js';
import { SEED_TIERS, RARITIES, RARITY_INFO, DISCOVERY_WEIGHT } from '../data/config.js';
import { CROPS } from '../data/crops.js';
import { PACKET_FOR_TIER } from '../art/uiArt.js';
import { uiImg, coinAmount, fmtNum } from './render.js';
import { sfx } from './audio.js';

function pct(v) {
  if (v === 0) return '0%';
  if (v < 0.1) return `${v.toFixed(3).replace(/0+$/, '')}%`;
  if (v < 1) return `${v.toFixed(2).replace(/0+$/, '')}%`;
  return `${Math.round(v * 10) / 10}%`;
}

export function render(root) {
  const s = app.state;
  const wrap = h('div', { class: 'screen-pad' });
  wrap.append(h('div', { class: 'panel' },
    h('h2', {}, 'Seed Shop'),
    h('p', { class: 'muted small', style: { margin: 0 } },
      'Every seed is a mystery. Pricier seeds roll rarer crops more often, but nothing is ever guaranteed. ',
      `Within a rarity, crops you haven't discovered yet are ${DISCOVERY_WEIGHT}× more likely.`)));

  for (const t of SEED_TIERS) {
    const price = G.seedPrice(s, t.id);
    const odds = G.rarityOdds(s, t.id);
    const owned = s.seeds[t.id] || 0;
    const { ev } = G.expectedSeedValue(t.id);
    const eligible = CROPS.filter((c) => c.minTier <= t.tier && (t.odds[c.rarity] || 0) > 0);
    const undiscovered = eligible.filter((c) => !s.discovered[c.id]).length;
    const bar = h('div', { class: 'odds-bar' });
    const legend = h('div', { class: 'odds-legend' });
    for (const r of RARITIES) {
      if (!odds[r]) continue;
      const seg = h('i', { style: { width: `${Math.max(odds[r], 0.8)}%`, background: RARITY_INFO[r].color } });
      if (r === 'ultra') seg.className = 'ultra-bg';
      bar.append(seg);
      legend.append(h('span', { class: r, style: { '--c': RARITY_INFO[r].color } }, `${RARITY_INFO[r].name} ${pct(odds[r])}`));
    }
    const buy = (n) => {
      const res = app.commit((st) => G.buySeeds(st, t.id, n));
      if (res.ok) {
        sfx('buy');
        toast(`Bought ${n} ${t.name}${n > 1 ? 's' : ''}!`);
      }
    };
    wrap.append(h('div', { class: 'panel tier-card' },
      uiImg(PACKET_FOR_TIER[t.id], 'pk'),
      h('div', {},
        h('h3', {}, h('span', {}, t.name), coinAmount(price, t.price)),
        h('div', { class: 'owned' }, `Owned ×${owned} · avg harvest ~${fmtNum(ev)} · ${undiscovered}/${eligible.length} undiscovered`),
        h('div', { class: 'muted small' }, t.blurb),
        bar, legend,
        h('div', { class: 'btn-row', style: { marginTop: '8px' } },
          h('button', { class: 'btn small', disabled: s.coins < price, onclick: () => buy(1) }, 'Buy 1'),
          h('button', { class: 'btn small gold', disabled: s.coins < price * 5, onclick: () => buy(5) }, 'Buy 5 ', coinAmount(price * 5))))));
  }

  const plantable = s.plots.some((p) => p.unlocked && !p.crop) && SEED_TIERS.some((t) => s.seeds[t.id] > 0);
  if (plantable) {
    wrap.append(h('button', { class: 'btn block', onclick: () => app.setTab('garden') }, 'Go plant them!'));
  }
  root.append(wrap);
}
