// Deterministic random helpers. Every random outcome in the game is derived
// from the save's master seed plus a counter, so reloading never rerolls.

// 32-bit string/number hash (FNV-1a variant mixed with murmur finaliser).
export function hash32(...parts) {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x7c; // separator
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// mulberry32: small, fast, good-enough PRNG returning floats in [0, 1).
export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(min, max) { return min + Math.floor(next() * (max - min + 1)); },
    range(min, max) { return min + next() * (max - min); },
    pick(arr) { return arr[Math.floor(next() * arr.length)]; },
  };
}

// Pick an item from [{item, weight}] using a uniform roll in [0, 1).
export function weightedPick(entries, roll) {
  let total = 0;
  for (const e of entries) total += Math.max(0, e.weight);
  if (total <= 0) return entries.length ? entries[entries.length - 1].item : undefined;
  let r = roll * total;
  for (const e of entries) {
    const w = Math.max(0, e.weight);
    if (r < w) return e.item;
    r -= w;
  }
  return entries[entries.length - 1].item;
}

export function randomSeed() {
  if (globalThis.crypto && globalThis.crypto.getRandomValues) {
    const a = new Uint32Array(1);
    globalThis.crypto.getRandomValues(a);
    return a[0] >>> 0;
  }
  return (Math.random() * 4294967296) >>> 0;
}
