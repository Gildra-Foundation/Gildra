/**
 * Pixel comparison of two design capture runs (see capture-design.mjs).
 *
 * Usage:
 *   node scripts/compare-design.mjs <baselineDir> <currentDir> [--threshold 0] [--only home,home-ru]
 *
 * For every `<name>.png` present in both directories it counts differing
 * pixels (pixelmatch), writes `<currentDir>/<name>--diff.png` when they
 * differ, and checks the overflow JSON written by the capture script.
 * Exits 1 when any pair exceeds the threshold, sizes differ, a baseline
 * image is missing in the current run, or any overflow is non-zero.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith("--"));
const value = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : undefined;
};
const [baselineDir, currentDir] = positional;
if (!baselineDir || !currentDir) {
  console.error("usage: compare-design.mjs <baselineDir> <currentDir> [--threshold N] [--only a,b]");
  process.exit(2);
}
const THRESHOLD = Number(value("--threshold") ?? 0);
const ONLY = value("--only")?.split(",").map((s) => s.trim()).filter(Boolean);

const readPng = async (path) => PNG.sync.read(await readFile(path));

async function main() {
  const baseline = (await readdir(baselineDir)).filter(
    (f) => f.endsWith(".png") && !f.endsWith("--diff.png"),
  );
  const current = new Set(await readdir(currentDir));
  let failures = 0;
  const rows = [];

  for (const file of baseline.sort()) {
    const name = file.replace(/\.png$/, "");
    const routeName = name.split("--")[0];
    if (ONLY && !ONLY.includes(routeName)) continue;
    if (!current.has(file)) {
      failures++;
      rows.push([name, "MISSING", ""]);
      continue;
    }
    const a = await readPng(join(baselineDir, file));
    const b = await readPng(join(currentDir, file));
    if (a.width !== b.width || a.height !== b.height) {
      failures++;
      rows.push([name, "SIZE", `${a.width}x${a.height} vs ${b.width}x${b.height}`]);
      continue;
    }
    const diff = new PNG({ width: a.width, height: a.height });
    const count = pixelmatch(a.data, b.data, diff.data, a.width, a.height, {
      threshold: 0.1,
    });
    if (count > THRESHOLD) {
      failures++;
      await writeFile(join(currentDir, `${name}--diff.png`), PNG.sync.write(diff));
      rows.push([name, "DIFF", `${count}px`]);
    } else {
      rows.push([name, "ok", `${count}px`]);
    }
  }

  for (const file of [...current].filter((f) => f.endsWith(".json")).sort()) {
    const routeName = file.split("--")[0];
    if (ONLY && !ONLY.includes(routeName)) continue;
    const { overflow } = JSON.parse(await readFile(join(currentDir, file), "utf8"));
    if (overflow) {
      failures++;
      rows.push([file.replace(/\.json$/, ""), "OVERFLOW", `${overflow}px`]);
    }
  }

  for (const [name, status, detail] of rows) {
    console.log(`${status.padEnd(9)} ${name} ${detail}`);
  }
  if (failures > 0) {
    console.error(`${failures} comparison(s) failed`);
    process.exit(1);
  }
  console.log("all captures identical, no overflow");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
