import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const dir = resolve(import.meta.dirname, "../artifacts");
await mkdir(dir, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  recordVideo: { dir, size: { width: 390, height: 844 } },
});
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = process.env.CORE_BREAK_URL || "http://127.0.0.1:4173/";
const read = () =>
  page.evaluate(async () => (await import("./src/game.mjs")).inspect());
async function drag(piece, point, n = piece.n) {
  const start = n === piece.n ? piece : piece.parts.find((p) => p.n === n);
  if (!start) throw new Error("Missing part");
  const b = await page.locator("#world").boundingBox();
  await page.mouse.move(b.x + start.x, b.y + start.y);
  await page.mouse.down();
  await page.waitForTimeout(160);
  await page.mouse.move(b.x + point.x, b.y + point.y, { steps: 28 });
  await page.waitForTimeout(100);
  await page.mouse.up();
}
try {
  await page.goto(new URL("#spark/1", base).href);
  await page.waitForTimeout(1000);
  let s = await read();
  await drag(
    s.pieces.find((p) => p.n === 1),
    s.pieces.find((p) => p.n === 7),
  );
  await page.waitForTimeout(700);
  await page.screenshot({ path: resolve(dir, "01-merge.png") });
  s = await read();
  await drag(s.pieces[0], s.targets[0]);
  await page.locator(".victory").waitFor();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "次へ", exact: true }).click();
  await page.waitForTimeout(700);
  s = await read();
  await drag(s.pieces[0], { x: s.width * 0.74, y: s.height * 0.78 }, 4);
  await page.waitForTimeout(650);
  await page.screenshot({ path: resolve(dir, "02-split.png") });
  s = await read();
  await drag(
    s.pieces.find((p) => p.n === 4),
    s.targets[0],
  );
  await page.waitForTimeout(700);
  s = await read();
  await drag(
    s.pieces.find((p) => p.n === 8),
    s.targets[1],
  );
  await page.locator(".victory").waitFor();
  await page.waitForTimeout(400);
  await page.locator('.panel [data-menu="areas"]').click();
  await page.locator('[data-stage="5"]').click();
  await page.waitForTimeout(700);
  s = await read();
  await drag(s.pieces[0], s.gate);
  await page.waitForTimeout(340);
  await page.screenshot({ path: resolve(dir, "03-divide.png") });
  await page.waitForFunction(
    async () => !(await import("./src/game.mjs")).inspect().busy,
  );
  await page.waitForTimeout(700);
  await page.screenshot({ path: resolve(dir, "04-quotient.png") });
  s = await read();
  await drag(s.pieces[0], s.targets[1]);
  await page.locator(".victory").waitFor();
  await page.waitForTimeout(600);
  if (errors.length) throw new Error(errors.join("\n"));
  const video = page.video();
  await context.close();
  await video.saveAs(resolve(dir, "tactile-play.webm"));
  console.log(
    "Recorded merge, split and quotient attacks: artifacts/tactile-play.webm",
  );
} finally {
  await browser.close();
}
