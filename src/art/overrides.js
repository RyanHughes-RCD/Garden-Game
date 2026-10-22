// Browser loader for PNG sprite overrides listed in assets/art/manifest.json.
// Failures are non-fatal: anything that can't load keeps its generated art.
import { framesFromRGBA } from './pixel.js';
import { setOverride } from './sprites.js';

const BASE = 'assets/art/';

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

function decode(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return framesFromRGBA(c.width, c.height, ctx.getImageData(0, 0, c.width, c.height).data);
}

export async function loadOverrides() {
  let manifest;
  try {
    const res = await fetch(`${BASE}manifest.json`);
    if (!res.ok) return 0;
    manifest = await res.json();
  } catch {
    return 0;
  }
  const jobs = [];
  for (const kind of ['crops', 'decor', 'visitors', 'ui']) {
    for (const [key, rel] of Object.entries(manifest[kind] || {})) {
      jobs.push(loadImage(BASE + rel)
        .then((img) => setOverride(kind, key, decode(img)))
        .catch((err) => console.warn('Sprite override skipped:', err.message)));
    }
  }
  await Promise.all(jobs);
  return jobs.length;
}
