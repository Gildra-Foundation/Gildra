import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { unknownLibraryDataset } from "../../lib/library/routeGuard.ts";

const slugs = async () => new Set(["items", "spells", "achievements", "quest-reward-packages"]);

describe("library: a dataset that does not exist is a 404", () => {
  it("knows the catalog's datasets in both languages, with records and filters", async () => {
    for (const path of ["/library/items", "/ru/library/spells", "/library/spells/000030d0-1e29-488a-88f9-f17b79c19bb1/ball-lightning", "/ru/library/achievements/x/y", "/library/quest-reward-packages"]) {
      assert.equal(await unknownLibraryDataset(path, null, slugs), false, path);
    }
    for (const path of ["/library/nosuch", "/ru/library/nosuch", "/library/nosuch/000030d0-1e29-488a-88f9-f17b79c19bb1/x", "/library/Items", "/library/a", "/library/%E0%A4%A"]) {
      assert.equal(await unknownLibraryDataset(path, null, slugs), true, path);
    }
  });

  it("leaves the landing, loose records, other sections and unknown editions to the pages", async () => {
    for (const path of ["/library", "/ru/library", "/library/records/1da0c168-d556-41b4-ac9a-442bfe25b6c0/fireball", "/wow/forever/library/item/35", "/search"]) {
      assert.equal(await unknownLibraryDataset(path, null, slugs), false, path);
    }
    assert.equal(await unknownLibraryDataset("/library/nosuch", "bogus_edition", slugs), false);
    assert.equal(await unknownLibraryDataset("/library/nosuch", "wow_classic", slugs), true);
  });

  it("does not call a dataset missing when the catalog cannot be asked", async () => {
    assert.equal(await unknownLibraryDataset("/library/nosuch", null, async () => null), false);
  });
});
