// App controller: owns the live state, persistence, navigation, overlays and
// the timer loop. Screens import `app` and call app.commit(fn) to mutate state.
import { h, clear, $, $$ } from './dom.js';
import { loadState, saveState, STORAGE_KEY } from '../core/state.js';
import * as G from '../core/game.js';
import { fmtNum } from './render.js';
import { sfx, setSoundEnabled } from './audio.js';

const screens = {};

export const app = {
  state: null,
  tab: 'garden',
  moving: null, // nook index of a decoration being moved, or null
  listeners: new Set(),

  now() {
    return Date.now();
  },

  init() {
    const { state, source } = loadState(this.now());
    this.state = state;
    this.loadSource = source;
    setSoundEnabled(state.settings.sound !== false);
    G.tick(this.state, this.now());
    this.save();
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY && e.newValue) this.reloadFromStorage();
    });
  },

  reloadFromStorage() {
    this.state = loadState(this.now()).state;
    this.refresh();
  },

  save() {
    const ok = saveState(this.state);
    if (!ok) {
      // Another tab saved newer progress; adopt it rather than overwrite.
      this.reloadFromStorage();
      toast('Your garden was updated in another tab.');
    }
    return ok;
  },

  // Run a mutation, persist, re-render. Returns the mutation's result.
  commit(fn) {
    const res = fn(this.state, this.now());
    if (res && res.ok === false) {
      sfx('error');
      if (res.error) toast(res.error, true);
      return res;
    }
    this.save();
    this.refresh();
    return res;
  },

  registerScreen(name, mod) {
    screens[name] = mod;
  },

  setTab(name) {
    if (!screens[name]) return;
    this.tab = name;
    for (const b of $$('#tabbar button')) b.classList.toggle('active', b.dataset.tab === name);
    const screen = $('#screen');
    clear(screen);
    screen.scrollTop = 0;
    screens[name].render(screen);
    this.updateHeader();
  },

  refresh() {
    const screen = $('#screen');
    const mod = screens[this.tab];
    if (mod.update) mod.update(screen);
    else {
      const top = screen.scrollTop;
      clear(screen);
      mod.render(screen);
      screen.scrollTop = top;
    }
    this.updateHeader();
    for (const fn of this.listeners) fn();
  },

  updateHeader() {
    const s = this.state;
    const cv = $('#coin-value');
    const prev = Number(cv.dataset.v || 0);
    cv.textContent = fmtNum(s.coins);
    cv.dataset.v = s.coins;
    if (prev && s.coins > prev) {
      const c = $('#coin-counter');
      c.classList.remove('bump');
      void c.offsetWidth;
      c.classList.add('bump');
    }
    $('#score-value').textContent = G.decorScore(s);
    $('#garden-title').textContent = s.settings.gardenName || 'Little Garden';
    // badge on the Garden tab when crops are ready or a visitor waits
    const now = this.now();
    const ready = s.plots.filter((p) => p.crop && G.cropStatus(p.crop, now).ready).length + (s.visitor.current ? 1 : 0);
    const btn = $('#tabbar button[data-tab="garden"]');
    let dot = btn.querySelector('.dot');
    if (ready && this.tab !== 'garden') {
      if (!dot) btn.append((dot = h('span', { class: 'dot' })));
      dot.textContent = ready;
    } else if (dot) dot.remove();
  },
};

// ---------------------------------------------------------------- overlays

const stack = [];

function layer() {
  return $('#layer');
}

export function openOverlay(el, { onClose, dismissable = true, backdrop = true } = {}) {
  const wrap = h('div', { class: 'overlay', style: { position: 'absolute', inset: '0' } });
  if (backdrop) {
    wrap.append(h('div', { class: 'backdrop', onclick: () => dismissable && closeOverlay(entry) }));
  }
  wrap.append(el);
  layer().append(wrap);
  const entry = { wrap, onClose };
  stack.push(entry);
  return entry;
}

export function closeOverlay(entry = stack[stack.length - 1]) {
  if (!entry) return;
  const i = stack.indexOf(entry);
  if (i < 0) return;
  stack.splice(i, 1);
  entry.wrap.remove();
  if (entry.onClose) entry.onClose();
}

export function closeAllOverlays() {
  while (stack.length) closeOverlay();
}

export function overlayOpen() {
  return stack.length > 0;
}

export function openSheet(title, body, opts = {}) {
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-label': title },
    h('div', { class: 'grabber' }),
    title ? h('h2', {}, title) : null,
    body);
  return openOverlay(sheet, opts);
}

export function openModal(body, opts = {}) {
  const modal = h('div', { class: 'modal', role: 'dialog' }, body);
  return openOverlay(modal, opts);
}

export function toast(msg, bad = false) {
  const t = h('div', { class: `toast${bad ? ' bad' : ''}` }, msg);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), 2800);
}

// Fly a few coin sprites from an element to the coin counter.
export function flyCoins(fromEl, coinUrl, count = 6) {
  if (!fromEl) return;
  const r = fromEl.getBoundingClientRect();
  const target = $('#coin-counter').getBoundingClientRect();
  for (let i = 0; i < count; i++) {
    const c = h('img', { class: 'fx-coin px', src: coinUrl });
    const sx = r.left + r.width / 2 + (Math.random() - 0.5) * 30;
    const sy = r.top + r.height / 2 + (Math.random() - 0.5) * 30;
    c.style.left = `${sx}px`;
    c.style.top = `${sy}px`;
    document.body.append(c);
    setTimeout(() => {
      c.style.transform = `translate(${target.left + 18 - sx}px, ${target.top + 10 - sy}px) scale(0.7)`;
      c.style.opacity = '0.2';
    }, 30 + i * 60);
    setTimeout(() => c.remove(), 900 + i * 60);
  }
}
