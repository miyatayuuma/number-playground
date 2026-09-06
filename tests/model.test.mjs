import test from "node:test";
import assert from "node:assert/strict";
import {
  createRun,
  activeTargets,
  gateFactor,
  split,
  merge,
  fire,
  divide,
  accountedIds,
} from "../src/model.mjs";
import { factors, shape, intrinsic } from "../src/shapes.mjs";
import { STAGES } from "../src/stages.mjs";
function audit(r) {
  const ids = accountedIds(r);
  assert.equal(ids.length, r.dots.length);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(
    [...ids].sort((a, b) => a - b),
    r.dots.map((d) => d.id),
  );
  assert.ok(r.pieces.every((p) => p.ids.length > 0 && p.ids.length <= 36));
}
function part(r, p, n) {
  const g = shape(p.ids.length).groups.find((g) => g.indices.length === n);
  assert.ok(g, `Visible ${n} inside ${p.ids.length}`);
  return g.indices.map((i) => p.ids[i]);
}
function shot(r, p, n, target) {
  const ids = n === p.ids.length ? [...p.ids] : part(r, p, n);
  const result = fire(r, p.id, ids, target);
  assert.equal(result.ok, true);
  audit(r);
  return result;
}

test("canonical shapes cover 1–36, with exact factor products and disjoint dots", () => {
  for (let n = 1; n <= 36; n++) {
    assert.equal(
      factors(n).reduce((a, b) => a * b, 1),
      n,
    );
    const s = shape(n, 60);
    assert.equal(s.dots.length, n);
    assert.deepEqual(shape(n, 60), s);
    for (const d of s.dots)
      assert.ok(Math.hypot(d.x, d.y) + s.dotRadius < 60.01);
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        assert.ok(
          Math.hypot(s.dots[i].x - s.dots[j].x, s.dots[i].y - s.dots[j].y) >
            s.dotRadius * 2,
        );
    for (const g of s.groups) {
      assert.ok(g.indices.length < n);
      assert.equal(new Set(g.indices).size, g.indices.length);
    }
    assert.ok(intrinsic(n).radius >= 1);
  }
  assert.deepEqual(factors(8), [2, 4]);
  assert.deepEqual(factors(9), [3, 3]);
  assert.deepEqual(factors(12), [3, 4]);
  assert.throws(() => shape(0));
  assert.throws(() => shape(37));
  assert.throws(() => shape(2.5));
});

test("combining and pulling apart keeps persistent unit identities", () => {
  const r = createRun(0),
    before = [...r.pieces[0].ids, ...r.pieces[1].ids];
  assert.ok(merge(r, 1, r.pieces[1].ids, 0).ok);
  assert.equal(r.pieces[0].ids.length, 8);
  audit(r);
  const ids = part(r, r.pieces[0], 4);
  assert.ok(split(r, 0, ids).ok);
  assert.deepEqual(
    r.pieces.map((p) => p.ids.length),
    [4, 4],
  );
  audit(r);
  assert.deepEqual(
    r.pieces.flatMap((p) => p.ids).sort((a, b) => a - b),
    before,
  );
  assert.equal(merge(r, 0, [999], 1).ok, false);
  assert.equal(split(r, 0, [r.pieces[0].ids[0], r.pieces[0].ids[0]]).ok, false);
  audit(r);
});

test("division shoots the other columns and leaves quotient plus remainder", () => {
  const r = createRun(6),
    p = r.pieces[0],
    ids = [...p.ids],
    result = divide(r, p.id, ids);
  assert.equal(result.ok, true);
  assert.equal(result.factor, 3);
  assert.equal(result.quotient, 4);
  assert.equal(result.remainder, 2);
  assert.equal(result.ids.length, 8);
  assert.deepEqual(result.kept, [0, 3, 6, 9]);
  assert.deepEqual(result.rest, [12, 13]);
  assert.deepEqual(
    r.pieces.map((p) => p.ids.length),
    [4, 2],
  );
  audit(r);
  assert.equal(result.ids.length + result.kept.length + result.rest.length, 14);
});

test("every stage is solvable using actual visible subgroups or entire pieces", () => {
  for (let index = 0; index < STAGES.length; index++) {
    const r = createRun(index);
    if (index === 0) {
      merge(r, 1, r.pieces[1].ids, 0);
      shot(r, r.pieces[0], 8, 0);
    }
    if (index === 1) {
      shot(r, r.pieces[0], 4, 0);
      shot(r, r.pieces[0], 8, 1);
    }
    if (index === 2) {
      merge(r, 1, [...r.pieces[1].ids], 0);
      merge(r, 2, [...r.pieces.find((p) => p.id === 2).ids], 0);
      shot(r, r.pieces[0], 10, 0);
    }
    if ([3, 10, 11].includes(index)) {
      for (let t = 0; t < r.targets.length; t++)
        shot(r, r.pieces[0], r.targets[t].n, t);
    }
    if (index === 4) {
      for (let t = 0; t < 3; t++) shot(r, r.pieces[0], 4, t);
    }
    if ([5, 6, 9].includes(index)) {
      const divisions = index === 9 ? 2 : 1;
      for (let d = 0; d < divisions; d++) {
        const p = r.pieces[0];
        assert.ok(divide(r, p.id, [...p.ids]).ok);
        audit(r);
      }
      for (const t of activeTargets(r)) {
        const p = r.pieces.find((p) => p.ids.length === r.targets[t].n);
        shot(r, p, p.ids.length, t);
      }
    }
    if (index === 7) {
      shot(
        r,
        r.pieces.find((p) => p.id === 0),
        4,
        0,
      );
      shot(
        r,
        r.pieces.find((p) => p.id === 1),
        4,
        1,
      );
    }
    if (index === 8) {
      const p = r.pieces.find((p) => p.ids.length === 6);
      merge(r, p.id, part(r, p, 2), 0);
      shot(
        r,
        r.pieces.find((p) => p.ids.length === 10),
        10,
        0,
      );
      shot(r, r.pieces[0], 4, 1);
    }
    assert.equal(r.status, "won", r.stage.id);
    audit(r);
  }
});

test("failed shots and invalid gates never delete ammunition", () => {
  for (const index of [0, 6]) {
    const r = createRun(index),
      p = r.pieces[0],
      ids = [...p.ids];
    for (let i = 0; i < 4; i++) {
      assert.equal(fire(r, p.id, ids, 0).ok, false);
      audit(r);
    }
    assert.equal(r.status, index === 0 ? "play" : "lost");
    assert.deepEqual(r.pieces[0].ids, ids);
  }
  const r = createRun(5),
    p = r.pieces[0],
    ids = p.ids.slice(0, 2);
  const before = JSON.stringify(r.pieces);
  assert.equal(divide(r, p.id, ids).ok, false);
  assert.equal(JSON.stringify(r.pieces), before);
  audit(r);
});

test("linked sockets keep their loaded units until a single combined burst", () => {
  const r = createRun(3);
  for (let i = 0; i < 2; i++) {
    const result = shot(r, r.pieces[0], 3, i);
    assert.equal(result.type, "load");
    assert.equal(r.spent.length, 0);
  }
  const result = shot(r, r.pieces[0], 3, 2);
  assert.equal(result.type, "burst");
  assert.equal(result.ids.length, 9);
  assert.equal(r.spent.length, 9);
  assert.equal(r.targets.flatMap((t) => t.loaded).length, 0);
  audit(r);
});

test("resonance requires a part from each source; future layers are closed", () => {
  const r = createRun(7),
    p = r.pieces[0],
    ids = part(r, p, 4);
  assert.equal(fire(r, p.id, ids, 1).ok, false);
  audit(r);
  assert.equal(r.targets[1].complete, false);
  assert.equal(fire(r, p.id, ids, 0).ok, true);
  audit(r);
  const t = createRun(8),
    q = t.pieces[0];
  assert.equal(fire(t, q.id, part(t, q, 4), 1).ok, false);
  audit(t);
  assert.equal(gateFactor(createRun(9)), 3);
});
