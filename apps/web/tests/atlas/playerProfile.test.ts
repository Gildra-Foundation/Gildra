import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { bestRunsByDungeon, keystoneUpgrades, parsePlayerKey, playerProfilePath, raidProgress, ratingColor } from "../../lib/wow/playerProfileView.ts";
import { playerProfileCopy } from "../../components/wow/audit/playerProfileCopy.ts";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));

describe("Player profile address", () => {
  it("writes lower-case, encoded paths in both languages", () => {
    assert.equal(playerProfilePath("eu", "twisting-nether", "Sjelemental"), "/wow/players/eu/twisting-nether/sjelemental");
    assert.equal(playerProfilePath("EU", "howling-fjord", "Аэрит", "/ru"), "/ru/wow/players/eu/howling-fjord/%D0%B0%D1%8D%D1%80%D0%B8%D1%82");
  });
  it("accepts real characters and rejects anything else before calling Blizzard", () => {
    assert.deepEqual(parsePlayerKey({ region: "eu", realm: "howling-fjord", name: "%D0%90%D1%8D%D1%80%D0%B8%D1%82" }), { region: "eu", realm: "howling-fjord", name: "аэрит" });
    assert.deepEqual(parsePlayerKey({ region: "EU", realm: "%D0%B3%D0%BE%D1%80%D0%B4%D1%83%D0%BD%D0%BD%D0%B8", name: "Rooiben" }), { region: "eu", realm: "гордунни", name: "rooiben" });
    for (const params of [
      { region: "cn", realm: "sylvanas", name: "rooiben" },
      { region: "eu", realm: "../etc", name: "rooiben" },
      { region: "eu", realm: "sylvanas", name: "a1" },
      { region: "eu", realm: "sylvanas", name: "waytoolongname" },
      { region: "eu", realm: "sylvanas", name: "%E0%A4%A" },
    ]) assert.equal(parsePlayerKey(params), null, JSON.stringify(params));
  });
});

describe("Player profile data", () => {
  it("keeps the counted run of every dungeon, best first, with our run ids", () => {
    const runs = bestRunsByDungeon(fixture("blizzard-mythic-keystone-season.json"), [
      { keystone_run_id: 24928235, map_challenge_mode_id: 586, clear_time_ms: 1666843, num_keystone_upgrades: 1, par_time_ms: 1920999 },
      { keystone_run_id: 1, map_challenge_mode_id: 587, clear_time_ms: 1 },
    ]);
    assert.equal(runs.length, 8);
    assert.deepEqual(runs.map((run) => run.slug), ["den-of-nalorakk", "murder-row", "the-blinding-vale", "kings-rest", "ruby-life-pools", "temple-of-sethraliss", "voidscar-arena", "altar-of-fangs"]);
    assert.ok(runs.every((run) => run.timed && run.level === 24));
    const [nalorakk, murderRow] = runs;
    assert.equal(nalorakk.runId, 24928235);
    assert.equal(nalorakk.timerMs, 1920999);
    assert.equal(nalorakk.upgrades, 1);
    assert.equal(murderRow.runId, undefined, "a run is linked only when the clear time matches");
    assert.equal(murderRow.timerMs, 34 * 60 * 1000);
    assert.equal(nalorakk.color, "rgb(255 128 0)");
  });
  it("counts keystone upgrades from the timer", () => {
    assert.equal(keystoneUpgrades(1_000, 2_000, true), 3);
    assert.equal(keystoneUpgrades(1_500, 2_000, true), 2);
    assert.equal(keystoneUpgrades(1_900, 2_000, true), 1);
    assert.equal(keystoneUpgrades(2_500, 2_000, false), 0);
    assert.equal(ratingColor({ r: 255, g: 255, b: 255, a: 0 }), undefined);
  });
  it("reads the current season's raids by difficulty", () => {
    const raids = raidProgress(fixture("blizzard-character-raids.json"));
    assert.deepEqual(raids.map((raid) => [raid.id, raid.slug]), [[1317, undefined], [1320, "venomous-abyss"], [1324, "the-unbinding-of-kithix"]]);
    assert.deepEqual(raids[1].modes, [{ difficulty: "HEROIC", killed: 8, total: 8 }, { difficulty: "MYTHIC", killed: 8, total: 8 }]);
    assert.deepEqual(raidProgress(null), []);
  });
  it("has the same copy keys in both languages", () => {
    assert.deepEqual(Object.keys(playerProfileCopy.ru).sort(), Object.keys(playerProfileCopy.en).sort());
  });
});
