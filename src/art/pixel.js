// Pixel-art core: templates are arrays of strings, one char per pixel.
// '.' or ' ' is transparent; other chars index into a palette object.
// Templates may set `mirror: true`, in which case each row holds the left half
// plus the centre column and is mirrored to produce a symmetric sprite.
// `px` lists [x, y, char] overrides applied after mirroring (asymmetric details).
// This module is shared by the browser renderer and the Node asset tools.

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

export function mix(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v + (B[i] - v) * t));
}

export const lighten = (c, t) => mix(c, '#fffbea', t);
export const darken = (c, t) => mix(c, '#2a1840', t);

// Shared outline / shadow tones keep every sprite in one family.
export const INK = '#2b1b33';

export function expandRows(tpl) {
  const w = tpl.w || 16;
  const h = tpl.h || tpl.rows.length;
  const rows = [];
  for (let y = 0; y < h; y++) {
    let r = tpl.rows[y] || '';
    if (tpl.mirror) {
      // the half's last char is the centre column; mirror everything before it
      const half = r.padEnd(Math.ceil(w / 2), '.').slice(0, Math.ceil(w / 2));
      r = half + half.slice(0, -1).split('').reverse().join('');
    }
    rows.push(r.padEnd(w, '.').slice(0, w).split(''));
  }
  for (const [x, y, ch] of tpl.px || []) {
    if (rows[y] && x >= 0 && x < w) rows[y][x] = ch;
  }
  return rows;
}

// Returns { w, h, px } where px is an array of hex colours (or null).
export function renderTemplate(tpl, palette) {
  const rows = expandRows(tpl);
  const w = tpl.w || 16;
  const h = rows.length;
  const px = new Array(w * h).fill(null);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === '.' || ch === ' ') continue;
      const col = palette[ch];
      if (col) px[y * w + x] = col;
    }
  }
  return { w, h, px };
}

// Overlay one pixel grid onto another at an offset.
export function compose(base, top, ox = 0, oy = 0) {
  const out = { w: base.w, h: base.h, px: base.px.slice() };
  for (let y = 0; y < top.h; y++) {
    for (let x = 0; x < top.w; x++) {
      const c = top.px[y * top.w + x];
      const tx = x + ox;
      const ty = y + oy;
      if (c && tx >= 0 && ty >= 0 && tx < out.w && ty < out.h) out.px[ty * out.w + tx] = c;
    }
  }
  return out;
}

// Single-colour silhouette of a sprite (used by the mystery reveal).
export function silhouette(grid, color = INK) {
  return { w: grid.w, h: grid.h, px: grid.px.map((c) => (c ? color : null)) };
}

// Add a 1px outline around opaque pixels (for sprites drawn without one).
export function outline(grid, color = INK) {
  const { w, h, px } = grid;
  const out = px.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[y * w + x]) continue;
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        return nx >= 0 && ny >= 0 && nx < w && ny < h && px[ny * w + nx];
      });
      if (n) out[y * w + x] = color;
    }
  }
  return { w, h, px: out };
}

// Palette for crop sprites derived from the crop's three colours.
//   o outline  m main  l light  d dark  a accent  b accent-dark  c accent-light
//   g leaf  h leaf-light  k leaf-dark (also stems)  w white  s soil-ish brown
export function cropPalette({ main, accent, leaf }) {
  return {
    o: mix(darken(main, 0.55), INK, 0.45),
    m: main,
    l: lighten(main, 0.45),
    d: darken(main, 0.28),
    a: accent,
    b: darken(accent, 0.3),
    c: lighten(accent, 0.5),
    g: leaf,
    h: lighten(leaf, 0.35),
    k: mix(darken(leaf, 0.5), INK, 0.35),
    w: '#ffffff',
    s: '#8a5a3c',
    x: INK,
  };
}

// ---------------------------------------------------------------- RGBA <-> grid

// Split an RGBA image (Uint8 array, row-major) into square frames laid out
// horizontally. Pixels with alpha < 128 are transparent.
export function framesFromRGBA(width, height, data) {
  const size = height;
  const count = width % size === 0 ? width / size : 1;
  const fw = count > 1 ? size : width;
  const frames = [];
  for (let f = 0; f < count; f++) {
    const px = new Array(fw * height).fill(null);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < fw; x++) {
        const i = (y * width + f * fw + x) * 4;
        if (data[i + 3] >= 128) px[y * fw + x] = rgbToHex([data[i], data[i + 1], data[i + 2]]);
      }
    }
    frames.push({ w: fw, h: height, px });
  }
  return frames;
}

// Nearest-neighbour upscale by an integer factor.
export function scaleGrid(grid, k) {
  if (k === 1) return grid;
  const w = grid.w * k;
  const h = grid.h * k;
  const px = new Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = grid.px[Math.floor(y / k) * grid.w + Math.floor(x / k)];
  return { w, h, px };
}

function hsl(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let hue;
  if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) hue = ((b - r) / d + 2) * 60;
  else hue = ((r - g) / d + 4) * 60;
  return [hue, s, l];
}

// "Unripe" version of a sprite: keeps foliage and outlines, washes everything
// else towards a pale leaf green so the shape shows but the colour mostly hides.
// Works on any grid, including hand-made PNG overrides.
export function unripe(grid, leaf, amount = 0.62) {
  const bud = mix(leaf, '#e6f2c8', 0.35);
  const out = grid.px.map((c) => {
    if (!c) return c;
    const [hue, s, l] = hsl(c);
    if (l < 0.2) return c;
    if (hue >= 65 && hue <= 170 && s > 0.18) return c;
    return mix(c, bud, amount);
  });
  return { w: grid.w, h: grid.h, px: out };
}
