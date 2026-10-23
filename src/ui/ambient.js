// Ambient life for the garden scene: swaying grass, butterflies by day,
// fireflies at night, falling petals, a time-of-day tint from the real clock
// and warm glows around lamps after dark. Purely visual; nothing is saved.
import { h } from './dom.js';
import { app } from './app.js';
import { img } from './render.js';
import { ambientGrid } from '../art/sprites.js';
import { NOOKS } from '../data/garden.js';
import { DECOR_BY_ID } from '../data/decorations.js';
import { BED, pathX } from '../art/sceneArt.js';

const artPx = (n) => `calc(var(--tile) * ${n / 16})`;

// Time-of-day phases by local hour.
export function phaseFor(date) {
  const hr = date.getHours() + date.getMinutes() / 60;
  if (hr >= 21 || hr < 5) return { name: 'night', tint: 'rgba(18, 24, 80, 0.5)', glow: true, fireflies: true };
  if (hr < 7) return { name: 'dawn', tint: 'rgba(255, 168, 110, 0.16)', glow: true, fireflies: false };
  if (hr < 17) return { name: 'day', tint: 'rgba(0, 0, 0, 0)', glow: false, fireflies: false };
  if (hr < 19) return { name: 'golden', tint: 'rgba(255, 140, 50, 0.2)', glow: false, fireflies: false };
  return { name: 'dusk', tint: 'rgba(110, 60, 150, 0.32)', glow: true, fireflies: true };
}

// Lawn spots for grass tufts, away from beds and path (art px).
const TUFTS = [[4, 22], [76, 24], [3, 56], [77, 52], [5, 88], [76, 86], [18, 101], [62, 102], [34, 88], [46, 110], [14, 72], [66, 70]]
  .filter(([x, y]) => !(x > BED.x0 && x < BED.x1 && y > BED.y0 && y < BED.y1 + 2) && !(y > BED.y1 && Math.abs(x - pathX(y)) < 7));

let A = null; // { scene, low, high, tint, glows, flyers, timer }

export function mountAmbient(low, scene) {
  if (A && A.timer) clearInterval(A.timer);
  const high = h('div', { class: 'ambient-high' });
  const tint = h('div', { class: 'day-tint' });
  const glows = h('div', { class: 'glow-layer' });
  scene.append(high, tint, glows);
  for (const [x, y] of TUFTS) {
    const t = img(ambientGrid('tuft'), 'tuft');
    t.style.left = artPx(x - 2.5);
    t.style.top = artPx(y - 4);
    t.style.animationDelay = `${-(x * 37 + y * 11) % 3000}ms`;
    low.append(t);
  }
  A = { scene, low, high, tint, glows, flyers: [], phase: null, glowSig: '', timer: null };
  A.timer = setInterval(tick, 2600);
  updateAmbient(app.now());
  tick();
}

function lawnPoint() {
  for (let k = 0; k < 10; k++) {
    const x = 6 + Math.random() * 68;
    const y = 14 + Math.random() * 94;
    if (!(x > BED.x0 && x < BED.x1 && y > BED.y0 && y < BED.y1)) return [x, y];
  }
  return [8, 90];
}

function setFlyers(kind) {
  for (const f of A.flyers) f.remove();
  A.flyers = [];
  const n = kind === 'fireflies' ? 7 : 2;
  for (let k = 0; k < n; k++) {
    const el = kind === 'fireflies'
      ? h('i', { class: 'firefly' })
      : h('div', { class: 'butterfly' }, img(ambientGrid(k % 2 ? 'butterflyBlue' : 'butterfly'), 'wings'));
    const [x, y] = lawnPoint();
    el.style.left = artPx(x);
    el.style.top = artPx(y);
    if (kind === 'fireflies') el.style.animationDelay = `${-k * 700}ms`;
    A.high.append(el);
    A.flyers.push(el);
  }
}

function spawnPetal(x, y) {
  const p = h('i', { class: 'petal' });
  p.style.left = artPx(x);
  p.style.top = artPx(y);
  p.style.setProperty('--drift', `${(Math.random() - 0.3) * 30}px`);
  A.high.append(p);
  setTimeout(() => p.remove(), 4200);
}

function tick() {
  if (!A || !A.scene.isConnected) {
    if (A && A.timer) clearInterval(A.timer);
    return;
  }
  // flyers wander to a new spot each tick
  for (const f of A.flyers) {
    if (Math.random() < 0.7) {
      const [x, y] = lawnPoint();
      f.classList.toggle('flip', parseFloat(f.style.left) > x);
      f.style.left = artPx(x);
      f.style.top = artPx(y);
    }
  }
  // petals drift from cherry trees and flower arches; otherwise the odd one floats by
  const s = app.state;
  const sources = NOOKS.filter((n, i) => ['cherry-tree', 'flower-arch'].includes(s.decorTiles[i]));
  if (A.phase && A.phase.name !== 'night') {
    for (const n of sources) if (Math.random() < 0.8) spawnPetal(n.x - 6 + Math.random() * 12, n.y - 14);
    if (!sources.length && Math.random() < 0.25) spawnPetal(Math.random() * 80, 0);
  }
}

export function updateAmbient(now) {
  if (!A) return;
  const phase = phaseFor(new Date(now));
  if (!A.phase || A.phase.name !== phase.name) {
    A.phase = phase;
    A.tint.style.background = phase.tint;
    A.scene.dataset.phase = phase.name;
    setFlyers(phase.fireflies ? 'fireflies' : 'butterflies');
  }
  // warm light around glowing decorations after dark
  const sig = `${phase.glow}|${app.state.decorTiles.join(',')}`;
  if (sig === A.glowSig) return;
  A.glowSig = sig;
  A.glows.replaceChildren();
  if (!phase.glow) return;
  app.state.decorTiles.forEach((id, i) => {
    if (!id || !DECOR_BY_ID[id].glow) return;
    const n = NOOKS[i];
    const g = h('i', { class: 'lamp-glow' });
    g.style.left = artPx(n.x - 14);
    g.style.top = artPx(n.y - 26);
    A.glows.append(g);
  });
}
