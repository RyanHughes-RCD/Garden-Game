// The garden scene: one 80×112 pixel-art picture drawn behind the crop beds
// and decorations — lawn, fence and flower border, a raised-bed frame around
// the crops and a winding stone path. Plus small ambient sprites.
import { INK, mix } from './pixel.js';
import { SCENE_W, SCENE_H } from '../data/garden.js';

const C = {
  grass: '#86cf5e', grassStripe: '#80c958', blade: '#6ab84a', bladeLight: '#a6e07a', edge: '#5aa83e',
  fence: '#d39a5e', fenceLight: '#e8b87a', fenceDark: '#a0643a',
  stone: '#cfc6b4', stoneLight: '#e8e0d0', stoneDark: '#9a907e',
  wood: '#b07440', woodLight: '#d39a5e', woodDark: '#7a4a2a', soil: '#6e4430',
  flowers: ['#ffffff', '#ffd23f', '#ffa6d2', '#b58cff', '#ff8a8a'],
};

// Deterministic per-pixel noise.
function noise(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Centre line of the path for a given y (gentle S-curve).
export const pathX = (y) => 40 + Math.sin((y - 82) / 8) * 4;

// Crop-bed frame, in art px (plots are tiles x 1–3, y 1–4).
export const BED = { x0: 14, y0: 14, x1: 66, y1: 82 };

export function paintScene() {
  const W = SCENE_W;
  const H = SCENE_H;
  const px = new Array(W * H).fill(C.grass);
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) px[y * W + x] = c; };
  const get = (x, y) => px[y * W + x];

  // lawn: mowing stripes, blades, a darker edge
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let c = Math.floor(y / 8) % 2 ? C.grassStripe : C.grass;
      const n = noise(x, y, 1);
      if (n > 0.94) c = C.bladeLight;
      else if (n < 0.07) c = C.blade;
      if (x === 0 || x === W - 1 || y === H - 1) c = C.edge;
      set(x, y, c);
    }
  }
  // little grass tufts
  for (let k = 0; k < 70; k++) {
    const x = Math.floor(noise(k, 7, 2) * W);
    const y = 12 + Math.floor(noise(k, 9, 3) * (H - 14));
    set(x, y, C.blade); set(x + 1, y - 1, C.bladeLight); set(x + 2, y, C.blade);
  }

  // stone path from the bed frame to the bottom edge
  for (let y = BED.y1 - 1; y < H; y++) {
    const cx = pathX(y);
    const half = 5 + (y - BED.y1) / 10;
    for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) set(x, y, mix(C.grass, C.stoneDark, 0.35));
  }
  for (let y = BED.y1 + 2; y < H + 3; y += 5) {
    const cx = pathX(y);
    const row = Math.floor(y / 5) % 2;
    for (const off of row ? [-4, 3] : [-6, 0, 6]) {
      const sx = Math.round(cx + off + (noise(y, off, 4) - 0.5) * 2);
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          if ((dx * dx) / 9 + (dy * dy) / 4 > 1) continue;
          const edge = (dx * dx) / 9 + (dy * dy) / 4 > 0.55;
          set(sx + dx, y + dy, edge ? C.stoneDark : dy < 0 && dx < 1 ? C.stoneLight : C.stone);
        }
      }
    }
  }

  // raised-bed frame around the crops (the plots draw their own soil on top)
  for (let y = BED.y0; y <= BED.y1; y++) {
    for (let x = BED.x0; x <= BED.x1; x++) {
      const border = x < BED.x0 + 2 || x > BED.x1 - 2 || y < BED.y0 + 2 || y > BED.y1 - 2;
      if (!border) { set(x, y, C.soil); continue; }
      const outer = x === BED.x0 || x === BED.x1 || y === BED.y0 || y === BED.y1;
      const lit = y < BED.y0 + 2 || x < BED.x0 + 2;
      set(x, y, outer ? INK : lit ? C.woodLight : C.wood);
    }
  }
  // plank seams and a shadow below the frame
  for (let x = BED.x0 + 6; x < BED.x1; x += 9) { set(x, BED.y1 - 1, C.woodDark); set(x, BED.y0 + 1, C.wood); }
  for (let x = BED.x0 + 1; x <= BED.x1 + 1; x++) set(x, BED.y1 + 1, mix(get(x, BED.y1 + 1), '#2a4a20', 0.35));

  // wooden fence along the top with a flower border below it
  for (let x = 0; x < W; x++) {
    for (const ry of [4, 8]) { set(x, ry, C.fence); set(x, ry + 1, C.fenceDark); }
    set(x, 3, INK);
    set(x, 10, mix(C.grass, INK, 0.3));
  }
  for (let x = 2; x < W; x += 7) {
    for (let y = 1; y < 11; y++) set(x, y, y === 1 ? INK : C.fenceLight), set(x + 1, y, y === 1 ? INK : C.fence), set(x + 2, y, INK);
    set(x - 1, 2, INK);
  }
  for (let x = 1; x < W - 1; x += 3) {
    const c = C.flowers[Math.floor(noise(x, 11, 5) * C.flowers.length)];
    const y = 11 + Math.floor(noise(x, 12, 6) * 2);
    set(x, y + 1, C.blade);
    set(x, y, c);
  }

  // scattered wildflowers on the open lawn (kept off the path and beds)
  for (let k = 0; k < 26; k++) {
    const x = 2 + Math.floor(noise(k, 21, 7) * (W - 4));
    const y = 16 + Math.floor(noise(k, 23, 8) * (H - 18));
    const inBed = x >= BED.x0 - 1 && x <= BED.x1 + 1 && y >= BED.y0 - 1 && y <= BED.y1 + 2;
    const onPath = y > BED.y1 && Math.abs(x - pathX(y)) < 9;
    if (inBed || onPath) continue;
    const c = C.flowers[k % C.flowers.length];
    set(x, y, c); set(x - 1, y, c); set(x + 1, y, c); set(x, y - 1, c); set(x, y + 1, '#e8a020');
  }
  return { w: W, h: H, px };
}

// --- small ambient sprites ---------------------------------------------------

const sprite = (rows, pal) => {
  const h = rows.length;
  const w = rows[0].length;
  const px = [];
  for (const r of rows) for (const ch of r) px.push(ch === '.' ? null : pal[ch]);
  return { w, h, px };
};

export const AMBIENT = {
  tuft: sprite(['.h..h', '.gh.g', 'g.gg.', '.ggg.'], { g: C.blade, h: C.bladeLight }),
  butterfly: sprite(['oo.oo', 'pkokp', 'pkokp', '.o.o.'], { o: INK, p: '#ffa6d2', k: '#ffd0ea' }),
  butterflyBlue: sprite(['oo.oo', 'bkokb', 'bkokb', '.o.o.'], { o: INK, b: '#7cc4ff', k: '#d0ecff' }),
};
