// Generates PWA icons and sprite-sheet PNGs from the pixel-art templates.
// Run: npm run assets
import { writeFileSync, mkdirSync } from 'node:fs';
import { Bitmap } from './png.mjs';
import { CROPS } from '../src/data/crops.js';
import { DECORATIONS } from '../src/data/decorations.js';
import { VISITOR_TYPES } from '../src/data/visitors.js';
import { UI_TEMPLATES } from '../src/art/uiArt.js';
import { cropGrid, decorGrid, visitorGrid, uiGrid, stageGrid } from '../src/art/sprites.js';

const root = new URL('..', import.meta.url).pathname;
mkdirSync(`${root}icons`, { recursive: true });
mkdirSync(`${root}assets/sprites`, { recursive: true });

// Icon: a flower growing in a soil plot on grass, inside a rounded frame.
function icon(size, { maskable = false } = {}) {
  const bmp = new Bitmap(size, size, '#5a9a3a');
  const tile = Math.floor(size / 16);
  for (let y = 0; y < size; y += tile * 16) for (let x = 0; x < size; x += tile * 16) bmp.blit(uiGrid('grass1'), x, y, tile);
  const inner = maskable ? 0.62 : 0.8;
  const s = Math.max(1, Math.floor((size * inner) / 16));
  const off = Math.floor((size - s * 16) / 2);
  bmp.blit(uiGrid('soil'), off, off, s);
  bmp.blit(cropGrid(31), off, off - Math.floor(s * 1.5), s); // Velvet Rose
  return bmp.png();
}
writeFileSync(`${root}icons/icon-192.png`, icon(192));
writeFileSync(`${root}icons/icon-512.png`, icon(512));
writeFileSync(`${root}icons/icon-maskable-512.png`, icon(512, { maskable: true }));
writeFileSync(`${root}icons/apple-touch-icon.png`, icon(180));
writeFileSync(`${root}icons/favicon-32.png`, icon(32));

// Sprite sheets (16px cells, 1x) for reference / reuse.
function sheet(grids, cols, file) {
  const rows = Math.ceil(grids.length / cols);
  const bmp = new Bitmap(cols * 16, rows * 16);
  grids.forEach((g, i) => bmp.blit(g, (i % cols) * 16, Math.floor(i / cols) * 16, 1));
  writeFileSync(`${root}assets/sprites/${file}`, bmp.png());
}
sheet(CROPS.map((c) => cropGrid(c.id)), 10, 'crops.png');
sheet(CROPS.flatMap((c) => [0, 1, 2, 3].map((st) => stageGrid(c.id, st))), 16, 'growth-stages.png');
sheet(DECORATIONS.map((d) => decorGrid(d.id)), 8, 'decorations.png');
sheet(VISITOR_TYPES.flatMap((v) => [visitorGrid(v.id, 0), visitorGrid(v.id, 1)]), 6, 'visitors.png');
sheet(Object.keys(UI_TEMPLATES).map((k) => uiGrid(k)).map((g) => ({ ...g, w: g.w })), 8, 'ui.png');
console.log('Assets written.');
