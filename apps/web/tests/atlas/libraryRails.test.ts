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

  it("filters achievements by the game's categories, largest first", () => {
    const rails = libraryRails("achievements", [
      category({ id: 1, type: "achievement", facet: "group", name: "Achievement categories", path: "categorys", parentPath: undefined, count: 13877 }),
      category({ id: 2, type: "achievement", facet: "category", name: "Deaths", path: "categorys/category-122", parentPath: "categorys", count: 20 }),
      category({ id: 3, type: "achievement", facet: "category", name: "Dungeons", path: "categorys/category-14807", parentPath: "categorys", count: 271 }),
      category({ id: 4, type: "achievement", facet: "category", name: "Empty", path: "categorys/category-1", parentPath: "categorys", count: 0 }),
    ], "ru");
    assert.deepEqual(rails.map((rail) => [rail.id, rail.label, rail.categories.map((entry) => entry.path)]), [["category", "Категория", ["categorys/category-14807", "categorys/category-122"]]]);
    // Other record types keep their placeholder categories ("Category 142") to themselves.
    assert.deepEqual(libraryRails("currencies", [category({ type: "currency", facet: "category", name: "Category 142", path: "categorys/category-142", parentPath: "categorys" }), category({ id: 2, type: "currency", facet: "category", name: "Category 143", path: "categorys/category-143", parentPath: "categorys" })], "en"), []);
  });
});
