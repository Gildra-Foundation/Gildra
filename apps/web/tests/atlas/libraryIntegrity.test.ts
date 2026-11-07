import assert from "node:assert/strict";
import { it } from "node:test";
import { LIBRARY_INTERNAL_NAME } from "../../lib/library/internalName.ts";
import { libraryProduct, libraryProductPath, emptyProductDataset } from "../../lib/library/product.ts";
it("hides internal markers and preserves Temple and contest", () => {
 for (const name of ["Conversation (DNT)", "<DNT> Eons Fringe", "[PH] Reward", "11.0 Warband Testing 2"]) assert.ok(LIBRARY_INTERNAL_NAME.test(name), name);
 for (const name of ["Temple of Elune", "Fishing contest", "Contest Winner", "Tempest"]) assert.ok(!LIBRARY_INTERNAL_NAME.test(name), name);
});
it("preserves product identity and only noindexes known empty datasets", () => {
 assert.equal(libraryProduct("bogus"), undefined);assert.equal(libraryProduct(), "wow");
 assert.equal(libraryProductPath("/library/quests", "wow_classic"), "/library/quests?product=wow_classic");
 assert.ok(emptyProductDataset({entityCount:0}));assert.ok(!emptyProductDataset({entityCount:12}));assert.ok(!emptyProductDataset({}));
});
