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
  packRawQuantityForLevel,
  matchPackTarget,
  beginPackTransition,
  settlePackTransition,
  packTargetActivated,
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
  compactPackNestedUnitShape,
  PACK_RAW_DOT_WORLD_RADIUS,
  PACK_MAX_SIBLING_OVERLAP,
  PACK_MAX_NESTED_RAW_DOTS,
  packPlaceFrameRadius,
  packPlaceUnitCenters,
  packUnitFrameRadius,
  packUnitFrameInnerRadius,
} from "../src/shapes.mjs";
import {
  canonicalSelectorShape,
  drawNumberReadout,
  drawSelectorDots,
} from "../src/number-selector.mjs";

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
function pourUntilMassEmpty(run, level = 0) {
  const results = [];
  while (run.pack.numberMassRawIds.length) {
    const previous = run.pack.numberMassRawIds.length,
      result = pourPackMass(run, level);
    assert.ok(result.ok, "available Number Mass feeds at least one complete unit");
    assert.ok(run.pack.numberMassRawIds.length < previous, "each gesture consumes mass");
    results.push(result);
  }
  return results;
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
    pourUntilMassEmpty(run, 0);
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

test("PACK problems define exactly one hidden target and preserve its radix-neutral digits", () => {
  assert.deepEqual(packCanonicalDigits(17, 4), [1, 0, 1]);
  assert.deepEqual(packCanonicalDigits(17, 5), [3, 2]);
  assert.deepEqual(packCanonicalDigits(17, 3), [1, 2, 2]);
  for (let difficulty = 1; difficulty <= 5; difficulty++) {
    const problem = generateProblem("pack", difficulty, "single-target"),
      run = createRun(problem);
    assert.equal(problem.targetRadix, 5);
    assert.equal("targetRadices" in problem, false);
    assert.deepEqual(Object.keys(run.pack.target).sort(), ["activated", "digits", "radix"]);
    assert.deepEqual(run.pack.target.digits, packCanonicalDigits(17, 5));
    assert.equal(run.pack.target.activated, false);
  }
});

test("PACK target matching requires a complete settled canonical structure", () => {
  const run = createRun({ ...generateProblem("pack", 3, "settle"), targetRadix: 4 });
  assert.equal(matchPackTarget(run).ok, false, "Number Mass is not yet packed");
  assert.ok(setPackBase(run, 4));
  assert.ok(pourPackMass(run, 0).ok);
  assert.ok(beginPackTransition(run));
  assert.equal(matchPackTarget(run).ok, false, "carry presentation has not settled");
  assert.equal(run.pack.target.activated, false);
  assert.ok(settlePackTransition(run));
  assert.deepEqual(packDigits(run), [1, 0]);
  assert.equal(matchPackTarget(run).reason, "not-settled", "remaining mass prevents matching");
  assert.equal(run.pack.target.activated, false);
  pourUntilMassEmpty(run, 0);
  assert.deepEqual(packDigits(run), [1, 0, 1]);
  assert.equal(matchPackTarget(run).ok, true);
  assert.equal(packTargetActivated(run), true);
  assert.equal(matchPackTarget(run).ok, false, "a target activates only once");
});

test("PACK wrong radix has no penalty and resetting radix preserves the single target", () => {
  const run = createRun(generateProblem("pack", 3, "wrong-radix")),
    original = run.dots.map((dot) => dot.id),
    target = structuredClone(run.pack.target);
  assert.ok(setPackBase(run, 4));
  pourUntilMassEmpty(run, 0);
  assert.deepEqual(packDigits(run), [1, 0, 1]);
  assert.equal(matchPackTarget(run).ok, false);
  assert.equal(run.status, "play");
  assert.equal(run.pack.target.activated, false);
  assert.ok(setPackBase(run, 3));
  assert.deepEqual(run.pack.numberMassRawIds, original);
  assert.deepEqual(run.pack.target, target);
  assert.deepEqual(run.pack.discoveredLevels, [0]);
  audit(run);
});

test("PACK target activation is single-shot and attack resolves the original identity set", () => {
  const run = createRun(generateProblem("pack", 1, "attack")),
    original = run.dots.map((dot) => dot.id);
  assert.ok(setPackBase(run, 5));
  pourUntilMassEmpty(run, 0);
  settlePackTransition(run);
  assert.equal(matchPackTarget(run).ok, true);
  assert.equal(matchPackTarget(run).ok, false, "rebuilding the target adds no progress");
  assert.equal(buildPackAttackPlan(run).ok, true);
  const plan = beginPackAttack(run);
  assert.equal(plan.ok, true);
  assert.equal(run.status, "attack");
  assert.equal(setPackBase(run, 4), false);
  assert.equal(pourPackMass(run, 0).ok, false);
  assert.deepEqual([...plan.rawIds].sort((a, b) => a - b), original);
  assert.equal(new Set(plan.rawIds).size, original.length);
  assert.equal(plan.payloads.some((payload) => "targetLayer" in payload), false);
  for (const payload of plan.payloads)
    assert.equal(resolvePackAttackPayload(run, payload.itemId).ok, true);
  assert.equal(run.status, "break");
  assert.equal(completePackBreak(run), true);
  assert.equal(run.status, "won");
  assert.deepEqual([...accountedIds(run)].sort((a, b) => a - b), original);
});

test("PACK base 4 / 17 feeds one carry at a time and keeps carry automatic", () => {
  const run = createRun(structuredClone(PROBLEM_BANK.pack[0])),
    original = run.dots.map((dot) => dot.id);
  assert.equal(setPackBase(run, 4), true);
  const first = pourPackMass(run, 0);
  assert.equal(first.consumedRawIds.length, 4);
  assert.equal(first.carryReached, true);
  assert.equal(run.pack.numberMassRawIds.length, 13);
  assert.deepEqual(run.pack.discoveredLevels, [0, 1]);
  assert.deepEqual(packDigits(run), [1, 0]);

  const second = pourPackMass(run, 1);
  assert.equal(second.consumedRawIds.length, 12);
  assert.equal(second.feedUnits, 3);
  assert.equal(run.pack.numberMassRawIds.length, 1);
  assert.deepEqual(run.pack.discoveredLevels, [0, 1, 2]);
  assert.deepEqual(packDigits(run), [1, 0, 0]);
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
  assert.equal(run.status, "play", "one gesture does not finish the structure");
  const third = pourPackMass(run, 0);
  assert.equal(third.consumedRawIds.length, 1);
  assert.deepEqual(packDigits(run), [1, 0, 1]);
  assert.equal(run.pack.numberMassRawIds.length, 0);
  assert.equal(run.status, "play", "canonical completion holds without attack");
  assert.deepEqual(
    [...run.pack.numberMassRawIds, ...activePackItems(run).flatMap((item) => item.ids)].sort((a, b) => a - b),
    original,
  );
  assert.equal(isCanonicalPack(run), true);
  audit(run);
});

test("PACK base 5 / 17 permits only complete L1 units when mass is short", () => {
  const run = createRun(structuredClone(PROBLEM_BANK.pack[0]));
  assert.ok(setPackBase(run, 5));
  const first = pourPackMass(run, 0);
  assert.equal(first.consumedRawIds.length, 5);
  assert.equal(run.pack.numberMassRawIds.length, 12);
  assert.deepEqual(packDigits(run), [1, 0]);

  const second = pourPackMass(run, 1);
  assert.equal(second.unitSize, 5);
  assert.equal(second.neededUnits, 4);
  assert.equal(second.availableUnits, 2);
  assert.equal(second.feedUnits, 2);
  assert.equal(second.consumedRawIds.length, 10);
  assert.equal(run.pack.numberMassRawIds.length, 2);
  assert.deepEqual(packDigits(run), [3, 0]);

  const third = pourPackMass(run, 0);
  assert.equal(third.consumedRawIds.length, 2);
  assert.deepEqual(packDigits(run), [3, 2]);
  assert.equal(run.pack.numberMassRawIds.length, 0);
  assert.equal(isCanonicalPack(run), true);
  audit(run);
});

test("PACK stops after carry and preserves unique raw IDs on direct input", () => {
  const run = createRun({
      ...structuredClone(PROBLEM_BANK.pack[0]),
      ammo: [32],
      quantity: 32,
    }),
    original = run.dots.map((dot) => dot.id);
  assert.ok(setPackBase(run, 4));
  const first = pourPackMass(run, 0);
  assert.equal(first.consumedRawIds.length, 4);
  assert.equal(run.pack.numberMassRawIds.length, 28);

  assert.ok(pourPackMass(run, 0).ok);
  assert.ok(pourPackMass(run, 0).ok);
  const discovered = pourPackMass(run, 0);
  assert.equal(discovered.consumedRawIds.length, 4);
  assert.deepEqual(run.pack.discoveredLevels, [0, 1, 2]);
  assert.equal(run.pack.numberMassRawIds.length, 16);

  const direct = pourPackMass(run, 2);
  assert.equal(direct.consumedRawIds.length, 16);
  assert.equal(direct.consumedRawIds.length, 4 ** 2 * direct.feedUnits);
  assert.equal(run.pack.numberMassRawIds.length, 0);
  assert.equal(new Set(accountedIds(run)).size, original.length);
  assert.deepEqual([...accountedIds(run)].sort((a, b) => a - b), original);
  assert.equal(isCanonicalPack(run), true);
});

test("PACK radix 2 and 10 carry safely, conserve mass, and reset to raw IDs", () => {
  const run = createRun(structuredClone(PROBLEM_BANK.pack[0])),
    original = run.dots.map((dot) => dot.id);
  assert.equal(run.stage.radices[0], 2);
  assert.equal(run.stage.radices.at(-1), 10);
  assert.ok(setPackBase(run, 2));
  const binaryFirst = pourPackMass(run, 0);
  assert.equal(binaryFirst.consumedRawIds.length, 2);
  assert.equal(run.pack.numberMassRawIds.length, 15);
  assert.deepEqual(run.pack.discoveredLevels, [0, 1]);
  pourUntilMassEmpty(run, 0);
  assert.ok(packDigits(run).every((digit) => digit < 2));
  assert.equal(isCanonicalPack(run), true);
  assert.deepEqual([...accountedIds(run)].sort((a, b) => a - b), original);

  assert.ok(setPackBase(run, 10));
  const decimalFirst = pourPackMass(run, 0);
  assert.equal(decimalFirst.consumedRawIds.length, 10);
  assert.equal(run.pack.numberMassRawIds.length, 7);
  assert.deepEqual(packDigits(run), [1, 0]);
  assert.ok(pourPackMass(run, 0).ok);
  assert.deepEqual(packDigits(run), [1, 7]);
  assert.equal(run.pack.numberMassRawIds.length, 0);
  assert.ok(packDigits(run).every((digit) => digit < 10));
  assert.equal(isCanonicalPack(run), true);
  assert.deepEqual([...accountedIds(run)].sort((a, b) => a - b), original);
  assert.ok(setPackBase(run, 9));
  assert.deepEqual(run.pack.numberMassRawIds, original);
  assert.deepEqual(run.pack.discoveredLevels, [0]);
  assert.deepEqual(packDigits(run), [0]);
});

test("number selector shapes reuse canonical factorization geometry and zero is empty", () => {
  for (const value of [2, 3, 4, 5, 8, 9, 10]) {
    const mini = canonicalSelectorShape(value, 8),
      canonical = shape(value, 8);
    assert.deepEqual(mini.dots, canonical.dots);
    assert.equal(mini.dots.length, value);
    assert.deepEqual(
      canonicalSelectorShape(value, 16).dots.map((dot) => [dot.x / 2, dot.y / 2]),
      mini.dots.map((dot) => [dot.x, dot.y]),
      `value ${value} only scales uniformly`,
    );
  }
  assert.deepEqual(canonicalSelectorShape(0, 12).dots, []);
  const labels = [];
  drawNumberReadout(
    { label: (...args) => labels.push(args) },
    0,
    12,
    18,
    "#fff",
  );
  assert.equal(labels[0][0], "0", "the empty selector keeps its Arabic readout");
  assert.deepEqual(drawSelectorDots({ ctx: {} }, 0, 0, 0, "#fff").dots, []);
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
  for (let i = 0; i < 4; i++) assert.ok(pourPackMass(l2Run, 0).ok);
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

test("PACK readouts count raw descendants from active unit hierarchies", () => {
  const expected = new Map([
    [3, { digits: [1, 2, 2], raw: [9, 6, 2] }],
    [4, { digits: [1, 0, 1], raw: [16, 0, 1] }],
    [5, { digits: [3, 2], raw: [15, 2] }],
  ]);
  for (const [base, values] of expected) {
    const run = createRun(structuredClone(PROBLEM_BANK.pack[0]));
    if (run.pack.base !== base) assert.equal(setPackBase(run, base), true);
    while (run.pack.numberMassRawIds.length) {
      const result = pourPackMass(run, 0);
      assert.equal(result.ok, true);
    }
    const maxLevel = Math.max(...run.pack.discoveredLevels),
      readouts = Array.from({ length: maxLevel + 1 }, (_, level) =>
        packRawQuantityForLevel(run, level),
      ).reverse();
    assert.deepEqual(packDigits(run), values.digits, `base ${base} digits / 17`);
    assert.deepEqual(readouts, values.raw, `base ${base} raw quantity / 17`);

    for (let level = 0; level <= maxLevel; level++) {
      const expectedRawIds = activePackItems(run)
          .filter((item) => item.level === level)
          .flatMap((item) => {
            const collect = (id) => {
              const node = run.pack.nodes[id];
              return node.macro
                ? node.children.flatMap(collect)
                : [...node.ids];
            };
            return collect(item.id);
          }),
        actual = packRawQuantityForLevel(run, level);
      assert.equal(actual, expectedRawIds.length);
      assert.equal(new Set(expectedRawIds).size, expectedRawIds.length);
    }
    assert.equal(isCanonicalPack(run), true);
  }
});

test("PACK uses identical frame dimensions at every place level", () => {
  for (const [width, places] of [[320, 3], [390, 3], [412, 4], [812, 5]]) {
    const placeRadius = packPlaceFrameRadius(width, places),
      unitRadius = packUnitFrameRadius(placeRadius),
      innerRadius = packUnitFrameInnerRadius(unitRadius);
    assert.ok(placeRadius > unitRadius);
    assert.ok(innerRadius < unitRadius);
    assert.equal(packPlaceFrameRadius(width, places), placeRadius);
    assert.equal(packUnitFrameRadius(placeRadius), unitRadius);
    for (const digit of [1, 2, 3, 8, 9]) {
      const centers = packPlaceUnitCenters(digit, placeRadius, unitRadius);
      assert.equal(centers.length, digit);
      assert.ok(centers.every((point) =>
        Math.hypot(point.x, point.y) + unitRadius <=
          placeRadius * 0.88 + 1e-8,
      ));
    }
  }
  assert.ok(
    packPlaceFrameRadius(842, 5, 344) < packPlaceFrameRadius(842, 5, 798),
    "narrow landscape scales the shared frames to available height",
  );
});

test("PACK L0 uses one framed raw dot without adding child structure", () => {
  const run = createRun(structuredClone(PROBLEM_BANK.pack[0]));
  assert.ok(pourPackMass(run, 0, 1).ok);
  const rawItem = activePackItems(run).find((item) => item.level === 0),
    geometry = compactPackNestedUnitShape(
      run.pack.base,
      0,
      packUnitFrameInnerRadius(packUnitFrameRadius(28)),
    );
  assert.ok(rawItem);
  assert.equal(rawItem.macro, false);
  assert.deepEqual(rawItem.children, []);
  assert.deepEqual(rawItem.ids, [rawItem.ids[0]]);
  assert.equal(geometry.dots.length, 1);
  assert.equal(geometry.groups.length, 0);
  assert.ok(geometry.dots[0].radius > 0);
  assert.ok(geometry.radius <= geometry.parentInnerRadius);
});

test("PACK adaptive packing preserves topology, containment, and shared overlap cap", () => {
  const cases = [[2, 4], [3, 2], [4, 2], [5, 2], [8, 2], [10, 2], [10, 3]];
  for (const [base, levels] of cases) {
    const quantity = base ** levels,
      maxRadius = 7,
      geometry = compactPackNestedUnitShape(base, levels, maxRadius),
      canonical = quantity <= 36 ? shape(quantity, 54) : null;
    assert.ok(quantity <= PACK_MAX_NESTED_RAW_DOTS);
    assert.equal(geometry.dots.length, quantity);
    assert.ok(geometry.rawRadius > 0);
    assert.ok(geometry.rawRadius <= PACK_RAW_DOT_WORLD_RADIUS);
    assert.ok(geometry.radius <= maxRadius + 1e-8);
    assert.ok(geometry.dots.every((dot) => dot.radius === geometry.rawRadius));
    if (canonical)
      assert.deepEqual(
        geometry.dots.map(({ x, y }) => [x, y]),
        canonical.dots.map(({ x, y }) => [x * geometry.spacingScale, y * geometry.spacingScale]),
      );
    const expectedGroups = Array.from({ length: levels }, (_, i) => quantity / base ** (i + 1))
      .reduce((sum, count) => sum + count, 0);
    assert.equal(geometry.groups.length, expectedGroups);
    for (const group of geometry.groups) {
      const members = geometry.dots.slice(group.start, group.start + group.count);
      assert.equal(group.count, base ** group.groupLevel);
      assert.equal(group.count, members.length);
      assert.ok(members.every((dot, index) => dot.index === group.start + index));
      assert.ok(group.radius <= maxRadius + 1e-8);
    }
    let minCenterDistance = Infinity;
    for (let i = 0; i < geometry.dots.length; i++)
      for (let j = i + 1; j < geometry.dots.length; j++)
        minCenterDistance = Math.min(
          minCenterDistance,
          Math.hypot(
            geometry.dots[i].x - geometry.dots[j].x,
            geometry.dots[i].y - geometry.dots[j].y,
          ),
        );
    if (quantity > 1)
      assert.ok(
        Math.max(0, 1 - minCenterDistance / (2 * geometry.rawRadius)) <=
          PACK_MAX_SIBLING_OVERLAP + 1e-8,
        `base ${base}, level ${levels} respects the shared sibling overlap cap`,
      );
    assert.equal(geometry.maxOverlap, PACK_MAX_SIBLING_OVERLAP);
    assert.equal(geometry.quantity, quantity);
  }
});

test("PACK radix reset removes old grouping while preserving all raw identities", () => {
  const run = createRun(structuredClone(PROBLEM_BANK.pack[0])),
    rawIds = run.dots.map((dot) => dot.id);
  assert.ok(setPackBase(run, 4));
  assert.ok(pourPackMass(run, 0).ok);
  assert.deepEqual(packDigits(run), [1, 0]);
  assert.deepEqual(run.pack.discoveredLevels, [0, 1]);
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

test("PACK repeated L0 gestures reach canonical base-4 structure without attacking", () => {
  const run = createRun(structuredClone(PROBLEM_BANK.pack[0])),
    original = run.dots.map((dot) => dot.id);
  setPackBase(run, 4);
  const gestures = pourUntilMassEmpty(run, 0);
  assert.ok(gestures.length > 1);
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

test("PACK single target follows the existing saved difficulty progression", () => {
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
    assert.equal(generateProblem("pack", 5, 999).targetRadix, 5);
  assert.equal(generateProblem("pack", 5, 999).difficulty, 5);
  const progress = freshProgress().pack;
  recordResult(progress, true);
  recordResult(progress, true);
  recordResult(progress, true);
  assert.equal(progress.difficulty, 2);
  assert.equal(generateProblem("pack", progress.difficulty, "next").targetRadix, 5);
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
