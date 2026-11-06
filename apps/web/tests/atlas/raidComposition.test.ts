import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COVERAGE, PLANNER_SPECS, TYPICAL_MYTHIC, armorCounts, coverageOf, decodeRoster, emptyRoster, encodeRoster,
  resizeRoster, roleCounts, slotCount,
} from "../../lib/wow/raidComposition/model.ts";
import { PLANNER_SPELLS } from "../../lib/wow/raidComposition/spells.ts";

describe("raid composition: data", () => {
  it("every specialization has a unique one-character code, a role and an armor type", () => {
    assert.equal(PLANNER_SPECS.length, 40);
    const codes = PLANNER_SPECS.map((spec) => spec.code);
    assert.ok(codes.every((code) => /^[A-Za-z0-9]$/.test(code)), "codes are single URL-safe characters");
    assert.equal(new Set(codes).size, codes.length);
    for (const spec of PLANNER_SPECS) assert.ok(spec.role && spec.armor, spec.slug);
    assert.equal(PLANNER_SPECS.find((spec) => spec.specId === 1480)?.role, "ranged", "Devourer is ranged");
  });

  it("coverage refers only to known spells and specializations", () => {
    const slugs = new Set(PLANNER_SPECS.map((spec) => spec.slug));
    const ids = new Set<string>();
    for (const group of COVERAGE) {
      for (const item of group.items) {
        assert.ok(!ids.has(item.id), `duplicate item ${item.id}`);
        ids.add(item.id);
        for (const source of item.sources) {
          assert.ok(source.spell in PLANNER_SPELLS, `${item.id}: spell ${source.spell}`);
          assert.ok(source.specs.length > 0, `${item.id}: ${source.spell} has providers`);
          for (const slug of source.specs) assert.ok(slugs.has(slug), `${item.id}: ${slug}`);
        }
      }
    }
  });
});

describe("raid composition: roster", () => {
  it("round-trips through the share code and trims trailing empty slots", () => {
    const roster = emptyRoster("mythic");
    roster[0] = "blood-death-knight";
    roster[2] = "fire-mage";
    const code = encodeRoster(roster);
    assert.equal(code, "a-r");
    assert.deepEqual(decodeRoster(code, "mythic"), roster);
    assert.equal(encodeRoster(emptyRoster("flex")), "");
  });

  it("ignores unknown characters and overflow", () => {
    const roster = decodeRoster("a?r" + "a".repeat(40), "mythic");
    assert.equal(roster.length, slotCount("mythic"));
    assert.equal(roster[1], null);
    assert.equal(roster[2], "fire-mage");
  });

  it("keeps players when the raid shrinks while there is room", () => {
    const flex = emptyRoster("flex");
    flex[25] = "holy-priest";
    flex[29] = "arms-warrior";
    const mythic = resizeRoster(flex, "mythic");
    assert.equal(mythic.length, 20);
    assert.deepEqual(mythic.filter(Boolean), ["holy-priest", "arms-warrior"]);
    assert.equal(resizeRoster(mythic, "flex").length, 30);
  });

  it("the typical Mythic roster covers every buff, Bloodlust and battle res", () => {
    const roster = resizeRoster(TYPICAL_MYTHIC, "mythic");
    assert.equal(roster.filter(Boolean).length, 20);
    assert.deepEqual(roleCounts(roster), { tank: 2, healer: 4, melee: 5, ranged: 9 });
    const coverage = coverageOf(roster);
    for (const group of COVERAGE.filter((entry) => entry.id === "buffs" || entry.id === "essentials")) {
      for (const item of group.items) assert.ok(coverage.get(item.id)!.providers.length > 0, item.id);
    }
    assert.equal(coverage.get("battle-res")!.providers.length, 7, "two druids, two death knights, a warlock and two paladins");
    const armor = armorCounts(roster);
    assert.equal(Object.values(armor).reduce((sum, value) => sum + value, 0), 20);
  });

  it("an empty roster covers nothing", () => {
    for (const { providers } of coverageOf(emptyRoster("flex")).values()) assert.equal(providers.length, 0);
  });
});
