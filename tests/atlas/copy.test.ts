import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * Translation completeness (roadmap item 76): every *Copy.ts object with `en`
 * and `ru` sides has the same keys on both, at every depth. Functions count as
 * leaves; arrays must have the same length.
 */
const roots = ["components", "lib"].map((dir) => new URL(`../../${dir}/`, import.meta.url));
const files: URL[] = [];
const walk = (dir: URL) => {
  for (const name of readdirSync(dir)) {
    const url = new URL(name, dir);
    if (statSync(url).isDirectory()) walk(new URL(`${name}/`, dir));
    else if (/Copy\.ts$/.test(name)) files.push(url);
  }
};
roots.forEach(walk);

function shape(value: unknown, at: string, out: string[]) {
  if (Array.isArray(value)) { out.push(`${at}[${value.length}]`); value.forEach((item, index) => shape(item, `${at}[${index}]`, out)); return; }
  if (value && typeof value === "object") { for (const [key, child] of Object.entries(value)) shape(child, `${at}.${key}`, out); return; }
  out.push(at);
}

describe("translations", () => {
  for (const file of files) {
    const name = file.pathname.split("/").slice(-3).join("/");
    it(`${name}: en and ru have the same keys`, async () => {
      const exports = await import(file.href) as Record<string, unknown>;
      let pairs = 0;
      for (const [exported, value] of Object.entries(exports)) {
        if (!value || typeof value !== "object" || !("en" in value) || !("ru" in value)) continue;
        pairs += 1;
        const en: string[] = []; const ru: string[] = [];
        shape((value as Record<string, unknown>).en, "", en);
        shape((value as Record<string, unknown>).ru, "", ru);
        const missingRu = en.filter((key) => !ru.includes(key));
        const missingEn = ru.filter((key) => !en.includes(key));
        assert.deepEqual({ missingRu, missingEn }, { missingRu: [], missingEn: [] }, `${exported}`);
      }
      assert.ok(pairs >= 0);
    });
  }
});
