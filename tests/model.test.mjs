import test from "node:test";
import assert from "node:assert/strict";
import {
  createRun,
  activeTargets,
  split,
  merge,
  fire,
  divide,
  setWidth,
  accountedIds,
  activePackItems,
  packableGroups,
  packDigits,
  normalizePackSelection,
  unpackPackItem,
  setPackBase,
} from "../src/model.mjs";
import { PROBLEM_BANK, generateProblem, divisors } from "../src/stages.mjs";
import { gcd } from "../src/math.mjs";
import {
  shape,
  factors,
  arrayShape,
  packCoefficientShape,
  placeSlotLayout,
  radixFrame,
  packScaleViewports,
  packNestedUnitShape,
  PACK_RAW_DOT_WORLD_RADIUS,
  PACK_FOCUS_DOT_SCREEN_RADIUS,
  PACK_SCALE_DEPTH_RATIO,
  PACK_CHILD_GAP_RATIO,
} from "../src/shapes.mjs";
import {
  packCameraForFocus,
  packCameraForInspection,
  packFocusProgress,
  projectPackPoint,
} from "../src/pack-view.mjs";
import {
  freshProgress,
  restoreProgress,
  recordResult,
} from "../src/progress.mjs";
function audit(run) {
  const ids = accountedIds(run);
  assert.equal(ids.length, run.dots.length);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(
    [...ids].sort((a, b) => a - b),
    run.dots.map((d) => d.id),
  );
  assert.ok(run.pieces.every((p) => p.ids.length > 0 && p.ids.length <= 36));
}
function shoot(run, p, i, cell) {
  const result = fire(run, p.id, [...p.ids], i, cell);
  assert.ok(result.ok, JSON.stringify(run.stage));
  audit(run);
  return result;
}
function combineAll(run) {
  while (run.pieces.length > 1) {
    const p = run.pieces[1];
    assert.ok(merge(run, p.id, [...p.ids], run.pieces[0].id).ok);
    audit(run);
  }
  return run.pieces[0];
}
function packAll(run) {
  while (run.pack.phase === "pack") {
    const counts = new Map();
    for (const item of activePackItems(run))
      counts.set(item.level, (counts.get(item.level) || 0) + 1);
    const level = [...counts]
      .filter(([, count]) => count >= run.pack.base)
      .sort((a, b) => a[0] - b[0])[0]?.[0];
    assert.notEqual(level, undefined, "PACK has a carryable place before lock");
    const itemIds = activePackItems(run)
      .filter((item) => item.level === level)
      .map((item) => item.id);
    const result = normalizePackSelection(run, itemIds);
    assert.ok(result.ok);
    audit(run);
    if (result.locked) return result;
  }
  throw new Error("PACK did not lock");
}
function unpackAll(run) {
  while (run.pack.phase === "unpack") {
    const macro = activePackItems(run).find((item) => item.macro);
    assert.ok(macro, "PACK has a macro to unpack");
    assert.ok(unpackPackItem(run, macro.id).ok);
    audit(run);
  }
  assert.equal(run.pack.phase, "choose");
}
export function solve(problem) {
  const run = createRun(structuredClone(problem));
  if (problem.area === "spark") {
    combineAll(run);
    for (let i = 0; i < run.targets.length; i++) {
      let p = run.pieces[0];
      if (p.ids.length > run.targets[i].n) {
        const result = split(run, p.id, p.ids.slice(0, run.targets[i].n));
        p = run.pieces.find((p) => p.id === result.pieceId);
      }
      shoot(run, p, i);
    }
  } else if (problem.area === "link") {
    while (run.stage.gates[run.gateIndex]) {
      const p = run.pieces[0];
      setWidth(run, p.id, run.stage.gates[run.gateIndex]);
      assert.ok(divide(run, p.id, [...p.ids]).ok);
      audit(run);
    }
    for (const i of activeTargets(run))
      shoot(
        run,
        run.pieces.find((p) => p.ids.length === run.targets[i].n),
        i,
      );
  } else if (problem.area === "gear") {
    setWidth(run, run.pieces[0].id, problem.gcd);
    const result = shoot(run, run.pieces[0], 0);
    assert.equal(result.outcome, "win");
  } else if (problem.area === "pack") {
    const first = packAll(run);
    assert.equal(first.lock.notation, "32₅");
    unpackAll(run);
    assert.ok(setPackBase(run, 4));
    const second = packAll(run);
    assert.equal(second.lock.notation, "101₄");
  }
  assert.equal(run.status, "won");
  if (problem.area === "pack") assert.equal(run.spent.length, 0);
  else assert.equal(run.spent.length, run.dots.length);
  audit(run);
}
test("every generated construction is solvable and conserves every dot", () => {
  for (const [rule, bank] of Object.entries(PROBLEM_BANK)) {
    if (rule === "pack") assert.equal(bank.length, 1);
    else assert.ok(bank.length >= 30, rule);
    for (const p of bank) solve(p);
  }
});
test("seeded generation spans all production difficulties without repeating the last ten", () => {
  for (const rule of Object.keys(PROBLEM_BANK).filter((rule) => rule !== "pack"))
    for (let d = 1; d <= 5; d++) {
      let recent = [];
      const seen = new Set();
      for (let seed = 0; seed < 80; seed++) {
        const p = generateProblem(rule, d, seed, recent);
        assert.deepEqual(p, generateProblem(rule, d, seed, recent));
        assert.equal(p.difficulty, d);
        assert.ok(!recent.includes(p.id));
        seen.add(p.id);
        recent = [...recent, p.id].slice(-10);
      }
      assert.ok(seen.size >= 11);
    }
  assert.throws(() => generateProblem("missing"));
});
test("PACK normalizes arbitrary same-level selections without preselecting a bundle", () => {
  {
    const run = createRun(structuredClone(PROBLEM_BANK.pack[0])),
      original = [...run.pieces[0].ids],
      selected = activePackItems(run).map((item) => item.id),
      result = normalizePackSelection(run, selected);
    assert.ok(result.ok);
    assert.equal(result.bundles.length, 3);
    assert.equal(result.remainderItemIds.length, 2);
    assert.equal(result.locked, true);
    assert.deepEqual(result.lock.digits, [3, 2]);
    assert.equal(result.lock.notation, "32₅");
    assert.deepEqual(
      activePackItems(run).map((item) => item.ids.length),
      [1, 1, 5, 5, 5],
    );
    assert.deepEqual(run.pieces[0].ids, original);
    audit(run);
  }

  {
    const run = createRun(structuredClone(PROBLEM_BANK.pack[0])),
      selected = activePackItems(run)
        .slice(0, 7)
        .map((item) => item.id),
      result = normalizePackSelection(run, selected);
    assert.ok(result.ok);
    assert.equal(result.bundles.length, 1);
    assert.equal(result.remainderItemIds.length, 2);
    assert.equal(result.locked, false);
    assert.equal(activePackItems(run).filter((item) => item.level === 1).length, 1);
    assert.equal(activePackItems(run).filter((item) => item.level === 0).length, 12);
    audit(run);
  }

  {
    const run = createRun(structuredClone(PROBLEM_BANK.pack[0])),
      before = activePackItems(run).map((item) => item.id),
      selected = before.slice(0, 3),
      result = normalizePackSelection(run, selected);
    assert.ok(result.ok);
    assert.equal(result.bundles.length, 0);
    assert.deepEqual(result.remainderItemIds, selected);
    assert.deepEqual(
      activePackItems(run).map((item) => item.id),
      before,
    );
    assert.equal(run.pack.phase, "pack");
    audit(run);
  }
});

test("PACK carries recursively through parent children and fully unpacks by identity", () => {
  const stage = {
      ...structuredClone(PROBLEM_BANK.pack[0]),
      id: "pack:17:4",
      radices: [4, 4],
    },
    run = createRun(stage),
    original = [...run.pieces[0].ids];

  const first = normalizePackSelection(
    run,
    activePackItems(run).map((item) => item.id),
  );
  assert.ok(first.ok);
  assert.equal(first.bundles.length, 4);
  assert.equal(first.remainderItemIds.length, 1);
  assert.equal(first.locked, false);
  assert.equal(activePackItems(run).filter((item) => item.level === 1).length, 4);
  assert.equal(activePackItems(run).filter((item) => item.level === 0).length, 1);

  const second = normalizePackSelection(
    run,
    activePackItems(run)
      .filter((item) => item.level === 1)
      .map((item) => item.id),
  );
  assert.ok(second.ok);
  assert.equal(second.bundles.length, 1);
  assert.equal(second.remainderItemIds.length, 0);
  assert.equal(second.locked, true);
  assert.equal(second.complete, false);
  assert.deepEqual(second.lock.digits, [1, 0, 1]);
  assert.equal(second.lock.notation, "101₄");
  assert.deepEqual(packDigits(run), [1, 0, 1]);
  assert.equal(activePackItems(run).filter((item) => item.level === 1).length, 0);
  const top = activePackItems(run).find((item) => item.level === 2);
  assert.equal(top.children.length, 4);
  assert.ok(
    top.children.every(
      (id) =>
        run.pack.nodes[id].level === 1 &&
        run.pack.nodes[id].children.length === 4,
    ),
  );
  assert.ok(
    top.children
      .flatMap((id) => run.pack.nodes[id].children)
      .every((id) => run.pack.nodes[id].level === 0),
  );
  unpackAll(run);
  assert.deepEqual(
    activePackItems(run)
      .flatMap((item) => item.ids)
      .sort((a, b) => a - b),
    [...original].sort((a, b) => a - b),
  );
  assert.deepEqual(run.pieces[0].ids, original);
  assert.equal(new Set(run.pieces[0].ids).size, 17);
  audit(run);
});

test("PACK unpack restores the exact children and raw ID set", () => {
  const run = createRun(structuredClone(PROBLEM_BANK.pack[0])),
    original = [...run.pieces[0].ids],
    selected = activePackItems(run)
      .slice(0, 5)
      .map((item) => item.id),
    packed = normalizePackSelection(run, selected);
  assert.ok(packed.ok);
  assert.equal(packed.bundles.length, 1);

  const macroId = packed.bundles[0].itemId,
    macro = run.pack.nodes[macroId];
  assert.equal(macro.children.length, 5);
  assert.deepEqual(macro.ids, original.slice(0, 5));

  const unpacked = unpackPackItem(run, macroId);
  assert.ok(unpacked.ok);
  assert.deepEqual(unpacked.childItemIds, macro.children);
  assert.deepEqual(
    activePackItems(run)
      .flatMap((item) => item.ids)
      .sort((a, b) => a - b),
    [...original].sort((a, b) => a - b),
  );
  assert.equal(new Set(activePackItems(run).flatMap((item) => item.ids)).size, 17);
  audit(run);
});

test("PACK keeps the empty middle place explicit after recursive carry", () => {
  const slots = placeSlotLayout(17, 4, 390, 600);
  assert.deepEqual(slots.map((slot) => slot.level), [0, 1, 2]);

  const stage = {
      ...structuredClone(PROBLEM_BANK.pack[0]),
      id: "pack:17:4-zero",
      radices: [4],
    },
    run = createRun(stage);
  normalizePackSelection(
    run,
    activePackItems(run).map((item) => item.id),
  );
  normalizePackSelection(
    run,
    activePackItems(run)
      .filter((item) => item.level === 1)
      .map((item) => item.id),
  );
  assert.deepEqual(packDigits(run), [1, 0, 1]);
  assert.equal(activePackItems(run).filter((item) => item.level === 1).length, 0);
});

test("PACK raw dots share world size and camera projection defines every level", () => {
  const five = radixFrame(5, 40),
    four = radixFrame(4, 40),
    initial = packScaleViewports(0, 390, 844, 5),
    recursive4 = packScaleViewports(2, 390, 844, 4),
    recursive5 = packScaleViewports(2, 390, 844, 5),
    unit0 = packNestedUnitShape(4, 0),
    unit1 = packNestedUnitShape(4, 1),
    unit2 = packNestedUnitShape(4, 2),
    collectRawRadii = (unit) =>
      unit.levels === 0
        ? [unit.radius]
        : unit.children.flatMap((child) => collectRawRadii(child.inner));
  assert.equal(five.points.length, 5);
  assert.equal(four.points.length, 4);
  assert.notDeepEqual(five.points, four.points);
  assert.equal(unit1.children.length, 4);
  assert.equal(unit1.radius < 36, true, "compact L1 content is smaller than Pass 5 geometry");
  assert.equal(unit2.radius < 162, true, "recursive L2 content is smaller than Pass 5 geometry");
  assert.ok(unit1.frameRadius < unit1.radius, "the unit frame is not a child container");
  assert.ok(
    Math.max(
      ...unit1.children.map(
        ({ x, y, radius }) => Math.hypot(x, y) + radius,
      ),
    ) > unit1.frameRadius,
    "compact children may extend beyond their comparison frame",
  );
  const childCenters = unit1.children.map(({ x, y }) => ({ x, y }));
  for (let i = 0; i < childCenters.length; i++)
    for (let j = i + 1; j < childCenters.length; j++)
      assert.ok(
        Math.hypot(
          childCenters[i].x - childCenters[j].x,
          childCenters[i].y - childCenters[j].y,
        ) > 2 * PACK_RAW_DOT_WORLD_RADIUS + 1,
        "compact 2×2 raw children remain distinct",
      );
  const spacingRatio1 = Math.hypot(unit1.children[0].x, unit1.children[0].y) / unit0.radius,
    spacingRatio2 = Math.hypot(unit2.children[0].x, unit2.children[0].y) / unit1.radius;
  assert.ok(Math.abs(spacingRatio1 - spacingRatio2) < 1e-12, "L2 reuses the same recursive packing rule");
  assert.equal(unit1.children[0].radius, unit0.radius);
  assert.equal(unit2.children[0].radius, unit1.radius);
  assert.deepEqual(
    recursive4.map(({ level, ghost }) => [level, ghost]),
    [
      [2, false],
      [1, false],
      [0, false],
    ],
  );
  assert.deepEqual(
    initial.map(({ level, ghost }) => [level, ghost]),
    [
      [1, true],
      [0, false],
    ],
  );
  assert.ok(initial[0].overviewOffsetX < initial[1].overviewOffsetX);
  assert.equal(
    initial.find((slot) => slot.level === 1).x,
    recursive4.find((slot) => slot.level === 1).x,
    "canonical L1 center stays stable as higher levels become known",
  );
  assert.deepEqual(
    recursive4.map(({ level, depth, x }) => [level, depth, x]),
    recursive5.map(({ level, depth, x }) => [level, depth, x]),
    "base 5 to base 4 does not alter the camera depth axis",
  );
  assert.ok(
    recursive4
      .filter((slot) => slot.level > 0)
      .every((slot) =>
        Math.abs(
          slot.depth /
            recursive4.find((previous) => previous.level === slot.level - 1).depth -
            PACK_SCALE_DEPTH_RATIO,
        ) < 1e-12,
      ),
    "neighboring scale planes use the selected short depth ratio",
  );

  const overview = packCameraForFocus(initial, null),
    overviewProjection = initial.map((slot) =>
      projectPackPoint({ x: slot.x, y: slot.y, z: slot.z }, overview, 390, 844),
    );
  assert.ok(overviewProjection[0].x < overviewProjection[1].x);
  assert.ok(
    recursive4.every(
      (slot) =>
        Math.abs(
          slot.frameWorldRadius *
            overview.focalLength /
            slot.depth -
            slot.overviewFrameRadius,
        ) < 1e-8,
    ),
    "overview perspective projects every scale frame to the same radius",
  );

  for (const level of [0, 1, 2]) {
    const plane = recursive4.find((slot) => slot.level === level),
      camera = packCameraForFocus(recursive4, level),
      center = projectPackPoint(
        { x: plane.x, y: plane.y, z: plane.z },
        camera,
        390,
        844,
      );
    assert.equal(center.x, 195);
    assert.equal(center.y, 422);
    assert.ok(
      Math.abs(
        PACK_RAW_DOT_WORLD_RADIUS * center.scale -
          PACK_FOCUS_DOT_SCREEN_RADIUS,
      ) < 1e-8,
      `raw@L${level} projects to the common focus diameter`,
    );
  }

  const levelTwo = recursive4.find((slot) => slot.level === 2),
    overviewFrameRadii = recursive4.map((slot) =>
      slot.frameWorldRadius * overview.focalLength / slot.depth,
    );
  assert.ok(overviewFrameRadii.every((radius) => Math.abs(radius - PACK_FOCUS_DOT_SCREEN_RADIUS) < 1e-8));
  assert.equal(collectRawRadii(unit2).length, 16);
  assert.ok(collectRawRadii(unit2).every((radius) => radius === PACK_RAW_DOT_WORLD_RADIUS));

  const cameraAt1 = packCameraForInspection(recursive4, 1, 2),
    cameraAt15 = packCameraForInspection(recursive4, 1.5, 2),
    cameraNear1 = packCameraForInspection(recursive4, 1.15, 2),
    cameraNear2 = packCameraForInspection(recursive4, 1.85, 2),
    cameraAt3 = packCameraForInspection(recursive4, 3, 2),
    l0 = packCameraForFocus(recursive4, 0),
    l1 = packCameraForFocus(recursive4, 1),
    l2 = packCameraForFocus(recursive4, 2);
  assert.equal(cameraAt1.z, l0.z);
  assert.equal(cameraAt1.x, l0.x);
  assert.ok(cameraAt15.z > l0.z && cameraAt15.z < l1.z, "intermediate drag positions project continuously");
  assert.ok(cameraNear1.inspectionProgress < 1.15 && cameraNear1.inspectionProgress > 1);
  assert.ok(cameraNear2.inspectionProgress > 1.85 && cameraNear2.inspectionProgress < 2);
  assert.equal(cameraNear1.focusLevel, 0);
  assert.equal(cameraNear2.focusLevel, 1);
  assert.equal(cameraAt3.z, l2.z);
  assert.equal(cameraAt3.focusLevel, 2);
  assert.equal(packFocusProgress(1, 2), 1, "focus wells keep canonical anchors fixed");
  const focusAt2 = packCameraForFocus(recursive4, 2),
    focusCenter = projectPackPoint(
      { x: levelTwo.x, y: levelTwo.y, z: levelTwo.z },
      focusAt2,
      390,
      844,
    ),
    focusedRawRadius = PACK_RAW_DOT_WORLD_RADIUS * focusCenter.scale,
    focusedFrameRadius = levelTwo.frameWorldRadius * focusCenter.scale;
  assert.ok(Math.abs(focusedRawRadius - PACK_FOCUS_DOT_SCREEN_RADIUS) < 1e-8);
  assert.ok(
    Math.abs(focusedFrameRadius / focusedRawRadius - PACK_SCALE_DEPTH_RATIO ** 2) < 1e-8,
    "focus uses the same projection for dots and unit frame without fit scaling",
  );
  assert.ok(
    packNestedUnitShape(5, 1).children.every((child, i, all) =>
      all.every((other, j) =>
        i === j ||
        Math.hypot(child.x - other.x, child.y - other.y) >
          2 * child.radius + 1,
      ),
    ),
    "base-five children keep visually separate raw identities too",
  );
  assert.equal(PACK_CHILD_GAP_RATIO, 0.16);

  assert.ok(
    [320, 390, 844].every((width) => {
      const layout = packScaleViewports(2, width, width === 844 ? 390 : 844, 4),
        camera = packCameraForFocus(layout, null),
        projected = layout.map((slot) =>
          projectPackPoint({ x: slot.x, y: slot.y, z: slot.z }, camera, width, width === 844 ? 390 : 844),
        );
      return projected.every((point) => point.visible) &&
        projected[0].x < projected[1].x && projected[1].x < projected[2].x;
    }),
    "overview keeps higher-to-lower order at mobile and landscape widths",
  );
});

test("PACK radix reset removes old grouping while preserving all raw identities", () => {
  const run = createRun(structuredClone(PROBLEM_BANK.pack[0])),
    rawIds = [...run.pieces[0].ids];
  normalizePackSelection(
    run,
    activePackItems(run).map((item) => item.id),
  );
  while (run.pack.phase === "unpack") {
    const nextMacro = activePackItems(run).find((item) => item.macro);
    assert.ok(nextMacro);
    assert.ok(unpackPackItem(run, nextMacro.id).ok);
  }
  assert.equal(run.pack.phase, "choose");
  assert.ok(activePackItems(run).every((item) => item.level === 0 && !item.macro));
  assert.deepEqual(
    activePackItems(run).flatMap((item) => item.ids).sort((a, b) => a - b),
    [...rawIds].sort((a, b) => a - b),
  );
  assert.ok(setPackBase(run, 4));
  assert.equal(run.pack.base, 4);
  assert.ok(activePackItems(run).every((item) => item.level === 0 && !item.macro));
  assert.deepEqual(run.pieces[0].ids, rawIds);
  audit(run);
});

test("PACK full vertical slice keeps all 17 raw identities through radix change", () => {
  const run = createRun(structuredClone(PROBLEM_BANK.pack[0])),
    original = [...run.pieces[0].ids];

  assert.equal(run.pack.base, 5);
  assert.deepEqual(packDigits(run), [0, 17]);
  const first = packAll(run);
  assert.deepEqual(first.lock.digits, [3, 2]);
  assert.equal(run.pack.phase, "unpack");
  unpackAll(run);

  assert.equal(activePackItems(run).length, 17);
  assert.ok(activePackItems(run).every((item) => item.level === 0));
  assert.ok(setPackBase(run, 4));

  const second = packAll(run);
  assert.equal(second.complete, true);
  assert.deepEqual(second.lock.digits, [1, 0, 1]);
  assert.equal(run.status, "won");
  assert.deepEqual(run.pieces[0].ids, original);
  assert.equal(new Set(run.pieces[0].ids).size, 17);
  audit(run);
});

test("PACK factorization geometry does not depend on the active radix", () => {
  const seventeen = shape(17, 48),
    four = shape(4, 48),
    zero = packCoefficientShape(0, 4, 48);
  assert.equal(seventeen.dots.length, 17);
  assert.equal(four.dots.length, 4);
  assert.equal(zero.dots.length, 0);
  assert.deepEqual(factors(17), [17]);
});

test("PACK remains outside adaptive saved progress", () => {
  assert.equal(freshProgress().pack, undefined);
  assert.equal(
    restoreProgress({ pack: { difficulty: 5, wins: 2, retries: 1 } }).pack,
    undefined,
  );
  assert.equal(generateProblem("pack", 5, 999).id, "pack:17:5-4");
  assert.equal(generateProblem("pack", 5, 999).difficulty, 1);
});

test("gear only clears on the greatest common divisor", () => {
  const problem = PROBLEM_BANK.gear.find(
      (p) => p.ammo[0] === 12 && p.ammo[1] === 18,
    ),
    r = createRun(problem);
  assert.ok(problem);
  assert.equal(problem.gcd, 6);

  for (const f of [2, 3]) {
    setWidth(r, 0, f);
    const before = structuredClone(r);
    const result = fire(r, 0, [...r.pieces[0].ids], 0);
    assert.equal(result.ok, true);
    assert.equal(result.outcome, "repel");
    assert.equal(result.greatest, 6);
    assert.deepEqual(r, before);
    audit(r);
  }

  setWidth(r, 0, 4);
  const beforeMiss = structuredClone(r);
  assert.equal(fire(r, 0, [...r.pieces[0].ids], 0).ok, false);
  assert.deepEqual(r, beforeMiss);

  setWidth(r, 0, 6);
  const win = fire(r, 0, [...r.pieces[0].ids], 0);
  assert.equal(win.ok, true);
  assert.equal(win.outcome, "win");
  assert.equal(r.status, "won");
  assert.equal(r.spent.length, 30);
  audit(r);
});
test("gear bank is gcd-driven and GCD 2 stays a minority", () => {
  const twos = PROBLEM_BANK.gear.filter((p) => p.gcd === 2).length;
  assert.ok(PROBLEM_BANK.gear.length >= 55);
  assert.ok(twos / PROBLEM_BANK.gear.length <= 0.15);
  for (const problem of PROBLEM_BANK.gear) {
    assert.equal(gcd(problem.ammo[0], problem.ammo[1]), problem.gcd);
    assert.ok(problem.gcd >= 2);
    assert.ok(problem.gcd <= 12);
  }
});
test("14 in three columns shoots eight, keeps four, and sets two aside", () => {
  const p = PROBLEM_BANK.link.find((p) => p.ammo[0] === 14 && p.gates[0] === 3),
    r = createRun(p);
  assert.equal(divide(r, 0, [...r.pieces[0].ids]).ok, false);
  setWidth(r, 0, 3);
  const out = divide(r, 0, [...r.pieces[0].ids]);
  assert.deepEqual(out.kept, [0, 3, 6, 9]);
  assert.deepEqual(out.rest, [12, 13]);
  assert.equal(out.ids.length, 8);
  audit(r);
});
test("shapes 1–36 do not overlap; paired polygons have radial symmetry", () => {
  for (let n = 1; n <= 36; n++) {
    const s = shape(n, 60);
    assert.equal(s.dots.length, n);
    assert.equal(
      factors(n).reduce((a, b) => a * b, 1),
      n,
    );
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        assert.ok(
          Math.hypot(s.dots[i].x - s.dots[j].x, s.dots[i].y - s.dots[j].y) >
            s.dotRadius * 2,
        );
    for (let width = 1; width <= n; width++) {
      const a = arrayShape(n, width);
      assert.equal(a.dots.length, n);
      assert.equal(a.dots.filter((d) => d.remainder).length, n % width);
      assert.equal(a.dots.filter((d) => d.keep).length, Math.floor(n / width));
    }
  }
  for (const n of [6, 10, 14, 22, 26, 34]) {
    const s = shape(n, 60),
      a = (2 * Math.PI) / (n / 2);
    for (const d of s.dots) {
      const x = d.x * Math.cos(a) - d.y * Math.sin(a),
        y = d.x * Math.sin(a) + d.y * Math.cos(a);
      assert.ok(s.dots.some((q) => Math.hypot(q.x - x, q.y - y) < 1e-7));
    }
    for (const g of s.groups) {
      const [a, b] = g.indices.map((i) => s.dots[i]);
      assert.ok(Math.abs((a.x - g.x) * g.y - (a.y - g.y) * g.x) < 1e-6);
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 2 * s.dotRadius);
    }
  }
});
test("difficulty adapts only to completed problems or deliberate reissues; restores bounded state", () => {
  const p = freshProgress().gear;
  for (let i = 0; i < 3; i++) recordResult(p, true);
  assert.equal(p.difficulty, 2);
  recordResult(p, false);
  assert.equal(p.difficulty, 2);
  recordResult(p, false);
  assert.equal(p.difficulty, 1);
  for (let i = 0; i < 30; i++) recordResult(p, true);
  assert.equal(p.difficulty, 5);
  for (let i = 0; i < 30; i++) recordResult(p, false);
  assert.equal(p.difficulty, 1);
  assert.equal(
    restoreProgress({
      gear: { difficulty: 99, wins: 99, retries: -4, recent: [null, "a"] },
    }).gear.difficulty,
    5,
  );
});

test("rule-specific objects cannot be merged into an unsolvable paired gun or division", () => {
  for (const rule of ["gear"]) {
    const problem = PROBLEM_BANK[rule].find((p) => p.ammo.length === 2);
    const r = createRun(problem),
      before = structuredClone(r);
    assert.equal(merge(r, 0, [...r.pieces[0].ids], 1).ok, false);
    assert.deepEqual(r, before);
  }
});
