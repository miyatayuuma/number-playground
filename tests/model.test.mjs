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
  packDigits,
  packUnitSize,
  pourPackMass,
  setPackBase,
  isCanonicalPack,
  packCanonicalDigits,
  matchPackDefense,
  beginPackTransition,
  settlePackTransition,
  packDefenseCleared,
  buildPackAttackPlan,
  beginPackAttack,
  resolvePackAttackPayload,
  completePackBreak,
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
  if (run.stage.area === "pack") assert.ok(isCanonicalPack(run));
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
    assert.ok(setPackBase(run, 4));
    const result = pourPackMass(run, 0);
    assert.ok(result.ok);
    assert.deepEqual(packDigits(run), [1, 0, 1]);
    assert.equal(run.pack.numberMassRawIds.length, 0);
    assert.equal(run.status, "play");
  }
  if (problem.area === "pack") assert.equal(run.spent.length, 0);
  else {
    assert.equal(run.status, "won");
    assert.equal(run.spent.length, run.dots.length);
  }
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
test("SPARK difficulty grows quantity and shifts from joins to sequential decomposition", () => {
  const ranges = {
      1: [3, 6],
      2: [5, 9],
      3: [7, 12],
      4: [10, 18],
      5: [14, 24],
    },
    samples = new Map();
  for (let difficulty = 1; difficulty <= 5; difficulty++) {
    const generated = Array.from({ length: 600 }, (_, seed) =>
      generateProblem("spark", difficulty, `progression-${seed}`, []),
    );
    samples.set(difficulty, generated);
    for (const problem of generated) {
      const total = problem.ammo.reduce((sum, n) => sum + n, 0),
        required = problem.targets.reduce((sum, target) => sum + target.n, 0);
      assert.ok(total >= ranges[difficulty][0] && total <= ranges[difficulty][1]);
      assert.equal(required, total);
      assert.ok(problem.targets.every((target) => target.n > 0));
    }
  }

  const averageQuantity = (difficulty) => {
      const problems = samples.get(difficulty);
      return (
        problems.reduce(
          (sum, problem) =>
            sum + problem.ammo.reduce((total, n) => total + n, 0),
          0,
        ) / problems.length
      );
    },
    multiStageRatio = (difficulty) => {
      const problems = samples.get(difficulty);
      return (
        problems.filter((problem) =>
          problem.targets.some((target) => target.phase > 0),
        ).length / problems.length
      );
    },
    joinRatio = (difficulty) => {
      const problems = samples.get(difficulty);
      return (
        problems.filter((problem) => problem.family === "join").length /
        problems.length
      );
    };

  for (let difficulty = 1; difficulty < 5; difficulty++)
    assert.ok(
      averageQuantity(difficulty + 1) > averageQuantity(difficulty),
      `quantity should grow from D${difficulty} to D${difficulty + 1}`,
    );

  assert.equal(joinRatio(1), 1);
  assert.equal(multiStageRatio(1), 0);
  assert.ok(joinRatio(2) >= 0.6 && joinRatio(2) <= 0.7);
  assert.ok(multiStageRatio(2) >= 0.3 && multiStageRatio(2) <= 0.4);
  assert.ok(joinRatio(3) >= 0.25 && joinRatio(3) <= 0.35);
  assert.ok(multiStageRatio(3) >= 0.65 && multiStageRatio(3) <= 0.75);
  assert.equal(joinRatio(4), 0);
  assert.equal(joinRatio(5), 0);
  assert.ok(multiStageRatio(4) > multiStageRatio(3));
  assert.ok(multiStageRatio(4) >= 0.8);
  assert.ok(multiStageRatio(5) >= 0.8);

  const d2Families = new Set(samples.get(2).map((problem) => problem.family)),
    d3Families = new Set(samples.get(3).map((problem) => problem.family));
  assert.ok(d2Families.has("sequential-split"));
  assert.ok(d2Families.has("join-decomposition"));
  assert.ok(d3Families.has("parallel-split"));
});

test("SPARK join-decomposition cannot shortcut its first active target with an initial piece", () => {
  for (const problem of PROBLEM_BANK.spark.filter(
    (problem) => problem.family === "join-decomposition",
  )) {
    const first = problem.targets.find((target) => target.phase === 0);
    assert.ok(first);
    assert.ok(
      problem.ammo.every((quantity) => quantity !== first.n),
      JSON.stringify(problem),
    );
    assert.ok(
      first.n > Math.max(...problem.ammo),
      "the first layer requires combining initial pieces before decomposition",
    );
  }
});

test("SPARK 7 -> 3 -> 4 spends each original raw identity exactly once", () => {
  const run = createRun({
      id: "spark:test:7-to-3-to-4",
      area: "spark",
      difficulty: 3,
      ammo: [7],
      family: "sequential-split",
      targets: [
        { n: 3, phase: 0, origin: null },
        { n: 4, phase: 1, origin: null },
      ],
    }),
    original = run.dots.map((dot) => dot.id),
    firstIds = run.pieces[0].ids.slice(0, 3);

  assert.deepEqual(run.spent, []);
  assert.deepEqual(activeTargets(run), [0]);
  const first = fire(run, run.pieces[0].id, firstIds, 0);
  assert.equal(first.ok, true);
  assert.equal(run.spent.length, 3);
  assert.equal(run.pieces.length, 1);
  assert.equal(run.pieces[0].ids.length, 4);
  assert.deepEqual(activeTargets(run), [1]);
  assert.equal(run.status, "play");
  assert.deepEqual(
    [...new Set([...run.pieces[0].ids, ...run.spent])].sort((a, b) => a - b),
    original,
  );
  assert.equal(
    new Set([...run.pieces[0].ids, ...run.spent]).size,
    original.length,
  );

  const remaining = run.pieces[0];
  const second = fire(run, remaining.id, [...remaining.ids], 1);
  assert.equal(second.ok, true);
  assert.equal(run.spent.length, 7);
  assert.equal(run.pieces.length, 0);
  assert.equal(run.status, "won");
  assert.deepEqual([...run.spent].sort((a, b) => a - b), original);
  assert.equal(new Set(run.spent).size, original.length);
});

test("PACK starts with one Number Mass and only an empty L0", () => {
  const run = createRun(structuredClone(PROBLEM_BANK.pack[0])),
    original = run.dots.map((dot) => dot.id);
  assert.equal(run.pack.numberMassRawIds.length, 17);
  assert.deepEqual(run.pack.numberMassRawIds, original);
  assert.deepEqual(run.pack.active, []);
  assert.deepEqual(run.pack.discoveredLevels, [0]);
  assert.deepEqual(packDigits(run), [0]);
  assert.equal(isCanonicalPack(run), true);
  audit(run);
});

test("PACK derives hidden, unique defense structures from the shared difficulty", () => {
  assert.deepEqual(packCanonicalDigits(17, 4), [1, 0, 1]);
  assert.deepEqual(packCanonicalDigits(17, 5), [3, 2]);
  assert.deepEqual(packCanonicalDigits(17, 3), [1, 2, 2]);
  assert.deepEqual(generateProblem("pack", 1, 0).targetRadices, [5]);
  assert.deepEqual(generateProblem("pack", 2, 0).targetRadices, [5]);
  assert.deepEqual(generateProblem("pack", 3, 0).targetRadices, [5, 4]);
  assert.deepEqual(generateProblem("pack", 5, 0).targetRadices, [5, 4, 3]);
  for (const difficulty of [1, 3, 5]) {
    const run = createRun(generateProblem("pack", difficulty, "targets")),
      locks = run.pack.defenseLocks;
    assert.equal(locks.length, difficulty <= 2 ? 1 : difficulty === 3 ? 2 : 3);
    assert.equal(new Set(locks.map((lock) => lock.radix)).size, locks.length);
    assert.equal(new Set(locks.map((lock) => lock.digits.join(","))).size, locks.length);
    assert.ok(locks.every((lock) => lock.activated === false));
  }
  const base4Target = createRun(generateProblem("pack", 3, 1)).pack.defenseLocks
    .find((lock) => lock.radix === 4);
  assert.deepEqual(base4Target.digits, [1, 0, 1]);
});

test("PACK defense matching waits for the full settled canonical structure", () => {
  const run = createRun(generateProblem("pack", 1, "settle"));
  assert.equal(matchPackDefense(run).ok, false, "Number Mass is not yet packed");
  assert.ok(setPackBase(run, 4));
  assert.ok(pourPackMass(run, 0).ok);
  assert.ok(beginPackTransition(run));
  assert.equal(matchPackDefense(run).ok, false, "carry presentation has not settled");
  assert.equal(run.pack.defenseLocks[0].activated, false);
  assert.ok(settlePackTransition(run));
  assert.deepEqual(packDigits(run), [1, 0, 1]);
  assert.equal(matchPackDefense(run).reason, "no-match", "the wrong radix stays exploratory");
  assert.equal(run.pack.defenseLocks[0].activated, false);
});

test("PACK multi-ghost locks activate independently in either order and persist across radix resets", () => {
  function explore(order) {
    const run = createRun(generateProblem("pack", 3, `order-${order.join("")}`)),
      original = run.dots.map((dot) => dot.id);
    assert.equal(buildPackAttackPlan(run).ok, false);
    for (const [index, radix] of order.entries()) {
      if (run.pack.base !== radix) assert.ok(setPackBase(run, radix));
      const result = pourPackMass(run, 0);
      assert.ok(result.ok);
      beginPackTransition(run);
      assert.equal(matchPackDefense(run).ok, false);
      settlePackTransition(run);
      const match = matchPackDefense(run);
      assert.equal(match.ok, true, `radix ${radix} activates its matching lock`);
      assert.equal(match.allActivated, index === order.length - 1);
      assert.equal(packDefenseCleared(run), index === order.length - 1);
      assert.equal(
        buildPackAttackPlan(run).ok,
        index === order.length - 1,
        "the attack waits until every lock has activated",
      );
      assert.deepEqual(
        [...accountedIds(run)].sort((a, b) => a - b),
        original,
        "activation retains the one raw identity set",
      );
      if (index + 1 < order.length) {
        const activeLockIds = run.pack.defenseLocks
          .filter((lock) => lock.activated)
          .map((lock) => lock.id);
        assert.ok(setPackBase(run, order[index + 1]));
        assert.deepEqual(
          run.pack.numberMassRawIds,
          original,
          "radix changes restore all raw identities to Number Mass",
        );
        assert.deepEqual(
          run.pack.defenseLocks.filter((lock) => lock.activated).map((lock) => lock.id),
          activeLockIds,
          "activated defense state persists while player structure resets",
        );
        assert.deepEqual(run.pack.discoveredLevels, [0]);
      }
    }
    assert.equal(buildPackAttackPlan(run).ok, true);
    return run;
  }

  const fiveThenFour = explore([5, 4]),
    fourThenFive = explore([4, 5]);
  assert.deepEqual(
    fiveThenFour.pack.defenseLocks.map((lock) => lock.activated),
    fourThenFive.pack.defenseLocks.map((lock) => lock.activated),
  );
});

test("PACK refuses duplicate activation and attack input, then resolves one final identity-preserving attack", () => {
  const run = createRun(generateProblem("pack", 1, "attack")),
    original = run.dots.map((dot) => dot.id);
  assert.ok(setPackBase(run, 5));
  assert.ok(pourPackMass(run, 0).ok);
  settlePackTransition(run);
  const match = matchPackDefense(run);
  assert.equal(match.ok, true);
  assert.equal(match.allActivated, true);
  assert.equal(matchPackDefense(run).ok, false, "rebuilding the active target adds no progress");
  assert.equal(buildPackAttackPlan(run).ok, true);
  const plan = beginPackAttack(run);
  assert.equal(plan.ok, true);
  assert.equal(run.status, "attack");
  assert.equal(setPackBase(run, 4), false);
  assert.equal(pourPackMass(run, 0).ok, false);
  assert.deepEqual([...plan.rawIds].sort((a, b) => a - b), original);
  assert.equal(new Set(plan.rawIds).size, original.length);
  for (const payload of plan.payloads)
    assert.equal(resolvePackAttackPayload(run, payload.itemId).ok, true);
  assert.equal(run.status, "break");
  assert.equal(completePackBreak(run), true);
  assert.equal(run.status, "won");
  assert.deepEqual([...accountedIds(run)].sort((a, b) => a - b), original);
});

test("PACK streams all L0 input and automatically carries recursively", () => {
  const run = createRun(structuredClone(PROBLEM_BANK.pack[0])),
    original = run.dots.map((dot) => dot.id);
  assert.equal(setPackBase(run, 4), true);
  const result = pourPackMass(run, 0);
  assert.ok(result.ok);
  assert.equal(result.consumedRawIds.length, 17);
  assert.equal(result.steps.filter((step) => step.type === "input").length, 17);
  assert.deepEqual(
    result.steps
      .filter((step) => step.type === "carry")
      .map(({ fromLevel, toLevel }) => [fromLevel, toLevel]),
    [[0, 1], [0, 1], [0, 1], [0, 1], [1, 2]],
  );
  assert.equal(run.pack.numberMassRawIds.length, 0);
  assert.deepEqual(run.pack.discoveredLevels, [0, 1, 2]);
  assert.deepEqual(packDigits(run), [1, 0, 1]);
  assert.equal(activePackItems(run).filter((item) => item.level === 1).length, 0);
  const top = activePackItems(run).find((item) => item.level === 2);
  assert.ok(top);
  assert.equal(top.ids.length, 16);
  assert.equal(top.children.length, 4);
  assert.ok(
    top.children.every((childId) => {
      const child = run.pack.nodes[childId];
      return child.level === 1 && child.children.length === 4;
    }),
  );
  assert.equal(run.status, "play", "canonical completion holds without attack");
  assert.deepEqual(
    [...run.pack.numberMassRawIds, ...activePackItems(run).flatMap((item) => item.ids)].sort((a, b) => a - b),
    original,
  );
  assert.equal(isCanonicalPack(run), true);
  audit(run);
});

test("PACK direct input consumes the raw identities for one discovered upper unit", () => {
  const l1Run = createRun({
      ...structuredClone(PROBLEM_BANK.pack[0]),
      ammo: [8],
      quantity: 8,
    }),
    l1Ids = l1Run.dots.map((dot) => dot.id);
  assert.equal(pourPackMass(l1Run, 1).reason, "level-not-discovered");
  setPackBase(l1Run, 4);
  const discovery = pourPackMass(l1Run, 0, 4);
  assert.ok(discovery.ok);
  assert.deepEqual(l1Run.pack.discoveredLevels, [0, 1]);
  assert.deepEqual(l1Run.pack.numberMassRawIds, l1Ids.slice(4));
  const directL1 = pourPackMass(l1Run, 1);
  assert.ok(directL1.ok);
  assert.deepEqual(directL1.consumedRawIds, l1Ids.slice(4));
  assert.equal(directL1.consumedRawIds.length, 4);
  const upperL1 = activePackItems(l1Run).find(
    (item) => item.level === 1 && item.ids.includes(l1Ids[4]),
  );
  assert.deepEqual(upperL1.ids, l1Ids.slice(4));
  assert.deepEqual(
    upperL1.children.map((childId) => l1Run.pack.nodes[childId].ids[0]),
    l1Ids.slice(4),
  );
  assert.equal(activePackItems(l1Run).filter((item) => item.level === 1).length, 2);
  assert.ok(isCanonicalPack(l1Run));

  const l2Run = createRun({
      ...structuredClone(PROBLEM_BANK.pack[0]),
      ammo: [32],
      quantity: 32,
    }),
    l2Ids = l2Run.dots.map((dot) => dot.id);
  setPackBase(l2Run, 4);
  assert.ok(pourPackMass(l2Run, 0, 16).ok);
  assert.deepEqual(l2Run.pack.discoveredLevels, [0, 1, 2]);
  assert.deepEqual(l2Run.pack.numberMassRawIds, l2Ids.slice(16));
  const directL2 = pourPackMass(l2Run, 2);
  assert.ok(directL2.ok);
  assert.deepEqual(directL2.consumedRawIds, l2Ids.slice(16));
  assert.equal(directL2.consumedRawIds.length, 16);
  const topUnits = activePackItems(l2Run).filter((item) => item.level === 2);
  assert.equal(topUnits.length, 2);
  const upperL2 = topUnits.find((item) => item.ids.includes(l2Ids[16]));
  assert.deepEqual(upperL2.ids, l2Ids.slice(16));
  assert.ok(
    upperL2.children.every((childId, index) => {
      const child = l2Run.pack.nodes[childId];
      return (
        child.level === 1 &&
        child.ids.length === 4 &&
        child.ids.every((id, offset) => id === l2Ids[16 + index * 4 + offset])
      );
    }),
  );
  assert.ok(isCanonicalPack(l2Run));
  assert.equal(packUnitSize(4, 1), 4);
  assert.equal(packUnitSize(4, 2), 16);
});

test("PACK radix change returns all active hierarchy to Number Mass and clears discovery", () => {
  const run = createRun(structuredClone(PROBLEM_BANK.pack[0])),
    original = run.dots.map((dot) => dot.id);
  setPackBase(run, 4);
  assert.ok(pourPackMass(run, 0).ok);
  assert.equal(isCanonicalPack(run), true);
  assert.equal(setPackBase(run, 5), true);
  assert.equal(run.pack.base, 5);
  assert.deepEqual(run.pack.numberMassRawIds, original);
  assert.deepEqual(run.pack.active, []);
  assert.deepEqual(run.pack.discoveredLevels, [0]);
  assert.deepEqual(packDigits(run), [0]);
  assert.equal(isCanonicalPack(run), true);
  assert.equal(setPackBase(run, 5), false);
  audit(run);
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
    rawIds = run.dots.map((dot) => dot.id);
  assert.ok(setPackBase(run, 4));
  assert.ok(pourPackMass(run, 0).ok);
  assert.deepEqual(packDigits(run), [1, 0, 1]);
  assert.deepEqual(run.pack.discoveredLevels, [0, 1, 2]);
  assert.ok(setPackBase(run, 5));
  assert.equal(run.pack.base, 5);
  assert.equal(run.pack.phase, "pack");
  assert.deepEqual(run.pack.numberMassRawIds, rawIds);
  assert.deepEqual(run.pack.active, []);
  assert.deepEqual(run.pack.discoveredLevels, [0]);
  assert.deepEqual(packDigits(run), [0]);
  assert.equal(isCanonicalPack(run), true);
  audit(run);
});

test("PACK full stream reaches canonical base-4 structure without attacking", () => {
  const run = createRun(structuredClone(PROBLEM_BANK.pack[0])),
    original = run.dots.map((dot) => dot.id);
  setPackBase(run, 4);
  const streamed = pourPackMass(run, 0);
  assert.ok(streamed.ok);
  assert.deepEqual(packDigits(run), [1, 0, 1]);
  assert.equal(isCanonicalPack(run), true);
  assert.equal(run.pack.numberMassRawIds.length, 0);
  assert.equal(run.status, "play");
  const top = activePackItems(run).find((item) => item.level === 2);
  assert.equal(top.children.length, 4);
  assert.ok(
    top.children.every((id) => {
      const child = run.pack.nodes[id];
      return child.level === 1 && child.children.length === 4 && child.ids.length === 4;
    }),
  );
  const corrupted = structuredClone(run),
    corruptedTop = corrupted.pack.nodes[top.id];
  corruptedTop.children[0] = corruptedTop.children[1];
  assert.equal(isCanonicalPack(corrupted), false);
  const accounted = [
      ...run.pack.numberMassRawIds,
      ...activePackItems(run).flatMap((item) => item.ids),
    ],
    digits = packDigits(run);
  assert.deepEqual([...accounted].sort((a, b) => a - b), original);
  assert.equal(new Set(accounted).size, 17);
  assert.deepEqual(digits, [1, 0, 1]);
  assert.equal(run.pack.discoveredLevels.includes(1), true);
  assert.equal(activePackItems(run).filter((item) => item.level === 1).length, 0);
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

test("PACK lock count follows the existing saved difficulty progression", () => {
  assert.deepEqual(freshProgress().pack, {
    difficulty: 1,
    wins: 0,
    retries: 0,
    recent: [],
  });
  assert.deepEqual(
    restoreProgress({ pack: { difficulty: 5, wins: 2, retries: 1 } }).pack,
    { difficulty: 5, wins: 2, retries: 1, recent: [] },
  );
  assert.equal(generateProblem("pack", 5, 999).targetRadices.length, 3);
  assert.equal(generateProblem("pack", 5, 999).difficulty, 5);
  const progress = freshProgress().pack;
  recordResult(progress, true);
  recordResult(progress, true);
  recordResult(progress, true);
  assert.equal(progress.difficulty, 2);
  assert.equal(generateProblem("pack", progress.difficulty, "next").targetRadices.length, 1);
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
