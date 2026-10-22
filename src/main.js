// Entry point: boot the app, wire navigation, timers and the service worker.
import { app, overlayOpen } from './ui/app.js';
import { $$ } from './ui/dom.js';
import * as G from './core/game.js';
import { hydrateSprites, gridURL } from './ui/render.js';
import { uiGrid, compose } from './art/sprites.js';
import { unlockAudio, sfx } from './ui/audio.js';
import * as garden from './ui/garden.js';
import * as seeds from './ui/seeds.js';
import * as collection from './ui/collection.js';
import * as decor from './ui/decor.js';
import * as records from './ui/records.js';
import { showWelcomeBack } from './ui/modals.js';
import { VISITOR_BY_ID } from './data/visitors.js';

function grassBackground() {
  // 2x2 block of grass tiles, darkened slightly for the page background.
  const tiles = ['grass1', 'grass3', 'grass2', 'grass1'].map((n) => uiGrid(n));
  let big = { w: 32, h: 32, px: new Array(32 * 32).fill(null) };
  tiles.forEach((t, i) => { big = compose(big, t, (i % 2) * 16, Math.floor(i / 2) * 16); });
  big = { ...big, px: big.px.map((c) => (c ? shade(c) : '#4f8f36')) };
  document.documentElement.style.setProperty('--grass-bg', `url(${gridURL(big, 4)})`);
}

function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(v * 0.72);
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')}`;
}

function awaySummary(since, now) {
  const s = app.state;
  return {
    away: now - since,
    ready: s.plots.filter((p) => p.crop && G.cropStatus(p.crop, now).ready).length,
    thirsty: s.plots.filter((p) => p.crop && G.cropStatus(p.crop, now).open).length,
    visitor: s.visitor.current ? VISITOR_BY_ID[s.visitor.current.type].name : null,
  };
}

function boot() {
  const lastSeen = (() => {
    try { return JSON.parse(localStorage.getItem('littleGarden.save') || '{}').lastSeenAt || null; } catch { return null; }
  })();
  app.init();
  grassBackground();
  hydrateSprites();

  app.registerScreen('garden', garden);
  app.registerScreen('seeds', seeds);
  app.registerScreen('collection', collection);
  app.registerScreen('decor', decor);
  app.registerScreen('records', records);

  for (const b of $$('#tabbar button')) {
    b.addEventListener('click', () => {
      sfx('tap');
      if (app.placing && b.dataset.tab !== 'garden') app.placing = null;
      app.setTab(b.dataset.tab);
    });
  }
  document.getElementById('score-chip').addEventListener('click', () => app.setTab('decor'));
  document.addEventListener('pointerdown', unlockAudio, { capture: true });

  app.setTab('garden');

  const now = app.now();
  if (lastSeen && now - lastSeen > 15 * 60 * 1000) showWelcomeBack(awaySummary(lastSeen, now));

  let lastSave = Date.now();
  setInterval(() => {
    const t = app.now();
    const { arrived } = G.tick(app.state, t);
    if (arrived) {
      app.save();
      sfx('visitor');
      app.refresh();
    } else if (app.tab === 'garden') {
      garden.update(document.getElementById('screen'));
      app.updateHeader();
    } else {
      app.updateHeader();
    }
    if (Date.now() - lastSave > 30000) { app.save(); lastSave = Date.now(); }
  }, 1000);

  let hiddenAt = null;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = app.now();
      app.save();
    } else {
      app.reloadFromStorage();
      G.tick(app.state, app.now());
      app.save();
      app.refresh();
      if (hiddenAt && app.now() - hiddenAt > 15 * 60 * 1000 && !overlayOpen()) showWelcomeBack(awaySummary(hiddenAt, app.now()));
    }
  });
  window.addEventListener('pagehide', () => app.save());
  window.addEventListener('resize', () => { garden.sizeScene(); });

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW registration failed', e));
  }
}

boot();
