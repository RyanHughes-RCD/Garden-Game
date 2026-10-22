// Shared helpers for the art pipeline (Node side): reading/writing override
// PNGs in assets/art/ and keeping assets/art/manifest.json in sync.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { decodePNG, Bitmap } from './png.mjs';
import { framesFromRGBA } from '../src/art/pixel.js';
import { setOverride } from '../src/art/sprites.js';

export const ROOT = new URL('..', import.meta.url).pathname;
export const ART_DIR = join(ROOT, 'assets/art');
export const KINDS = ['crops', 'decor', 'visitors', 'ui'];

export function readPNGFrames(file) {
  const { width, height, data } = decodePNG(readFileSync(file));
  return framesFromRGBA(width, height, data);
}

export function writeFrames(file, frames) {
  const w = frames[0].w;
  const h = frames[0].h;
  const bmp = new Bitmap(w * frames.length, h);
  frames.forEach((g, i) => bmp.blit(g, i * w, 0, 1));
  writeFileSync(file, bmp.png());
}

// Rebuild the manifest from the files actually present in assets/art/<kind>/.
export function syncManifest() {
  const manifest = { version: 1 };
  for (const kind of KINDS) {
    const dir = join(ART_DIR, kind);
    manifest[kind] = {};
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).sort()) {
      if (f.endsWith('.png')) manifest[kind][f.slice(0, -4)] = `${kind}/${f}`;
    }
  }
  mkdirSync(ART_DIR, { recursive: true });
  writeFileSync(join(ART_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export function readManifest() {
  const file = join(ART_DIR, 'manifest.json');
  if (!existsSync(file)) return { version: 1, crops: {}, decor: {}, visitors: {}, ui: {} };
  return JSON.parse(readFileSync(file, 'utf8'));
}

// Register every override in the manifest with the sprite library.
export function loadOverridesNode() {
  const manifest = readManifest();
  let n = 0;
  for (const kind of KINDS) {
    for (const [key, rel] of Object.entries(manifest[kind] || {})) {
      setOverride(kind, key, readPNGFrames(join(ART_DIR, rel)));
      n++;
    }
  }
  return n;
}
