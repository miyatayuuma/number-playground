import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { chromium } from "playwright";
import { STAGES } from "../src/stages.mjs";
const root = resolve(import.meta.dirname, "..");
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      ),
      file = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!file.startsWith(root + "/")) {
      res.writeHead(403).end();
      return;
    }
    const data = await readFile(file);
    res.setHeader(
      "Content-Type",
      {
        ".html": "text/html; charset=utf-8",
        ".mjs": "text/javascript",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".png": "image/png",
      }[extname(file)] || "application/octet-stream",
    );
    res.end(data);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
  hasTouch: true,
});
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => {
  if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
});
const read = () =>
  page.evaluate(async () => (await import("./src/game.mjs")).inspect());
async function settled() {
  await page.waitForFunction(async () => {
    const s = (await import("./src/game.mjs")).inspect();
    return !s.busy && s.width > 0;
  });
  await page.waitForTimeout(45);
  return read();
}
let navigation = 0;
async function route(index) {
  const s = STAGES[index];
  await page.goto(`${base}/?test=${++navigation}#${s.area}/${(index % 3) + 1}`);
  await settled();
}
async function audit() {
  const s = await read(),
    ids = [...s.pieces.flatMap((p) => p.ids), ...s.loaded, ...s.spent];
  assert.equal(ids.length, s.total);
  assert.equal(new Set(ids).size, s.total);
  if (!s.busy)
    assert.equal(
      new Set(s.visibleIds).size,
      s.pieces.flatMap((p) => p.ids).length + s.loaded.length,
    );
  return s;
}
async function drag(piece, destination, n = piece.n) {
  const source = n === piece.n ? piece : piece.parts.find((p) => p.n === n);
  assert.ok(source, `Visible ${n} in ${piece.n}`);
  const box = await page.locator("#world").boundingBox();
  await page.mouse.move(box.x + source.x, box.y + source.y);
  await page.mouse.down();
  const selected = await read();
  assert.equal(selected.dragIds.length, n, `selected ${n} in ${piece.n}`);
  await page.mouse.move(box.x + destination.x, box.y + destination.y, {
    steps: 12,
  });
  await page.mouse.up();
  await settled();
  await audit();
}
async function shoot(n, targetIndex, sourceN = n) {
  const s = await read();
  const p = s.pieces.find((p) => p.n === sourceN);
  assert.ok(p, `source ${sourceN}`);
  await drag(p, s.targets[targetIndex], n);
}
async function combine(sourceN, targetN, n = sourceN) {
  const s = await read(),
    p = s.pieces.find((p) => p.n === sourceN);
  const target = s.pieces.find((q) => q.n === targetN && q.id !== p.id);
  assert.ok(target);
  await drag(p, target, n);
}
async function gate(n) {
  const s = await read();
  await drag(
    s.pieces.find((p) => p.n === n),
    s.gate,
  );
}
try {
  await route(0);
  assert.equal(await page.locator(".hud button:visible").count(), 2);
  assert.equal(await page.locator("p:visible").count(), 0);
  await page.getByRole("button", { name: "エリアを選ぶ", exact: true }).click();
  assert.equal(await page.locator("[data-stage]").count(), 12);
  await page.getByRole("button", { name: "戻る", exact: true }).click();
  for (let i = 0; i < 12; i++) {
    await route(i);
    if (i === 0) {
      await combine(1, 7);
      await shoot(8, 0);
    }
    if (i === 1) {
      await shoot(4, 0, 12);
      await shoot(8, 1);
    }
    if (i === 2) {
      await combine(3, 5);
      await combine(2, 8);
      await shoot(10, 0);
    }
    if ([3, 10, 11].includes(i)) {
      for (let t = 0; t < STAGES[i].targets.length; t++)
        await shoot(STAGES[i].targets[t].n, t);
    }
    if (i === 4) {
      await shoot(4, 0, 12);
      await shoot(4, 1, 8);
      await shoot(4, 2);
    }
    if (i === 5) {
      await gate(12);
      assert.deepEqual(
        (await read()).pieces.map((p) => p.n),
        [4],
      );
      await shoot(4, 1);
    }
    if (i === 6) {
      await gate(14);
      assert.deepEqual(
        (await read()).pieces.map((p) => p.n),
        [4, 2],
      );
      await shoot(2, 1);
      await shoot(4, 2);
    }
    if (i === 7) {
      await shoot(4, 0, 12);
      await shoot(4, 1, 20);
    }
    if (i === 8) {
      await combine(6, 8, 2);
      await shoot(10, 0);
      await shoot(4, 1);
    }
    if (i === 9) {
      await gate(24);
      await gate(8);
      await shoot(4, 2);
    }
    await page.locator(".victory").waitFor();
    assert.equal((await read()).status, "won");
  }
  console.log(
    "All 12 battles solved with real dragging; every unit accounted for and visible exactly once.",
  );
  await page.reload();
  await page.getByRole("button", { name: "エリアを選ぶ", exact: true }).click();
  assert.equal(await page.locator("[data-stage].cleared").count(), 12);

  // A physical touch sequence rather than hidden model actions.
  await route(0);
  const cdp = await context.newCDPSession(page);
  let s = await read();
  const from = s.pieces.find((p) => p.n === 1),
    to = s.pieces.find((p) => p.n === 7),
    box = await page.locator("#world").boundingBox();
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: box.x + from.x, y: box.y + from.y }],
  });
  for (let i = 1; i <= 10; i++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: box.x + from.x + ((to.x - from.x) * i) / 10,
          y: box.y + from.y + ((to.y - from.y) * i) / 10,
        },
      ],
    });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await settled();
  assert.deepEqual(
    (await read()).pieces.map((p) => p.n),
    [8],
  );
  await shoot(8, 0);
  console.log("Touch dragging and persistent clear records verified.");

  await route(0);
  for (let i = 0; i < 5; i++) await shoot(7, 0);
  assert.equal((await read()).status, "play");
  assert.equal(
    (await read()).pieces.reduce((sum, p) => sum + p.n, 0),
    8,
  );
  await route(6);
  for (let i = 0; i < 4; i++) await shoot(14, 0);
  await page.locator(".defeat").waitFor();
  assert.equal((await read()).misses, 4);
  await page.getByRole("button", { name: "同じ戦闘をやり直す" }).click();
  assert.equal((await read()).misses, 0);
  assert.equal((await read()).pieces[0].n, 14);
  await route(1);
  s = await read();
  await drag(s.pieces[0], { x: s.width * 0.78, y: s.height * 0.83 }, 4);
  assert.deepEqual(
    (await read()).pieces.map((p) => p.n),
    [8, 4],
  );
  await combine(4, 8);
  assert.deepEqual(
    (await read()).pieces.map((p) => p.n),
    [12],
  );

  await route(0);
  s = await read();
  const b = await page.locator("#world").boundingBox();
  await page.mouse.move(b.x + s.pieces[0].x, b.y + s.pieces[0].y);
  await page.mouse.down();
  await page.mouse.move(b.x + 20, b.y + 30, { steps: 5 });
  await page.locator("#world").dispatchEvent("pointercancel", { pointerId: 1 });
  await page.mouse.up();
  await settled();
  assert.deepEqual(
    (await read()).pieces.map((p) => p.n),
    [7, 1],
  );

  // Normal-motion attacks must survive pause, navigation, and resizing.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await route(5);
  s = await read();
  const cb = await page.locator("#world").boundingBox();
  await page.mouse.move(cb.x + s.pieces[0].x, cb.y + s.pieces[0].y);
  await page.mouse.down();
  await page.mouse.move(cb.x + s.gate.x, cb.y + s.gate.y, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  await page.waitForTimeout(160);
  await page.getByRole("button", { name: "再開", exact: true }).last().click();
  await settled();
  assert.deepEqual(
    (await read()).pieces.map((p) => p.n),
    [4],
  );
  await audit();
  await route(5);
  s = await read();
  const bb = await page.locator("#world").boundingBox();
  await page.mouse.move(bb.x + s.pieces[0].x, bb.y + s.pieces[0].y);
  await page.mouse.down();
  await page.mouse.move(bb.x + s.gate.x, bb.y + s.gate.y, { steps: 8 });
  await page.mouse.up();
  await page.setViewportSize({ width: 768, height: 900 });
  await settled();
  await audit();
  assert.equal((await read()).pieces[0].n, 4);
  await route(0);
  s = await read();
  await combine(1, 7);
  s = await read();
  const rb = await page.locator("#world").boundingBox();
  await page.mouse.move(rb.x + s.pieces[0].x, rb.y + s.pieces[0].y);
  await page.mouse.down();
  await page.mouse.move(rb.x + s.targets[0].x, rb.y + s.targets[0].y, {
    steps: 5,
  });
  await page.mouse.up();
  await page.getByRole("button", { name: "エリアを選ぶ", exact: true }).click();
  await page.locator('[data-stage="7"]').click();
  await settled();
  assert.equal((await read()).stage, "gear-2");
  await audit();
  console.log(
    "Splitting, rejoining, cancelled drags, failure/retry, pause, resize, and navigation passed.",
  );

  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [844, 390],
    [768, 1024],
    [1280, 900],
  ]) {
    await page.setViewportSize({ width, height });
    for (const index of [0, 1, 6, 7, 11]) {
      await route(index);
      const state = await read();
      assert.equal(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth > innerWidth ||
            document.documentElement.scrollHeight > innerHeight,
        ),
        false,
      );
      for (const p of state.pieces) {
        assert.ok(p.x - p.radius >= 0 && p.x + p.radius <= state.width);
        assert.ok(p.y - p.radius >= 0 && p.y + p.radius <= state.height);
      }
      await audit();
    }
  }
  await mkdir(resolve(root, "artifacts"), { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await route(1);
  await page.screenshot({
    path: resolve(root, "artifacts/tactile-mobile.png"),
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await route(7);
  await page.screenshot({
    path: resolve(root, "artifacts/tactile-desktop.png"),
  });

  await page.goto(`${base}/classic.html`);
  await page.locator("#modes").waitFor();
  for (const mode of ["casual", "normal", "expert", "blitz"]) {
    await page.locator(`[data-mode="${mode}"]`).click();
    assert.equal(await page.locator(`[data-mode="${mode}"].on`).count(), 1);
  }
  await page.locator('.app>a[href="./"]').click();
  await settled();
  assert.equal((await read()).stage, "spark-1");
  const blocked = await browser.newContext({ reducedMotion: "reduce" });
  await blocked.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("disabled");
      },
    });
  });
  const bp = await blocked.newPage();
  bp.on("pageerror", (e) => errors.push(e.message));
  await bp.goto(base);
  await bp.locator("#stage-name").waitFor();
  assert.match(await bp.locator("#stage-name").textContent(), /スパーク/);
  await blocked.close();
  assert.deepEqual(errors, []);
  console.log(
    "320px–1280px and landscape layouts, classic modes, disabled storage: no browser errors.",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
