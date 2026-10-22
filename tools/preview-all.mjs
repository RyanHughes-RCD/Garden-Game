// Renders decoration, visitor and UI sprites to a PNG contact sheet for review.
import { writeFileSync } from 'node:fs';
import { Bitmap } from './png.mjs';
import { DECORATIONS } from '../src/data/decorations.js';
import { VISITOR_TYPES } from '../src/data/visitors.js';
import { UI_TEMPLATES } from '../src/art/uiArt.js';
import { decorGrid, visitorGrid, uiGrid } from '../src/art/sprites.js';

const out = process.argv[2] || 'sprites-preview.png';
const S = 5, CELL = 16 * S + 8, COLS = 10;
const items = [
  ...DECORATIONS.map((d) => decorGrid(d.id)),
  ...VISITOR_TYPES.flatMap((v) => [visitorGrid(v.id, 0), visitorGrid(v.id, 1)]),
  ...Object.keys(UI_TEMPLATES).map((k) => uiGrid(k)),
];
const rows = Math.ceil(items.length / COLS);
const bmp = new Bitmap(COLS * CELL, rows * CELL, '#86cf5e');
items.forEach((g, i) => {
  const x = (i % COLS) * CELL + 4, y = Math.floor(i / COLS) * CELL + 4;
  bmp.fill(x - 2, y - 2, 16 * S + 4, 16 * S + 4, (i % 2) ? '#7cc957' : '#8fd468');
  bmp.blit(g, x, y, S);
});
writeFileSync(out, bmp.png());
console.log('wrote', out, items.length);
