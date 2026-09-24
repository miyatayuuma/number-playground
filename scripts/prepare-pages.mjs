import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = join(root, "dist");
const versionData = JSON.parse(await readFile(join(root, "version.json"), "utf8"));
const version = versionData.version;
if (typeof version !== "string" || !/^\d+(?:\.\d+)*$/.test(version)) {
  throw new Error("version.json must contain a numeric dotted version");
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const excluded = new Set([".git", "node_modules", "dist", "artifacts", ".github"]);
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (!excluded.has(entry.name)) {
    await cp(join(root, entry.name), join(output, entry.name), { recursive: true });
  }
}

const htmlPath = join(output, "index.html");
let html = await readFile(htmlPath, "utf8");
html = html.replace(
  /(<script\s+type="module"\s+src="src\/bootstrap\.mjs)(?:\?v=[^"]*)?("\s*><\/script>)/,
  `$1?v=${version}$2`,
);
if (!html.includes(`src="src/bootstrap.mjs?v=${version}"`)) {
  throw new Error("index.html bootstrap marker was not found");
}
await writeFile(htmlPath, html);

async function versionModuleImports(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await versionModuleImports(path);
    } else if (extname(path) === ".mjs") {
      const source = await readFile(path, "utf8");
      const versioned = source.replace(
        /((?:\bfrom\s*|\bimport\s*)["'])(\.\.?\/[^"']+\.mjs)(?:\?[^"']*)?(["'])/g,
        `$1$2?v=${version}$3`,
      );
      await writeFile(path, versioned);
    }
  }
}
await versionModuleImports(join(output, "src"));

console.log(`Prepared Pages site at dist/ for version ${version}`);
