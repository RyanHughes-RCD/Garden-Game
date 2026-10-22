// Records: lifetime stats, best harvests, bonuses, visitors and settings.
import { h } from './dom.js';
import { app, openSheet, closeOverlay, toast } from './app.js';
import * as G from '../core/game.js';
import { BONUS_TYPES, SCORE_THRESHOLDS } from '../data/config.js';
import { CROP_BY_ID } from '../data/crops.js';
import { VISITOR_TYPES } from '../data/visitors.js';
import { parseSave, newState, BACKUP_KEY } from '../core/state.js';
import { cropImg, uiImg, visitorImg, rarityTag, fmtNum, fmtDate } from './render.js';
import { setSoundEnabled, sfx } from './audio.js';
import { openShowcase } from './showcase.js';

export function render(root) {
  const s = app.state;
  const st = s.stats;
  const prog = G.collectionProgress(s);
  const wrap = h('div', { class: 'screen-pad' });

  wrap.append(h('button', { class: 'btn gold block', style: { marginBottom: '12px' }, onclick: openShowcase }, uiImg('camera'), 'Garden showcase'));

  const stat = (k, v, icon) => h('div', { class: 'stat' }, h('div', { class: 'v' }, icon ? uiImg(icon) : null, v), h('div', { class: 'k' }, k));
  wrap.append(h('div', { class: 'panel' },
    h('h2', {}, 'Lifetime'),
    h('div', { class: 'stat-grid' },
      stat('Collection', `${prog.found}/100`),
      stat('Decoration score', G.decorScore(s), 'star'),
      stat('Coins from harvests', fmtNum(st.coinsFromHarvests), 'coin'),
      stat('Total coins earned', fmtNum(st.coinsEarned), 'coin'),
      stat('Harvests', fmtNum(st.harvests), 'basket'),
      stat('Items harvested', fmtNum(st.itemsHarvested)),
      stat('Seeds planted', fmtNum(st.plantings), 'seed'),
      stat('Waterings', fmtNum(st.waterings), 'drop'),
      stat('Visitors greeted', fmtNum(st.visitors), 'heart'),
      stat('Correct guesses', `${fmtNum(st.correctGuesses)}/${fmtNum(st.guesses)}`, 'star'),
      stat('Gardening since', fmtDate(s.createdAt)))));

  const recRow = (title, e, extra) => h('div', { class: 'record-row' },
    e ? cropImg(e.cropId) : uiImg('basket'),
    h('div', { class: 'grow' }, h('span', { class: 'muted small' }, title),
      h('b', {}, e ? CROP_BY_ID[e.cropId].name : 'None yet'),
      e ? h('span', { class: 'small' }, extra(e)) : null));
  wrap.append(h('div', { class: 'panel' },
    h('h2', {}, 'Records'),
    recRow('Highest-value single yield', st.bestSingle, (e) => `${fmtNum(e.value)} coins · ×${e.qty} · ${fmtDate(e.at)}`),
    recRow('Largest harvest haul', st.largestHaul, (e) => `×${e.qty} items · ${fmtNum(e.value)} coins`),
    h('h3', { style: { marginTop: '10px' } }, 'Most valuable harvests'),
    st.topHarvests.length ? st.topHarvests.map((e, i) => h('div', { class: 'record-row' },
      h('b', { style: { width: '20px' } }, `${i + 1}.`), cropImg(e.cropId),
      h('div', { class: 'grow' }, h('b', {}, CROP_BY_ID[e.cropId].name), rarityTag(CROP_BY_ID[e.cropId].rarity)),
      h('span', { class: 'price' }, uiImg('coin'), fmtNum(e.value)))) : h('p', { class: 'muted small' }, 'Harvest something!'),
    h('h3', { style: { marginTop: '10px' } }, 'Rarest discoveries'),
    h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } },
      G.rarestDiscoveries(s, 8).map((c) => { const im = cropImg(c.id, '', c.name); im.style.cssText = 'width:48px;height:48px'; return im; }))));

  const stacks = G.bonusStacks(s);
  const vals = G.bonusValues(s);
  wrap.append(h('div', { class: 'panel' },
    h('h2', {}, 'Garden bonuses'),
    h('p', { class: 'muted small', style: { marginTop: 0 } },
      `At each decoration score threshold (${SCORE_THRESHOLDS.join(', ')}) you get one random permanent bonus. Stacks add up to the max shown; maxed bonuses leave the pool.`),
    Object.entries(BONUS_TYPES).map(([k, b]) => h('div', { class: 'bonus-row' },
      h('div', {}, h('b', {}, b.name), h('br'), h('span', { class: 'small muted' }, stacks[k] ? b.describe(vals[k]) : `+${Math.round(b.per * 100)}${b.unit} per stack`)),
      h('span', { class: 'pips' }, Array.from({ length: b.maxStacks }, (_, i) => h('i', { class: i < stacks[k] ? 'on' : '' })))))));

  wrap.append(h('div', { class: 'panel' },
    h('h2', {}, 'Visitors'),
    h('div', { class: 'visitor-grid' }, VISITOR_TYPES.map((v) => {
      const n = s.visitorLog[v.id] || 0;
      return h('div', { class: n ? '' : 'unseen' }, visitorImg(v.id, 0), n ? v.name.split(' ')[0] : '???', h('br'), n ? `×${n}` : '');
    }))));

  wrap.append(settingsPanel());
  root.append(wrap);
}

function settingsPanel() {
  const s = app.state;
  const name = h('input', { class: 'text-input', value: s.settings.gardenName, maxlength: 28, 'aria-label': 'Garden name' });
  name.addEventListener('change', () => app.commit((st) => { st.settings.gardenName = name.value.trim().slice(0, 28) || 'My Little Garden'; return { ok: true }; }));
  return h('div', { class: 'panel' },
    h('h2', {}, 'Settings'),
    h('label', { class: 'small' }, 'Garden name'), name,
    h('div', { class: 'btn-row', style: { marginTop: '10px' } },
      h('button', {
        class: 'btn plain',
        onclick: () => {
          app.commit((st) => { st.settings.sound = !st.settings.sound; return { ok: true }; });
          setSoundEnabled(app.state.settings.sound);
          sfx('tap');
        },
      }, uiImg(s.settings.sound ? 'sound' : 'mute'), s.settings.sound ? 'Sound on' : 'Sound off'),
      h('button', { class: 'btn plain', onclick: openBackup }, 'Backup save')),
    h('p', { class: 'muted small' }, 'Progress is saved automatically on this device. Use “Backup save” to copy it somewhere safe or move it to another device.'),
    h('p', { class: 'muted small' }, 'Little Garden v1.0 · a web app (PWA), not an App Store app.'));
}

function openBackup() {
  const box = h('textarea', { class: 'save-box', readonly: true }, JSON.stringify(app.state));
  const input = h('textarea', { class: 'save-box', placeholder: 'Paste a save here to restore it' });
  const entry = openSheet('Backup & restore', h('div', {},
    h('p', { class: 'small' }, 'Your save code:'), box,
    h('div', { class: 'btn-row', style: { margin: '8px 0 14px' } },
      h('button', {
        class: 'btn',
        onclick: async () => {
          try { await navigator.clipboard.writeText(box.value); toast('Save copied!'); } catch { box.select(); toast('Select and copy the text above.'); }
        },
      }, 'Copy')),
    h('p', { class: 'small' }, 'Restore from a save code:'), input,
    h('div', { class: 'btn-row', style: { marginTop: '8px' } },
      h('button', {
        class: 'btn gold',
        onclick: () => {
          try {
            const restored = parseSave(input.value.trim(), app.now());
            restored.rev = app.state.rev;
            app.state = restored;
            app.save();
            closeOverlay(entry);
            app.setTab('garden');
            toast('Save restored!');
          } catch {
            toast('That save code is not valid.', true);
          }
        },
      }, 'Restore')),
    h('h3', { style: { marginTop: '18px' } }, 'Start over'),
    h('p', { class: 'muted small' }, 'Erases all progress on this device. This cannot be undone.'),
    h('button', {
      class: 'btn danger block',
      onclick: () => {
        if (!confirm('Erase your whole garden and start over?')) return;
        const fresh = newState(app.now());
        fresh.rev = app.state.rev;
        app.state = fresh;
        try { localStorage.removeItem(BACKUP_KEY); } catch { /* ignore */ }
        app.save();
        closeOverlay(entry);
        app.setTab('garden');
      },
    }, 'Erase garden')));
}
