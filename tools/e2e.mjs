// End-to-end gameplay check in a real browser (Playwright, iPhone viewport).
// Plays the full loop with a fake clock: buy, plant, reveal, water, wait hours,
// harvest, discover, visitors, decorate, earn a bonus, reload, showcase.
// Usage: node tools/e2e.mjs [screenshot-dir]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = createRequire('/opt/node22/lib/node_modules/')('playwright'); }
const { chromium, devices } = playwright;

const outDir = process.argv[2] || new URL('../e2e-shots/', import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });
const PORT = 8765;
const server = spawn(process.execPath, [new URL('./serve.mjs', import.meta.url).pathname], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));

const HOUR = 3600e3;
const T0 = new Date('2026-05-01T09:00:00').getTime();
const errors = [];
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
try {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.clock.install({ time: T0 });
  await page.goto(`http://localhost:${PORT}/`);
  await page.clock.runFor(1500);
  const shot = (name) => page.screenshot({ path: `${outDir}/${name}.png` });
  const save = () => page.evaluate(() => JSON.parse(localStorage.getItem('littleGarden.save')));
  const tap = async (sel) => { await page.locator(sel).first().click(); await page.clock.runFor(400); };
  const advance = async (ms) => { await page.clock.setSystemTime((await page.evaluate(() => Date.now())) + ms); await page.clock.runFor(2200); };
  await shot('01-start');

  let s = await save();
  assert.equal(s.coins, 40);
  assert.equal(s.seeds.sprout, 3);

  // plant 3 starter seeds with the reveal animation
  for (let i = 1; i <= 3; i++) {
    await tap(`button[aria-label="Plot ${i}"]`);
    if (i === 1) await shot('02-seed-picker');
    await tap('.sheet button:has-text("Plant")');
    if (i === 1) { await page.clock.runFor(600); await shot('03-reveal-spinning'); }
    await page.clock.runFor(4000);
    if (i === 1) await shot('04-reveal-landed');
    await tap('.modal button:has-text("Water now")');
  }
  s = await save();
  assert.equal(s.seeds.sprout, 0);
  assert.equal(s.plots.filter((p) => p.crop).length, 3);
  assert.ok(s.plots.slice(0, 3).every((p) => p.crop.waters[0] != null), 'watered at planting');
  const planted = s.plots.map((p) => p.crop && p.crop.cropId);

  // buy a seed in the shop, plant via "buy & plant" too
  await tap('#tabbar button[data-tab="seeds"]');
  await shot('05-seed-shop');
  await tap('.tier-card button:has-text("Buy 1")');
  s = await save();
  assert.equal(s.coins, 30);
  assert.equal(s.seeds.sprout, 1);
  await tap('#tabbar button[data-tab="garden"]');
  await tap('button[aria-label="Plot 4"]');
  await tap('.sheet button:has-text("Plant")');
  await page.clock.runFor(4000);
  await tap('.modal button:has-text("Lovely!")');

  // reload mid-growth: crop identities must not change
  await page.reload();
  await page.clock.runFor(1500);
  s = await save();
  assert.deepEqual(s.plots.map((p) => p.crop && p.crop.cropId).slice(0, 3), planted.slice(0, 3), 'no reroll on refresh');

  // 40 minutes later: plot info sheet with watering schedule
  await advance(40 * 60e3);
  await shot('06-growing');
  await page.clock.runFor(1500);
  await tap('button[aria-label="Plot 1"]'); // waters if its window is open
  await page.clock.runFor(1500);
  if (!(await page.locator('.sheet').count())) await tap('button[aria-label="Plot 1"]');
  await shot('07-plot-info');
  await page.locator('.backdrop').last().click({ position: { x: 10, y: 10 } });

  // leave for 3 hours (closed app): crops finish, a visitor waits
  await advance(3 * HOUR);
  await shot('08-ready');
  if (await page.locator('.visitor button').count()) {
    await tap('.visitor button');
    await shot('09-visitor');
    await tap('.modal button:has-text("Thank you!")');
  }
  const coinsBefore = (await save()).coins;
  await tap('.garden-hint button:has-text("Harvest")');
  await page.clock.runFor(800);
  await shot('10-harvest');
  await tap('.modal button:has-text("Collect")');
  s = await save();
  assert.ok(s.coins > coinsBefore, 'harvest paid coins');
  assert.ok(Object.keys(s.discovered).length >= 1, 'discovered crops');
  assert.equal(s.plots.filter((p) => p.crop).length, 0, 'plots cleared');
  const harvests = s.stats.harvests;

  // refresh again: everything persisted, no duplicate harvest
  await page.reload();
  await page.clock.runFor(1500);
  s = await save();
  assert.equal(s.stats.harvests, harvests);

  await tap('#tabbar button[data-tab="collection"]');
  await shot('11-collection');
  await tap('.dex-card:not(.locked)');
  await shot('12-crop-detail');
  await page.locator('.backdrop').last().click({ position: { x: 10, y: 10 } });

  // decorations: give the test player coins, buy & place, earn a bonus
  await page.evaluate(() => { const v = JSON.parse(localStorage.getItem('littleGarden.save')); v.coins += 3000; v.rev += 1; localStorage.setItem('littleGarden.save', JSON.stringify(v)); });
  await page.reload();
  await page.clock.runFor(1500);
  await tap('#tabbar button[data-tab="decor"]');
  await shot('13-decor-shop');
  for (const name of ['Garden Gnome', 'Birdhouse']) {
    await tap(`.decor-card:has-text("${name}") button.gold`);
  }
  await tap('.decor-card:has-text("Garden Gnome") button:has-text("Place")');
  await shot('14-placing');
  await tap('button[aria-label="Decoration spot 1"]');
  await page.clock.runFor(2500);
  await shot('15-bonus');
  await tap('.modal button:has-text("Wonderful!")');
  s = await save();
  assert.equal(s.decorTiles[0], 'gnome');
  assert.ok(s.bonuses.length >= 1, 'threshold bonus awarded');
  await tap('button[aria-label="Decoration spot 3"]');
  await tap('.sheet .decor-card');
  s = await save();
  assert.equal(s.decorTiles[2], 'birdhouse');

  // unlock a plot
  await tap('button[aria-label="Plot 5"]');
  await tap('.sheet button:has-text("Unlock")');
  s = await save();
  assert.equal(s.plots[4].unlocked, true);
  await shot('16-decorated');

  await tap('#tabbar button[data-tab="records"]');
  await shot('17-records');
  await tap('button:has-text("Garden showcase")');
  await page.clock.runFor(1500);
  await page.waitForSelector('img.card');
  await page.clock.runFor(1000);
  await shot('18-showcase');
  const card = await page.evaluate(async () => { const im = document.querySelector('img.card'); await im.decode(); return [im.naturalWidth, im.naturalHeight]; });
  assert.deepEqual(card, [720, 1280], 'showcase image rendered');

  // offline: service worker file and manifest are served
  const sw = await page.request.get(`http://localhost:${PORT}/sw.js`);
  assert.equal(sw.status(), 200);
  const manifest = await page.request.get(`http://localhost:${PORT}/manifest.webmanifest`);
  assert.equal((await manifest.json()).start_url, './');

  // no horizontal overflow on the main screens
  for (const tab of ['garden', 'seeds', 'collection', 'decor', 'records']) {
    await page.evaluate(() => document.querySelectorAll('.showcase button').forEach((b) => b.textContent === 'Close' && b.click()));
    await tap(`#tabbar button[data-tab="${tab}"]`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth || document.getElementById('screen').scrollWidth > document.getElementById('screen').clientWidth);
    assert.equal(overflow, false, `no horizontal overflow on ${tab}`);
  }
  assert.deepEqual(errors, [], 'no page errors');
  console.log('E2E OK. Screenshots in', outDir);
} catch (e) {
  console.error('E2E FAILED:', e.message);
  console.error('page errors:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
}
