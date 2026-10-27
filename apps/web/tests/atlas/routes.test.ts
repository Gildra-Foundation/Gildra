import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, it } from "node:test";

import { routeSections, trail, type RouteSection } from "../../lib/routes/registry.ts";
import { atlasScenes } from "../../lib/atlas/scenes.ts";
import { sectionMetadata } from "../../lib/routes/metadata.ts";

const sections = routeSections as Record<string, RouteSection>;

describe("route registry", () => {
  for (const [id, section] of Object.entries(sections)) {
    it(`${id}: page exists in both languages, parent and scene are known`, () => {
      const dir = section.path === "/" ? "" : section.path;
      // A single-language section keeps only its own tree (the other URL redirects in next.config.ts).
      if (section.only !== "ru") assert.ok(existsSync(new URL(`../../app/(site)${dir}/page.tsx`, import.meta.url)), `app/(site)${dir}/page.tsx`);
      if (section.only !== "en") assert.ok(existsSync(new URL(`../../app/ru${dir}/page.tsx`, import.meta.url)), `app/ru${dir}/page.tsx`);
      if (section.parent) assert.ok(section.parent in sections, `parent ${section.parent}`);
      if (section.scene) assert.ok(section.scene in atlasScenes, `scene ${section.scene}`);
    });
  }
  it("derives canonical and hreflang of a section page from its path", () => {
    const meta = sectionMetadata("lairs", "ru");
    assert.equal(meta.title, "Логова и мировые боссы Midnight Сезон 2 — Gildra");
    assert.deepEqual(meta.alternates, { canonical: "/ru/wow/lairs", languages: { en: "/wow/lairs", ru: "/ru/wow/lairs", "x-default": "/wow/lairs" } });
    assert.deepEqual(meta.robots, { index: false, follow: true });
    assert.equal(sectionMetadata("database", "en").robots, undefined);
  });
  it("builds breadcrumbs through the parents", () => {
    assert.deepEqual(trail("ru", "lairs"), [{ label: "World of Warcraft", href: "/ru/wow" }, { label: "Логова и мировые боссы" }]);
    assert.deepEqual(trail("en", "raids", { label: "The Voidspire" }), [{ label: "World of Warcraft", href: "/wow" }, { label: "Raids", href: "/wow/raids" }, { label: "The Voidspire" }]);
  });
});
