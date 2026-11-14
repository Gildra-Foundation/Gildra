import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { foreverDungeonMetadata } from "../../lib/seo/foreverDungeonMetadata.ts";
import { newDungeons, returningDungeonDetails } from "../../components/wow/forever/instanceData.ts";

it("every published Forever dungeon describes its own guide in EN/RU metadata", () => {
  for (const lang of ["en", "ru"] as const) {
    const descriptions = new Set<string>();
    for (const { slug, min, max } of [...newDungeons, ...returningDungeonDetails]) {
      const meta = foreverDungeonMetadata(lang, slug);
      const description = String(meta.description);
      assert.ok(description.includes(`${min}–${max}`));
      assert.ok(description.length >= 60 && description.length <= 170, description);
      assert.ok(!descriptions.has(description), `${lang} ${slug}: duplicate description`);
      descriptions.add(description);
      const path = `${lang === "ru" ? "/ru" : ""}/wow/forever/dungeons/${slug}`;
      assert.equal(meta.alternates?.canonical, path);
      assert.equal(meta.openGraph?.url, path);
      assert.equal(meta.openGraph?.description, description);
      const page = readFileSync(new URL(`../../app/${lang === "ru" ? "ru" : "(site)"}/wow/forever/dungeons/${slug}/page.tsx`, import.meta.url), "utf8");
      assert.ok(page.includes(`foreverDungeonMetadata(lang, "${slug}")`), path);
    }
    assert.equal(descriptions.size, 28);
  }
  assert.deepEqual(foreverDungeonMetadata("en", "missing-dungeon"), {});
});
