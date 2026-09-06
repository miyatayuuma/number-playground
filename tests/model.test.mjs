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
} from "../src/model.mjs";
import { PROBLEM_BANK, generateProblem, divisors } from "../src/stages.mjs";
import { shape, factors, arrayShape } from "../src/shapes.mjs";
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
    const f = divisors(problem.ammo[0]).find((f) => problem.ammo[1] % f === 0);
    setWidth(run, run.pieces[0].id, f);
    shoot(run, run.pieces[0], 0);
  }
  assert.equal(run.status, "won");
  assert.equal(run.spent.length, run.dots.length);
  audit(run);
}
test("every generated construction is solvable and conserves every dot", () => {
  for (const [rule, bank] of Object.entries(PROBLEM_BANK)) {
    assert.ok(bank.length >= 30, rule);
    for (const p of bank) solve(p);
  }
});
test("seeded generation spans all difficulties without repeating the last ten", () => {
  for (const rule of Object.keys(PROBLEM_BANK))
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
test("all common widths work, and unequal rows never consume ammo", () => {
  for (const problem of PROBLEM_BANK.gear)
    for (const f of divisors(problem.ammo[0]).filter(
      (f) => problem.ammo[1] % f === 0,
    )) {
      const r = createRun(problem);
      setWidth(r, 0, f);
      const result = shoot(r, r.pieces[0], 0);
      assert.ok(result.groups.every((g) => g.length === f));
    }
  const r = createRun(PROBLEM_BANK.gear[0]);
  setWidth(r, 0, 1);
  const before = structuredClone(r);
  for (let i = 0; i < 8; i++)
    assert.equal(fire(r, 0, r.pieces[0].ids, 0).ok, false);
  assert.deepEqual(r, before);
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
