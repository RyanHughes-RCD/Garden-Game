// Sprite library: builds pixel grids for every game sprite from templates.
// Pure data in, pixel grids out — shared by the browser (canvas) and Node.
import { renderTemplate, cropPalette, compose, silhouette, mix, lighten } from './pixel.js';
import { CROP_TEMPLATES, STAGE_TEMPLATES } from './cropArt.js';
import { DECOR_TEMPLATES } from './decorArt.js';
import { VISITOR_TEMPLATES } from './visitorArt.js';
import { UI_TEMPLATES } from './uiArt.js';
import { CROP_BY_ID } from '../data/crops.js';

const SOIL = { s: '#7a4a2e', y: '#a06a3e', x: '#4a2a1e' };

// Small 4-point sparkles for magical crops (placed where most templates are empty).
const SPARKLES = [[1, 1], [14, 3], [0, 8], [15, 10]];
const GLOW = [[1, 2], [13, 1], [14, 7], [0, 6]];

function fxOverlay(grid, fx, colors) {
  if (!fx) return grid;
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

export function cropGrid(cropId) {
  return memo(`crop:${cropId}`, () => {
    const crop = CROP_BY_ID[cropId];
    const tpl = CROP_TEMPLATES[crop.template];
    const pal = tpl.palette || cropPalette(crop.colors);
    return fxOverlay(renderTemplate(tpl, pal), crop.fx, crop.colors);
  });
}

export function cropSilhouette(cropId, color) {
  return memo(`sil:${cropId}:${color}`, () => silhouette(cropGrid(cropId), color));
}

export function stageGrid(cropId, stage) {
  if (stage >= 4) return cropGrid(cropId);
  return memo(`stage:${cropId}:${stage}`, () => {
    const crop = CROP_BY_ID[cropId];
    const pal = { ...cropPalette(crop.colors), ...SOIL };
    return renderTemplate(STAGE_TEMPLATES[stage], pal);
  });
}

// Generic stage sprites for unknown crops (e.g. tutorial art).
export function genericStageGrid(stage) {
  return memo(`gstage:${stage}`, () => {
    const pal = { ...cropPalette({ main: '#f78fb3', accent: '#ffd23f', leaf: '#5dbb4c' }), ...SOIL };
    return renderTemplate(STAGE_TEMPLATES[Math.min(stage, 3)], pal);
  });
}

export function decorGrid(id) {
  return memo(`decor:${id}`, () => {
    const tpl = DECOR_TEMPLATES[id];
    return renderTemplate(tpl, tpl.palette);
  });
}

export function visitorGrid(id, frame = 0) {
  return memo(`visitor:${id}:${frame}`, () => {
    const tpl = VISITOR_TEMPLATES[id];
    const rows = frame && tpl.alt ? { ...tpl, px: [...(tpl.px || []), ...tpl.alt] } : tpl;
    return renderTemplate(rows, tpl.palette);
  });
}

export function uiGrid(name) {
  return memo(`ui:${name}`, () => {
    const tpl = UI_TEMPLATES[name];
    if (!tpl) throw new Error(`Unknown UI sprite ${name}`);
    return renderTemplate(tpl, tpl.palette);
  });
}

export function hasUi(name) {
  return !!UI_TEMPLATES[name];
}

export { compose, silhouette, mix };
