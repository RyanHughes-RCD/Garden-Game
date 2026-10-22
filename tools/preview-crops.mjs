// Renders all crop sprites + growth stages to a PNG contact sheet for review.
import { writeFileSync } from 'node:fs';
import { Bitmap } from './png.mjs';
import { CROPS } from '../src/data/crops.js';
import { CROP_TEMPLATES, STAGE_TEMPLATES } from '../src/art/cropArt.js';
import { renderTemplate, cropPalette } from '../src/art/pixel.js';

const out = process.argv[2] || 'crops-preview.png';
const S = 5, CELL = 16 * S + 8, COLS = 10;
const rows = Math.ceil(CROPS.length / COLS) + 1;
const bmp = new Bitmap(COLS * CELL, rows * CELL, '#cfe8b0');
CROPS.forEach((c, i) => {
  const tpl = CROP_TEMPLATES[c.template];
  if (!tpl) { console.warn('missing template', c.template); return; }
  const g = renderTemplate(tpl, tpl.palette || cropPalette(c.colors));
  const x = (i % COLS) * CELL + 4, y = Math.floor(i / COLS) * CELL + 4;
  bmp.fill(x - 2, y - 2, 16 * S + 4, 16 * S + 4, (i % 2) ? '#bfe09a' : '#d8f0c0');
  bmp.blit(g, x, y, S);
});
STAGE_TEMPLATES.forEach((t, i) => {
  const g = renderTemplate(t, { ...cropPalette(CROPS[1].colors), s: '#7a4a2e', y: '#a06a3e', x: '#4a2a1e' });
  bmp.blit(g, i * CELL + 4, (rows - 1) * CELL + 4, S);
});
writeFileSync(out, bmp.png());
console.log('wrote', out);
