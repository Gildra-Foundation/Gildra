import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LIBRARY_LIMIT, libraryHits, libraryQueryKey, librarySuggestUrl } from "../../components/platform/search/librarySuggest.ts";
import { siteSearchCopy } from "../../components/platform/search/siteSearchCopy.ts";

describe("quick search: library records", () => {
  it("asks the library from two letters on, per language", () => {
    assert.equal(libraryQueryKey("о", "ru"), "");
    assert.equal(libraryQueryKey("  ", "en"), "");
    assert.equal(libraryQueryKey(" Огненный Шар ", "ru"), "ru|огненный шар");
    assert.notEqual(libraryQueryKey("fireball", "en"), libraryQueryKey("fireball", "ru"));
    assert.equal(libraryQueryKey("x".repeat(201), "en"), "");
  });

  it("asks the suggestions endpoint of the library pages", () => {
    assert.equal(librarySuggestUrl(" Огненный шар ", "ru"), "/api/platform/library/suggest?q=%D0%9E%D0%B3%D0%BD%D0%B5%D0%BD%D0%BD%D1%8B%D0%B9+%D1%88%D0%B0%D1%80&lang=ru&product=wow");
  });

  it("keeps named records with an address, a few of them", () => {
    const record = (id: string, extra: object = {}) => ({ id, href: `/library/spells/${id}/fireball`, name: "Fireball", typeLabel: "Spell", school: "Fire", ...extra });
    const hits = libraryHits({ records: [record("a", { iconUrl: "https://render.worldofwarcraft.com/eu/icons/56/x.jpg" }), { id: "b", name: "No address" }, record("c", { name: " " }), record("d", { href: "https://elsewhere.example/x" }), ...["e", "f", "g", "h", "i", "j"].map((id) => record(id))] });
    assert.equal(hits.length, LIBRARY_LIMIT);
    assert.deepEqual(hits[0], { id: "a", href: "/library/spells/a/fireball", name: "Fireball", typeLabel: "Spell", iconUrl: "https://render.worldofwarcraft.com/eu/icons/56/x.jpg" });
    assert.deepEqual(hits.map((hit) => hit.id), ["a", "e", "f", "g", "h"]);
    assert.ok(!("iconUrl" in hits[1]));
  });

  it("an answer without records lists nothing", () => {
    for (const payload of [null, undefined, {}, { records: null }, { message: "The library is closed" }, "x"]) assert.deepEqual(libraryHits(payload), []);
  });

  it("names the section as the site does", () => {
    assert.equal(siteSearchCopy.ru.library("щит"), "Искать «щит» в библиотеке");
    assert.equal(siteSearchCopy.en.library("shield"), "Search the library for “shield”");
    for (const lang of ["en", "ru"] as const) assert.doesNotMatch(JSON.stringify([siteSearchCopy[lang].failed, siteSearchCopy[lang].libraryGroup, siteSearchCopy[lang].library("x")]), /database|баз[аеуы] данных/i);
  });
});
