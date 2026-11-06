import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { clock, parseRunsQuery, runsSearch, withSpec, withoutSpec } from "../../lib/games/wow/mythicPlusRunsTypes.ts";
import { parseRunId, runHref, toRunDetail } from "../../lib/games/wow/mythicPlusRunTypes.ts";
import { communityCopy } from "../../components/wow/mythicCommunity/communityCopy.ts";
import { staticPaths } from "../../lib/games/wow/sitemap.ts";

describe("Mythic+ community query", () => {
  it("keeps only well-formed filters", () => {
    assert.deepEqual(parseRunsQuery({ dungeon: "murder-row", region: "eu", minLevel: "22", specs: "65,250,x,62", sort: "fast", limit: "60" }),
      { dungeon: "murder-row", region: "eu", minLevel: 22, specs: [62, 65, 250], sort: "fast", limit: 60 });
    assert.deepEqual(parseRunsQuery({ dungeon: "../etc", region: "cn", minLevel: "99", specs: "", sort: "random", limit: "500" }), {});
    assert.deepEqual(parseRunsQuery({ dungeon: "all", sort: "level", limit: "30" }), {}, "defaults are not repeated in the URL");
    assert.equal(parseRunsQuery({ specs: "1,2,3,4,5,6,7" }).specs?.length, 5);
  });
  it("writes the same canonical search for the API and the page", () => {
    assert.equal(runsSearch({}), "");
    assert.equal(runsSearch({ specs: [250, 62], dungeon: "kings-rest", minLevel: 21 }), "?dungeon=kings-rest&minLevel=21&specs=62,250");
    assert.equal(runsSearch(parseRunsQuery({ specs: "250,62", sort: "recent" })), "?specs=62,250&sort=recent");
  });
  it("adds and removes one spec, resetting the page size", () => {
    const query = { specs: [62, 62], limit: 60 };
    assert.deepEqual(withSpec(query, 250), { specs: [62, 62, 250], limit: undefined });
    assert.deepEqual(withoutSpec(query, 62), { specs: [62], limit: undefined });
  });
  it("prints clear times as minutes and seconds", () => {
    assert.equal(clock(1_674_349), "27:54");
    assert.equal(clock(59_600), "1:00");
  });
});

describe("Mythic+ community pages", () => {
  it("have the same copy keys in both languages", () => {
    const keys = (value: object): string[] => Object.entries(value).flatMap(([key, item]) => item && typeof item === "object" ? keys(item).map((inner) => `${key}.${inner}`) : [key]).sort();
    assert.deepEqual(keys(communityCopy.ru), keys(communityCopy.en));
  });
  it("are listed in the sitemap", () => {
    for (const path of ["/wow/mythic-plus/comps", "/wow/mythic-plus/stats", "/wow/mythic-plus/routes"]) assert.ok(staticPaths().includes(path), path);
  });
});

describe("Mythic+ run page", () => {
  const raw = JSON.parse(readFileSync(new URL("../fixtures/raiderio-run-details.json", import.meta.url), "utf8"));
  it("keeps the facts of a Raider.IO run", () => {
    const run = toRunDetail(raw);
    assert.ok(run);
    assert.equal(run.id, 24026346);
    assert.equal(run.dungeon.slug, "ruby-life-pools");
    assert.equal(run.level, 24);
    assert.equal(run.chests, 1);
    assert.equal(run.url, "https://raider.io/mythic-plus-runs/season-mn-2/24026346-24-ruby-life-pools");
    assert.deepEqual(run.players.map((player) => player.role), ["tank", "healer", "dps", "dps", "dps"]);
    assert.equal(run.players[0].heroId, 24);
    assert.ok(run.players.every((player) => player.loadout && player.itemLevel && player.rating));
    assert.equal(run.players.reduce((sum, player) => sum + player.deaths, 0), 1);
    assert.equal(run.deaths, 1);
    assert.deepEqual(run.encounters.map((encounter) => encounter.name), ["Melidrussa Chillworn", "Kokia Blazehoof", "Kyrakka and Erkhart Stormvein"]);
    assert.equal(run.affixes.length, 3);
    assert.ok(run.videos.every((video) => video.url.startsWith("https://www.twitch.tv/videos/") || video.url.startsWith("https://www.youtube.com/watch?v=")));
  });
  it("rejects answers that are not a finished run", () => {
    assert.equal(toRunDetail({}), null);
    assert.equal(toRunDetail({ ...raw, deleted_at: "2026-11-01T00:00:00Z" }), null);
    assert.equal(toRunDetail(null), null);
    const unlogged = toRunDetail({ ...raw, logged_details: null, videos: [{ videoType: "youtube", videoId: "bad id!" }] });
    assert.equal(unlogged?.deaths, null);
    assert.deepEqual(unlogged?.encounters, []);
    assert.deepEqual(unlogged?.videos, []);
  });
  it("reads only plain run ids from the URL", () => {
    assert.equal(parseRunId("24026346"), 24026346);
    for (const value of ["", "0", "012", "1e5", "24026346-24-ruby", "99999999999", "-4"]) assert.equal(parseRunId(value), null, value);
    assert.equal(runHref("/ru", 5), "/ru/wow/mythic-plus/routes/5");
  });
});
