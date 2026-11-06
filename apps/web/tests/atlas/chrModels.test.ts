import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { chrModelIdForRace } from "../../lib/wow/chrModels.ts";

/** ChrRaceXChrModel of the game: playable race → [male, female] model of the Wowhead viewer. */
describe("character model ids", () => {
  it("core races are consecutive pairs", () => {
    for (const race of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
      assert.equal(chrModelIdForRace(race, false), race * 2 - 1);
      assert.equal(chrModelIdForRace(race, true), race * 2);
    }
  });
  it("allied and later races use their own models, not NPC ones", () => {
    assert.equal(chrModelIdForRace(27, true), 54); // Nightborne female, not 30 (Skeleton)
    assert.equal(chrModelIdForRace(22, false), 43); // Worgen
    assert.equal(chrModelIdForRace(26, true), 48); // Pandaren (Horde) shares the Pandaren model
    assert.equal(chrModelIdForRace(37, true), 74); // Mechagnome
    assert.equal(chrModelIdForRace(52, true), 89); // Dracthyr: one model for both sexes
    assert.equal(chrModelIdForRace(70, false), 89);
    assert.equal(chrModelIdForRace(85, true), 196); // Earthen
    assert.equal(chrModelIdForRace(91, false), 200); // Haranir
  });
  it("unknown races have no model", () => {
    assert.equal(chrModelIdForRace(15, false), undefined);
  });
});
