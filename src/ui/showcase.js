// Showcase: renders a shareable garden card (PNG) with records and stats.
import { h } from './dom.js';
import { app, openOverlay, closeOverlay, toast } from './app.js';
import * as G from '../core/game.js';
import { DECOR_TILES } from '../core/state.js';
import { PLOT_TILES, GARDEN_COLS, GARDEN_ROWS, RARITY_INFO, BONUS_TYPES } from '../data/config.js';
import { CROP_BY_ID } from '../data/crops.js';
import { uiGrid, decorGrid, stageGrid, cropGrid } from '../art/sprites.js';
import { gridCanvas, fmtNum, fmtDate } from './render.js';

const W = 720;
const H = 1280;
const INK = '#2b1b33';

function sprite(ctx, grid, x, y, scale) {
  ctx.drawImage(gridCanvas(grid, scale), Math.round(x), Math.round(y));
}

function panel(ctx, x, y, w, hgt, fill = '#fff6e2') {
  ctx.fillStyle = 'rgba(43,27,51,0.35)';
  roundRect(ctx, x, y + 6, w, hgt, 16);
  ctx.fill();
  ctx.fillStyle = fill;
  roundRect(ctx, x, y, w, hgt, 16);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function roundRect(ctx, x, y, w, hgt, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + hgt, r);
  ctx.arcTo(x + w, y + hgt, x, y + hgt, r);
  ctx.arcTo(x, y + hgt, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function text(ctx, str, x, y, { size = 28, weight = 700, color = INK, align = 'left', max } = {}) {
  ctx.font = `${weight} ${size}px 'Pixelify Sans', system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  let s = String(str);
  if (max) while (ctx.measureText(s).width > max && s.length > 3) s = `${s.slice(0, -2)}…`;
  ctx.fillText(s, x, y);
}

export async function renderShowcase(state, now) {
  try { await document.fonts.load("700 32px 'Pixelify Sans'"); } catch { /* fallback font */ }
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // grass background
  const grass = ['grass1', 'grass2', 'grass3'];
  for (let y = 0; y < H; y += 128) for (let x = 0; x < W; x += 128) sprite(ctx, uiGrid(grass[((x + y) / 128) % 3]), x, y, 8);
  ctx.fillStyle = 'rgba(40,70,30,0.25)';
  ctx.fillRect(0, 0, W, H);

  // header
  panel(ctx, 30, 26, W - 60, 110);
  text(ctx, state.settings.gardenName || 'My Little Garden', W / 2, 80, { size: 40, align: 'center', max: W - 120 });
  text(ctx, `Little Garden · ${fmtDate(now)}`, W / 2, 118, { size: 22, weight: 400, color: '#5a4a5e', align: 'center' });

  // garden
  const T = 96;
  const gx = (W - T * GARDEN_COLS) / 2;
  const gy = 168;
  ctx.fillStyle = '#8a5a3c';
  roundRect(ctx, gx - 16, gy - 16, T * GARDEN_COLS + 32, T * GARDEN_ROWS + 32, 12);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  for (let y = 0; y < GARDEN_ROWS; y++) {
    for (let x = 0; x < GARDEN_COLS; x++) sprite(ctx, uiGrid(grass[(x * 7 + y * 13 + ((x * y) % 3)) % 3]), gx + x * T, gy + y * T, 6);
  }
  PLOT_TILES.forEach(([x, y], i) => {
    const p = state.plots[i];
    const px = gx + x * T;
    const py = gy + y * T;
    if (!p.unlocked) { sprite(ctx, uiGrid('soil-locked'), px, py, 6); return; }
    sprite(ctx, uiGrid('soil'), px, py, 6);
    if (p.crop) sprite(ctx, stageGrid(p.crop.cropId, G.cropStatus(p.crop, now).stage), px, py, 6);
  });
  DECOR_TILES.forEach(([x, y], i) => {
    const id = state.decorTiles[i];
    if (id) sprite(ctx, decorGrid(id), gx + x * T, gy + y * T, 6);
  });

  // stats
  const sy = gy + T * GARDEN_ROWS + 40;
  panel(ctx, 30, sy, W - 60, H - sy - 30);
  const prog = G.collectionProgress(state);
  const col1 = 60;
  const col2 = W / 2 + 10;
  text(ctx, 'Collection', col1, sy + 44, { size: 22, weight: 400, color: '#5a4a5e' });
  text(ctx, `${prog.found}/100`, col1, sy + 82, { size: 38 });
  ctx.fillStyle = '#fff';
  roundRect(ctx, col1, sy + 96, 260, 20, 8); ctx.fill(); ctx.lineWidth = 4; ctx.stroke();
  ctx.fillStyle = '#7cc35a';
  if (prog.found) { roundRect(ctx, col1 + 3, sy + 99, 254 * prog.found / 100, 14, 6); ctx.fill(); }

  text(ctx, 'Decoration score', col2, sy + 44, { size: 22, weight: 400, color: '#5a4a5e' });
  sprite(ctx, uiGrid('star'), col2, sy + 54, 3);
  text(ctx, G.decorScore(state), col2 + 44, sy + 82, { size: 38 });
  const bonusCount = state.bonuses.filter((b) => b.type in BONUS_TYPES).length;
  text(ctx, `${bonusCount} garden bonus${bonusCount === 1 ? '' : 'es'}`, col2, sy + 114, { size: 22, weight: 400 });

  const st = state.stats;
  const recY = sy + 140;
  const rec = (label, e, x, sub) => {
    text(ctx, label, x, recY + 22, { size: 20, weight: 400, color: '#5a4a5e' });
    if (!e) { text(ctx, 'None yet', x, recY + 70, { size: 24 }); return; }
    sprite(ctx, cropGrid(e.cropId), x, recY + 32, 4);
    text(ctx, CROP_BY_ID[e.cropId].name, x + 72, recY + 60, { size: 22, max: 220 });
    text(ctx, sub(e), x + 72, recY + 88, { size: 22, weight: 400 });
  };
  rec('Best single yield', st.bestSingle, col1, (e) => `${fmtNum(e.value)} coins`);
  rec('Largest haul', st.largestHaul, col2, (e) => `×${e.qty} items`);

  const rarY = recY + 128;
  text(ctx, 'Rarest discoveries', col1, rarY, { size: 20, weight: 400, color: '#5a4a5e' });
  const rarest = G.rarestDiscoveries(state, 8);
  rarest.forEach((crop, i) => {
    const x = col1 + i * 74;
    ctx.fillStyle = RARITY_INFO[crop.rarity].color;
    roundRect(ctx, x, rarY + 12, 68, 68, 10); ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
    sprite(ctx, cropGrid(crop.id), x + 2, rarY + 14, 4);
  });
  if (!rarest.length) text(ctx, 'Plant some seeds to begin!', col1, rarY + 50, { size: 22 });
  text(ctx, `${fmtNum(st.coinsFromHarvests)} coins harvested · ${fmtNum(st.harvests)} harvests`, W / 2, H - 52, { size: 20, weight: 400, align: 'center' });
  return c;
}

export async function openShowcase() {
  const wrap = h('div', { class: 'showcase' }, h('p', { style: { color: '#fff' } }, 'Preparing your showcase…'));
  const entry = openOverlay(wrap, { backdrop: false });
  const canvas = await renderShowcase(app.state, app.now());
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  const url = URL.createObjectURL(blob);
  const file = new File([blob], 'little-garden.png', { type: 'image/png' });
  wrap.replaceChildren(
    h('img', { class: 'card', src: url, alt: 'Garden showcase card' }),
    h('p', { class: 'small', style: { color: '#fff', textAlign: 'center', margin: 0 } }, 'Tip: press and hold the image to save it to Photos.'),
    h('div', { class: 'btn-row' },
      navigator.canShare && navigator.canShare({ files: [file] })
        ? h('button', {
          class: 'btn gold',
          onclick: async () => {
            try { await navigator.share({ files: [file], title: 'My Little Garden' }); } catch { /* cancelled */ }
          },
        }, 'Share')
        : null,
      h('a', { class: 'btn blue', href: url, download: 'little-garden.png', onclick: () => toast('Image saved!') }, 'Save image'),
      h('button', { class: 'btn plain', onclick: () => { closeOverlay(entry); URL.revokeObjectURL(url); } }, 'Close')));
}
