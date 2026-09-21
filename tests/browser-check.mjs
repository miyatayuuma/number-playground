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
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: "no-preference",
  hasTouch: true,
});
await instrument(context);
const page = await context.newPage(),
  errors = [],
  touchSession = await context.newCDPSession(page);
async function capture(path) {
  if (process.env.CAPTURE_BROWSER_ARTIFACTS === "0") return;
  await page.screenshot({ path: resolve(root, path), timeout: 30000 });
}
page.on("pageerror", (e) =>
  errors.push(`pageerror ${e.name}: ${e.message}\n${e.stack}`),
);
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console ${message.text()}`);
});
page.on("response", (r) => {
  if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
});
const { read, settled, route, audit, drag, width, packBase, solveCurrent } =
  driver(page, base);
async function captureCanvasTrace() {
  await page.evaluate(() => {
    window.__canvasTrace = { enabled: true, labels: [], curves: 0 };
  });
  await page.waitForTimeout(160);
  return page.evaluate(() => {
    window.__canvasTrace.enabled = false;
    return window.__canvasTrace;
  });
}
async function touchStartAt(point, id = 1) {
  const bounds = await page.locator("#world").boundingBox();
  await touchSession.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{
      id,
      x: bounds.x + point.x,
      y: bounds.y + point.y,
      radiusX: 1,
      radiusY: 1,
      force: 1,
    }],
  });
}
async function touchMoveTo(point, id = 1) {
  const bounds = await page.locator("#world").boundingBox();
  await touchSession.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{
      id,
      x: bounds.x + point.x,
      y: bounds.y + point.y,
      radiusX: 1,
      radiusY: 1,
      force: 1,
    }],
  });
}
async function touchEnd() {
  await touchSession.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}
function assertPackGeometry(state) {
  const pack = state.pack,
    radii = pack.slots.map((slot) => slot.frameRadius),
    dots = new Map(pack.renderedDots.map((dot) => [dot.id, dot]));
  assert.ok(radii.every((radius) => radius === radii[0]));
  assert.equal(pack.targetGhost.radius, radii[0]);
  assert.equal(pack.targetGhost.unitFrameRadius, pack.unitFrameRadius);
  assert.ok(pack.targetGhost.places.every((place) =>
    place.unitFrameRadius === pack.unitFrameRadius &&
    !("rawQuantity" in place),
  ));
  assert.ok(pack.targetGhost.places.every((ghost) =>
    pack.slots.every((slot) =>
      ghost.y + ghost.frameRadius + 8 <= slot.y - slot.frameRadius,
    ),
  ), "Target Ghost and player places remain vertically separated");
  assert.ok(pack.items.every((item) => item.unitFrameRadius === pack.unitFrameRadius));
  for (const item of pack.items) {
    const slot = pack.slots.find((candidate) => candidate.level === item.level),
      content = item.rawIds.map((id) => dots.get(id));
    assert.ok(slot, `item ${item.id} has a visible place`);
    assert.ok(content.every(Boolean), `item ${item.id} retains each raw identity`);
    for (const dot of content)
      assert.ok(
        Math.hypot(dot.x - item.x, dot.y - item.y) + dot.radius <=
          pack.unitFrameRadius * 0.84 + 0.8,
        `raw dot ${dot.id} stays inside its Unit Frame`,
      );
    assert.ok(
      Math.hypot(item.x - slot.x, item.y - slot.y) + item.unitFrameRadius <=
        slot.frameRadius * 0.88 + 0.8,
      `unit ${item.id} stays inside its Place Frame`,
    );
  }
}
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
    [
      "spark",
      (p) =>
        p.family === "join" &&
        p.difficulty === 1 &&
        p.ammo[0] === 2 &&
        p.ammo[1] === 3,
    ],
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

  // Sequential SPARK uses one enemy position: future layers stay hidden
  // until the currently active quantity has actually impacted.
  let sparkState = await route(
    "spark",
    (p) =>
      p.family === "sequential-split" &&
      p.difficulty === 3 &&
      p.ammo.length === 1 &&
      p.ammo[0] === 9 &&
      p.targets.length === 2 &&
      p.targets[0].n === 3 &&
      p.targets[1].n === 6,
    3,
  );
  const sequentialIds = [...sparkState.pieces[0].ids],
    firstLayerPoint = { x: sparkState.targets[0].x, y: sparkState.targets[0].y },
    groupOfThree = sparkState.pieces[0].parts.find((part) => part.n === 3);
  assert.ok(groupOfThree, "factorized 9 exposes a directly manipulable group of 3");
  assert.equal(sparkState.targets[0].active, true);
  assert.equal(sparkState.targets[0].visible, true);
  assert.equal(sparkState.targets[1].active, false);
  assert.equal(sparkState.targets[1].visible, false);

  const touchShot = await touchPeel(
    context,
    page,
    groupOfThree,
    sparkState.targets[0].x - groupOfThree.x,
    sparkState.targets[0].y - groupOfThree.y,
    { fast: true, hold: 0 },
  );
  assert.equal(touchShot.initial.length, 3);
  sparkState = await settled();
  assert.equal(sparkState.spent.length, 3);
  assert.deepEqual(sparkState.pieces.map((piece) => piece.n), [6]);
  assert.equal(sparkState.targets[0].complete, true);
  assert.equal(sparkState.targets[0].visible, false);
  assert.equal(sparkState.targets[1].active, true);
  assert.equal(sparkState.targets[1].visible, true);
  assert.ok(Math.abs(sparkState.targets[1].x - firstLayerPoint.x) < 0.01);
  assert.ok(Math.abs(sparkState.targets[1].y - firstLayerPoint.y) < 0.01);
  assert.deepEqual(
    [...sparkState.pieces.flatMap((piece) => piece.ids), ...sparkState.spent].sort(
      (a, b) => a - b,
    ),
    sequentialIds,
  );
  const sequentialToken = sparkState.runToken;
  await drag(sparkState.pieces[0], sparkState.targets[1], 6, false);
  const sequentialFinish = await read();
  assert.equal(sequentialFinish.runToken, sequentialToken);
  assert.equal(sequentialFinish.status, "won");
  assert.equal(sequentialFinish.pieces.length, 0);
  assert.deepEqual(
    [...sequentialFinish.spent].sort((a, b) => a - b),
    sequentialIds,
  );
  assert.equal(new Set(sequentialFinish.spent).size, sequentialIds.length);
  await settled();
  await audit();

  // Join -> decomposition cannot fire an untouched initial piece at phase 0.
  // Merge first, peel a visible subgroup away, then use both resulting quantities.
  sparkState = await route(
    "spark",
    (p) =>
      p.family === "join-decomposition" &&
      p.difficulty === 3 &&
      p.ammo[0] === 4 &&
      p.ammo[1] === 5 &&
      p.targets[0].n === 6 &&
      p.targets[1].n === 3,
    3,
  );
  assert.ok(sparkState.pieces.every((piece) => piece.n < sparkState.targets[0].n));
  const joinIds = [...sparkState.pieces.flatMap((piece) => piece.ids)];
  await drag(sparkState.pieces[1], sparkState.pieces[0]);
  sparkState = await settled();
  assert.deepEqual(sparkState.pieces.map((piece) => piece.n), [9]);
  const peelThree = sparkState.pieces[0].parts.find((part) => part.n === 3);
  assert.ok(peelThree);
  await drag(
    peelThree,
    { x: sparkState.width * 0.78, y: sparkState.height * 0.8 },
    3,
    true,
    1,
  );
  sparkState = await settled();
  assert.deepEqual(
    sparkState.pieces.map((piece) => piece.n).sort((a, b) => a - b),
    [3, 6],
  );
  const six = sparkState.pieces.find((piece) => piece.n === 6);
  await drag(six, sparkState.targets[0], 6);
  sparkState = await settled();
  assert.equal(sparkState.spent.length, 6);
  assert.deepEqual(sparkState.pieces.map((piece) => piece.n), [3]);
  assert.equal(sparkState.targets[1].active, true);
  assert.equal(sparkState.targets[1].visible, true);
  const joinToken = sparkState.runToken;
  await drag(sparkState.pieces[0], sparkState.targets[1], 3, false);
  const joinFinish = await read();
  assert.equal(joinFinish.runToken, joinToken);
  assert.equal(joinFinish.status, "won");
  assert.deepEqual([...joinFinish.spent].sort((a, b) => a - b), joinIds);
  assert.equal(new Set(joinFinish.spent).size, joinIds.length);
  await settled();
  await audit();
  console.log(
    "SPARK D1 join, sequential touch decomposition, hidden next layer, and join->decomposition passed.",
  );

  await page.emulateMedia({ reducedMotion: "no-preference" });
  // One ghost shows only a defense silhouette; the player experiments with
  // radices until the same Number Mass forms that structure.
  let packState = await route("pack", () => true, 1);
  await mkdir(resolve(root, "artifacts"), { recursive: true });
  await capture("artifacts/pack-mass-initial.png");
  assert.equal(packState.total, 17);
  assert.equal(packState.progress.pack.difficulty, 1);
  assert.equal(packState.status, "play");
  assert.equal(packState.pack.base, 3);
  assert.equal(packState.pack.control.current, 3);
  assert.equal(packState.pack.targetGhost.places.length, 2);
  assert.equal(packState.pack.targetGhost.unitFrameRadius, packState.pack.unitFrameRadius);
  assert.equal(packState.pack.targetActivated, false);
  assert.equal("camera" in packState.pack, false);
  assert.equal("ghosts" in packState.pack, false);
  assert.equal("locks" in packState.pack, false);
  assert.deepEqual(
    packState.pack.targetGhost.places.map((place) => place.unitCount),
    [3, 2],
  );
  assert.ok(packState.pack.targetGhost.places.every((place) =>
    !("radix" in place) && !("base" in place) && !("children" in place),
  ));
  assert.ok(
    ["radix", "base", "digits", "notation", "targetRadix"].every(
      (key) => !(key in packState.pack.targetGhost),
    ),
  );
  const flatBeforeSwipe = packState.pack.slots.map(({ x, y, frameRadius }) => [x, y, frameRadius]);
  const worldBox = await page.locator("#world").boundingBox();
  await page.mouse.move(worldBox.x + worldBox.width * 0.76, worldBox.y + worldBox.height * 0.27);
  await page.mouse.down();
  await page.mouse.move(worldBox.x + worldBox.width * 0.24, worldBox.y + worldBox.height * 0.27, { steps: 8 });
  await page.mouse.up();
  packState = await read();
  assert.deepEqual(packState.pack.slots.map(({ x, y, frameRadius }) => [x, y, frameRadius]), flatBeforeSwipe);
  assert.equal("camera" in packState.pack, false);
  const visibleText = await page.locator("body").innerText();
  assert.doesNotMatch(visibleText, /base\s*[345]|[345]進|[0-9]+₍?[345]/i);
  assert.deepEqual(packState.pack.revealedLevels, [0]);
  assert.deepEqual(packState.pack.viewports.map((view) => view.level), [0]);
  assert.deepEqual(packState.pack.places.map(({ level, n }) => [level, n]), [[0, 0]]);
  assert.deepEqual(packState.pack.digits, [0]);
  assert.equal(packState.pack.numberMass.quantity, 17);
  assert.deepEqual(packState.pack.directInputLevels, [0]);
  assert.deepEqual(packState.pack.originalRawIds, packState.pack.rawIds);
  assert.equal(packState.pack.rawIds.length, 17);
  assert.equal(new Set(packState.pack.rawIds).size, 17);
  assert.deepEqual(
    packState.pack.places.map(({ rawQuantity, readoutOpacity }) => [rawQuantity, readoutOpacity]),
    [[0, 0.25]],
    "zero raw quantity remains visible at the subdued baseline opacity",
  );
  const originalPackIds = [...packState.pack.originalRawIds],
    firstMass = packState.pack.numberMass,
    firstL0 = packState.pack.slots.find((slot) => slot.level === 0);
  assert.ok(firstL0);

  // Existing mass drag/drop ownership drives active-place feedback; the
  // readout itself adds no hit target or pointer region.
  const initialBounds = await page.locator("#world").boundingBox();
  await page.mouse.move(initialBounds.x + firstMass.x, initialBounds.y + firstMass.y);
  await page.mouse.down();
  assert.deepEqual((await read()).dragIds.sort((a, b) => a - b), originalPackIds);
  await page.mouse.move(initialBounds.x + firstL0.x, initialBounds.y + firstL0.y, { steps: 8 });
  let touchedPack = await read();
  assert.deepEqual(
    touchedPack.pack.places.filter((place) => place.readoutOpacity === 0.74).map((place) => place.level),
    [0],
    "only the existing active feed target receives pointer-drag emphasis",
  );
  assert.equal(touchedPack.pack.places[0].rawQuantity, 0);
  await page.mouse.move(initialBounds.x + firstMass.x, initialBounds.y + firstMass.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(30);
  assert.ok((await read()).pack.places.every((place) => place.readoutOpacity === 0.25));
  await settled();
  await drag(firstMass, firstL0, 17, false);
  const streamMotion = await read();
  assert.equal(streamMotion.busy, true);
  assert.equal(streamMotion.status, "play");
  assert.equal(streamMotion.pack.attack, null);
  assert.equal(streamMotion.pack.renderedDots.length, 17);
  assert.equal(new Set(streamMotion.pack.renderedDots.map((dot) => dot.id)).size, 17);
  assert.deepEqual([...streamMotion.pack.rawIds].sort((a, b) => a - b), originalPackIds);
  await capture("artifacts/pack-stream-motion.png");
  await page.waitForFunction(() => {
    const places = window.__readFlow?.().pack?.places || [];
    return places.some((place) => place.readoutOpacity >= 0.67);
  });
  let carryReadouts = await read();
  assert.ok(carryReadouts.pack.places.some((place) => place.readoutOpacity >= 0.67));
  assert.ok(carryReadouts.pack.places.every((place) => place.readoutOpacity <= 0.68));
  assert.ok(carryReadouts.pack.places.length <= 2, "only the changed source/destination places are visible");
  await page.waitForTimeout(550);
  carryReadouts = await read();
  assert.ok(carryReadouts.pack.places.every((place) => place.readoutOpacity < 0.75));
  await page.waitForTimeout(350);
  carryReadouts = await read();
  assert.ok(carryReadouts.pack.places.every((place) => place.readoutOpacity === 0.25));
  await capture("artifacts/pack-stream-motion.png");
  packState = await settled();
  assert.deepEqual(packState.pack.digits, [1, 0]);
  assert.equal(packState.pack.numberMass.quantity, 14);
  assert.deepEqual(packState.pack.revealedLevels, [0, 1]);
  assert.equal(packState.pack.complete, false, "one gesture stops at its first carry");
  assert.equal(packState.pack.places.find((place) => place.level === 1).digit, 1);
  const carrySlots = [0, 1].map((level) =>
    packState.pack.slots.find((slot) => slot.level === level),
  );
  await touchStartAt(packState.pack.numberMass, 2);
  await touchMoveTo(carrySlots[1], 2);
  touchedPack = await read();
  assert.deepEqual(
    touchedPack.pack.places
      .filter((place) => place.readoutOpacity === 0.74)
      .map((place) => place.level),
    [1],
    "touch drag over one existing feed target emphasizes only that place",
  );
  assert.ok(touchedPack.pack.places.find((place) => place.level === 0).readoutOpacity <= 0.25);
  await touchMoveTo(packState.pack.numberMass, 2);
  await touchEnd();
  await page.waitForTimeout(80);
  assert.ok((await read()).pack.places.every((place) => place.readoutOpacity === 0.25));
  await packWholeMass();
  packState = await settled();
  assert.deepEqual(packState.pack.digits, [1, 2, 2]);
  assert.deepEqual(packState.pack.places.map((place) => place.rawQuantity), [9, 6, 2]);
  assert.equal(packState.pack.numberMass.quantity, 0);
  assert.equal(packState.pack.targetActivated, false);
  assert.deepEqual(packState.pack.directInputLevels, []);
  assertPackGeometry(packState);
  const mobileViewports = [
    [320, 568, "pack-320-portrait"],
    [390, 844, "pack-390-portrait"],
    [412, 915, "pack-412-portrait"],
    [812, 375, "pack-narrow-landscape"],
  ];
  for (const [width, height, name] of mobileViewports) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(90);
    packState = await settled();
    assert.equal(await page.evaluate(() => window.innerWidth), width);
    assertPackGeometry(packState);
    assert.ok(packState.pack.slots.every((slot) =>
      slot.x - slot.frameRadius >= 0 &&
      slot.x + slot.frameRadius <= packState.width,
    ));
    await capture(`artifacts/${name}.png`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(90);
  packState = await settled();
  await page.waitForFunction(() =>
    window.__readFlow?.().pack?.places?.every((place) => place.readoutOpacity === 0.25),
  );
  const readoutTrace = await captureCanvasTrace();
  for (const place of packState.pack.places) {
    const y = place.slot.y + place.slot.frameRadius + 23;
    assert.ok(readoutTrace.labels.some((label) =>
      label.text === String(place.rawQuantity) &&
      Math.abs(label.x - place.slot.x) < 0.1 &&
      Math.abs(label.y - y) < 0.1 &&
      Math.abs(label.alpha - 0.25) < 0.001,
    ), `visible decimal raw-quantity readout ${place.rawQuantity}`);
  }
  await page.waitForTimeout(450);
  assert.equal((await read()).status, "play", "a mismatching structure has no penalty or attack");

  assert.deepEqual(packState.pack.allowedRadices, [2, 3, 4, 5, 6, 7, 8, 9, 10]);
  await packBase(2);
  packState = await settled();
  assert.equal(packState.pack.base, 2);
  assert.ok(packState.pack.places.every((place) => place.readoutOpacity === 0.25), "radix changes clear old readout emphasis");
  await drag(
    packState.pack.numberMass,
    packState.pack.slots.find((slot) => slot.level === 0),
    17,
  );
  packState = await settled();
  assert.equal(packState.pack.numberMass.quantity, 15);
  assert.deepEqual(packState.pack.digits, [1, 0]);
  assert.deepEqual(packState.pack.revealedLevels, [0, 1]);

  await packBase(10);
  packState = await settled();
  assert.equal(packState.pack.base, 10);
  await drag(
    packState.pack.numberMass,
    packState.pack.slots.find((slot) => slot.level === 0),
    17,
  );
  packState = await settled();
  assert.equal(packState.pack.numberMass.quantity, 7);
  assert.deepEqual(packState.pack.digits, [1, 0]);
  await drag(
    packState.pack.numberMass,
    packState.pack.slots.find((slot) => slot.level === 0),
    7,
  );
  packState = await settled();
  assert.equal(packState.pack.numberMass.quantity, 0);
  assert.deepEqual(packState.pack.digits, [1, 7]);
  assert.equal(packState.pack.digits.every((digit) => digit < 10), true);

  // A radix reset restores the same raw identities, then base 4 displays its
  // real intermediate zero without activating the base 5 defense ghost.
  await packBase(4);
  packState = await settled();
  assert.equal(packState.pack.base, 4);
  assert.equal(packState.pack.control.current, 4);
  assert.deepEqual(packState.pack.rawIds.sort((a, b) => a - b), originalPackIds);
  assert.deepEqual(packState.pack.numberMass.ids.sort((a, b) => a - b), originalPackIds);
  assert.equal(packState.pack.numberMass.quantity, 17);
  assert.deepEqual(packState.pack.viewports.map((view) => view.level), [0]);
  assert.deepEqual(packState.pack.revealedLevels, [0]);
  assert.deepEqual(packState.pack.places.map(({ level, n }) => [level, n]), [[0, 0]]);
  assert.deepEqual(packState.pack.digits, [0]);
  assert.deepEqual(packState.pack.directInputLevels, [0]);
  assert.equal(packState.pack.notation, null);
  const resetTrace = await captureCanvasTrace();
  assert.equal(
    resetTrace.labels.some(({ text }) => text.toLowerCase() === "number mass"),
    false,
    "PACK source dots need no Number Mass explanation label",
  );
  await capture("artifacts/pack-radix-reset.png");

  const base4Mass = packState.pack.numberMass,
    base4L0 = packState.pack.slots.find((slot) => slot.level === 0);
  await drag(base4Mass, base4L0, 17, false);
  await page.waitForFunction(
    () => window.__readFlow?.().pack?.numberMass?.quantity === 13,
  );
  const recursiveMotion = await read();
  assert.equal(recursiveMotion.busy, true);
  assert.equal(recursiveMotion.status, "play");
  assert.equal(recursiveMotion.pack.numberMass.quantity, 13);
  assert.deepEqual([...recursiveMotion.pack.rawIds].sort((a, b) => a - b), originalPackIds);
  await capture("artifacts/pack-incremental-carry-motion.png");
  packState = await settled();
  assert.equal(packState.pack.complete, false);
  assert.equal(packState.pack.canonical, true);
  assert.deepEqual(packState.pack.digits, [1, 0]);
  assert.deepEqual(packState.pack.revealedLevels, [0, 1]);
  assert.deepEqual(packState.pack.viewports.map((view) => view.level).sort((a, b) => a - b), [0, 1]);
  assert.equal(packState.pack.numberMass.quantity, 13);
  assert.equal(packState.pack.notation, null, "partial packing has no radix notation");

  await drag(
    packState.pack.numberMass,
    packState.pack.slots.find((slot) => slot.level === 1),
    13,
  );
  packState = await settled();
  assert.equal(packState.pack.numberMass.quantity, 1);
  assert.deepEqual(packState.pack.digits, [1, 0, 0]);
  assert.deepEqual(packState.pack.revealedLevels, [0, 1, 2]);
  assert.equal(packState.pack.places.some((place) => place.level === 1 && place.digit === 0), true);
  assert.equal(packState.pack.notation, null, "unfinished recursive structure stays blank");

  await drag(
    packState.pack.numberMass,
    packState.pack.slots.find((slot) => slot.level === 0),
    1,
  );
  packState = await settled();
  assert.equal(packState.pack.complete, true);
  assert.deepEqual(packState.pack.digits, [1, 0, 1]);
  assert.deepEqual(
    packState.pack.places
      .map(({ level, rawQuantity }) => [level, rawQuantity])
      .sort((a, b) => a[0] - b[0]),
    [[0, 1], [1, 0], [2, 16]],
  );
  assertPackGeometry(packState);
  assert.deepEqual(
    packState.pack.places.map(({ level, digit }) => [level, digit]).sort((a, b) => a[0] - b[0]),
    [[0, 1], [1, 0], [2, 1]],
  );
  assert.deepEqual(packState.pack.viewports.map((view) => view.level).sort((a, b) => a - b), [0, 1, 2]);
  assert.equal(packState.pack.numberMass.quantity, 0);
  assert.deepEqual([...packState.pack.rawIds].sort((a, b) => a - b), originalPackIds);
  assert.equal(packState.pack.renderedDots.length, 17);
  assert.equal(new Set(packState.pack.renderedDots.map((dot) => dot.id)).size, 17);
  assert.equal(packState.status, "play");
  assert.equal(packState.pack.notation?.phase, "equality");
  assert.deepEqual(
    {
      quantity: packState.pack.notation?.quantity,
      digits: packState.pack.notation?.digits,
      radix: packState.pack.notation?.radix,
    },
    { quantity: 17, digits: "101", radix: "4" },
  );
  const packCanvasTrace = await captureCanvasTrace(),
    packControl = packState.pack.control;
  assert.equal(packCanvasTrace.curves, 0, "PACK carries use unit motion without an arrow curve");
  assert.equal(
    packCanvasTrace.labels.some(({ text }) => /^L\d+$/.test(text)),
    false,
    "place identity has no visible implementation label",
  );
  assert.equal(
    packCanvasTrace.labels.some(({ text }) => text === "17 ="),
    true,
    "completed wrong radix shows equality feedback",
  );
  assert.equal(
    packCanvasTrace.labels.some(({ text, alpha }) => text === "101" && alpha === 0.76),
    true,
    "middle zero notation remains more visible than the raw quantity readouts",
  );
  for (const place of packState.pack.places) {
    const y = place.slot.y + place.slot.frameRadius + 23;
    assert.ok(packCanvasTrace.labels.some(({ text, x, y: labelY, alpha }) =>
      text === String(place.rawQuantity) &&
      Math.abs(x - place.slot.x) < 0.1 &&
      Math.abs(labelY - y) < 0.1 &&
      alpha <= 0.75,
    ), `raw quantity stays below completed notation opacity at level ${place.level}`);
  }
  await page.waitForTimeout(1350);
  packState = await read();
  assert.equal(packState.pack.notation?.phase, "compact");
  const compactTrace = await captureCanvasTrace();
  assert.equal(compactTrace.labels.some(({ text }) => text === "17 ="), false);
  assert.equal(compactTrace.labels.some(({ text }) => text === "101"), true);

  for (const [w, h] of [[320, 568], [390, 844], [412, 915], [844, 390]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(80);
    const responsivePack = await read(),
      notation = responsivePack.pack.notation,
      readoutBottom = Math.max(
        ...responsivePack.pack.slots.map(
          (slot) => slot.y + slot.frameRadius + 23 + 9,
        ),
      );
    assert.equal(notation?.phase, "compact");
    assert.ok(notation.left >= 0 && notation.right <= responsivePack.width);
    assert.ok(notation.top > readoutBottom, "notation stays below place readouts");
    assert.ok(
      !responsivePack.pack.control || notation.bottom < responsivePack.pack.control.y - 20,
      "notation stays clear of the radix selector",
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(80);
  packState = await read();
  assert.equal(packControl.preview, packControl.current);
  assert.equal(packControl.options.length, 9, "PACK exposes radix 2 through 10");
  await capture("artifacts/pack-base4-canonical.png");
  assert.equal(packState.pack.targetActivated, false);

  // Correct structure activates the single target and sends the same raw IDs
  // through the identity-preserving attack before BREAK advances the run.
  await packBase(5);
  packState = await settled();
  assert.equal(packState.pack.notation, null, "radix change clears the old notation");
  assert.equal(packState.pack.numberMass.quantity, 17);
  assert.deepEqual([...packState.pack.rawIds].sort((a, b) => a - b), originalPackIds);
  const finalMass = packState.pack.numberMass,
    finalL0 = packState.pack.slots.find((slot) => slot.level === 0),
    beforeFinalRun = packState.runToken;
  await drag(finalMass, finalL0, 17);
  let finalProgress = await settled();
  assert.equal(finalProgress.pack.numberMass.quantity, 12);
  assert.deepEqual(finalProgress.pack.digits, [1, 0]);
  await drag(
    finalProgress.pack.numberMass,
    finalProgress.pack.slots.find((slot) => slot.level === 1),
    12,
  );
  finalProgress = await settled();
  assert.equal(finalProgress.pack.numberMass.quantity, 2);
  assert.deepEqual(finalProgress.pack.digits, [3, 0]);
  await drag(
    finalProgress.pack.numberMass,
    finalProgress.pack.slots.find((slot) => slot.level === 0),
    2,
    false,
  );
  await page.evaluate(async () => {
    window.__readFlow = (await import("./src/game.mjs")).inspect;
  });
  await page.waitForFunction(
    (token) => window.__readFlow().status === "attack" || window.__readFlow().status === "break" || window.__readFlow().runToken !== token,
    beforeFinalRun,
  );
  let finalPhase = await read();
  assert.equal(finalPhase.pack.targetActivated, true);
  assert.equal(finalPhase.pack.notation?.digits, "32");
  assert.equal(finalPhase.pack.notation?.radix, "5");
  assert.equal(await page.locator('#keyboard-controls input[data-pack-radix]').count(), 0);
  assert.equal(finalPhase.pack.control, null);
  const attackBase = finalPhase.pack.base,
    attackBounds = await page.locator("#world").boundingBox();
  await page.mouse.click(
    attackBounds.x + finalPhase.width * 0.5,
    attackBounds.y + finalPhase.height * 0.9,
  );
  finalPhase = await read();
  assert.equal(finalPhase.pack.base, attackBase, "the radix control is locked during attack");
  assert.equal(finalPhase.dragIds.length, 0, "Number Mass input is locked during attack");
  await capture("artifacts/pack-attack.png");
  await page.waitForFunction((token) => window.__readFlow().status === "break" || window.__readFlow().runToken !== token, beforeFinalRun);
  await capture("artifacts/pack-break.png");
  const afterBreak = await settled();
  assert.ok(afterBreak.runToken > beforeFinalRun, "BREAK advances to the next problem");
  assert.equal(afterBreak.pack.notation, null, "next problem clears prior notation");
  assert.ok(afterBreak.pack.places.every((place) => place.readoutOpacity === 0.25), "next problem clears prior raw-quantity emphasis");
  assert.equal(afterBreak.progress.pack.wins, 1);
  console.log("PACK single target, wrong-radix exploration, radix reset, activation, attack, BREAK, and adaptive progression verified.");

  // A single radix-4 target retains its empty middle place, then activates once.
  async function packWholeMass() {
    for (let gesture = 0; gesture < 36; gesture++) {
      const s = await settled();
      if (s.rule !== "pack" || s.status !== "play" || s.pack.complete) return s;
      const mass = s.pack.numberMass,
        l0 = s.pack.slots.find((slot) => slot.level === 0),
        token = s.runToken;
      await drag(mass, l0, mass.quantity, false);
      await page.waitForFunction(
        (startToken) => {
          const current = window.__readFlow();
          return current.runToken !== startToken || current.pack?.targetActivated || !current.busy;
        },
        token,
      );
      const current = await read();
      if (current.runToken !== token || current.pack?.targetActivated || current.pack?.complete)
        return current;
    }
    throw new Error("PACK Number Mass did not empty through incremental gestures");
  }
  packState = await route("pack", () => true, 3);
  assert.equal(packState.pack.targetGhost.places.length, 2);
  assert.deepEqual(
    packState.pack.targetGhost.places.map((place) => place.unitCount),
    [3, 2],
  );
  assert.ok(packState.pack.targetGhost.places.every((place) => !place.empty));
  await packBase(4);
  const middleZeroRun = packState.runToken;
  packState = await packWholeMass();
  assert.equal(packState.pack.targetActivated, false);
  assert.deepEqual(packState.pack.digits, [1, 0, 1]);
  assert.equal((await settled()).runToken, middleZeroRun);
  assert.equal(packState.pack.places.find((place) => place.level === 1).digit, 0);

  await page.emulateMedia({ reducedMotion: "reduce" });
  packState = await route("pack", () => true, 3);
  assert.ok(packState.pack.places.every((place) => place.readoutOpacity === 0.25));
  await packBase(4);
  packState = await packWholeMass();
  assert.equal(packState.pack.notation?.digits, "101");
  assert.ok(packState.pack.places.some((place) => place.readoutOpacity > 0.25), "carry readouts remain visible with reduced motion");
  await page.waitForTimeout(520);
  assert.ok((await read()).pack.places.every((place) => place.readoutOpacity === 0.25));
  await page.waitForTimeout(240);
  assert.equal((await read()).pack.notation?.phase, "compact");
  packState = await route("pack", () => true, 3);
  await packBase(5);
  const reducedMotionRun = packState.runToken;
  packState = await packWholeMass();
  assert.equal(packState.pack.targetActivated, true);
  assert.ok((await settled()).runToken > reducedMotionRun);
  console.log("PACK single target, middle-zero place, activation, attack, BREAK, and reduced-motion progression verified.");
  await route("link", (p) => p.ammo[0] === 14 && p.gates[0] === 3);
  let s = await read();
  const linkHandle = s.pieces[0].handle;
  assert.equal(linkHandle.value, 0);
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
  const gearHandle = s.pieces[0].handle;
  assert.equal(gearHandle.value, 0);
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
  await route("spark", (p) => p.ammo[0] === 4 && p.ammo[1] === 5);
  const sparkSelectorState = await read();
  assert.ok(sparkSelectorState.pieces.every((piece) => piece.n > 0));
  let small = (await read()).pieces.find((p) => p.n === 4);
  const slow = await touchPeel(context, page, small, 32, 0, { fast: false });
  assert.equal(slow.initial.length, 4);
  assert.equal(slow.picked.length, 4);
  await settled();
  await route("spark", (p) => p.ammo[0] === 4 && p.ammo[1] === 5);
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
  await route("spark", (p) => p.ammo[0] === 4 && p.ammo[1] === 5);
  small = (await read()).pieces.find((p) => p.n === 4);
  const grip = await touchPeel(context, page, small.grip, 32, 0, {
    cancel: true,
  });
  assert.equal(grip.picked.length, 4);
  await settled();
  assert.deepEqual(
    (await read()).pieces.map((p) => p.n),
    [4, 5],
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
  const responsiveSizes = [
    [320, 568],
    [390, 844],
    [412, 915],
    [844, 390],
    [768, 1024],
    [1280, 900],
  ];
  for (const [w, h] of responsiveSizes) {
    await page.setViewportSize({ width: w, height: h });
    for (const rule of ["spark", "link", "gear"]) {
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
      await audit();
    }
  }

  // PACK stays flat and inside portrait and narrow-landscape canvases.
  for (const [w, h] of [[320, 568], [390, 844], [412, 915], [844, 390]]) {
    await page.setViewportSize({ width: w, height: h });
    s = await route("pack", () => true, 5);
    assert.equal(s.pack.targetGhost.places.length, 2);
    assert.equal("camera" in s.pack, false);
    assert.equal("ghosts" in s.pack, false);
    assert.equal("locks" in s.pack, false);
    assert.equal(new Set(s.pack.slots.map((slot) => slot.frameRadius)).size, 1);
    assert.equal(new Set(s.pack.slots.map((slot) => slot.y)).size, 1);
    assert.deepEqual(s.pack.slots.map((slot) => slot.x), [...s.pack.slots].map((slot) => slot.x).sort((a, b) => a - b));
    for (const place of s.pack.targetGhost.places) {
      assert.equal("radix" in place, false);
      assert.equal("base" in place, false);
      assert.equal("children" in place, false);
      assert.ok(place.x - place.frameRadius >= 0 && place.x + place.frameRadius <= s.width);
    }
    assert.equal(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth > innerWidth ||
          document.documentElement.scrollHeight > innerHeight,
      ),
      false,
    );
    const mass = s.pack.numberMass,
      l0 = s.pack.slots.find((slot) => slot.level === 0),
      control = s.pack.control;
    assert.ok(mass.x - mass.radius >= 0 && mass.x + mass.radius <= s.width);
    assert.ok(mass.y - mass.radius >= 0 && mass.y + mass.radius <= s.height);
    assert.ok(l0.x - l0.frameRadius >= 0 && l0.x + l0.frameRadius <= s.width);
    assert.ok(l0.y - l0.frameRadius >= 0 && l0.y + l0.frameRadius + 35 < s.height);
    assert.ok(
      Math.hypot(mass.x - l0.x, mass.y - l0.y) > mass.radius + l0.frameRadius + 12,
      JSON.stringify({ mass, l0, threshold: mass.radius + l0.frameRadius + 12 }),
    );
    assert.ok(control.x1 >= 0 && control.x2 <= s.width && control.y < s.height);
    for (const place of s.pack.targetGhost.places) {
      assert.ok(place.y - place.frameRadius >= 0 && place.y + place.frameRadius <= s.height);
    }
    assert.equal(await page.locator('#keyboard-controls input[data-pack-radix]').count(), 1);
    assert.equal(await page.locator('#keyboard-controls input[data-pack-radix]').getAttribute("min"), "2");
    assert.equal(await page.locator('#keyboard-controls input[data-pack-radix]').getAttribute("max"), "10");
    await audit();
  }

  // A dense radix-10 unit keeps every raw identity inside its shared frame;
  // the dots may become small as the same recursive geometry repeats.
  await page.setViewportSize({ width: 320, height: 568 });
  s = await route("pack", () => true, 5);
  await packBase(10);
  s = await settled();
  const base10Mass = s.pack.numberMass,
    base10Slot = s.pack.slots.find((slot) => slot.level === 0);
  await drag(base10Mass, base10Slot, 17);
  s = await settled();
  const upperTen = s.pack.items.find((item) => item.level === 1);
  assert.ok(upperTen, "base 10 creates a visible upper unit");
  assert.equal(upperTen.rawIds.length, 10);
  assert.equal(upperTen.unitFrameRadius, s.pack.unitFrameRadius);
  const upperDots = s.pack.renderedDots.filter((dot) => dot.rootItemId === upperTen.id);
  assert.equal(upperDots.length, 10);
  assert.ok(upperDots.every((dot) => dot.radius > 0 && dot.radius <= 4.2));
  assert.ok(upperDots.every((dot) =>
    Math.hypot(dot.x - upperTen.x, dot.y - upperTen.y) + dot.radius <=
      upperTen.unitFrameRadius * 0.84 + 1,
  ));
  const upperSlot = s.pack.slots.find((slot) => slot.level === 1);
  assert.ok(
    Math.hypot(upperTen.x - upperSlot.x, upperTen.y - upperSlot.y) +
      upperTen.unitFrameRadius <= upperSlot.frameRadius * 0.88 + 1,
  );
  let maximumOverlap = 0;
  for (let i = 0; i < upperDots.length; i++)
    for (let j = i + 1; j < upperDots.length; j++) {
      const distance = Math.hypot(
        upperDots[i].x - upperDots[j].x,
        upperDots[i].y - upperDots[j].y,
      );
      maximumOverlap = Math.max(
        maximumOverlap,
        Math.max(
          0,
          1 - distance / (upperDots[i].radius + upperDots[j].radius),
        ),
      );
    }
  assert.ok(maximumOverlap <= 0.3 + 1e-3);

  // Native touch stream on the smallest portrait layout, then verify all
  // discovered place readouts still fit after L1 and L2 appear.
  await page.setViewportSize({ width: 320, height: 568 });
  s = await route("pack");
  await packBase(4);
  async function touchPackFeed(level) {
    const current = await settled(),
      touchFrom = current.pack.numberMass,
      touchTo = current.pack.slots.find((slot) => slot.level === level),
      touchBox = await page.locator("#world").boundingBox(),
      packTouch = await context.newCDPSession(page);
    assert.ok(touchTo, `discovered touch target ${level}`);
    await packTouch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: touchBox.x + touchFrom.x, y: touchBox.y + touchFrom.y },
      ],
    });
    assert.equal(
      (await read()).dragIds.length,
      touchFrom.quantity,
      "touch selects the entire Number Mass",
    );
    for (let i = 1; i <= 12; i++)
      await packTouch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x: touchBox.x + touchFrom.x + ((touchTo.x - touchFrom.x) * i) / 12,
            y: touchBox.y + touchFrom.y + ((touchTo.y - touchFrom.y) * i) / 12,
          },
        ],
      });
    await packTouch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await packTouch.detach();
    return settled();
  }
  s = await touchPackFeed(0);
  assert.deepEqual(s.pack.digits, [1, 0]);
  assert.equal(s.pack.numberMass.quantity, 13);
  s = await touchPackFeed(1);
  assert.deepEqual(s.pack.digits, [1, 0, 0]);
  assert.equal(s.pack.numberMass.quantity, 1);
  s = await touchPackFeed(0);
  assert.deepEqual(s.pack.digits, [1, 0, 1]);
  assert.deepEqual(s.pack.revealedLevels, [0, 1, 2]);
  for (const place of s.pack.places) {
    assert.ok(place.x - place.slot.frameRadius >= 0);
    assert.ok(place.x + place.slot.frameRadius <= s.width);
    assert.ok(place.y - place.slot.frameRadius - 15 >= 0);
    assert.ok(place.y + place.slot.frameRadius + 30 <= s.height);
  }
  assert.equal(s.pack.numberMass.quantity, 0);
  await audit();
  await capture("artifacts/pack-touch-320.png");
  for (const rule of ["link", "gear"]) {
    s = await route(
      rule,
      rule === "gear"
        ? (p) => p.ammo[0] === 12 && p.ammo[1] === 20
        : (p) => p.ammo[0] === 14 && p.gates[0] === 3,
    );
    await width(s.pieces[0].id, rule === "gear" ? 4 : 3);
    await capture(`artifacts/flow-${rule}.png`);
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
  await blocked.close().catch(() => {});
  assert.deepEqual(errors, []);
  console.log(
    "Touch, cancellation, retry adaptation, persistence, pause/navigation, responsive layouts, classic and disabled storage passed.",
  );
} catch (error) {
  await mkdir(resolve(root, "artifacts"), { recursive: true });
  await page.screenshot({
    path: resolve(root, "artifacts/browser-failure.png"),
    timeout: 5000,
  }).catch(() => {});
  console.error(await read().catch(() => null));
  console.error(errors);
  throw error;
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
