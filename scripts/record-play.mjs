import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { instrument, driver, touchPeel } from "../tests/play-driver.mjs";
const dir = resolve(import.meta.dirname, "../artifacts");
await mkdir(dir, { recursive: true });
const browser = await chromium.launch(),
  context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    recordVideo: { dir, size: { width: 390, height: 844 } },
  });
await instrument(context);
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.stack));
const base = (process.env.CORE_BREAK_URL || "http://127.0.0.1:4173").replace(
  /\/$/,
  "",
);
const { read, route, settled, drag, width, solveCurrent } = driver(page, base);
try {
  await page.goto(base);
  await page.waitForTimeout(2200);
  await page.screenshot({ path: resolve(dir, "flow-menu.png") });
  await route("spark", (p) => p.ammo[0] === 4 && p.ammo[1] === 32);
  let small = (await read()).pieces.find((p) => p.n === 4);
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(dir, "peel-four.png") });
  await touchPeel(context, page, small, 32, 0, { fast: false });
  await settled();
  await page.waitForTimeout(500);
  await route("spark", (p) => p.ammo[0] === 4 && p.ammo[1] === 32);
  small = (await read()).pieces.find((p) => p.n === 4);
  const pair = await touchPeel(context, page, small, 32, 0);
  await settled();
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(dir, "peel-two.png") });
  const p = (await read()).pieces.find((p) =>
    p.ids.every((id) => pair.picked.includes(id)),
  );
  await touchPeel(context, page, p, 0, -32);
  await settled();
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(dir, "peel-one.png") });
  for (const [rule, predicate, factor] of [
    ["link", (p) => p.ammo[0] === 14 && p.gates[0] === 3, 3],
    ["gear", (p) => p.ammo[0] === 12 && p.ammo[1] === 20, 4],
  ]) {
    let s = await route(rule, predicate);
    await page.waitForTimeout(600);
    if (factor) {
      await width(s.pieces[0].id, factor - 1);
      await page.waitForTimeout(600);
      await width(s.pieces[0].id, factor);
    }
    await page.waitForTimeout(500);
    s = await read();
    await page.screenshot({
      path: resolve(dir, `flow-${rule}-${s.family}.png`),
    });
    if (rule === "link") {
      await drag(s.pieces[0], s.targets[0]);
      await page.waitForTimeout(600);
      await page.screenshot({ path: resolve(dir, "flow-quotient.png") });
    }
    await solveCurrent();
    await page.waitForTimeout(500);
  }
  if (errors.length) throw new Error(errors.join("\n"));
  const video = page.video();
  await context.close();
  await video.saveAs(resolve(dir, "peel-play.webm"));
  console.log("Recorded real gestures: artifacts/peel-play.webm");
} finally {
  await browser.close();
}
