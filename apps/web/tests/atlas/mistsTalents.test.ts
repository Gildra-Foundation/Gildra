import assert from "node:assert/strict";
import test from "node:test";
import { mistsClasses } from "../../lib/wow/mists/data.ts";
import { mistsBuildQuery, parseMistsBuild } from "../../lib/wow/mists/types.ts";

test("every class has six tiers of three talents with text and icons in both languages", () => {
  assert.equal(mistsClasses.length, 11);
  for (const cls of mistsClasses) {
    // Death Knights start at 55 and meet their first three tiers at 56, 57 and 58.
    assert.deepEqual(cls.tiers.map(tier => tier.level), cls.slug === "death-knight" ? [56, 57, 58, 60, 75, 90] : [15, 30, 45, 60, 75, 90], cls.slug);
    for (const tier of cls.tiers) {
      assert.equal(tier.talents.length, 3, `${cls.slug} ${tier.level}`);
      for (const talent of tier.talents) {
        for (const lang of ["en", "ru"] as const) {
          assert.ok(talent.name[lang] && talent.description[lang], `${talent.name.en} ${lang}`);
          assert.ok(!/\$[a-z0-9{]/i.test(talent.description[lang]), `${talent.name.en} ${lang}: template token`);
        }
        assert.match(talent.icon, /^https:\/\/render\.worldofwarcraft\.com\//);
      }
    }
    assert.ok(cls.specs.length >= 3 && cls.specs.length <= 4, cls.slug);
    assert.match(cls.color, /^#[0-9a-f]{6}$/);
  }
});

test("a build round-trips through the address and ignores junk", () => {
  const mage = mistsClasses.find(cls => cls.slug === "mage")!;
  const build = parseMistsBuild(mage, "fire", "120301");
  assert.deepEqual(build, { spec: "fire", picks: [1, 2, 0, 3, 0, 1] });
  assert.equal(mistsBuildQuery(build), "?spec=fire&talents=120301");
  assert.deepEqual(parseMistsBuild(mage, "holy", "9x4"), { spec: null, picks: [0, 0, 0, 0, 0, 0] });
  assert.equal(mistsBuildQuery({ spec: null, picks: [0, 0, 0, 0, 0, 0] }), "");
});
