import assert from "node:assert/strict";
import { generateProblem, PROBLEM_BANK } from "../src/stages.mjs";
export async function instrument(context) {
  await context.addInitScript(() => {
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
  const read = () =>
    page.evaluate(async () => (await import("./src/game.mjs")).inspect());
  async function settled() {
    await page.evaluate(async () => {
      window.__readFlow = (await import("./src/game.mjs")).inspect;
    });
    await page.waitForFunction(() => {
      const s = window.__readFlow();
      return !s.busy && s.width > 0 && s.status === "play";
    });
    return read();
  }
  async function route(rule, predicate = () => true, difficulty) {
    const example = PROBLEM_BANK[rule].find(
      (p) => predicate(p) && (!difficulty || p.difficulty === difficulty),
    );
    assert.ok(example, `fixture ${rule}`);
    const d = difficulty || example.difficulty;
    let seed = 0;
    while (seed < 100000 && !predicate(generateProblem(rule, d, `${seed}-0`)))
      seed++;
    assert.ok(seed < 100000, "seed found");
    await page.goto(`${base}/?fixtureSeed=${seed}&difficulty=${d}#${rule}`);
    return settled();
  }
  async function audit() {
    const s = await read(),
      ids = [...s.pieces.flatMap((p) => p.ids), ...s.loaded, ...s.spent];
    assert.equal(ids.length, s.total);
    assert.equal(new Set(ids).size, s.total);
    if (!s.busy)
      assert.equal(
        new Set(s.visibleIds).size,
        s.pieces.flatMap((p) => p.ids).length + s.loaded.length,
      );
    return s;
  }
  async function drag(from, to, n = from.n, wait = true) {
    const b = await page.locator("#world").boundingBox();
    await page.mouse.move(b.x + from.x, b.y + from.y);
    await page.mouse.down();
    if (n !== undefined)
      assert.equal((await read()).dragIds.length, n, `selected ${n}`);
    await page.mouse.move(b.x + to.x, b.y + to.y, { steps: 12 });
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
  async function solveCurrent() {
    let s = await read();
    const id = s.stage;
    for (let step = 0; step < 30; step++) {
      s = await settled();
      if (s.stage !== id) return s;
      if (s.rule === "spark") {
        if (s.pieces.length > 1) {
          await drag(s.pieces[1], s.pieces[0]);
          continue;
        }
        assert.equal(s.targets.length, 1, "browser join fixture");
        await drag(s.pieces[0], s.targets[0]);
      } else if (s.rule === "gear") {
        const f = Array.from(
          { length: s.pieces[0].n - 1 },
          (_, i) => i + 2,
        ).find((f) => s.pieces.every((p) => p.n % f === 0));
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
      } else if (s.family === "square") {
        const p = s.pieces[0],
          t = s.targets[0],
          w = p.width,
          h = p.n / w;
        let cell;
        for (let row = 0; row <= t.side - h && !cell; row++)
          for (let col = 0; col <= t.side - w; col++)
            if (
              p.ids.every(
                (_, i) =>
                  t.cells[
                    (row + Math.floor(i / w)) * t.side + col + (i % w)
                  ] === null,
              )
            ) {
              cell = { row, col };
              break;
            }
        assert.ok(cell);
        await drag(p, {
          x: t.x + (cell.col + (w - t.side) / 2) * t.pitch,
          y: t.y + (cell.row + (h - t.side) / 2) * t.pitch,
        });
      } else {
        const i = s.targets.findIndex((t) => t.active && !t.complete),
          t = s.targets[i],
          p = s.pieces.find((p) => p.n === t.n);
        if (t.kind === "rectangle") {
          const f = Array.from({ length: p.n - 2 }, (_, i) => i + 2).find(
            (f) => p.n % f === 0,
          );
          await width(p.id, f);
        } else await width(p.id, 0);
        s = await read();
        await drag(
          s.pieces.find((q) => q.id === p.id),
          s.targets[i],
        );
      }
    }
    throw new Error(`No automatic next problem: ${id}`);
  }
  return { read, settled, route, audit, drag, width, solveCurrent };
}
