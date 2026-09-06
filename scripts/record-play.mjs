import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { instrument, driver } from "../tests/play-driver.mjs";
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
const { read, route, drag, width, solveCurrent } = driver(page, base);
try {
  await page.goto(base);
  await page.waitForTimeout(2200);
  await page.screenshot({ path: resolve(dir, "flow-menu.png") });
  for (const [rule, predicate, factor] of [
    ["link", (p) => p.ammo[0] === 14 && p.gates[0] === 3, 3],
    ["gear", (p) => p.ammo[0] === 12 && p.ammo[1] === 20, 4],
    [
      "core",
      (p) => p.family === "contrast" && p.ammo[0] === 7 && p.ammo[1] === 9,
      0,
    ],
    ["core", (p) => p.family === "square" && p.ammo.every((n) => n === 9), 0],
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
  await video.saveAs(resolve(dir, "flow-play.webm"));
  console.log("Recorded real gestures: artifacts/flow-play.webm");
} finally {
  await browser.close();
}
