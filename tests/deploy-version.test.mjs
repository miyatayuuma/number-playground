import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

test("Pages version authority versions the entry and every local ES module edge", async () => {
  execFileSync(process.execPath, ["scripts/prepare-pages.mjs"], { cwd: root });
  const version = JSON.parse(await readFile(join(root, "dist/version.json"), "utf8")).version;
  const html = await readFile(join(root, "dist/index.html"), "utf8");
  assert.ok(html.includes(`src="src/bootstrap.mjs?v=${version}"`));

  async function checkModules(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await checkModules(path);
      } else if (path.endsWith(".mjs")) {
        const source = await readFile(path, "utf8");
        const edges = [...source.matchAll(/(?:\bfrom\s*|\bimport\s*)["'](\.\.?\/[^"']+\.mjs)(\?[^"']*)?["']/g)];
        for (const [, , query] of edges) assert.equal(query, `?v=${version}`, `${path} import version`);
      }
    }
  }
  await checkModules(join(root, "dist/src"));
});
