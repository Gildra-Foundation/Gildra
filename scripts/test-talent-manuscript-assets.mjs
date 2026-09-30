import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PNG } from "pngjs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url));
const themes = read("lib/talentSpecThemes.ts").toString();
const slugs = [...themes.matchAll(/slug:\s*"([a-z-]+)"/g)].map(match => match[1]);
assert.equal(slugs.length, 40, "Keep the artwork inventory in sync with the specialization catalogue");
const hashes = new Set();
const inventory = [];
for (const slug of slugs) {
  const path = `public/assets/wow/character-book/spec-emblems/${slug}-v1.png`;
  const bytes = read(path);
  const png = PNG.sync.read(bytes);
  const hash = createHash("sha256").update(bytes).digest("hex");
  assert.ok(!hashes.has(hash), `${slug} must have its own generated artwork`);
  hashes.add(hash);
  let transparent = 0;
  for (let index = 3; index < png.data.length; index += 4) if (png.data[index] === 0) transparent++;
  const fraction = transparent / (png.width * png.height);
  assert.ok(fraction > .15 && fraction < .97, `${slug}: must be a genuine transparent cutout with visible artwork (${fraction})`);
  assert.ok(png.width >= 512 && png.height >= 512);
  inventory.push({ slug, bytes: bytes.length, transparentPercent: Math.round(fraction * 100) });
}
const signature = read("components/talents/spec-signature/SpecSignatureFx.tsx").toString();
assert.ok(!signature.includes("signature.title") && !signature.includes("styles.plaque"), "No untranslated signature caption, visible or accessible");
assert.ok(signature.includes('aria-hidden="true"'), "Pure decoration must be hidden from assistive tech");
const simulator = read("components/wow/audit/CharacterTalentSimulator.tsx").toString();
assert.ok(simulator.includes('appearance="manuscript"'));
assert.ok(simulator.includes('lang={lang}'));
assert.ok(read("components/talents/SpecEmblem.tsx").toString().includes('from "next/image"'), "Optimize the active asset rather than loading the entire collection");
console.log(JSON.stringify({ status: "passed", distinctEmblems: hashes.size, inventory }, null, 2));
