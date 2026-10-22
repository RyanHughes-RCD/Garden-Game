// Sprite library: builds pixel grids for every game sprite.
// Sources, in priority order:
//   1. PNG overrides registered with setOverride() (hand-drawn or imported art
//      in assets/art/, loaded at boot by overrides.js / the Node tools)
//   2. procedural templates (src/art/*Art.js)
// Pure data in, pixel grids out — shared by the browser (canvas) and Node.
import { renderTemplate, cropPalette, compose, silhouette, mix, lighten, unripe } from './pixel.js';
import { CROP_TEMPLATES } from './cropArt.js';
import { TEMPLATE_FAMILY, stageTemplate } from './growthArt.js';
import { DECOR_TEMPLATES } from './decorArt.js';
import { VISITOR_TEMPLATES } from './visitorArt.js';
import { UI_TEMPLATES } from './uiArt.js';
import { CROP_BY_ID } from '../data/crops.js';

export const STAGE_COUNT = 5;
export const STAGE_NAMES = ['Seedling', 'Small plant', 'Medium plant', 'Large plant', 'Final form'];

const SOIL = { y: '#a06a3e', z: '#5a3420' };

// Small 4-point sparkles for magical crops (placed where most templates are empty).
const SPARKLES = [[1, 1], [14, 3], [0, 8], [15, 10]];
const GLOW = [[1, 2], [13, 1], [14, 7], [0, 6]];

function fxOverlay(grid, fx, colors) {
  if (!fx || grid.w !== 16) return grid;
  const out = { w: grid.w, h: grid.h, px: grid.px.slice() };
  const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < out.w && y < out.h && !out.px[y * out.w + x]) out.px[y * out.w + x] = c; };
  if (fx === 'sparkle' || fx === 'rainbow') {
    const c = fx === 'rainbow' ? '#ffe95a' : '#ffffff';
    for (const [x, y] of SPARKLES) {
      put(x, y, c);
      if (fx === 'rainbow') { put(x + 1, y, '#ff7ab8'); put(x, y + 1, '#4fb3ff'); }
    }
  } else if (fx === 'glow') {
    const c = lighten(colors.accent, 0.4);
    for (const [x, y] of GLOW) put(x, y, c);
  }
  return out;
}

const cache = new Map();
function memo(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

// ---------------------------------------------------------------- overrides

const overrides = { crops: new Map(), decor: new Map(), visitors: new Map(), ui: new Map() };

// Register replacement art. `frames` is an array of grids:
//   crops:    5 frames (seedling..final) or 1 frame (final form only)
//   visitors: 1–2 frames; decor/ui: 1 frame
export function setOverride(kind, key, frames) {
  if (!overrides[kind]) throw new Error(`Unknown sprite kind ${kind}`);
  overrides[kind].set(key, frames);
  cache.clear();
}

export function clearOverrides() {
  for (const m of Object.values(overrides)) m.clear();
  cache.clear();
}

export function hasOverride(kind, key) {
  return overrides[kind].has(key);
}

// ---------------------------------------------------------------- procedural

export function proceduralCropGrid(cropId) {
  const crop = CROP_BY_ID[cropId];
  const tpl = CROP_TEMPLATES[crop.template];
  const pal = tpl.palette || cropPalette(crop.colors);
  return fxOverlay(renderTemplate(tpl, pal), crop.fx, crop.colors);
}

function stagePalette(crop) {
  const pal = cropPalette(crop.colors);
  return { ...pal, ...SOIL, u: mix(crop.colors.main, crop.colors.leaf, 0.55), U: mix(pal.d, crop.colors.leaf, 0.55) };
}

export function familyOf(cropId) {
  return TEMPLATE_FAMILY[CROP_BY_ID[cropId].template] || 'bloom';
}

// Stage 0–4 grid from templates only (ignores overrides).
export function proceduralStageGrid(cropId, stage, finalGrid = proceduralCropGrid(cropId)) {
  const crop = CROP_BY_ID[cropId];
  if (stage >= 4) return finalGrid;
  if (stage === 3) return unripe(finalGrid, crop.colors.leaf);
  return renderTemplate(stageTemplate(familyOf(cropId), stage), stagePalette(crop));
}

// ---------------------------------------------------------------- public

export function cropGrid(cropId) {
  return stageGrid(cropId, 4);
}

export function stageGrid(cropId, stage) {
  const s = Math.max(0, Math.min(4, stage));
  return memo(`stage:${cropId}:${s}`, () => {
    const frames = overrides.crops.get(CROP_BY_ID[cropId].key);
    if (frames && frames.length >= STAGE_COUNT) return frames[s];
    const final = frames ? frames[frames.length - 1] : proceduralCropGrid(cropId);
    return proceduralStageGrid(cropId, s, final);
  });
}

export function cropSilhouette(cropId, color) {
  return memo(`sil:${cropId}:${color}`, () => silhouette(cropGrid(cropId), color));
}

export function decorGrid(id) {
  return memo(`decor:${id}`, () => {
    const o = overrides.decor.get(id);
    if (o) return o[0];
    const tpl = DECOR_TEMPLATES[id];
    return renderTemplate(tpl, tpl.palette);
  });
}

export function proceduralVisitorGrid(id, frame = 0) {
  const tpl = VISITOR_TEMPLATES[id];
  const rows = frame && tpl.alt ? { ...tpl, px: [...(tpl.px || []), ...tpl.alt] } : tpl;
  return renderTemplate(rows, tpl.palette);
}

export function visitorGrid(id, frame = 0) {
  return memo(`visitor:${id}:${frame}`, () => {
    const o = overrides.visitors.get(id);
    if (o) return o[Math.min(frame, o.length - 1)];
    return proceduralVisitorGrid(id, frame);
  });
}

export function proceduralDecorGrid(id) {
  const tpl = DECOR_TEMPLATES[id];
  return renderTemplate(tpl, tpl.palette);
}

export function proceduralUiGrid(name) {
  const tpl = UI_TEMPLATES[name];
  if (!tpl) throw new Error(`Unknown UI sprite ${name}`);
  return renderTemplate(tpl, tpl.palette);
}

export function uiGrid(name) {
  return memo(`ui:${name}`, () => {
    const o = overrides.ui.get(name);
    return o ? o[0] : proceduralUiGrid(name);
  });
}

export function hasUi(name) {
  return !!UI_TEMPLATES[name];
}

export { compose, silhouette, mix };
