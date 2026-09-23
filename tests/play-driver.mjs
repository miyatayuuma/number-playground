import assert from "node:assert/strict";
import { generateProblem, PROBLEM_BANK } from "../src/stages.mjs";
export async function instrument(context) {
  await context.addInitScript(() => {
    window.__canvasTrace = {
      enabled: false,
      labels: [],
      arcs: [],
      roundRects: [],
      rects: [],
      curves: 0,
    };
    const fillText = CanvasRenderingContext2D.prototype.fillText,
      bezierCurveTo = CanvasRenderingContext2D.prototype.bezierCurveTo,
      arc = CanvasRenderingContext2D.prototype.arc,
      roundRect = CanvasRenderingContext2D.prototype.roundRect;
    const strokeRect = CanvasRenderingContext2D.prototype.strokeRect;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...rest) {
      if (this.canvas?.id === "world" && window.__canvasTrace.enabled)
        window.__canvasTrace.labels.push({
          text: String(text),
          x,
          y,
          alpha: this.globalAlpha,
        });
      return fillText.call(this, text, x, y, ...rest);
    };
    CanvasRenderingContext2D.prototype.bezierCurveTo = function (...args) {
      if (this.canvas?.id === "world" && window.__canvasTrace.enabled)
        window.__canvasTrace.curves++;
      return bezierCurveTo.apply(this, args);
    };
    CanvasRenderingContext2D.prototype.arc = function (x, y, radius, ...rest) {
      if (this.canvas?.id === "world" && window.__canvasTrace.enabled)
        window.__canvasTrace.arcs.push({ x, y, radius });
      return arc.call(this, x, y, radius, ...rest);
    };
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, width, height, ...rest) {
      if (this.canvas?.id === "world" && window.__canvasTrace.enabled)
        window.__canvasTrace.roundRects.push({ x, y, width, height });
      return roundRect.call(this, x, y, width, height, ...rest);
    };
    CanvasRenderingContext2D.prototype.strokeRect = function (x, y, width, height) {
      if (this.canvas?.id === "world" && window.__canvasTrace.enabled)
        window.__canvasTrace.rects.push({ x, y, width, height });
      return strokeRect.call(this, x, y, width, height);
    };
    const q = new URLSearchParams(location.search);
    if (q.has("fixtureSeed")) {
      Date.now = () => Number(q.get("fixtureSeed"));
      const rule = location.hash.slice(1),
        data = JSON.parse(localStorage.getItem("core-break-flow-v3") || "{}");
      data.progress ||= {};
      data.progress[rule] = {
        difficulty: Number(q.get("difficulty")),
        wins: 0,
        retries: 0,
        recent: [],
      };
      localStorage.setItem("core-break-flow-v3", JSON.stringify(data));
    }
  });
}
export function driver(page, base) {
  let navigation = 0;
  const read = () =>
    page.evaluate(async () => (await import("./src/game.mjs")).inspect());
  async function settled() {
    await page.evaluate(async () => {
      window.__readFlow = (await import("./src/game.mjs")).inspect;
    });
    await page.waitForFunction(
      () => {
        const s = window.__readFlow();
        return (
          !s.busy &&
          !s.moving &&
          s.width > 0 &&
          (s.status === "play" || (s.rule === "pack" && s.status === "won"))
        );
      },
      null,
      { polling: 100, timeout: 60000 },
    );
    return read();
  }
  async function route(rule, predicate = () => true, difficulty) {
    const example = rule === "pack"
      ? generateProblem("pack", difficulty || 1, "fixture-pack")
      : PROBLEM_BANK[rule].find(
          (p) => predicate(p) && (!difficulty || p.difficulty === difficulty),
        );
    assert.ok(example, `fixture ${rule}`);
    const d = difficulty || example.difficulty;
    let seed = 0;
    while (seed < 100000 && !predicate(generateProblem(rule, d, `${seed}-0`)))
      seed++;
    assert.ok(seed < 100000, "seed found");
    await page.goto(
      `${base}/?fixtureSeed=${seed}&difficulty=${d}&navigation=${++navigation}#${rule}`,
    );
    return settled();
  }
  async function audit() {
    const s = await read(),
      ids = s.rule === "pack"
        ? [...s.pack.rawIds]
        : [...s.pieces.flatMap((p) => p.ids), ...s.spent];
    assert.equal(ids.length, s.total);
    assert.equal(new Set(ids).size, s.total);
    if (!s.busy)
      assert.equal(
        new Set(s.visibleIds).size,
        s.rule === "pack"
          ? s.total
          : s.pieces.flatMap((p) => p.ids).length,
      );
    if (s.rule === "pack" && !s.busy)
      assert.deepEqual(
        [...s.visibleIds].sort((a, b) => a - b),
        [...s.pack.rawIds].sort((a, b) => a - b),
      );
    return s;
  }
  async function drag(from, to, n = from.n, wait = true, steps = 12) {
    const b = await page.locator("#world").boundingBox(),
      s = await read(),
      start = from.grip || from,
      anchor =
        s.rule === "gear"
          ? {
              x: s.pieces.reduce((sum, p) => sum + p.x, 0) / s.pieces.length,
              y: s.pieces.reduce((sum, p) => sum + p.y, 0) / s.pieces.length,
            }
          : { x: from.x, y: from.y },
      end = {
        x: to.x + start.x - anchor.x,
        y: to.y + start.y - anchor.y,
      };
    await page.mouse.move(b.x + start.x, b.y + start.y);
    await page.mouse.down();
    if (n !== undefined)
      assert.equal((await read()).dragIds.length, n, `selected ${n}`);
    await page.mouse.move(b.x + end.x, b.y + end.y, { steps });
    await page.mouse.up();
    if (wait) {
      await settled();
      return audit();
    }
  }
  async function width(pieceId, value) {
    // Each stroke is short enough to stay on even a 320px touch screen.
    for (let tries = 0; tries < 30; tries++) {
      const s = await read(),
        p = s.pieces.find((p) => p.id === pieceId);
      if (p.width === value) return;
      const h = p.handle || s.pieces.find((p) => p.handle)?.handle;
      assert.ok(h);
      const delta =
          Math.sign(value - p.width) * Math.min(4, Math.abs(value - p.width)),
        b = await page.locator("#world").boundingBox();
      await page.mouse.move(b.x + h.x, b.y + h.y);
      await page.mouse.down();
      await page.mouse.move(b.x + h.x + delta * 12, b.y + h.y, { steps: 8 });
      await page.mouse.up();
      await settled();
    }
    throw new Error("width did not change");
  }
  async function packBase(base = null) {
    const s = await read(),
      control = s.pack?.control;
    assert.ok(control, "PACK radix control");
    const options = s.pack.allowedRadices,
      targetBase = base ?? options.find((candidate) => candidate !== s.pack.base) ?? s.pack.base,
      index = options.indexOf(targetBase),
      targetX =
        control.x1 +
        ((control.x2 - control.x1) * Math.max(0, index)) /
          Math.max(1, options.length - 1);
    const b = await page.locator("#world").boundingBox();
    await page.mouse.move(b.x + control.x, b.y + control.y);
    await page.mouse.down();
    await page.mouse.move(b.x + targetX, b.y + control.y, { steps: 10 });
    await page.mouse.up();
    await settled();
    return audit();
  }
  async function solveCurrent() {
    let s = await read();
    const id = s.stage;
    for (let step = 0; step < 30; step++) {
      s = await settled();
      if (s.stage !== id || s.status === "won") return s;
      if (s.rule === "spark") {
        if (s.pieces.length > 1) {
          await drag(s.pieces[1], s.pieces[0]);
          continue;
        }
        assert.equal(s.targets.length, 1, "browser join fixture");
        await drag(s.pieces[0], s.targets[0]);
      } else if (s.rule === "gear") {
        const max = Math.min(...s.pieces.map((p) => p.n)),
          f = Array.from({ length: max - 1 }, (_, i) => max - i).find(
            (factor) => factor >= 2 && s.pieces.every((p) => p.n % factor === 0),
          );
        assert.ok(f, "gear gcd");
        await width(s.pieces[0].id, f);
        s = await read();
        await drag(s.pieces[0], s.targets[0]);
      } else if (s.rule === "link") {
        const i = s.targets.findIndex((t) => t.active && !t.complete),
          t = s.targets[i];
        const p = s.pieces.find(
          (p) => p.n === (t.kind === "divide" ? t.input : t.n),
        );
        assert.ok(p);
        if (t.kind === "divide") await width(p.id, t.width);
        s = await read();
        await drag(
          s.pieces.find((q) => q.id === p.id),
          s.targets[i],
        );
      } else if (s.rule === "pack") {
        if (s.pack.complete) return s;
        const problem = PROBLEM_BANK.pack.find((candidate) => candidate.id === s.stage);
        assert.ok(problem, "generated PACK candidate is in the programmatic pool");
        if (s.pack.base !== problem.targetRadix) {
          await packBase(problem.targetRadix);
          s = await read();
        }
        const source = s.pack.numberMass,
          place = s.pack.slots.find((slot) => slot.level === 0);
        assert.ok(source.quantity && place, "PACK source and L0");
        await drag(source, place, source.quantity);
      }
    }
    throw new Error(`No automatic next problem: ${id}`);
  }
  return { read, settled, route, audit, drag, width, packBase, solveCurrent };
}
// Native Chromium touch input. A deliberate peel holds for 600ms before moving.
export async function touchPeel(
  context,
  page,
  from,
  dx,
  dy,
  { fast = true, cancel = false, hold = fast ? 0.6 : 0 } = {},
) {
  const cdp = await context.newCDPSession(page),
    box = await page.locator("#world").boundingBox(),
    steps = fast ? 2 : 8;
  const read = () =>
    page.evaluate(async () => (await import("./src/game.mjs")).inspect());
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: box.x + from.x, y: box.y + from.y }],
  });
  const initial = (await read()).dragIds;
  if (hold) await page.waitForTimeout(hold * 1000);
  for (let i = 1; i <= steps; i++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: box.x + from.x + (dx * i) / steps,
          y: box.y + from.y + (dy * i) / steps,
        },
      ],
    });
  let picked = (await read()).dragIds;
  await cdp.send("Input.dispatchTouchEvent", {
    type: cancel ? "touchCancel" : "touchEnd",
    touchPoints: [],
  });
  await page.waitForTimeout(20);
  if (!cancel && Array.isArray(from.ids) && from.ids.length > 1) {
    const after = await read(),
      peeled = after.pieces.find(
        (p) =>
          p.id !== from.id &&
          p.ids.length < from.ids.length &&
          p.ids.every((id) => from.ids.includes(id)),
      );
    if (peeled) picked = [...peeled.ids];
  }
  await cdp.detach();
  return { initial, picked };
}
