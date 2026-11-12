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
it("lists the 13 classes and 40 specializations a player chooses from", async () => {
  const { isInternalRecord } = await import("../../lib/library/internalName.ts");
  const classes = Array.from({ length: 15 }, (_, index) => index + 1);
  assert.deepEqual(classes.filter((id) => !isInternalRecord("Class", "class", id)), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  // Every specialization id of the catalog (2026-11-12): the Initial ones, the Adventurer's and the pets' stay out.
  const specs = [62, 63, 64, 65, 66, 70, 71, 72, 73, 74, 79, 81, 102, 103, 104, 105, 250, 251, 252, 253, 254, 255, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270,
    535, 536, 537, 577, 581, 1444, 1446, 1447, 1448, 1449, 1450, 1451, 1452, 1453, 1454, 1455, 1456, 1465, 1467, 1468, 1473, 1478, 1480];
  assert.equal(specs.length, 60);
  const listed = specs.filter((id) => !isInternalRecord("Spec", "specialization", id));
  assert.equal(listed.length, 40);
  for (const id of [62, 73, 270, 577, 581, 1467, 1473, 1480]) assert.ok(listed.includes(id), String(id));
  // The id rule is per type: item 14 or spell 74 are ordinary records, and a record without an id is judged by its name alone.
  assert.ok(!isInternalRecord("Linen Cloth", "item", 14));
  assert.ok(!isInternalRecord("Ferocity", "spell", 74));
  assert.ok(!isInternalRecord("Warrior", "class"));
});
