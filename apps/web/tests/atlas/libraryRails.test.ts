import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { libraryRails, offersTypeFacets } from "../../components/library/libraryRails.ts";

const category = (patch: Record<string, unknown>) => ({ id: 1, type: "item", facet: "item_subclass", name: "Red", slug: "red", path: "item-types/gem/red", parentPath: "item-types/gem", description: "", count: 10, sortOrder: 1, ...patch }) as never;

describe("library: dataset filters", () => {
  it("offers the filters of the whole record type only where the dataset is the whole type", () => {
    assert.equal(offersTypeFacets({ slug: "items", entityType: "item" }), true);
    assert.equal(offersTypeFacets({ slug: "spells", entityType: "spell" }), true);
    for (const slug of ["gems", "consumables", "trade-goods", "reagents", "item-enhancements", "artifact-relics", "armor", "weapons"]) {
      assert.equal(offersTypeFacets({ slug, entityType: "item" }), false, `${slug} has no slot or armor type of its own`);
    }
  });

  it("leaves the client's obsolete categories out of a rail", () => {
    const rails = libraryRails("consumables", [
      category({ id: 1, name: "Potion", path: "item-types/consumable/potion", parentPath: "item-types/consumable", count: 900 }),
      category({ id: 2, name: "Elixir", path: "item-types/consumable/elixir", parentPath: "item-types/consumable", count: 400 }),
      category({ id: 3, name: "Cheese/Bread(OBSOLETE)", path: "item-types/consumable/cheese", parentPath: "item-types/consumable", count: 592 }),
    ], "en");
    assert.deepEqual(rails.map((rail) => rail.categories.map((entry) => entry.name)), [["Potion", "Elixir"]]);
  });
});
