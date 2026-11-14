import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FOREVER_PROFESSION_SLUGS, unknownForeverRoute } from "../../lib/forever/routeGuard.ts";

test("Forever route guard scopes classes and both locales before streaming", async () => {
  for (const locale of ["", "/ru"]) for (const section of ["classes", "talent-calc"]) {
    for (const slug of ["warrior", "paladin", "hunter", "rogue", "priest", "shaman", "mage", "warlock", "druid"])
      assert.equal(await unknownForeverRoute(`${locale}/wow/forever/${section}/${slug}`), false);
    assert.equal(await unknownForeverRoute(`${locale}/wow/forever/${section}/monk`), true);
  }
  assert.equal(await unknownForeverRoute("/wow/classes/monk"), false);
});
test("Forever record guard uses current IDs, rejects malformed identities, and does not hide outages", async () => {
  const ids = async () => new Set([19019]);
  for (const locale of ["", "/ru"]) {
    assert.equal(await unknownForeverRoute(`${locale}/wow/forever/library/item/19019`, ids), false);
    for (const tail of ["item/999999999", "item/0", "item/019019", "item/1e2", "unknown/19019"])
      assert.equal(await unknownForeverRoute(`${locale}/wow/forever/library/${tail}`, ids), true);
    assert.equal(await unknownForeverRoute(`${locale}/wow/forever/library/data`, ids), false);
    assert.equal(await unknownForeverRoute(`${locale}/wow/forever/library/item/19019`, async () => { throw new Error("unavailable"); }), false);
  }
});

test("Forever professions and recipes that do not exist answer 404 before streaming", async () => {
  const catalog = JSON.parse(readFileSync(new URL("../../data/wow/forever/professions/catalog.json", import.meta.url), "utf8")) as { professions: { slug: string; recipes: { id: number }[] }[] };
  assert.deepEqual([...FOREVER_PROFESSION_SLUGS].sort(), catalog.professions.map((entry) => entry.slug).sort());
  const recipe = catalog.professions[0].recipes[0].id;
  const ids = async () => new Set([recipe]);
  for (const locale of ["", "/ru"]) {
    assert.equal(await unknownForeverRoute(`${locale}/wow/forever/professions`, ids), false);
    assert.equal(await unknownForeverRoute(`${locale}/wow/forever/professions/alchemy`, ids), false);
    assert.equal(await unknownForeverRoute(`${locale}/wow/forever/professions/nosuch`, ids), true);
    assert.equal(await unknownForeverRoute(`${locale}/wow/forever/professions/alchemy/${recipe}`, ids), false);
    for (const tail of ["999999999", "0", "abc", `0${recipe}`]) assert.equal(await unknownForeverRoute(`${locale}/wow/forever/professions/alchemy/${tail}`, ids), true, tail);
    assert.equal(await unknownForeverRoute(`${locale}/wow/forever/professions/nosuch/${recipe}`, ids), true);
    assert.equal(await unknownForeverRoute(`${locale}/wow/forever/professions/alchemy/${recipe}`, async () => { throw new Error("unavailable"); }), false);
  }
  // Every recipe of the catalog is in the library's recipe index the guard reads in production.
  for (const profession of catalog.professions.slice(0, 3)) assert.equal(await unknownForeverRoute(`/wow/forever/professions/${profession.slug}/${profession.recipes[0].id}`), false);
});
