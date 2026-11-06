import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  castTimeLabel, libraryColumns, libraryListSearch, libraryRecordView, libraryRecordViews, matchLibraryDatasets, parseLibraryListQuery, rankLibrarySuggestions,
  type LibraryRecordView, type LibrarySummary,
} from "../../components/library/libraryRecordView.ts";
import { relationTitle, relationshipAttributes } from "../../components/database/entityDetailCopy.ts";

const id = "00004a86-3321-43ac-983d-9d73d79d11ae";
const summary = (patch: Partial<LibrarySummary> = {}): LibrarySummary => ({
  id, type: "item", externalId: 100, slug: "grievous-legguards", name: "Grievous Gladiator's Wyrmhide Legguards", product: "wow",
  iconUrl: "https://api.gildra.net/v1/media/x", quality: 4, itemLevel: 40,
  highlights: [{ key: "required_level", value: "Requires Level 35" }, { key: "inventory_type", value: "Legs" }], ...patch,
});
const view = (patch: Partial<LibraryRecordView>): LibraryRecordView => ({ id: patch.name ?? "x", externalId: 1, type: "item", href: "/", name: "x", typeLabel: "Item", ...patch });

describe("library: record rows", () => {
  it("links a record to its own address, never the old four-segment one that redirects", () => {
    const row = libraryRecordView(summary(), "en");
    assert.equal(row.href, `/library/items/${id}/grievous-legguards`);
    assert.equal(libraryRecordView(summary({ type: "spell", slug: "" , externalId: 7 }), "ru").href, `/ru/library/spells/${id}/7`);
    assert.equal(libraryRecordView(summary({ product: "wow_classic" }), "en").href, `/library/items/${id}/grievous-legguards?product=wow_classic`);
  });

  it("reads the facts a table shows from the highlights", () => {
    const row = libraryRecordView(summary(), "en");
    assert.deepEqual([row.itemLevel, row.slot, row.requiredLevel, row.quality, row.typeLabel], [40, "Legs", 35, 4, "Item"]);
    const spell = libraryRecordView(summary({ type: "spell", quality: undefined, itemLevel: undefined, highlights: [{ key: "school", value: "physical+fire" }, { key: "cast_time", value: "Instant" }] }), "ru");
    assert.equal(spell.castTime, "Мгновенно");
    assert.equal(castTimeLabel("1500 ms", "en"), "1.5 sec", "the column heading says Cast: the cell does not repeat it");
    assert.equal(castTimeLabel("1500 ms", "ru"), "1,5 сек.");
    assert.match(spell.school ?? "", /\+/);
    assert.equal(spell.itemLevel, undefined);
  });

  it("keeps placeholders and internal records out of lists", () => {
    const rows = libraryRecordViews([summary(), summary({ id: "2", name: "zzOld Sword" }), summary({ id: "3", name: "Test [PH]" }), summary({ id: "4", name: "Ping DNT" })], "en");
    assert.deepEqual(rows.map((row) => row.id), [id]);
    assert.equal(libraryRecordView(summary({ description: "Deals $s1 damage." }), "en").description, undefined, "unresolved game templates never reach the page");
  });

  it("an English-only record keeps its English name on the Russian page", () => {
    assert.equal(libraryRecordView(summary({ name: "Grievous Legguards", localeFallback: true }), "ru").name, "Grievous Legguards");
  });

  it("shows only the columns the records really fill", () => {
    assert.deepEqual(libraryColumns("item"), ["itemLevel", "slot", "requiredLevel"]);
    assert.deepEqual(libraryColumns("creature"), []);
    const rows = [view({ itemLevel: 1, requiredLevel: 1 }), view({ itemLevel: 2 }), view({ itemLevel: 3, slot: "Legs", requiredLevel: 5 }), view({ itemLevel: 4, requiredLevel: 2 })];
    assert.deepEqual(libraryColumns("item", rows), ["itemLevel", "requiredLevel"], "a slot on one record in four is a column of dashes");
  });
});

describe("library: search suggestions", () => {
  it("folds same-named records of one type and puts the closest names and wanted kinds first", () => {
    const ranked = rankLibrarySuggestions([
      view({ name: "Invincible", type: "spell", id: "s1" }), view({ name: "Invincible", type: "spell", id: "s2" }),
      view({ name: "Invincible's Reins", type: "item", id: "i1", iconUrl: "x" }), view({ name: "Invincible", type: "mount", id: "m1", iconUrl: "x" }),
      view({ name: "Invincible", type: "creature", id: "c1" }),
    ], "invincible");
    assert.deepEqual(ranked.map((entry) => entry.id), ["m1", "c1", "s1", "i1"]);
  });

  it("leaves out records found only by their text when names match, keeps them for a query in the other language", () => {
    const ranked = rankLibrarySuggestions([view({ id: "a", name: "Strong Arms" }), view({ id: "b", name: "Invincible", type: "mount" })], "invinc");
    assert.deepEqual(ranked.map((entry) => entry.id), ["b"]);
    const cross = rankLibrarySuggestions([view({ id: "a", name: "Громовая Ярость" })], "thunderfury");
    assert.deepEqual(cross.map((entry) => entry.id), ["a"]);
  });

  it("caps the list and drops internal names", () => {
    const many = Array.from({ length: 20 }, (_, index) => view({ id: String(index), name: `Sword ${index}` }));
    assert.equal(rankLibrarySuggestions(many, "sword").length, 8);
    assert.equal(rankLibrarySuggestions([view({ name: "Sword DNT" })], "sword").length, 0);
  });

  it("suggests sections by the start of their name", () => {
    const sections = [{ name: "Предметы" }, { name: "Маунты" }, { name: "Боевые питомцы" }, { name: "Комплекты трансмогрификации" }];
    assert.deepEqual(matchLibraryDatasets(sections, "маунт").map((entry) => entry.name), ["Маунты"]);
    assert.deepEqual(matchLibraryDatasets(sections, "пит").map((entry) => entry.name), ["Боевые питомцы"]);
    assert.deepEqual(matchLibraryDatasets(sections, "п"), [], "one letter suggests nothing");
  });
});

describe("library: show-more query", () => {
  it("round-trips the dataset page query", () => {
    const query = { dataset: "items", product: "wow", q: "sword", facets: ["equipment/slots/legs"], minLevel: 600 };
    const parsed = parseLibraryListQuery(new URLSearchParams(libraryListSearch(query, "MDAw", "ru")));
    assert.ok(parsed);
    assert.deepEqual({ ...parsed }, { ...query, cursor: "MDAw", lang: "ru" });
  });

  it("rejects malformed input before it reaches the catalog", () => {
    const bad = ["dataset=Items&cursor=x", "dataset=items&cursor=a%20b", "dataset=items&cursor=x&minLevel=-1", "dataset=items&cursor=x&minLevel=1.5",
      `dataset=items&cursor=x&q=${"a".repeat(201)}`, `dataset=items&cursor=x&${Array.from({ length: 9 }, () => "facet=a").join("&")}`];
    for (const query of bad) assert.equal(parseLibraryListQuery(new URLSearchParams(query)), null, query);
  });

  it("keeps the edition only off retail", () => {
    assert.equal(libraryListSearch({ dataset: "items", product: "wow", q: "", facets: [] }, ""), "");
    assert.equal(libraryListSearch({ dataset: "items", product: "wow_classic", q: "", facets: [] }, ""), "product=wow_classic");
  });
});

describe("library: record relations", () => {
  it("names a relation from the side of the record on the page", () => {
    assert.equal(relationTitle("incoming", "obtained_from", "en"), "Loot");
    assert.equal(relationTitle("outgoing", "obtained_from", "ru"), "Где добыть");
    assert.equal(relationTitle("incoming", "creates", "en"), "Created by", "a recipe that creates the item is where it comes from");
    assert.equal(relationTitle("outgoing", "uses_reagent", "ru"), "Реагенты");
    assert.equal(relationTitle("outgoing", "belongs_to", "ru"), "Входит в");
    assert.equal(relationTitle("outgoing", "summoned_by", "en"), "Summoned by");
  });

  it("shows players' facts of a relation, not import bookkeeping", () => {
    const yesNo = { yes: "Yes", no: "No" };
    assert.deepEqual(relationshipAttributes({ chance_percent: null, difficulty_mask: -1, source_id: 130, source_type: "encounter" }, "en", yesNo), []);
    assert.deepEqual(relationshipAttributes({ order_index: 7, difficulty_mask: -1 }, "en", yesNo), []);
    assert.deepEqual(relationshipAttributes({ chance_percent: 12.5, quantity: 2 }, "ru", yesNo), ["Шанс добычи: 12.5%", "Количество: 2"]);
  });
});
