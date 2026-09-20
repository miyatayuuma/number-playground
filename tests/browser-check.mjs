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
async function inspectScaleMouse(deltas, direction = "left", screenshotPath = null) {
  const bounds = await page.locator("#world").boundingBox(),
    y = bounds.y + 58,
    startX = bounds.x +
      (direction === "left" ? bounds.width * 0.75 : Math.min(24, bounds.width * 0.08));
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX + (direction === "left" ? -5 : 5), y);
  const jitter = await read(),
    states = [];
  assert.equal(jitter.pack.camera.mode, "overview");
  assert.equal(jitter.pack.camera.moving, false);
  for (const [index, delta] of deltas.entries()) {
    await page.mouse.move(startX + delta, y, { steps: 8 });
    states.push(await read());
    if (screenshotPath && index === deltas.length - 1)
      await page.screenshot({ path: resolve(root, screenshotPath) });
  }
  await page.mouse.up();
  const released = await read(),
    home = await settled();
  return { jitter, states, released, home };
}
async function inspectScaleTouch(deltas, direction = "left", screenshotPath = null) {
  const bounds = await page.locator("#world").boundingBox(),
    x = bounds.x +
      (direction === "left" ? bounds.width * 0.75 : Math.min(24, bounds.width * 0.08)),
    y = bounds.y + 58,
    cdp = await context.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: x + (direction === "left" ? -5 : 5), y }],
  });
  await page.waitForTimeout(16);
  const jitter = await read(),
    states = [];
  assert.equal(jitter.pack.camera.mode, "overview");
  assert.equal(jitter.pack.camera.moving, false);
  for (const [index, delta] of deltas.entries()) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + delta, y }],
    });
    await page.waitForTimeout(16);
    states.push(await read());
    if (screenshotPath && index === deltas.length - 1)
      await page.screenshot({ path: resolve(root, screenshotPath) });
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.waitForTimeout(16);
  await cdp.detach();
  const released = await read(),
    home = await settled();
  return { jitter, states, released, home };
}
const focusStep = (width) => Math.min(56, Math.max(40, width * 0.145));
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
  // PACK Pass 5R: true shared-world-size dots, compact nested planes, and
  // transient continuous camera gestures that inspect raw identities.
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
  assert.ok(
    Math.abs(
      packState.pack.viewports[0].frameRadius -
        packState.pack.viewports[1].frameRadius,
    ) < 0.01,
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

  // Visible objects keep object-drag ownership and do not change focus.
  const rawProbe = packState.pack.renderedDots[0],
    bounds = await page.locator("#world").boundingBox();
  await page.mouse.move(bounds.x + rawProbe.x, bounds.y + rawProbe.y);
  await page.mouse.down();
  assert.deepEqual((await read()).dragIds, [rawProbe.id]);
  assert.equal((await read()).pack.camera.mode, "overview");
  await page.mouse.move(bounds.x + rawProbe.x + 18, bounds.y + rawProbe.y);
  assert.deepEqual((await read()).dragIds, [rawProbe.id]);
  assert.equal((await read()).pack.camera.mode, "overview");
  await page.mouse.up();
  await settled();

  // Background owns transient camera inspection from pointerdown; jitter is ignored.
  const beforeBackground = await read();
  const backgroundInspect = await inspectScaleMouse(
    [focusStep(beforeBackground.width)],
    "right",
  );
  assert.equal(backgroundInspect.jitter.pack.camera.mode, "overview");
  assert.equal(backgroundInspect.states[0].pack.camera.mode, "inspection");
  assert.equal(backgroundInspect.states[0].pack.camera.focusLevel, 0);
  assert.deepEqual(backgroundInspect.states[0].pack.digits, beforeBackground.pack.digits);
  assert.deepEqual(backgroundInspect.states[0].pack.rawIds, beforeBackground.pack.rawIds);
  assert.equal(backgroundInspect.states[0].pack.base, beforeBackground.pack.base);
  assert.equal(backgroundInspect.released.pack.camera.mode, "returning");
  assert.equal(backgroundInspect.home.pack.camera.mode, "overview");
  assert.equal(backgroundInspect.home.pack.camera.focusLevel, null);
  const focusedZero = backgroundInspect.states[0].pack.viewports.find((view) => view.level === 0);
  assert.ok(Math.abs(focusedZero.x - backgroundInspect.states[0].width / 2) < 0.01);
  assert.ok(Math.abs(focusedZero.y - backgroundInspect.states[0].height / 2) < 0.01);
  // A no-op gesture during the return spring must not leave a persistent
  // arbitrary camera midpoint after cancelling the return transition.
  const returnBounds = await page.locator("#world").boundingBox(),
    returnX = returnBounds.x + 12,
    returnY = returnBounds.y + 58;
  await page.mouse.move(returnX, returnY);
  await page.mouse.down();
  await page.mouse.move(returnX + focusStep(beforeBackground.width), returnY, {
    steps: 8,
  });
  await page.mouse.up();
  await page.mouse.move(returnX, returnY);
  await page.mouse.down();
  await page.mouse.move(returnX + 5, returnY);
  await page.mouse.up();
  const noopReturnHome = await settled();
  assert.equal(noopReturnHome.pack.camera.mode, "overview");
  assert.equal(noopReturnHome.pack.camera.focusLevel, null);

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
  const base5Attack = await page.evaluate(async () => {
    const model = await import("./src/model.mjs"),
      { PROBLEM_BANK } = await import("./src/stages.mjs"),
      run = model.createRun({
        ...structuredClone(PROBLEM_BANK.pack[0]),
        id: "pack:17:5-attack-browser",
        radices: [5],
      });
    model.normalizePackSelection(
      run,
      model.activePackItems(run).map((item) => item.id),
    );
    const plan = model.beginPackAttack(run);
    if (!plan.ok) return { ok: false };
    for (const payload of plan.payloads)
      model.resolvePackAttackPayload(run, payload.itemId);
    const result = {
      ok: run.status === "break",
      placeCount: plan.placeCount,
      levels: plan.payloads.map((payload) => payload.level),
      weights: plan.payloads.map((payload) => payload.weight),
      rawIds: run.pack.attack.resolvedRawIds,
    };
    result.completed = model.completePackBreak(run);
    return result;
  });
  assert.equal(base5Attack.ok, true);
  assert.equal(base5Attack.placeCount, 2);
  assert.deepEqual(base5Attack.levels, [1, 1, 1, 0, 0]);
  assert.deepEqual(base5Attack.weights, [5, 5, 5, 1, 1]);
  assert.deepEqual([...base5Attack.rawIds].sort((a, b) => a - b), originalPackIds);
  assert.equal(new Set(base5Attack.rawIds).size, 17);
  assert.equal(base5Attack.completed, true);

  // Overview unit frames match the L0 raw-dot reference. Inspection moves
  // continuously while held and returns home as soon as the gesture ends.
  const base5Overview = await read(),
    base5Frame0 = base5Overview.pack.viewports.find((view) => view.level === 0),
    base5Frame1 = base5Overview.pack.items.find((item) => item.level === 1);
  assert.ok(base5Frame1);
  assert.ok(Math.abs(base5Frame0.frameRadius - 7) < 0.15);
  assert.ok(Math.abs(base5Frame1.frameRadius - base5Frame0.frameRadius) < 0.15);
  const base5Inspection = await inspectScaleMouse(
      [
        -focusStep(base5Overview.width),
        -focusStep(base5Overview.width) * 1.5,
        -focusStep(base5Overview.width) * 2,
      ],
      "left",
      "artifacts/pack-base5-focus-l1.png",
    ),
    base5L0Focus = base5Inspection.states[0],
    base5L0Dots = base5L0Focus.pack.renderedDots.filter(
      (dot) => dot.level === 0 && dot.visible,
    ),
    base5FocusRadius = base5L0Dots[0].radius;
  assert.ok(base5Inspection.states[1].pack.camera.z > base5Inspection.states[0].pack.camera.z);
  assert.equal(base5L0Focus.pack.camera.focusLevel, 0);
  assert.ok(Math.abs(base5FocusRadius - 7) < 0.15);
  const base5L1Focus = base5Inspection.states[2],
    base5L1Dots = base5L1Focus.pack.renderedDots.filter(
      (dot) => dot.level === 1 && dot.visible,
    ),
    base5L1Radius = base5L1Dots.reduce((sum, dot) => sum + dot.radius, 0) /
      base5L1Dots.length,
    base5L1Viewport = base5L1Focus.pack.viewports.find((view) => view.level === 1);
  assert.equal(base5L1Focus.pack.camera.focusLevel, 1);
  assert.equal(base5L1Dots.length, 15);
  assert.ok(Math.abs(base5L1Radius - base5FocusRadius) < 0.15);
  assert.ok(Math.abs(base5L1Viewport.x - base5L1Focus.width / 2) < 0.01);
  assert.ok(Math.abs(base5L1Viewport.y - base5L1Focus.height / 2) < 0.01);
  assert.ok(base5L1Viewport.frameRadius > 0);
  assert.deepEqual(base5L1Focus.pack.rawIds, originalPackIds);
  assert.equal(base5Inspection.released.pack.camera.mode, "returning");
  assert.equal(base5Inspection.home.pack.camera.mode, "overview");
  assert.equal(base5Inspection.home.pack.camera.focusLevel, null);
  assert.ok(base5Inspection.home.pack.viewports.find((view) => view.level === 1));
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

  const scaleCameraBeforeRadixChange = {
    camera: {
      mode: packState.pack.camera.mode,
      focusLevel: packState.pack.camera.focusLevel,
      x: packState.pack.camera.x,
      y: packState.pack.camera.y,
      z: packState.pack.camera.z,
      focalLength: packState.pack.camera.focalLength,
    },
    planes: packState.pack.viewports.map(
      ({ level, worldX, worldY, worldZ, depth, unitWorldRadius, frameWorldRadius }) =>
        [level, worldX, worldY, worldZ, depth, unitWorldRadius, frameWorldRadius],
    ),
  };
  await packBase();
  packState = await read();
  assert.equal(packState.pack.base, 4);
  assert.equal(packState.pack.radixPoints, 4);
  assert.equal(packState.pack.phase, "pack");
  assert.deepEqual(
    {
      camera: {
        mode: packState.pack.camera.mode,
        focusLevel: packState.pack.camera.focusLevel,
        x: packState.pack.camera.x,
        y: packState.pack.camera.y,
        z: packState.pack.camera.z,
        focalLength: packState.pack.camera.focalLength,
      },
      planes: packState.pack.viewports.map(
        ({ level, worldX, worldY, worldZ, depth, unitWorldRadius, frameWorldRadius }) =>
          [level, worldX, worldY, worldZ, depth, unitWorldRadius, frameWorldRadius],
      ),
    },
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

  const base4Overview = await read(),
    base4L0Focus = base4Overview,
    base4L0Radius = base4L0Focus.pack.renderedDots.find(
      (dot) => dot.level === 0 && dot.visible,
    ).radius;
  assert.equal(base4L0Focus.pack.camera.mode, "overview");
  assert.ok(Math.abs(base4L0Radius - 7) < 0.15);
  const base4Inspection = await inspectScaleMouse(
      [-focusStep(base4Overview.width), -focusStep(base4Overview.width) * 2],
      "left",
      "artifacts/pack-base4-focus-l1.png",
    ),
    base4L1Focus = base4Inspection.states[1],
    base4L1Dots = base4L1Focus.pack.renderedDots.filter(
      (dot) => dot.level === 1 && dot.visible,
    );
  assert.equal(base4L1Focus.pack.camera.focusLevel, 1);
  assert.equal(base4L1Dots.length, 16);
  assert.ok(base4L1Dots.every((dot) => Math.abs(dot.radius - base4L0Radius) < 0.15));
  assert.deepEqual(base4L1Focus.pack.rawIds, originalPackIds);
  assert.equal(base4Inspection.home.pack.camera.mode, "overview");

  const middle = packState.pack.places.find((place) => place.level === 1),
    topSlot = packState.pack.slots.find((slot) => slot.level === 2);
  assert.ok(middle && topSlot);
  await drag(middle, topSlot, 16, false);
  const recursiveCarry = await read();
  assert.equal(recursiveCarry.busy, true);
  assert.equal(recursiveCarry.status, "settling");
  assert.equal(recursiveCarry.pack.phase, "attack-ready");
  assert.equal(recursiveCarry.pack.renderedDots.length, 17);
  assert.equal(new Set(recursiveCarry.pack.renderedDots.map((dot) => dot.id)).size, 17);
  await page.screenshot({ path: resolve(root, "artifacts/pack-recursive-carry.png") });
  const canonicalState = recursiveCarry;
  assert.equal(canonicalState.pack.locks[1].notation, "101₄");
  assert.deepEqual(canonicalState.pack.locks[1].digits, [1, 0, 1]);
  assert.equal(
    canonicalState.pack.places.find((place) => place.level === 2).n,
    1,
  );
  assert.equal(
    canonicalState.pack.places.find((place) => place.level === 1).n,
    0,
  );
  assert.equal(
    canonicalState.pack.places.find((place) => place.level === 0).n,
    1,
  );
  assert.equal(canonicalState.pack.revealCount, 2);
  assert.deepEqual(canonicalState.pack.revealedLevels, [0, 1, 2]);
  assert.ok(canonicalState.pack.viewports.every((viewport) => !viewport.ghost));
  const base4Top = canonicalState.pack.items.find((item) => item.level === 2);
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
  assert.equal(canonicalState.pack.renderedDots.length, 17);
  assert.equal(new Set(canonicalState.pack.renderedDots.map((dot) => dot.id)).size, 17);
  assert.ok(canonicalState.pack.renderedDots.every((dot) => dot.worldRadius === 8));
  assert.deepEqual(
    canonicalState.pack.items
      .flatMap((item) => item.rawIds)
      .sort((a, b) => a - b),
    [...originalPackIds].sort((a, b) => a - b),
  );
  await page.screenshot({ path: resolve(root, "artifacts/pack-base4-final.png") });
  assert.ok(canonicalState.pack.slots.some((slot) => slot.level === 1));
  assert.deepEqual(canonicalState.pieces[0].ids, originalPackIds);
  assert.deepEqual(canonicalState.pack.layers.map((layer) => layer.level), [0, 1, 2]);

  await page.waitForFunction(
    () => window.__readFlow?.().status === "attack",
    null,
    { timeout: 5000 },
  );
  const attackState = await read(),
    attackIds = attackState.pack.attack.payloads.flatMap((payload) => payload.rawIds);
  assert.equal(attackState.pack.phase, "attack");
  assert.deepEqual(
    attackState.pack.attack.payloads.map((payload) => [payload.level, payload.weight]),
    [[2, 16], [0, 1]],
  );
  assert.deepEqual(
    attackState.pack.layers.map((layer) => layer.level),
    [0, 1, 2],
  );
  assert.deepEqual([...attackIds].sort((a, b) => a - b), originalPackIds);
  assert.equal(new Set(attackIds).size, 17);
  assert.equal(attackState.pack.attack.placeCount, 3);
  assert.deepEqual(
    [...attackState.pack.rawIds].sort((a, b) => a - b),
    originalPackIds,
  );
  const attackBox = await page.locator("#world").boundingBox(),
    exposedRaw = attackState.pack.renderedDots.find((dot) => dot.level === 0);
  await page.mouse.move(attackBox.x + exposedRaw.x, attackBox.y + exposedRaw.y);
  await page.mouse.down();
  assert.deepEqual((await read()).dragIds, [], "attack locks dot manipulation");
  await page.mouse.move(attackBox.x + attackBox.width * 0.8, attackBox.y + 60, { steps: 5 });
  assert.equal((await read()).pack.camera.inputProgress, 0, "attack locks camera inspection");
  await page.mouse.up();
  await page.screenshot({ path: resolve(root, "artifacts/pack-layered-attack.png") });
  await page.waitForFunction(
    () => window.__readFlow?.().status === "break",
    null,
    { timeout: 5000 },
  );
  const broken = await read();
  assert.equal(broken.pack.phase, "break");
  assert.equal(broken.pack.attack.resolvedRawIds.length, 17);
  assert.equal(new Set(broken.pack.attack.resolvedRawIds).size, 17);
  assert.deepEqual(
    broken.pack.layers.map((layer) => [layer.level, layer.impacted]),
    [[0, true], [1, false], [2, true]],
  );
  assert.equal(broken.pack.renderedDots.length, 17);
  assert.equal(new Set(broken.pack.renderedDots.map((dot) => dot.id)).size, 17);
  await page.screenshot({ path: resolve(root, "artifacts/pack-enemy-break.png") });
  await page.waitForFunction(
    (previous) => window.__readFlow?.().runToken > previous,
    broken.runToken,
    { timeout: 5000 },
  );
  packState = await settled();
  assert.equal(packState.rule, "pack");
  assert.equal(packState.status, "play");
  assert.equal(packState.pack.phase, "pack");
  assert.equal(packState.total, 17);
  assert.equal(packState.runToken, broken.runToken + 1);
  await page.waitForTimeout(120);
  assert.equal((await read()).runToken, packState.runToken, "one BREAK advances once");
  console.log(
    "PACK layered attack verified 17→32₅, unpack/base change, 17→101₄, L2/L0 impacts across the retained empty L1 layer, enemy BREAK, and next-problem continuation.",
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
    [412, 915],
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
        if (w === 320) {
          await drag(
            s.pack.places.find((place) => place.level === 0),
            s.pack.slots.find((slot) => slot.level === 1),
            17,
          );
          s = await read();
          const step = focusStep(s.width),
            inspection = await inspectScaleTouch([-step, -step * 2]),
            levelOne = inspection.states[1],
            levelOneDots = levelOne.pack.renderedDots.filter(
              (dot) => dot.level === 1 && dot.visible,
            );
          assert.equal(levelOne.pack.camera.focusLevel, 1);
          assert.ok(levelOneDots.length > 0);
          assert.ok(levelOneDots.every((dot) => Math.abs(dot.radius - 7) < 0.2));
          assert.equal(inspection.home.pack.camera.mode, "overview");
        }
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
  const reducedL0Radius = s.pack.renderedDots.find(
    (dot) => dot.level === 0 && dot.visible,
  ).radius;
  const reducedStep = focusStep(s.width),
    reducedInspection = await inspectScaleMouse(
      [-reducedStep, -reducedStep * 1.5, -reducedStep * 2],
    );
  s = reducedInspection.states[2];
  const reducedL1Dots = s.pack.renderedDots.filter(
    (dot) => dot.level === 1 && dot.visible,
  );
  assert.equal(s.pack.camera.focusLevel, 1);
  assert.equal(s.pack.camera.mode, "inspection");
  assert.ok(reducedL1Dots.length > 0);
  assert.ok(reducedL1Dots.every((dot) => Math.abs(dot.radius - reducedL0Radius) < 0.15));
  assert.equal(reducedInspection.released.pack.camera.mode, "returning");
  s = reducedInspection.home;
  assert.equal(s.pack.camera.mode, "overview");
  assert.equal(s.pack.camera.focusLevel, null);
  assert.equal(s.pack.rawIds.length, 17);
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
