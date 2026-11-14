import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { catalogSearchQuery } from "../../lib/platform/catalog/searchQuery.ts";

describe("catalog search text", () => {
  it("drops quotes, brackets and sentence punctuation, keeps the words", () => {
    assert.equal(catalogSearchQuery('"fire"'), "fire");
    assert.equal(catalogSearchQuery("«Огненный шар»!"), "Огненный шар");
    assert.equal(catalogSearchQuery("Hero (Mythic)"), "Hero Mythic");
    assert.equal(catalogSearchQuery("Combatant II: Dragonflight"), "Combatant II Dragonflight");
    assert.equal(catalogSearchQuery("fire; -- drop"), "fire drop");
    assert.equal(catalogSearchQuery("  thunderfury,   blessed "), "thunderfury, blessed");
  });

  it("keeps apostrophes and hyphens of names", () => {
    for (const name of ["Sen'jin", "Xal'atath's Bargain", "Kel’Thuzad", "Two-Handed Sword", "Сал'ухан", "10.2.7"]) assert.equal(catalogSearchQuery(name), name);
  });

  it("asks nothing for less than two letters or digits", () => {
    for (const text of ["", " ", "a", "я", "a'", '"', "'\";--", "%", "+", "🔥", "?!", "(a)"]) assert.equal(catalogSearchQuery(text), "", JSON.stringify(text));
    assert.equal(catalogSearchQuery("ab"), "ab");
    assert.equal(catalogSearchQuery("щит"), "щит");
    assert.equal(catalogSearchQuery("x2"), "x2");
  });
});
