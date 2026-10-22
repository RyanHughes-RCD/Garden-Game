// Turns pixel grids into crisp images (nearest-neighbour, pre-scaled).
import { h } from './dom.js';
import { cropGrid, stageGrid, decorGrid, visitorGrid, uiGrid } from '../art/sprites.js';
import { RARITY_INFO } from '../data/config.js';

const urlCache = new WeakMap();

export function gridCanvas(grid, scale = 8) {
  const c = document.createElement('canvas');
  c.width = grid.w * scale;
  c.height = grid.h * scale;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const col = grid.px[y * grid.w + x];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return c;
}

// Default scale renders roughly 128px images whatever the art's resolution.
export function gridURL(grid, scale = Math.max(1, Math.round(128 / Math.max(grid.w, grid.h)))) {
  let byScale = urlCache.get(grid);
  if (!byScale) urlCache.set(grid, (byScale = new Map()));
  if (!byScale.has(scale)) byScale.set(scale, gridCanvas(grid, scale).toDataURL('image/png'));
  return byScale.get(scale);
}

export function img(grid, cls = '', alt = '') {
  return h('img', { class: `px ${cls}`, src: gridURL(grid), alt, draggable: 'false', width: grid.w, height: grid.h });
}

export const cropImg = (id, cls, alt) => img(cropGrid(id), cls, alt);
export const stageImg = (id, stage, cls) => img(stageGrid(id, stage), cls);
export const decorImg = (id, cls, alt) => img(decorGrid(id), cls, alt);
export const visitorImg = (id, frame, cls) => img(visitorGrid(id, frame), cls);
export const uiImg = (name, cls, alt) => img(uiGrid(name), cls, alt);

// Fill any [data-sprite] placeholders in static HTML.
export function hydrateSprites(root = document) {
  for (const el of root.querySelectorAll('[data-sprite]')) {
    if (el.firstChild) continue;
    el.append(uiImg(el.dataset.sprite));
  }
}

export function rarityColor(r) {
  return RARITY_INFO[r].color;
}

export function rarityTag(r) {
  return h('span', { class: `rarity-tag ${r}`, style: { '--c': rarityColor(r) } }, RARITY_INFO[r].name);
}

export function stars(r) {
  const n = RARITY_INFO[r].stars;
  const wrap = h('span', { class: 'stars', title: RARITY_INFO[r].name });
  for (let i = 0; i < Math.min(n, 6); i++) wrap.append(uiImg('star'));
  return wrap;
}

export function coinAmount(n, strike = null) {
  return h('span', { class: 'price' }, uiImg('coin'), strike != null && strike !== n ? h('s', {}, fmtNum(strike)) : null, fmtNum(n));
}

export function fmtNum(n) {
  return Math.round(n).toLocaleString('en-US');
}

export function fmtDuration(ms) {
  if (ms <= 0) return 'now';
  const s = Math.ceil(ms / 1000);
  const d = Math.floor(s / 86400);
  const hrs = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d) return `${d}d ${hrs}h`;
  if (hrs) return `${hrs}h ${String(m).padStart(2, '0')}m`;
  if (m) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

export function fmtClock(ts) {
  const d = new Date(ts);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return time;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return `tomorrow ${time}`;
  return `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`;
}

export function fmtDate(ts) {
  return new Date(ts).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}
