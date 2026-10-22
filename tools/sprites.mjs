#!/usr/bin/env node
// Art pipeline CLI: export, import, remove, list, check and preview sprite
// overrides. Override PNGs live in assets/art/<kind>/<key>.png and replace the
// procedural sprite with the same key at runtime.
//
//   npm run sprites -- <command> [filters] [options]
//
// Run `npm run sprites -- help` for the full reference.
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { CROPS } from '../src/data/crops.js';
import { DECORATIONS } from '../src/data/decorations.js';
import { VISITOR_TYPES } from '../src/data/visitors.js';
import { UI_TEMPLATES } from '../src/art/uiArt.js';
import { INK, scaleGrid, outline, rgbToHex, hexToRgb } from '../src/art/pixel.js';
import {
  proceduralCropGrid, proceduralStageGrid, proceduralDecorGrid, proceduralVisitorGrid, proceduralUiGrid,
  familyOf, stageGrid, decorGrid, visitorGrid, uiGrid,
} from '../src/art/sprites.js';
import { VISITOR_TEMPLATES } from '../src/art/visitorArt.js';
import { decodePNG, Bitmap } from './png.mjs';
import { ART_DIR, KINDS, ROOT, readPNGFrames, writeFrames, syncManifest, readManifest, loadOverridesNode } from './art-io.mjs';

const HELP = `
Little Garden sprite pipeline

Override PNGs in assets/art/<kind>/<key>.png replace generated sprites.
Kinds: crops, decor, visitors, ui. Frames are square and laid out left→right:
  crops     5 frames (seedling, small, medium, large, final) or 1 (final only;
            the 4 growth stages are then generated, stage 4 from your art)
  visitors  1–2 frames (idle, blink/flap)     decor, ui  1 frame
Any square size works (16, 24, 32, 48…). All frames in a file share one size.

Commands
  export   Write the current generated sprites as editable PNGs (starting points).
           --scale N     upscale N× nearest-neighbour (e.g. 2 → 32px canvases)
           --final-only  crops: export only the final form frame
           --force       overwrite existing override files
  import <dir>
           Convert external PNGs (any size, e.g. AI or painted art) into
           pixel-art overrides. Files are matched to keys by name: crop key
           ("velvet-rose"), crop number ("031", "31-anything"), or exact key for
           other kinds. Crop stages can be separate files: <key>-s0.png … -s4.png
           or one horizontal strip of 5 frames.
           --size N      target frame size in pixels (default 16)
           --colors K    reduce each sprite to K colours (default 16, 0 = off)
           --trim        crop each frame to its content, centre it, sit it on the bottom
           --key-bg      treat the top-left pixel colour as transparent background
           --outline     add a 1px dark outline around the result
           --force       overwrite existing override files
  remove   Delete override files (revert to generated art). Needs a filter or --all.
  list     Show which sprites are overridden.
  check    Validate override files and the manifest (exit 1 on problems).
  preview  Write contact sheets with overrides applied to art-preview/.
  sync     Rebuild assets/art/manifest.json from the files on disk.

Filters (combine freely; default = everything of the kind)
  --kind crops|decor|visitors|ui   (default crops; "all" for every kind)
  --keys a,b,c          sprite keys (crop keys like velvet-rose, decor ids, ui names)
  --ids 1,5,10-20       crop numbers
  --rarity r1,r2        crops/decor: common uncommon rare epic legendary ultra
  --template t1,t2      crops: art template (tulip, rose, mushroom, …)
  --family f1,f2        crops: growth family (bloom tall root rosette bush vine
                        fungus crystal cactus tree pod aquatic)
  --category c1,c2      crops: flower produce fantasy magic

Examples
  npm run sprites -- export --rarity ultra --scale 2
  npm run sprites -- export --kind decor --keys gnome,fountain
  npm run sprites -- import ~/Downloads/crops --size 32 --colors 20 --trim --key-bg
  npm run sprites -- remove --family fungus
  npm run sprites -- preview
`;

// ---------------------------------------------------------------- args

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { out[k] = next; i++; } else out[k] = true;
    } else out._.push(a);
  }
  return out;
}

const list = (v) => (v && v !== true ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : null);

function parseIds(v) {
  const ids = new Set();
  for (const part of list(v) || []) {
    const [a, b] = part.split('-').map(Number);
    for (let i = a; i <= (b || a); i++) ids.add(i);
  }
  return ids.size ? ids : null;
}

// ---------------------------------------------------------------- catalogue

function catalogue(kind) {
  if (kind === 'crops') return CROPS.map((c) => ({ key: c.key, crop: c, rarity: c.rarity }));
  if (kind === 'decor') return DECORATIONS.map((d) => ({ key: d.id, rarity: d.rarity }));
  if (kind === 'visitors') return VISITOR_TYPES.map((v) => ({ key: v.id }));
  if (kind === 'ui') return Object.keys(UI_TEMPLATES).map((k) => ({ key: k }));
  throw new Error(`Unknown kind "${kind}" (use ${KINDS.join(', ')} or all)`);
}

function selectKinds(args) {
  const k = args.kind || 'crops';
  return k === 'all' ? KINDS : [k];
}

function hasFilter(args) {
  return ['keys', 'ids', 'rarity', 'template', 'family', 'category'].some((k) => args[k]);
}

function select(kind, args) {
  const keys = list(args.keys);
  const ids = parseIds(args.ids);
  const rar = list(args.rarity);
  const tpl = list(args.template);
  const fam = list(args.family);
  const cat = list(args.category);
  return catalogue(kind).filter((e) => {
    if (keys && !keys.includes(e.key)) return false;
    if (rar && !rar.includes(e.rarity)) return false;
    if (kind === 'crops') {
      if (ids && !ids.has(e.crop.id)) return false;
      if (tpl && !tpl.includes(e.crop.template)) return false;
      if (fam && !fam.includes(familyOf(e.crop.id))) return false;
      if (cat && !cat.includes(e.crop.category)) return false;
    } else if (ids || tpl || fam || cat) return false;
    return true;
  });
}

const fileFor = (kind, key) => join(ART_DIR, kind, `${key}.png`);

// ---------------------------------------------------------------- export

function proceduralFrames(kind, e, args) {
  if (kind === 'crops') {
    const final = proceduralCropGrid(e.crop.id);
    if (args['final-only']) return [final];
    return [0, 1, 2, 3, 4].map((s) => proceduralStageGrid(e.crop.id, s, final));
  }
  if (kind === 'decor') return [proceduralDecorGrid(e.key)];
  if (kind === 'visitors') return VISITOR_TEMPLATES[e.key].alt ? [proceduralVisitorGrid(e.key, 0), proceduralVisitorGrid(e.key, 1)] : [proceduralVisitorGrid(e.key, 0)];
  return [squareUp(proceduralUiGrid(e.key))];
}

// UI icons are not always square; pad them so frames stay square.
function squareUp(g) {
  if (g.w === g.h) return g;
  const n = Math.max(g.w, g.h);
  const px = new Array(n * n).fill(null);
  const ox = Math.floor((n - g.w) / 2);
  const oy = Math.floor((n - g.h) / 2);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) px[(y + oy) * n + x + ox] = g.px[y * g.w + x];
  return { w: n, h: n, px };
}

function cmdExport(args) {
  const scale = Math.max(1, parseInt(args.scale || '1', 10));
  let wrote = 0;
  let skipped = 0;
  for (const kind of selectKinds(args)) {
    mkdirSync(join(ART_DIR, kind), { recursive: true });
    for (const e of select(kind, args)) {
      const file = fileFor(kind, e.key);
      if (existsSync(file) && !args.force) { skipped++; continue; }
      writeFrames(file, proceduralFrames(kind, e, args).map((g) => scaleGrid(g, scale)));
      wrote++;
    }
  }
  syncManifest();
  console.log(`Exported ${wrote} sprite file(s) to assets/art/${skipped ? ` (${skipped} existing kept; use --force to overwrite)` : ''}.`);
}

// ---------------------------------------------------------------- import

function matchKey(kind, name) {
  const base = name.toLowerCase().replace(/\.png$/, '');
  const stageMatch = base.match(/^(.*?)[-_](?:s|stage)([0-4])$/);
  const stem = stageMatch ? stageMatch[1] : base;
  const stage = stageMatch ? Number(stageMatch[2]) : null;
  const entries = catalogue(kind);
  let hit = entries.find((e) => e.key === stem);
  if (!hit && kind === 'crops') {
    const num = stem.match(/^0*(\d{1,3})(?:\D|$)/);
    if (num) hit = entries.find((e) => e.crop.id === Number(num[1]));
    if (!hit) {
      const norm = stem.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      hit = entries.find((e) => e.key === norm || norm.endsWith(`-${e.key}`));
    }
  }
  return hit ? { key: hit.key, stage } : null;
}

function rgbaFrames(file) {
  const img = decodePNG(readFileSync(file));
  const { width: w, height: h } = img;
  const count = w >= h * 4.5 && w % 5 === 0 ? 5 : w >= h * 1.8 && w % 2 === 0 ? 2 : 1;
  const fw = w / count;
  const frames = [];
  for (let f = 0; f < count; f++) {
    const data = new Uint8Array(fw * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < fw; x++) {
        const s = (y * w + f * fw + x) * 4;
        data.set(img.data.subarray(s, s + 4), (y * fw + x) * 4);
      }
    }
    frames.push({ w: fw, h, data });
  }
  return frames;
}

function keyBackground(fr) {
  const [r, g, b] = fr.data;
  for (let i = 0; i < fr.data.length; i += 4) {
    const d = Math.abs(fr.data[i] - r) + Math.abs(fr.data[i + 1] - g) + Math.abs(fr.data[i + 2] - b);
    if (d < 24) fr.data[i + 3] = 0;
  }
}

function contentBox(fr) {
  let x0 = fr.w, y0 = fr.h, x1 = -1, y1 = -1;
  for (let y = 0; y < fr.h; y++) {
    for (let x = 0; x < fr.w; x++) {
      if (fr.data[(y * fr.w + x) * 4 + 3] >= 128) {
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

// Box-filter downscale to size×size. A target pixel is opaque when at least
// half of its source block is opaque; its colour is the mean of opaque pixels.
// With `box` (shared by all frames of a sprite) the content is trimmed to it.
function downscale(fr, size, box = null) {
  const trim = !!box;
  if (!box) box = { x0: 0, y0: 0, x1: fr.w - 1, y1: fr.h - 1 };
  const bw = box.x1 - box.x0 + 1;
  const bh = box.y1 - box.y0 + 1;
  const side = trim ? Math.max(bw, bh) : Math.max(fr.w, fr.h);
  // trimmed content is centred horizontally and sits on the bottom edge
  const ox = trim ? box.x0 - (side - bw) / 2 : 0;
  const oy = trim ? box.y0 - (side - bh) : 0;
  const k = side / size;
  const px = new Array(size * size).fill(null);
  for (let ty = 0; ty < size; ty++) {
    for (let tx = 0; tx < size; tx++) {
      let n = 0, op = 0, r = 0, g = 0, b = 0;
      const sx0 = ox + tx * k, sy0 = oy + ty * k;
      for (let sy = Math.floor(sy0); sy < Math.ceil(sy0 + k); sy++) {
        for (let sx = Math.floor(sx0); sx < Math.ceil(sx0 + k); sx++) {
          n++;
          if (sx < 0 || sy < 0 || sx >= fr.w || sy >= fr.h) continue;
          const i = (sy * fr.w + sx) * 4;
          if (fr.data[i + 3] < 128) continue;
          op++; r += fr.data[i]; g += fr.data[i + 1]; b += fr.data[i + 2];
        }
      }
      if (n && op / n >= 0.5) px[ty * size + tx] = rgbToHex([r / op, g / op, b / op]);
    }
  }
  return { w: size, h: size, px };
}

// Deterministic k-means colour reduction shared across all frames of a sprite.
function quantize(frames, k) {
  const colours = [];
  for (const f of frames) for (const c of f.px) if (c) colours.push(hexToRgb(c));
  if (!k || colours.length === 0) return frames;
  const uniq = [...new Set(colours.map((c) => c.join(',')))].map((s) => s.split(',').map(Number));
  if (uniq.length <= k) return frames;
  // farthest-point initialisation
  const centres = [uniq[0]];
  const dist = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  while (centres.length < k) {
    let best = null, bd = -1;
    for (const c of uniq) {
      const d = Math.min(...centres.map((m) => dist(c, m)));
      if (d > bd) { bd = d; best = c; }
    }
    centres.push(best);
  }
  for (let it = 0; it < 10; it++) {
    const sums = centres.map(() => [0, 0, 0, 0]);
    for (const c of colours) {
      let bi = 0, bd = Infinity;
      centres.forEach((m, i) => { const d = dist(c, m); if (d < bd) { bd = d; bi = i; } });
      const s = sums[bi]; s[0] += c[0]; s[1] += c[1]; s[2] += c[2]; s[3]++;
    }
    sums.forEach((s, i) => { if (s[3]) centres[i] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
  }
  const nearest = (hex) => {
    const c = hexToRgb(hex);
    let bi = 0, bd = Infinity;
    centres.forEach((m, i) => { const d = dist(c, m); if (d < bd) { bd = d; bi = i; } });
    return rgbToHex(centres[bi]);
  };
  return frames.map((f) => ({ ...f, px: f.px.map((c) => (c ? nearest(c) : c)) }));
}

function cmdImport(args) {
  const dir = args._[1];
  if (!dir || !existsSync(dir)) throw new Error('Usage: sprites import <folder-of-pngs> [options]');
  const kind = args.kind || 'crops';
  if (!KINDS.includes(kind)) throw new Error(`--kind must be one of ${KINDS.join(', ')}`);
  const size = parseInt(args.size || '16', 10);
  const colours = args.colors === undefined ? 16 : parseInt(args.colors, 10);
  const groups = new Map(); // key -> { strip: [frames] } | { stages: [] }
  const unmatched = [];
  for (const f of readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.png')).sort()) {
    const m = matchKey(kind, f);
    if (!m) { unmatched.push(f); continue; }
    const frames = rgbaFrames(join(dir, f));
    if (args['key-bg']) frames.forEach(keyBackground);
    const g = groups.get(m.key) || { stages: [], strip: null };
    if (m.stage !== null) g.stages[m.stage] = frames[0];
    else g.strip = frames;
    groups.set(m.key, g);
  }
  mkdirSync(join(ART_DIR, kind), { recursive: true });
  let wrote = 0;
  for (const [key, g] of groups) {
    let raw = g.strip;
    if (g.stages.filter(Boolean).length) {
      if (g.stages.filter(Boolean).length !== 5) {
        console.warn(`! ${key}: stage files must cover s0–s4 (found ${g.stages.map((s, i) => (s ? i : null)).filter((i) => i !== null).join(',')}); skipped`);
        continue;
      }
      raw = g.stages;
    }
    let box = null;
    if (args.trim) {
      // one box for every frame, so growth stages keep their relative size
      for (const b of raw.map(contentBox).filter(Boolean)) {
        box = box ? { x0: Math.min(box.x0, b.x0), y0: Math.min(box.y0, b.y0), x1: Math.max(box.x1, b.x1), y1: Math.max(box.y1, b.y1) } : b;
      }
    }
    let frames = raw.map((fr) => downscale(fr, size, box));
    frames = quantize(frames, colours);
    if (args.outline) frames = frames.map((fr) => outline(fr, INK));
    const file = fileFor(kind, key);
    if (existsSync(file) && !args.force) { console.warn(`- ${key}: override exists (use --force)`); continue; }
    writeFrames(file, frames);
    wrote++;
    console.log(`+ ${kind}/${key}.png  ${frames.length} frame(s) @ ${size}px`);
  }
  if (unmatched.length) console.warn(`Unmatched files (no ${kind} key found): ${unmatched.join(', ')}`);
  syncManifest();
  console.log(`Imported ${wrote} sprite(s).`);
}

// ---------------------------------------------------------------- remove / list / check

function cmdRemove(args) {
  if (!hasFilter(args) && !args.all) throw new Error('remove needs a filter (e.g. --keys, --rarity) or --all');
  let n = 0;
  for (const kind of selectKinds(args)) {
    for (const e of select(kind, args)) {
      const file = fileFor(kind, e.key);
      if (existsSync(file)) { unlinkSync(file); n++; console.log(`- ${kind}/${e.key}.png`); }
    }
  }
  syncManifest();
  console.log(`Removed ${n} override(s).`);
}

function cmdList(args) {
  const manifest = syncManifest();
  for (const kind of args.kind ? selectKinds(args) : KINDS) {
    const keys = Object.keys(manifest[kind]);
    const total = catalogue(kind).length;
    console.log(`${kind.padEnd(9)} ${String(keys.length).padStart(3)}/${total} overridden${keys.length ? `: ${keys.join(', ')}` : ''}`);
  }
}

export function checkArt() {
  const problems = [];
  const manifest = readManifest();
  for (const kind of KINDS) {
    const valid = new Set(catalogue(kind).map((e) => e.key));
    const dir = join(ART_DIR, kind);
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.png')) : [];
    for (const f of files) {
      const key = basename(f, '.png');
      if (!valid.has(key)) problems.push(`${kind}/${f}: unknown key "${key}"`);
      if (!manifest[kind] || !manifest[kind][key]) problems.push(`${kind}/${f}: missing from manifest (run: npm run sprites -- sync)`);
      let frames;
      try { frames = readPNGFrames(join(dir, f)); } catch (err) { problems.push(`${kind}/${f}: ${err.message}`); continue; }
      const { w, h } = frames[0];
      if (w !== h) problems.push(`${kind}/${f}: frames must be square (${w}×${h}); width must be a multiple of height`);
      const n = frames.length;
      const ok = kind === 'crops' ? n === 1 || n === 5 : kind === 'visitors' ? n <= 2 : n === 1;
      if (!ok) problems.push(`${kind}/${f}: wrong frame count ${n}`);
      if (frames.every((fr) => fr.px.every((c) => !c))) problems.push(`${kind}/${f}: image is fully transparent`);
    }
    for (const [key, rel] of Object.entries(manifest[kind] || {})) {
      if (!existsSync(join(ART_DIR, rel))) problems.push(`manifest lists missing file ${rel} (${key})`);
    }
  }
  return problems;
}

function cmdCheck() {
  const problems = checkArt();
  if (problems.length) {
    console.error(`${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
    process.exitCode = 1;
  } else console.log('Art overrides OK.');
}

function cmdPreview() {
  const n = loadOverridesNode();
  const out = join(ROOT, 'art-preview');
  mkdirSync(out, { recursive: true });
  // crops: 5 stages each, 4 crops per row, 64px cells
  const S = 64, GAP = 4, PER = 4, BLOCK = 5 * (S + GAP) + 16;
  const rows = Math.ceil(CROPS.length / PER);
  const bmp = new Bitmap(PER * BLOCK, rows * (S + 12), '#cfe8b0');
  CROPS.forEach((c, i) => {
    const bx = (i % PER) * BLOCK + 8, by = Math.floor(i / PER) * (S + 12) + 6;
    for (let st = 0; st < 5; st++) {
      const g = stageGrid(c.id, st);
      const x = bx + st * (S + GAP);
      bmp.fill(x, by, S, S, st === 4 ? '#e8f4d8' : '#9a6a42');
      bmp.blit(g, x, by, Math.max(1, Math.floor(S / g.w)));
    }
  });
  writeFileSync(join(out, 'crops.png'), bmp.png());
  const others = [
    ...DECORATIONS.map((d) => decorGrid(d.id)),
    ...VISITOR_TYPES.flatMap((v) => [visitorGrid(v.id, 0), visitorGrid(v.id, 1)]),
    ...Object.keys(UI_TEMPLATES).map((k) => uiGrid(k)),
  ];
  const cols = 10;
  const sheet = new Bitmap(cols * (S + 8), Math.ceil(others.length / cols) * (S + 8), '#86cf5e');
  others.forEach((g, i) => sheet.blit(g, (i % cols) * (S + 8) + 4, Math.floor(i / cols) * (S + 8) + 4, Math.max(1, Math.floor(S / Math.max(g.w, g.h)))));
  writeFileSync(join(out, 'other.png'), sheet.png());
  console.log(`Preview written to art-preview/crops.png and art-preview/other.png (${n} override(s) applied).`);
}

// ---------------------------------------------------------------- main

const COMMANDS = { export: cmdExport, import: cmdImport, remove: cmdRemove, list: cmdList, check: cmdCheck, preview: cmdPreview, sync: () => { syncManifest(); console.log('Manifest synced.'); } };

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  if (!cmd || cmd === 'help' || args.help || !COMMANDS[cmd]) {
    console.log(HELP);
  } else {
    try {
      COMMANDS[cmd](args);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exitCode = 1;
    }
  }
}
