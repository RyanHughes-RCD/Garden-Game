import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const walk = (dir) => readdirSync(join(root, dir)).flatMap((f) => {
  const p = join(dir, f);
  return statSync(join(root, p)).isDirectory() ? walk(p) : [p];
});

test('service worker precaches every source file and listed assets exist', () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  const listed = [...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);
  for (const f of walk('src')) assert.ok(listed.includes(f), `sw.js is missing ${f}`);
  for (const f of listed) assert.ok(existsSync(join(root, f)), `sw.js lists missing file ${f}`);
});

test('manifest and html use relative paths (GitHub Pages subpath safe)', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  for (const icon of manifest.icons) {
    assert.ok(!icon.src.startsWith('/'));
    assert.ok(existsSync(join(root, icon.src)), icon.src);
  }
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert.ok(!/(src|href)="\//.test(html), 'no root-absolute paths in index.html');
  assert.ok(html.includes('apple-touch-icon'));
});

test('every crop, decoration and visitor has a valid sprite template', async () => {
  const { CROPS } = await import('../src/data/crops.js');
  const { DECORATIONS } = await import('../src/data/decorations.js');
  const { VISITOR_TYPES } = await import('../src/data/visitors.js');
  const { cropGrid, decorGrid, visitorGrid, stageGrid } = await import('../src/art/sprites.js');
  const keys = new Set();
  for (const c of CROPS) {
    const g = cropGrid(c.id);
    assert.equal(g.w * g.h, 256);
    const filled = g.px.filter(Boolean).length;
    assert.ok(filled > 40, `${c.name} has art`);
    keys.add(`${c.template}|${c.colors.main}|${c.colors.accent}|${c.colors.leaf}|${c.fx}`);
    for (let st = 0; st < 4; st++) assert.ok(stageGrid(c.id, st).px.some(Boolean));
  }
  assert.equal(keys.size, 100, 'every crop looks distinct');
  for (const d of DECORATIONS) assert.ok(decorGrid(d.id).px.filter(Boolean).length > 30, d.id);
  for (const v of VISITOR_TYPES) assert.ok(visitorGrid(v.id).px.filter(Boolean).length > 30, v.id);
});
