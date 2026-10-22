import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const site = path.resolve(root, "../apps/web/app/styles/atlas-theme.css");

/** Site rem (1rem = 16px there) as px: the admin's root font size is Payload's 13px. */
const px = (value: string) => value.replace(/(\d*\.?\d+)rem/g, (_, n: string) => `${Number(n) * 16}px`);

/** `--atlas-*` values of the first (default) rule of a stylesheet, whitespace-normalised, rem in px. */
function tokens(file: string): Map<string, string> {
  const css = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const body = css.slice(css.indexOf("{") + 1, css.indexOf("\n}"));
  const found = new Map<string, string>();
  for (const [, name, value] of body.matchAll(/(--atlas-[\w-]+):\s*([^;]+);/g)) found.set(name, px(value.replace(/\s+/g, " ").trim()));
  return found;
}

// The CMS image is built from cms/ alone; the parity check runs where the whole repository is checked out.
describe.skipIf(!fs.existsSync(site))("admin atlas tokens", () => {
  it("copies every value from the site's atlas theme unchanged", () => {
    const cms = tokens(path.resolve(root, "src/app/(payload)/atlas-tokens.css"));
    const reference = tokens(site);
    expect(cms.size).toBeGreaterThan(40);
    for (const [name, value] of cms) expect({ name, value }).toEqual({ name, value: reference.get(name) });
  });
});
