import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';
import { AREAS, MISSIONS, createState, chooseSize, fire, isPrime } from '../src/rules.mjs';

const root = resolve(import.meta.dirname, '..');
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    const data = await readFile(file);
    res.setHeader('Content-Type', ({ '.html':'text/html; charset=utf-8', '.mjs':'text/javascript', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png' })[extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const errors = [];
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const page = await context.newPage();
page.on('pageerror', e => errors.push(e.message));
page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
const route = async path => {
  await page.goto(`${base}/${path ? '#' + path : ''}`);
  await page.locator('h1').waitFor();
};
const click = async (action, key, value) => {
  const selector = `[data-action="${action}"]${key ? `[data-${key}="${value}"]` : ''}`;
  await page.locator(selector).click();
};
const shoot = async (action = 'fire') => {
  await click(action);
  await page.waitForFunction(() => !document.querySelector('[data-action="fire"]:disabled'));
};
const noOverflow = async label => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${label}: horizontal overflow`);

try {
  await route('');
  assert.equal(await page.locator('.world-card').count(), 4);
  for (const area of AREAS) {
    await page.locator(`.world-card[href="#${area.id}"]`).click();
    await page.locator('.stage-card').first().waitFor();
    assert.equal(await page.locator('.stage-card').count(), 9);
    await route('');
  }
  console.log('All areas and all stages are freely accessible.');

  for (const area of AREAS) for (const [index, m] of MISSIONS[area.id].entries()) {
    await route(`${area.id}/${index + 1}`);
    await noOverflow(`${area.id}/${index + 1}`);
    if (area.id === 'spark') {
      const values = [...m.ammo, ...m.reserve], initial = (1 << m.ammo.length) - 1;
      let best = null, cost = Infinity;
      for (let mask = 0; mask < 1 << values.length; mask++) {
        const total = values.reduce((t, n, i) => t + (mask & (1 << i) ? n : 0), 0);
        const moves = (mask ^ initial).toString(2).replace(/0/g, '').length;
        if (total === m.target && moves < cost) { best = mask; cost = moves; }
      }
      assert.notEqual(best, null);
      for (let i = m.ammo.length - 1; i >= 0; i--) if (!(best & (1 << i))) await page.locator(`[data-action="move"][data-source="ammo"][data-index="${i}"]`).click();
      for (let i = m.reserve.length - 1; i >= 0; i--) if (best & (1 << (i + m.ammo.length))) await page.locator(`[data-action="move"][data-source="reserve"][data-index="${i}"]`).click();
      assert.equal(await page.locator('.ammo-tray .unit-dot').count(), m.target);
      assert.equal(await page.locator('.ammo-tray .unit-dot, .reserve-tray .unit-dot').count(), values.reduce((a,b) => a+b, 0));
      await shoot();
    } else if (area.id === 'core') {
      let n = m.n;
      while (!isPrime(n)) {
        const f = Array.from({ length: 18 }, (_, i) => i + 2).find(f => isPrime(f) && n % f === 0);
        await click('size', 'value', f);
        assert.equal(await page.locator('.group-tray .unit-dot').count(), m.n, 'every original dot remains visible inside its bundle');
        await shoot(); n /= f;
      }
      await shoot('prime');
      if (m.square) {
        assert.equal(await page.locator('.rectangle-preview .unit-dot').count(), m.n);
        const factors = await page.locator('.factor-chip').evaluateAll(nodes => nodes.map(n => ({ index: Number(n.dataset.index), value: Number(n.childNodes[0].textContent) })));
        const seen = {};
        for (const f of factors) {
          seen[f.value] = (seen[f.value] || 0) + 1;
          if (seen[f.value] % 2) await click('factor', 'index', f.index);
        }
        await noOverflow(`square ${m.n}`);
        await shoot();
        assert.equal(await page.locator('.completed-square .unit-dot').count(), m.n);
      }
    } else {
      const choices = await page.locator('[data-action="size"]').evaluateAll(nodes => nodes.map(n => Number(n.dataset.value)));
      const f = choices.find(v => {
        const s = createState(area.id, index); chooseSize(s, v);
        s.remainder = m.n % v; s.parity = m.n % 2 ? 'odd' : 'even';
        return fire(s).ok;
      });
      assert.notEqual(f, undefined);
      await click('size', 'value', f);
      assert.equal(await page.locator('.group-tray .unit-dot').count(), area.id === 'gear' ? m.numbers[0] + m.numbers[1] : m.n);
      if (m.rule === 'remainder') await click('remainder', 'value', m.n % f);
      if (m.rule === 'parity') await click('parity', 'value', m.n % 2 ? 'odd' : 'even');
      await shoot();
    }
    await page.locator('.victory').waitFor();
  }
  await route('');
  assert.match(await page.locator('.overall-progress').textContent(), /36/);
  await page.reload();
  await page.locator('.world-card').first().waitFor();
  assert.equal(await page.locator('.mini-progress .filled').count(), 36);
  console.log('All 36 stages cleared through real controls; dot counts and saved progress verified.');

  await route('gear/1');
  await click('size', 'value', 5);
  await shoot();
  assert.equal(await page.locator('.health .active').count(), 3);
  await click('reset');
  assert.equal(await page.locator('.health .active').count(), 3, 'reset cannot erase damage');
  await click('size', 'value', 5);
  await shoot(); await shoot(); await shoot();
  await page.locator('.defeat').waitFor();
  await click('retry');
  assert.equal(await page.locator('.health .active').count(), 4);
  assert.match(await page.locator('h1').textContent(), /ふたつの/);

  await route('link/6'); await shoot();
  assert.match(await page.locator('.feedback').textContent(), /のこった数をえらぼう/);
  await route('spark/1');
  for (let i = 0; i < 5; i++) await shoot();
  assert.equal(await page.locator('.defeat').count(), 0);
  await page.locator('[data-action="split"][data-source="ammo"]').first().click();
  assert.equal(await page.locator('.ammo-tray .unit-dot, .reserve-tray .unit-dot').count(), 15);
  console.log('Wrong shots, free rearranging, missing answers, retries, and splitting verified.');

  // Normal animations, including changing routes during an in-flight attack.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await route('spark/1');
  await page.getByRole('button', { name: '2こをたす', exact: true }).click();
  await click('fire');
  await page.locator('.battle-nav a[href="#spark"]').click();
  await page.locator('.stage-grid').waitFor();
  await page.waitForTimeout(850);
  assert.equal(await page.locator('.flying-shot').count(), 0);
  assert.equal(await page.locator('.stage-grid').count(), 1);
  await route('spark/1');
  await page.getByRole('button', { name: '2こをたす', exact: true }).click();
  await shoot(); await page.locator('.victory').waitFor();
  await page.emulateMedia({ reducedMotion: 'reduce' });

  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['', 'spark', 'spark/1', 'link/7', 'gear/9', 'core/9']) { await route(path); await noOverflow(`${width}px ${path}`); }
  }
  await page.setViewportSize({ width: 1280, height: 1000 });
  await route(''); await mkdir(resolve(root, 'artifacts'), { recursive: true });
  await page.screenshot({ path: resolve(root, 'artifacts/home-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await route('spark/1'); await page.screenshot({ path: resolve(root, 'artifacts/spark-mobile.png'), fullPage: true });

  await page.goto(`${base}/classic.html`);
  await page.locator('#modes').waitFor();
  for (const mode of ['casual', 'normal', 'expert', 'blitz']) {
    await page.locator(`[data-mode="${mode}"]`).click();
    assert.equal(await page.locator(`[data-mode="${mode}"].on`).count(), 1);
    assert.ok(Number(await page.locator('#num').textContent()) > 1);
  }
  await page.locator('.app>a[href="./"]').click();
  await page.locator('.world-card').first().waitFor();
  console.log('320–1280px layouts, animation navigation, and all 4 classic modes verified.');

  const blocked = await browser.newContext({ reducedMotion: 'reduce' });
  await blocked.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('disabled'); } }); });
  const privatePage = await blocked.newPage();
  privatePage.on('pageerror', e => errors.push(e.message));
  await privatePage.goto(`${base}/#spark/1`);
  await privatePage.getByRole('button', { name: '2こをたす', exact: true }).click();
  await privatePage.locator('[data-action="fire"]').click();
  await privatePage.locator('.victory').waitFor();
  assert.equal(await privatePage.locator('.storage-note').count(), 1);
  await blocked.close();
  assert.deepEqual(errors, []);
  console.log('Storage-disabled play passes. No browser errors or missing assets.');
} finally {
  await browser.close();
  await new Promise(r => server.close(r));
}
