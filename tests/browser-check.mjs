import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { chromium } from "playwright";
import { instrument, driver, touchPeel } from "./play-driver.mjs";
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
await instrument(context);
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.stack));
page.on("response", (r) => {
  if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
});
const { read, settled, route, audit, drag, width, packBase, solveCurrent } =
  driver(page, base);
try {
  await page.goto(base);
  await page.locator("[data-rule]").first().waitFor();
  assert.equal(await page.locator("[data-rule]").count(), 4);
  assert.equal(await page.locator("[data-stage]").count(), 0);
  assert.equal(
    await page.locator('[data-rule="pack"] .pack-demo-dot').count(),
    13,
  );
  assert.equal(
    await page.locator('[data-rule="pack"] .pack-demo-slot').count(),
    4,
  );
  await page.locator('[data-rule="spark"]').click();
  await settled();
  assert.equal((await read()).rule, "spark");
  assert.equal(await page.locator(".hud button:visible").count(), 2);
  for (const [rule, predicate] of [
    ["spark", (p) => p.family === "join" && p.ammo[0] === 7 && p.ammo[1] === 1],
    ["link", (p) => p.ammo[0] === 14 && p.gates[0] === 3],
    [
      "link",
      (p) =>
        p.family === "chain" &&
        p.ammo[0] === 24 &&
        p.gates[0] === 3 &&
        p.gates[1] === 2,
    ],
    ["gear", (p) => p.ammo[0] === 12 && p.ammo[1] === 20],
    ["gear", (p) => p.ammo[0] === 18 && p.ammo[1] === 24],
  ]) {
    const before = await route(rule, predicate);
    await solveCurrent();
    assert.notEqual((await read()).stage, before.stage);
    assert.equal((await read()).rule, rule);
  }
  console.log(
    "Real drags solved merge, remainder, chained division, common widths; automatic continuation verified.",
  );

  await page.emulateMedia({ reducedMotion: "no-preference" });
  // PACK Pass 4: equal horizontal viewports, one visible copy of each raw dot,
  // nested carry/unpack, and a touch-only scale inspection gesture.
  let packState = await route("pack");
  await mkdir(resolve(root, "artifacts"), { recursive: true });
  await page.screenshot({ path: resolve(root, "artifacts/pack-initial.png") });
  assert.equal(packState.total, 17);
  assert.equal(packState.progress.pack, undefined);
  assert.equal(packState.pack.base, 5);
  assert.equal(packState.pack.phase, "pack");
  assert.equal(packState.pack.groups, undefined);
  assert.deepEqual(
    packState.pack.viewports.map(({ level, ghost }) => [level, ghost]),
    [
      [1, true],
      [0, false],
    ],
  );
  assert.ok(packState.pack.viewports[0].x < packState.pack.viewports[1].x);
  assert.equal(packState.pack.viewports[0].y, packState.pack.viewports[1].y);
  assert.equal(
    packState.pack.viewports[0].frameRadius,
    packState.pack.viewports[1].frameRadius,
  );
  assert.equal(
    packState.pack.places.find((place) => place.level === 0).n,
    17,
  );
  assert.ok(
    packState.pack.places
      .filter((place) => place.level > 0)
      .every((place) => place.n === 0),
  );
  const originalPackIds = [...packState.pieces[0].ids],
    base5Upper = packState.pack.slots.find((slot) => slot.level === 1),
    packSingle = packState.pack.items.find((item) => item.level === 0);
  assert.ok(base5Upper && packSingle);
  assert.equal(packState.pack.renderedDots.length, 17);
  assert.deepEqual(
    [...packState.pack.rawIds].sort((a, b) => a - b),
    [...originalPackIds].sort((a, b) => a - b),
  );

  // Visible object owns its gesture: a raw dot drag never becomes a rotation.
  const rawProbe = packState.pack.renderedDots[0],
    bounds = await page.locator("#world").boundingBox();
  await page.mouse.move(bounds.x + rawProbe.x, bounds.y + rawProbe.y);
  await page.mouse.down();
  assert.deepEqual((await read()).dragIds, [rawProbe.id]);
  assert.equal((await read()).pack.rotation.active, false);
  await page.mouse.move(bounds.x + rawProbe.x + 18, bounds.y + rawProbe.y);
  assert.deepEqual((await read()).dragIds, [rawProbe.id]);
  assert.equal((await read()).pack.rotation.active, false);
  await page.mouse.up();
  await settled();

  // Empty background owns the gesture from pointerdown, even through jitter.
  const beforeBackground = await read();
  await page.mouse.move(bounds.x + 15, bounds.y + 50);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 20, bounds.y + 50);
  assert.equal((await read()).dragIds.length, 0);
  await page.mouse.move(bounds.x + 115, bounds.y + 50, { steps: 8 });
  const backgroundTurn = await read();
  assert.equal(backgroundTurn.pack.rotation.active, true);
  assert.ok(Math.abs(backgroundTurn.pack.rotation.angle) > 0.1);
  assert.deepEqual(backgroundTurn.pack.digits, beforeBackground.pack.digits);
  assert.deepEqual(backgroundTurn.pack.rawIds, beforeBackground.pack.rawIds);
  assert.equal(backgroundTurn.pack.base, beforeBackground.pack.base);
  await page.mouse.up();
  await settled();
  assert.ok(Math.abs((await read()).pack.rotation.angle) < 0.01);

  // Less than one base unit crosses the boundary, reacts, and returns without
  // becoming an error or changing the mathematical state.
  await drag(packSingle, base5Upper, 1);
  packState = await read();
  assert.equal(packState.pack.phase, "pack");
  assert.equal(packState.pack.items.length, 17);
  assert.equal(
    packState.pack.items.filter((item) => item.macro).length,
    0,
  );
  assert.deepEqual(packState.pack.digits, [0, 17]);

  // Carry preserves all 17 raw identities while 15 settle into three nested
  // units and two remain at the lower scale.
  const base5Place = packState.pack.places.find((place) => place.level === 0);
  assert.equal(base5Place.n, 17);
  await drag(base5Place, base5Upper, 17, false);
  const carryMotion = await read();
  assert.equal(carryMotion.busy, true);
  assert.equal(carryMotion.pack.transition, null);
  assert.equal(carryMotion.pack.renderedDots.length, 17);
  assert.equal(new Set(carryMotion.pack.renderedDots.map((dot) => dot.id)).size, 17);
  assert.deepEqual(
    [...carryMotion.pack.rawIds].sort((a, b) => a - b),
    [...originalPackIds].sort((a, b) => a - b),
  );
  await page.screenshot({ path: resolve(root, "artifacts/pack-carry-motion.png") });
  await settled();
  packState = await read();
  assert.equal(packState.pack.phase, "unpack");
  assert.equal(packState.pack.locks.length, 1);
  assert.equal(packState.pack.locks[0].notation, "32₅");
  assert.deepEqual(packState.pack.locks[0].digits, [3, 2]);
  assert.equal(
    packState.pack.places.find((place) => place.level === 1).n,
    3,
  );
  assert.equal(
    packState.pack.places.find((place) => place.level === 0).n,
    2,
  );
  assert.deepEqual(packState.pieces[0].ids, originalPackIds);
  const base5Macros = packState.pack.items.filter((item) => item.macro);
  assert.equal(base5Macros.length, 3);
  assert.ok(
    base5Macros.every(
      (item) =>
        item.children.length === 5 &&
        item.rawIds.length === 5 &&
        item.tree.children.length === 5 &&
        item.tree.children.every((child) => child.rawIds.length === 1),
    ),
  );
  assert.equal(packState.pack.renderedDots.length, 17);
  assert.equal(new Set(packState.pack.renderedDots.map((dot) => dot.id)).size, 17);
  assert.deepEqual(
    packState.pack.items
      .flatMap((item) => item.rawIds)
      .sort((a, b) => a - b),
    [...originalPackIds].sort((a, b) => a - b),
  );
  assert.equal(packState.pack.revealCount, 1);
  assert.equal(packState.pack.scaleHintCount, 1);
  assert.deepEqual(packState.pack.revealedLevels, [0, 1]);
  assert.deepEqual(
    packState.pack.viewports.map(({ level, ghost }) => [level, ghost]),
    [
      [2, true],
      [1, false],
      [0, false],
    ],
  );
  await page.screenshot({ path: resolve(root, "artifacts/pack-base5-carry.png") });
  await audit();

  while (packState.pack.phase === "unpack") {
    const firstUnpack = packState.pack.items.find((candidate) => candidate.macro);
    if (!firstUnpack) throw new Error("PACK macro missing during unpack");
    const item = packState.pack.items.find((candidate) => candidate.macro),
      slot = packState.pack.slots.find(
        (candidate) => candidate.level === item.level - 1,
      );
    assert.ok(item && slot);
    const bounds = await page.locator("#world").boundingBox();
    await page.mouse.move(bounds.x + item.x, bounds.y + item.y);
    await page.mouse.down();
    assert.equal((await read()).dragIds.length, item.rawIds.length);
    await page.mouse.up();
    await settled();
    await drag(item, slot, item.rawIds.length, false);
    if (item.id === firstUnpack.id) {
      await page.waitForTimeout(55);
      const unfolding = await read();
      assert.equal(unfolding.pack.renderedDots.length, 17);
      assert.equal(new Set(unfolding.pack.renderedDots.map((dot) => dot.id)).size, 17);
      assert.deepEqual(
        [...unfolding.pack.rawIds].sort((a, b) => a - b),
        [...originalPackIds].sort((a, b) => a - b),
      );
      await page.screenshot({ path: resolve(root, "artifacts/pack-unpack-motion.png") });
    }
    await settled();
    packState = await read();
  }
  assert.equal(packState.pack.phase, "choose");
  assert.equal(packState.pack.items.length, 17);
  assert.ok(packState.pack.items.every((item) => item.rawIds.length === 1));
  assert.deepEqual(packState.pieces[0].ids, originalPackIds);

  const scaleCameraBeforeRadixChange = packState.pack.viewports.map(
    ({ level, x, y, radius, frameRadius, innerScale }) =>
      [level, x, y, radius, frameRadius, innerScale],
  );
  await packBase();
  packState = await read();
  assert.equal(packState.pack.base, 4);
  assert.equal(packState.pack.radixPoints, 4);
  assert.equal(packState.pack.phase, "pack");
  assert.deepEqual(
    packState.pack.viewports.map(
      ({ level, x, y, radius, frameRadius, innerScale }) =>
        [level, x, y, radius, frameRadius, innerScale],
    ),
    scaleCameraBeforeRadixChange,
  );
  assert.equal(packState.pack.transition?.type, "radix-change");
  assert.equal(packState.pack.radixGeometry.length, 4);
  await page.screenshot({ path: resolve(root, "artifacts/pack-base4-frame.png") });

  const base4Lower = packState.pack.places.find((place) => place.level === 0),
    base4MiddleSlot = packState.pack.slots.find((slot) => slot.level === 1);
  assert.equal(base4Lower.n, 17);
  assert.ok(base4MiddleSlot);
  await drag(base4Lower, base4MiddleSlot, 17);
  packState = await read();
  assert.equal(packState.pack.phase, "pack");
  assert.equal(
    packState.pack.places.find((place) => place.level === 0).n,
    1,
  );
  assert.equal(
    packState.pack.places.find((place) => place.level === 1).n,
    4,
  );
  const base4MiddleUnits = packState.pack.items.filter((item) => item.level === 1);
  assert.equal(base4MiddleUnits.length, 4);
  assert.ok(
    base4MiddleUnits.every(
      (item) =>
        item.rawIds.length === 4 &&
        item.tree.children.length === 4 &&
        item.tree.children.every((child) => child.level === 0),
    ),
  );
  assert.equal(
    packState.pack.revealCount,
    1,
      "the scale 1 viewport stays known when the radix changes",
  );
  assert.equal(packState.pack.scaleHintCount, 1);

  const middle = packState.pack.places.find((place) => place.level === 1),
    topSlot = packState.pack.slots.find((slot) => slot.level === 2);
  assert.ok(middle && topSlot);
  await drag(middle, topSlot, 16, false);
  const recursiveCarry = await read();
  assert.equal(recursiveCarry.busy, true);
  assert.equal(recursiveCarry.pack.renderedDots.length, 17);
  assert.equal(new Set(recursiveCarry.pack.renderedDots.map((dot) => dot.id)).size, 17);
  await page.screenshot({ path: resolve(root, "artifacts/pack-recursive-carry.png") });
  await settled();
  packState = await read();
  assert.equal(packState.status, "won");
  assert.equal(packState.pack.phase, "break");
  assert.equal(packState.pack.locks[1].notation, "101₄");
  assert.deepEqual(packState.pack.locks[1].digits, [1, 0, 1]);
  assert.equal(
    packState.pack.places.find((place) => place.level === 2).n,
    1,
  );
  assert.equal(
    packState.pack.places.find((place) => place.level === 1).n,
    0,
  );
  assert.equal(
    packState.pack.places.find((place) => place.level === 0).n,
    1,
  );
  assert.equal(packState.pack.revealCount, 2);
  assert.equal(packState.pack.scaleHintCount, 1);
  assert.deepEqual(packState.pack.revealedLevels, [0, 1, 2]);
  assert.ok(packState.pack.viewports.every((viewport) => !viewport.ghost));
  const base4Top = packState.pack.items.find((item) => item.level === 2);
  assert.equal(base4Top.children.length, 4);
  assert.equal(base4Top.rawIds.length, 16);
  assert.equal(base4Top.tree.children.length, 4);
  assert.ok(
    base4Top.tree.children.every(
      (middle) =>
        middle.level === 1 &&
        middle.children.length === 4 &&
        middle.children.every((raw) => raw.level === 0 && raw.rawIds.length === 1),
    ),
  );
  assert.equal(packState.pack.renderedDots.length, 17);
  assert.equal(new Set(packState.pack.renderedDots.map((dot) => dot.id)).size, 17);
  assert.equal(
    base4Top.radius,
    packState.pack.items.find((item) => item.level === 0).radius,
  );
  assert.deepEqual(
    packState.pack.items
      .flatMap((item) => item.rawIds)
      .sort((a, b) => a - b),
    [...originalPackIds].sort((a, b) => a - b),
  );
  await page.screenshot({ path: resolve(root, "artifacts/pack-base4-final.png") });
  assert.ok(packState.pack.slots.some((slot) => slot.level === 1));
  assert.deepEqual(packState.pieces[0].ids, originalPackIds);
  await audit();

  // Prototype completion stays on the representation; no enemy attack or
  // automatic next problem is introduced by this pass.
  await settled();
  packState = await read();
  assert.equal(packState.rule, "pack");
  assert.equal(packState.status, "won");
  const rotationSnapshot = {
    base: packState.pack.base,
    digits: packState.pack.digits,
    rawIds: [...packState.pack.rawIds].sort((a, b) => a - b),
    tree: packState.pack.items.find((item) => item.level === 2).tree,
    rawRadius: packState.pack.renderedDots.find((dot) => dot.level === 0).radius,
  };
  const scaleTouchBox = await page.locator("#world").boundingBox(),
    scaleCdp = await context.newCDPSession(page),
    touchStart = { x: scaleTouchBox.x + 16, y: scaleTouchBox.y + 52 };
  await scaleCdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [touchStart],
  });
  await scaleCdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: touchStart.x + 5, y: touchStart.y }],
  });
  await scaleCdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: touchStart.x + 122, y: touchStart.y }],
  });
  await page.waitForTimeout(60);
  const inspected = await read();
  assert.equal(inspected.pack.rotation.active, true);
  assert.ok(inspected.pack.rotation.angle > 0.25);
  assert.ok(inspected.pack.viewports.find((view) => view.level === 2).innerScale > 1);
  assert.ok(
    inspected.pack.renderedDots.find((dot) => dot.level === 0).radius <
      rotationSnapshot.rawRadius,
  );
  assert.equal(new Set(inspected.pack.viewports.map((view) => view.radius)).size, 1);
  assert.equal(inspected.pack.base, rotationSnapshot.base);
  assert.deepEqual(inspected.pack.digits, rotationSnapshot.digits);
  assert.deepEqual(
    [...inspected.pack.rawIds].sort((a, b) => a - b),
    rotationSnapshot.rawIds,
  );
  assert.deepEqual(inspected.pack.items.find((item) => item.level === 2).tree, rotationSnapshot.tree);
  await page.screenshot({ path: resolve(root, "artifacts/pack-scale-inspected.png") });
  await scaleCdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await scaleCdp.detach();
  await settled();
  const returned = await read();
  assert.ok(Math.abs(returned.pack.rotation.angle) < 0.01);
  assert.equal(new Set(returned.pack.viewports.map((view) => view.radius)).size, 1);
  await page.screenshot({ path: resolve(root, "artifacts/pack-base4-final.png") });
  console.log(
    "PACK Pass 4 verified nested 17→32₅→101₄, identity-preserving carry/unpack, touch scale rotation, radix-only geometry change, and the retained zero viewport.",
  );
  await route("link", (p) => p.ammo[0] === 14 && p.gates[0] === 3);
  let s = await read();
  const id = s.stage;
  for (let i = 0; i < 5; i++) await drag(s.pieces[0], s.targets[0]);
  assert.equal((await read()).stage, id);
  assert.equal((await read()).progress.link.retries, 0);
  // Cancelling a width gesture restores the previous preview.
  const box = await page.locator("#world").boundingBox(),
    handle = s.pieces[0].handle;
  await page.mouse.move(box.x + handle.x, box.y + handle.y);
  await page.mouse.down();
  await page.mouse.move(box.x + handle.x + 36, box.y + handle.y);
  await page.locator("#world").dispatchEvent("pointercancel", { pointerId: 1 });
  await page.mouse.up();
  await settled();
  assert.equal((await read()).pieces[0].width, 0);
  // Real CDP touch input on the common-width handle.
  await route("gear", (p) => p.ammo[0] === 12 && p.ammo[1] === 20);
  s = await read();
  const h = s.pieces[0].handle,
    b = await page.locator("#world").boundingBox(),
    cdp = await context.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: b.x + h.x, y: b.y + h.y }],
  });
  for (let i = 1; i <= 8; i++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: b.x + h.x + (48 * i) / 8, y: b.y + h.y }],
    });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await settled();
  assert.deepEqual(
    (await read()).pieces.map((p) => p.width),
    [4, 4],
  );
  // Keep the fun coarse selection, but distinguish deliberate fast peels.
  await route("spark", (p) => p.ammo[0] === 4 && p.ammo[1] === 32);
  let small = (await read()).pieces.find((p) => p.n === 4);
  const slow = await touchPeel(context, page, small, 32, 0, { fast: false });
  assert.equal(slow.initial.length, 4);
  assert.equal(slow.picked.length, 4);
  await settled();
  await route("spark", (p) => p.ammo[0] === 4 && p.ammo[1] === 32);
  small = (await read()).pieces.find((p) => p.n === 4);
  const fast = await touchPeel(context, page, small, 32, 0);
  assert.equal(fast.initial.length, 4);
  assert.deepEqual(fast.picked, small.ids.slice(2));
  await settled();
  await audit();
  let pair = (await read()).pieces.find((p) =>
    p.ids.every((id) => fast.picked.includes(id)),
  );
  assert.equal(pair.n, 2);
  const single = await touchPeel(context, page, pair, 0, -32);
  assert.equal(single.initial.length, 2);
  assert.equal(single.picked.length, 1);
  await settled();
  await audit();
  await route("spark", (p) => p.ammo[0] === 4 && p.ammo[1] === 32);
  small = (await read()).pieces.find((p) => p.n === 4);
  const grip = await touchPeel(context, page, small.grip, 32, 0, {
    cancel: true,
  });
  assert.equal(grip.picked.length, 4);
  await settled();
  assert.deepEqual(
    (await read()).pieces.map((p) => p.n),
    [4, 32],
  );
  for (const dot of small.dots) {
    const pick = await touchPeel(context, page, dot, 0, -24, {
      fast: false,
      cancel: true,
    });
    assert.deepEqual(pick.initial, [dot.id]);
    await settled();
  }
  // The old mode URL returns to the four choices, keeping saved progress.
  await page.goto(`${base}/#core`);
  await page.locator("[data-rule]").first().waitFor();
  assert.equal(await page.locator("[data-rule]").count(), 4);
  assert.equal((await read()).progress.core, undefined);
  await route("gear", (p) => p.ammo[0] === 12 && p.ammo[1] === 20);
  console.log(
    "Native touch: slow 4, fast 4→2→1, fast whole grip, single-dot contact and cancelled peels passed.",
  );
  // Two deliberate reissues lower difficulty; the persisted state is used after a fresh navigation.
  const level = (await read()).difficulty;
  for (let i = 0; i < 2; i++) {
    await page.locator("#pause").click();
    await page.locator('[data-menu="retry"]').click();
    await settled();
  }
  assert.equal((await read()).difficulty, Math.max(1, level - 1));
  const savedLevel = (await read()).difficulty;
  await page.goto(`${base}/#gear`);
  await settled();
  assert.equal((await read()).difficulty, savedLevel);
  // Pause during normal animation, then navigate away during another shot.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await route("link", (p) => p.ammo[0] === 14 && p.gates[0] === 3);
  s = await read();
  await width(s.pieces[0].id, 3);
  s = await read();
  await drag(s.pieces[0], s.targets[0], s.pieces[0].n, false);
  await page.locator("#pause").click();
  await page.waitForTimeout(180);
  await page.locator('[data-menu="close"]').first().click();
  await settled();
  await audit();
  assert.deepEqual(
    (await read()).pieces.map((p) => p.n),
    [4, 2],
  );
  await route("gear", (p) => p.ammo[0] === 12 && p.ammo[1] === 20);
  s = await read();
  await width(s.pieces[0].id, 4);
  s = await read();
  await drag(s.pieces[0], s.targets[0], s.pieces[0].n, false);
  await page.locator("#areas").click();
  await page.locator('[data-rule="spark"]').click();
  await settled();
  await audit();
  assert.equal((await read()).rule, "spark");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mkdir(resolve(root, "artifacts"), { recursive: true });
  for (const [w, h] of [
    [320, 568],
    [390, 844],
    [844, 390],
    [768, 1024],
    [1280, 900],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    for (const rule of ["spark", "link", "gear", "pack"]) {
      s = await route(rule);
      assert.equal(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth > innerWidth ||
            document.documentElement.scrollHeight > innerHeight,
        ),
        false,
      );
      for (const p of s.pieces) {
        assert.ok(p.x - p.radius >= 0 && p.x + p.radius <= s.width);
        assert.ok(p.y - p.radius >= 0 && p.y + p.radius <= s.height);
        if (p.handle) assert.ok(p.handle.y + 13 < s.height);
      }
      if (s.rule === "pack") {
        for (const slot of s.pack.slots) {
          assert.ok(slot.x - slot.radius >= 0 && slot.x + slot.radius <= s.width);
          assert.ok(slot.y - slot.radius * 1.2 >= 0);
          assert.ok(slot.y + slot.radius * 1.7 <= s.height);
        }
        assert.ok(
          s.pack.viewports.every((view) =>
            Math.abs(view.y - s.pack.viewports[0].y) < 0.01 &&
            Math.abs(view.radius - s.pack.viewports[0].radius) < 0.01,
          ) &&
            s.pack.viewports.every((view, i, all) =>
              i === 0 ||
              (view.x > all[i - 1].x &&
                view.x - all[i - 1].x >= view.radius + all[i - 1].radius),
            ),
        );
      }
      await audit();
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  s = await route("pack");
  const reducedCarryFrom = s.pack.places.find((place) => place.level === 0),
    reducedCarryTo = s.pack.slots.find((slot) => slot.level === 1);
  await drag(reducedCarryFrom, reducedCarryTo, 17);
  s = await read();
  assert.equal(s.pack.revealCount, 1);
  assert.deepEqual(s.pack.revealedLevels, [0, 1]);
  assert.ok(s.pack.viewports.find((view) => view.level === 1));
  assert.equal(s.pack.renderedDots.length, 17);
  assert.equal(new Set(s.pack.renderedDots.map((dot) => dot.id)).size, 17);
  assert.ok(s.pack.items.filter((item) => item.macro).every((item) => item.tree.children.length === 5));
  await page.screenshot({ path: resolve(root, "artifacts/pack-reduced-motion.png") });
  s = await route("pack");
  const touchFrom = s.pack.places.find((place) => place.level === 0),
    touchTo = s.pack.slots.find((slot) => slot.level === 1),
    touchBox = await page.locator("#world").boundingBox(),
    packTouch = await context.newCDPSession(page);
  await packTouch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: touchBox.x + touchFrom.x, y: touchBox.y + touchFrom.y }],
  });
  for (let i = 1; i <= 10; i++)
    await packTouch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: touchBox.x + touchFrom.x + ((touchTo.x - touchFrom.x) * i) / 10,
          y: touchBox.y + touchFrom.y + ((touchTo.y - touchFrom.y) * i) / 10,
        },
      ],
    });
  await packTouch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await packTouch.detach();
  await settled();
  s = await read();
  assert.equal(s.pack.phase, "unpack");
  assert.equal(s.pack.places.find((place) => place.level === 1).n, 3);
  assert.equal(s.pack.places.find((place) => place.level === 0).n, 2);
  await audit();
  for (const rule of ["link", "gear"]) {
    s = await route(
      rule,
      rule === "gear"
        ? (p) => p.ammo[0] === 12 && p.ammo[1] === 20
        : (p) => p.ammo[0] === 14 && p.gates[0] === 3,
    );
    await width(s.pieces[0].id, rule === "gear" ? 4 : 3);
    await page.screenshot({
      path: resolve(root, `artifacts/flow-${rule}.png`),
    });
  }
  await page.goto(`${base}/classic.html`);
  await page.locator("#modes").waitFor();
  for (const mode of ["casual", "normal", "expert", "blitz"]) {
    await page.locator(`[data-mode="${mode}"]`).click();
    assert.equal(await page.locator(`[data-mode="${mode}"].on`).count(), 1);
  }
  await page.locator('.app>a[href="./"]').click();
  await page.locator("[data-rule]").first().waitFor();
  const blocked = await browser.newContext({ reducedMotion: "reduce" });
  await blocked.addInitScript(() =>
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("disabled");
      },
    }),
  );
  const bp = await blocked.newPage();
  bp.on("pageerror", (e) => errors.push(e.message));
  await bp.goto(base);
  await bp.locator('[data-rule="gear"]').click();
  await bp.waitForTimeout(150);
  assert.match(await bp.locator("#stage-name").textContent(), /ギア/);
  await blocked.close();
  assert.deepEqual(errors, []);
  console.log(
    "Touch, cancellation, retry adaptation, persistence, pause/navigation, responsive layouts, classic and disabled storage passed.",
  );
} catch (error) {
  await mkdir(resolve(root, "artifacts"), { recursive: true });
  await page.screenshot({
    path: resolve(root, "artifacts/browser-failure.png"),
  });
  console.error(await read().catch(() => null));
  console.error(errors);
  throw error;
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
