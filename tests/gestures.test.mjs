import test from "node:test";
import assert from "node:assert/strict";
import { PeelGesture, finerSelection } from "../src/gestures.mjs";
import { shape } from "../src/shapes.mjs";
import { World } from "../src/view.mjs";
import { createRun, split } from "../src/model.mjs";
import { restoreProgress } from "../src/progress.mjs";
function world(ammo) {
  const w = Object.create(World.prototype);
  Object.assign(w, {
    w: 388,
    h: 786,
    units: new Map(),
    positions: new Map(),
    run: createRun({ area: "spark", ammo, targets: [] }),
    drag: null,
  });
  w.sync();
  for (const d of w.units.values()) {
    d.x = d.tx;
    d.y = d.ty;
  }
  return w;
}
test("four contains two vertical pairs, including fours nested in larger shapes", () => {
  for (const n of [4, 8, 12, 16, 24, 36]) {
    const s = shape(n),
      fours = s.nodes.filter((g) => g.indices.length === 4);
    assert.ok(fours.length);
    for (const four of fours) {
      const children = four.children.map((id) =>
        s.nodes.find((n) => n.id === id),
      );
      assert.deepEqual(
        children.map((c) => c.indices.length),
        [2, 2],
      );
    }
  }
  const s = shape(4),
    [a, b, c] = s.dots;
  assert.equal(a.x, b.x);
  assert.ok(Math.abs(c.x - a.x) > Math.abs(b.y - a.y));
  for (let n = 1; n <= 36; n++)
    for (const node of shape(n).nodes) {
      if (!node.children.length) {
        assert.equal(node.indices.length, 1);
        continue;
      }
      const children = node.children
        .flatMap((id) => shape(n).nodes.find((c) => c.id === id).indices)
        .sort((a, b) => a - b);
      assert.deepEqual(
        children,
        [...node.indices].sort((a, b) => a - b),
      );
    }
});
test("deliberate slow movement peels once while normal flicks, jitter and holds do not", () => {
  const slow = new PeelGesture(0, 0, 0);
  assert.equal(slow.update(4, 0, 40), false);
  assert.equal(slow.update(8, 0, 100), false);
  assert.equal(slow.update(12, 0, 160), true);
  assert.equal(slow.update(24, 0, 260), false);

  for (const dt of [8, 16, 33]) {
    const fast = new PeelGesture(0, 0, 0);
    assert.equal(fast.update(30, 0, dt), false);
    assert.equal(fast.update(32, 0, dt + 150), false);
  }

  const ordinary = new PeelGesture(0, 0, 0);
  assert.equal(ordinary.update(6, 0, 30), false);
  assert.equal(ordinary.update(14, 0, 70), false);
  assert.equal(ordinary.update(24, 0, 110), false);
  assert.equal(ordinary.update(26, 0, 260), false);

  const tap = new PeelGesture(0, 0, 0);
  for (let t = 10; t < 220; t += 10)
    assert.equal(tap.update(t % 4, 0, t), false);

  const hold = new PeelGesture(0, 0, 0);
  assert.equal(hold.update(0, 0, 500), false);
  assert.equal(hold.update(4, 0, 540), false);
  assert.equal(hold.update(12, 0, 680), true);
});
test("peel direction selects a direct child without skipping another level; grip is exempt", () => {
  const w = world([4]),
    p = w.read().pieces[0],
    whole = w.hit(p.x, p.y);
  assert.equal(whole.ids.length, 4);
  const right = finerSelection(whole, p.x, p.y, 30, 0);
  assert.equal(right.ids.length, 2);
  assert.ok(right.anchor.x > p.x);
  const top = finerSelection(right, right.anchor.x, right.anchor.y, 0, -30);
  assert.equal(top.ids.length, 1);
  assert.ok(top.anchor.y < right.anchor.y);
  assert.equal(finerSelection(top, top.anchor.x, top.anchor.y, 20, 0), null);
  const grip = w.hit(p.grip.x, p.grip.y);
  assert.equal(grip.kind, "grip");
  assert.equal(finerSelection(grip, p.grip.x, p.grip.y, 30, 0), null);
});
test("small visible dots remain individually pickable beside 24 or 32 and during motion", () => {
  for (const large of [24, 32]) {
    const w = world([4, large]),
      p = w.read().pieces[0];
    for (const d of p.dots) {
      assert.ok(d.r >= 6 - 1e-9);
      assert.deepEqual(w.hit(d.x, d.y).ids, [d.id]);
    }
    for (const id of p.ids) {
      w.units.get(id).x -= 40;
      w.units.get(id).y -= 70;
    }
    for (const d of w.read().pieces[0].dots)
      assert.deepEqual(w.hit(d.x, d.y).ids, [d.id]);
  }
});
test("short peels land outside other grip rings without moving the other pieces", () => {
  const w = world([4, 24]),
    p = w.run.pieces[0],
    before = { ...w.positions.get(1) };
  const result = split(w.run, p.id, p.ids.slice(0, 2));
  w.placeApart(result.pieceId, { ...w.positions.get(p.id) });
  w.sync();
  const c = w.positions.get(result.pieceId),
    r = Math.max(
      23,
      w.pieceShape(w.run.pieces.find((p) => p.id === result.pieceId)).radius +
        12,
    );
  for (const q of w.run.pieces.filter((p) => p.id !== result.pieceId)) {
    const other = w.positions.get(q.id),
      radius = Math.max(23, w.pieceShape(q).radius + 12);
    assert.ok(Math.hypot(c.x - other.x, c.y - other.y) >= r + radius + 7.9);
  }
  assert.deepEqual(w.positions.get(1), before);
});
test("saved core progress is ignored without resetting the remaining rules", () => {
  const p = restoreProgress({
    core: { difficulty: 5 },
    spark: { difficulty: 4, wins: 2, recent: ["spark:old"] },
    gear: { difficulty: 3 },
  });
  assert.equal(p.core, undefined);
  assert.equal(p.spark.difficulty, 4);
  assert.equal(p.spark.wins, 2);
  assert.equal(p.gear.difficulty, 3);
});
