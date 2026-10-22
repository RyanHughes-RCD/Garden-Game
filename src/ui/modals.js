// Celebration and event modals: planting, harvest, visitors, bonuses.
import { h } from './dom.js';
import { app, openModal, closeOverlay } from './app.js';
import * as G from '../core/game.js';
import { RARITY_INFO, BONUS_TYPES, WATERING, SEED_TIERS } from '../data/config.js';
import { CROP_BY_ID } from '../data/crops.js';
import { DECOR_BY_ID } from '../data/decorations.js';
import { stageGrid, STAGE_NAMES } from '../art/sprites.js';
import { PACKET_FOR_TIER } from '../art/uiArt.js';
import {
  img, uiImg, cropImg, decorImg, visitorImg, rarityTag, stars, fmtNum, fmtDuration, fmtClock,
} from './render.js';
import { sfx } from './audio.js';
import { startPlacing } from './garden.js';


function rayColor(r) {
  return { common: '#e8f8d0', uncommon: '#d0f0ff', rare: '#e8dcff', epic: '#ffd8ea', legendary: '#fff0b0', ultra: '#ffd0e0' }[r];
}

// ---------------------------------------------------------------- planting

// Planting gives nothing away: the seed drops into the soil and a seedling
// appears. What it grows into is for the player to watch and guess.
export function showPlanted(res, tierId, { onWater } = {}) {
  const tier = SEED_TIERS.find((t) => t.id === tierId);
  const st = G.cropStatus(res.plot, app.now());
  const packet = uiImg(PACKET_FOR_TIER[tierId], 'plant-packet');
  const seed = uiImg('seed', 'plant-seed');
  const sprout = img(stageGrid(res.crop.id, 0), 'plant-sprout');
  const stagePlot = h('div', { class: 'plant-stage' }, uiImg('soil', 'plant-soil'), sprout, seed, packet);
  const buttons = h('div', { class: 'btn-row', style: { marginTop: '12px' } });
  if (st.open && onWater) {
    buttons.append(h('button', { class: 'btn blue', onclick: () => { closeOverlay(entry); onWater(); } }, uiImg('drop'), 'Water now'));
  }
  buttons.append(h('button', { class: 'btn', onclick: () => closeOverlay(entry) }, 'Lovely!'));
  const body = h('div', {},
    h('h2', {}, 'Planted!'),
    stagePlot,
    h('p', { style: { margin: '8px 0 4px' } }, `A mystery seed from a ${tier.name} packet is in the ground.`),
    h('p', { class: 'muted small', style: { margin: 0 } }, 'Check back as it grows through 5 stages. Can you guess what it will become?'),
    h('div', { class: 'small', style: { marginTop: '6px' } }, `Ready in ${fmtDuration(st.harvestAt - app.now())} · ${fmtClock(st.harvestAt)}`),
    buttons);
  const entry = openModal(body);
  setTimeout(() => sfx('tick'), 450);
  setTimeout(() => sfx('land'), 900);
}

// ---------------------------------------------------------------- harvest

export function showHarvestResult(res) {
  const crop = res.crop;
  const info = RARITY_INFO[crop.rarity];
  const rays = h('div', { class: 'rays', style: { '--ray': rayColor(crop.rarity) } }, cropImg(crop.id));
  const s = app.state;
  const isBest = res.newBest && s.stats.harvests > 1;
  const body = h('div', {},
    res.isNew ? h('div', { class: 'banner-new' }, 'NEW DISCOVERY!') : h('div', { class: 'muted small' }, 'Harvested'),
    rays,
    h('h2', {}, crop.name),
    h('div', {}, rarityTag(crop.rarity), ' ', stars(crop.rarity)),
    res.isNew ? h('div', { class: 'muted small', style: { marginTop: '4px' } }, `#${String(crop.id).padStart(3, '0')} added to your collection · ${G.collectionProgress(s).found}/100`) : null,
    h('p', { class: 'small', style: { margin: '8px 0 0' } }, `“${crop.desc}”`),
    h('div', { class: 'reward-line' }, uiImg('coin'), `+${fmtNum(res.value)}`),
    h('div', { class: 'muted small' }, `×${res.qty} harvested · watered ${res.waters}/${WATERING.checkpoints.length}${res.waters ? ` (×${(WATERING.yieldMult ** res.waters).toFixed(2)})` : ''}`),
    isBest ? h('div', { style: { marginTop: '6px', fontWeight: 700, color: '#a8691b' } }, '★ New record: highest single yield!') : null,
    res.guess ? guessLine(res.guess) : null,
  );
  if (res.trophy) {
    const d = DECOR_BY_ID[res.trophy];
    body.append(h('div', { class: 'panel', style: { marginTop: '12px', background: '#fff4b0' } },
      h('b', {}, 'Ultra-rare reward!'),
      h('div', { class: 'detail-head', style: { justifyContent: 'center', marginTop: '6px' } }, decorImg(d.id)),
      h('div', {}, `Unique decoration: ${d.name}`),
      h('button', { class: 'btn gold block', style: { marginTop: '8px' }, onclick: () => { closeOverlay(entry); startPlacing(d.id); } }, 'Place it now')));
  }
  body.append(h('button', { class: 'btn block', style: { marginTop: '12px' }, onclick: () => closeOverlay(entry) }, 'Collect'));
  body.style.setProperty('--c', info.color);
  const entry = openModal(body);
}

function guessLine(g) {
  return g.correct
    ? h('div', { class: 'guess-result good' }, `Good eye! You guessed it at the ${STAGE_NAMES[g.stage].toLowerCase()} stage: +${fmtNum(g.extra)} coins (+${Math.round(g.bonus * 100)}%)`)
    : h('div', { class: 'guess-result' }, `You guessed ${CROP_BY_ID[g.cropId].name}. Not this time!`);
}

export function showHarvestSummary(results) {
  const total = results.reduce((a, r) => a + r.value, 0);
  const list = h('div', { style: { textAlign: 'left', margin: '8px 0' } });
  for (const r of results) {
    list.append(h('div', { class: 'record-row' },
      cropImg(r.crop.id),
      h('div', { class: 'grow' }, h('b', {}, r.crop.name, r.isNew ? h('span', { class: 'banner-new', style: { fontSize: '11px', marginLeft: '6px', padding: '0 4px' } }, 'NEW') : null),
        h('span', { class: 'small' }, rarityTag(r.crop.rarity), ` ×${r.qty}`,
          r.guess ? (r.guess.correct ? ' · guessed right!' : ' · guess missed') : '')),
      h('span', { class: 'price' }, uiImg('coin'), fmtNum(r.value))));
  }
  const trophies = results.filter((r) => r.trophy);
  const news = results.filter((r) => r.isNew).length;
  const body = h('div', {},
    h('h2', {}, 'Harvest time!'),
    news ? h('div', { class: 'banner-new' }, `${news} new discover${news > 1 ? 'ies' : 'y'}!`) : null,
    results.some((r) => r.guess && r.guess.correct) ? h('div', { class: 'guess-result good' }, `${results.filter((r) => r.guess && r.guess.correct).length} correct guess(es)!`) : null,
    list,
    h('div', { class: 'reward-line' }, uiImg('coin'), `+${fmtNum(total)}`),
    trophies.length ? h('div', { class: 'panel', style: { background: '#fff4b0' } }, h('b', {}, 'Ultra-rare reward!'), h('br'),
      trophies.map((t) => `${DECOR_BY_ID[t.trophy].name} added to your decorations.`).join(' ')) : null,
    h('button', { class: 'btn block', onclick: () => closeOverlay(entry) }, 'Collect'));
  const entry = openModal(body);
}

// ---------------------------------------------------------------- visitors

export function showVisitor(res) {
  const v = res.visitor;
  const line = v.lines[Math.floor(Math.random() * v.lines.length)];
  let reward;
  if (v.effect === 'water') reward = res.watered ? `Watered ${res.watered} thirsty plant${res.watered > 1 ? 's' : ''}!` : 'No plants were thirsty, so they left a tip.';
  else if (v.effect === 'hurry') reward = res.hurried ? `${res.hurried} crop${res.hurried > 1 ? 's' : ''} will be ready ${v.minutes} minutes sooner!` : 'Nothing was growing, so they left a tip.';
  else if (v.effect === 'seed') reward = `Gifted you a ${SEED_TIERS.find((t) => t.id === res.seed).name}!`;
  else reward = 'Left you a little gift.';
  const portrait = visitorImg(v.id, 0, 'big-sprite');
  portrait.style.animation = 'hop 0.9s ease-in-out infinite';
  const body = h('div', {},
    portrait,
    h('h2', {}, v.name),
    h('div', { class: 'panel', style: { background: '#fff', textAlign: 'center' } }, `“${line}”`),
    h('div', {}, reward),
    res.coins ? h('div', { class: 'reward-line' }, uiImg('coin'), `+${fmtNum(res.coins)}`) : null,
    res.seed ? h('div', { class: 'reward-line' }, uiImg(PACKET_FOR_TIER[res.seed]), '+1') : null,
    h('button', { class: 'btn pink block', style: { marginTop: '10px' }, onclick: () => closeOverlay(entry) }, 'Thank you!'));
  const entry = openModal(body);
}

// ---------------------------------------------------------------- bonuses

export function showBonusAwards(awards) {
  const queue = [...awards];
  const nextAward = () => {
    const a = queue.shift();
    if (!a) return;
    const names = Object.values(BONUS_TYPES).map((b) => b.name);
    const label = h('div', { class: 'slot-label' }, names[0]);
    const desc = h('div', { class: 'muted' }, '');
    const btn = h('button', { class: 'btn gold block', style: { marginTop: '12px', visibility: 'hidden' }, onclick: () => { closeOverlay(entry); nextAward(); } }, 'Wonderful!');
    const icon = uiImg('star', 'big-sprite');
    icon.style.cssText = 'width:96px;height:96px;margin:8px auto;display:block';
    const body = h('div', {},
      h('div', { class: 'banner-new' }, 'GARDEN BONUS!'),
      h('div', { class: 'muted small', style: { marginTop: '8px' } }, `Decoration score reached ${a.threshold}`),
      icon, label, desc, btn);
    const entry = openModal(body, { dismissable: false });
    let i = 0;
    const steps = 16;
    const spin = () => {
      i += 1;
      label.textContent = names[i % names.length];
      sfx('tick');
      if (i < steps) setTimeout(spin, 50 + i * 12);
      else land();
    };
    const land = () => {
      sfx('bonus');
      if (a.type === 'coins') {
        label.textContent = 'Golden Harvest';
        desc.textContent = `Every bonus is maxed out, so here are ${a.amount} coins!`;
      } else {
        const b = BONUS_TYPES[a.type];
        const v = G.bonusValues(app.state)[a.type];
        const n = G.bonusStacks(app.state)[a.type];
        label.textContent = b.name;
        desc.textContent = `${b.describe(v)} (stack ${n}/${b.maxStacks}). Permanent!`;
      }
      btn.style.visibility = 'visible';
    };
    setTimeout(spin, 300);
  };
  nextAward();
}

// ---------------------------------------------------------------- welcome back

export function showWelcomeBack(summary) {
  const rows = [];
  if (summary.ready) rows.push(`${summary.ready} crop${summary.ready > 1 ? 's are' : ' is'} ready to harvest`);
  if (summary.thirsty) rows.push(`${summary.thirsty} plant${summary.thirsty > 1 ? 's are' : ' is'} thirsty`);
  if (summary.visitor) rows.push(`${summary.visitor} is waiting to say hello`);
  if (!rows.length) return;
  const body = h('div', {},
    uiImg('basket', 'big-sprite'),
    h('h2', {}, 'Welcome back!'),
    h('p', { class: 'muted' }, `You were away for ${fmtDuration(summary.away)}. Your garden kept growing.`),
    h('div', { style: { textAlign: 'left' } }, rows.map((r) => h('div', { class: 'bonus-row' }, r))),
    h('button', { class: 'btn block', style: { marginTop: '12px' }, onclick: () => closeOverlay(entry) }, 'To the garden!'));
  body.querySelector('.big-sprite').style.cssText = 'width:96px;height:96px;margin:0 auto;display:block';
  const entry = openModal(body);
}

export { CROP_BY_ID };
