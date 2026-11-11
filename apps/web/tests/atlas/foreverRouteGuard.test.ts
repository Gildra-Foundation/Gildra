import test from "node:test";
import assert from "node:assert/strict";
import { unknownForeverRoute } from "../../lib/forever/routeGuard.ts";

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
