// Builds a rich demo save by simulating weeks of play with the real game
// rules, then captures screenshots at several iPhone sizes.
// Usage: node tools/screenshots.mjs [out-dir]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import * as G from '../src/core/game.js';
import { newState } from '../src/core/state.js';
import { SEED_TIERS, HOUR } from '../src/data/config.js';
import { DECORATIONS } from '../src/data/decorations.js';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = createRequire('/opt/node22/lib/node_modules/')('playwright'); }
const { chromium, devices } = playwright;
const outDir = process.argv[2] || new URL('../docs/screenshots/', import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });

// --- simulate ~3 weeks of casual play (check-ins every 4 hours)
const start = Date.now() - 21 * 24 * HOUR;
const s = newState(start, 4242);
let now = start;
const tiers = [...SEED_TIERS].reverse();
for (let step = 0; step < 21 * 6; step++) {
  G.tick(s, now);
  if (s.visitor.current) G.greetVisitor(s, now);
  s.plots.forEach((p, i) => { if (p.crop && G.cropStatus(p.crop, now).ready) G.harvest(s, i, now); });
  s.plots.forEach((p, i) => { if (p.crop) G.water(s, i, now); });
  const price = G.nextPlotPrice(s);
  if (price && s.coins > price * 2) G.unlockPlot(s);
  const free = s.decorTiles.indexOf(null);
  const dec = DECORATIONS.filter((d) => !d.trophy && !s.decorOwned[d.id] && d.price * 4 < s.coins).sort((a, b) => b.price - a.price)[0];
  if (free >= 0 && dec) { G.buyDecor(s, dec.id); G.placeDecor(s, free, dec.id, now); }
  s.plots.forEach((p, i) => {
    if (!p.unlocked || p.crop) return;
    const t = (step + i) % 3 === 0 ? SEED_TIERS[0] : tiers.find((x) => G.seedPrice(s, x.id) <= s.coins * 0.25) || SEED_TIERS[0];
    if (!s.seeds[t.id]) G.buySeeds(s, t.id, 1);
    const have = SEED_TIERS.find((x) => s.seeds[x.id] > 0);
    if (have) G.plant(s, i, have.id, now - Math.random() * 3 * HOUR);
  });
  now += 4 * HOUR;
}
s.visitor.current = null;
s.visitor.nextAt = Date.now() + 2000;
s.settings.gardenName = 'Sunny Meadow';
s.lastSeenAt = Date.now();
const json = JSON.stringify(s);
console.log('demo save:', Object.keys(s.discovered).length, 'found, score', G.decorScore(s), 'coins', s.coins);

const PORT = 8766;
const server = spawn(process.execPath, [new URL('./serve.mjs', import.meta.url).pathname], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch();
const errors = [];
try {
  for (const [label, dev] of [['se', devices['iPhone SE']], ['13', devices['iPhone 13']], ['promax', devices['iPhone 14 Pro Max']]]) {
    const ctx = await browser.newContext({ ...dev, serviceWorkers: 'block' });
    await ctx.addInitScript((save) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('littleGarden.save', save); sessionStorage.setItem('seeded', '1'); } }, json);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `${outDir}/garden-${label}.png` });
    if (label === '13') {
      for (const tab of ['seeds', 'collection', 'decor', 'records']) {
        await page.click(`#tabbar button[data-tab="${tab}"]`);
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${outDir}/${tab}.png` });
      }
      await page.click('button:has-text("Garden showcase")');
      await page.waitForSelector('img.card');
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${outDir}/showcase.png` });
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
if (errors.length) { console.error('page errors', errors); process.exitCode = 1; }
console.log('screenshots in', outDir);
