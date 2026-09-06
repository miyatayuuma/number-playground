import test from "node:test";
import assert from "node:assert/strict";
import {
  boundsFromDots,
  circle,
  compound,
  overlaps,
  rect,
} from "../src/interactions.mjs";

test("circle contact becomes true when visible edges touch", () => {
  assert.equal(overlaps(circle(0, 0, 10), circle(20, 0, 10)), true);
  assert.equal(overlaps(circle(0, 0, 10), circle(20.1, 0, 10)), false);
});

test("circle and rectangle use their actual edges", () => {
  const target = rect(20, -5, 30, 5);
  assert.equal(overlaps(circle(10, 0, 10), target), true);
  assert.equal(overlaps(circle(9.9, 0, 10), target), false);
});

test("padding supplies release hysteresis without changing entry threshold", () => {
  const dragged = circle(0, 0, 10),
    target = circle(25, 0, 10);
  assert.equal(overlaps(dragged, target), false);
  assert.equal(overlaps(dragged, target, 5), true);
});

test("compound geometry does not make empty gaps interactive", () => {
  const pair = compound([rect(0, 0, 10, 10), rect(30, 0, 40, 10)]);
  assert.equal(overlaps(pair, circle(20, 5, 4)), false);
  assert.equal(overlaps(pair, circle(14, 5, 4)), true);
});

test("dot bounds include visible dot radius", () => {
  const box = boundsFromDots(
    [
      { x: 10, y: 20, r: 2 },
      { x: 30, y: 40, r: 3 },
    ],
    "rect",
  );
  assert.deepEqual(box, {
    kind: "rect",
    left: 8,
    top: 18,
    right: 33,
    bottom: 43,
  });
});
