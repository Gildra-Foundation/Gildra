/**
 * Import a RiftDen MDX bundle as draft articles (see scripts/lib/import-bundle.ts).
 *
 *   npm run import:articles -- --bundle <file.json> --as <staff email> [--site riftden] [--apply]
 *
 * Without --apply nothing is written: the report lists what would be created
 * and what is skipped (already present, or rejected by the converter).
 */
import fs from "node:fs";

import { getPayload } from "payload";

import config from "../src/payload.config";
import { importBundle, validateBundle } from "./lib/import-bundle";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const bundlePath = arg("--bundle");
const staffEmail = arg("--as");
if (!bundlePath || !staffEmail) {
  console.error("Usage: npm run import:articles -- --bundle <file.json> --as <staff email> [--site riftden] [--apply]");
  process.exit(2);
}
const apply = process.argv.includes("--apply");
const payload = await getPayload({ config });
try {
  const bundle = validateBundle(JSON.parse(fs.readFileSync(bundlePath, "utf8")));
  const outcomes = await importBundle(payload, bundle, { site: arg("--site") ?? bundle.site, staffEmail, apply });
  for (const o of outcomes) console.log(`${o.action.padEnd(13)} ${o.slug}${o.detail ? ` — ${o.detail}` : ""}`);
  console.log(apply ? "Applied: new articles are drafts; review and publish them in the CMS." : "Dry run: nothing was written. Re-run with --apply to create the drafts.");
  process.exit(0);
} catch (error) {
  console.error(`Import failed: ${(error as Error).message}`);
  process.exit(1);
}
