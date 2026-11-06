import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { clock, parseRunsQuery, runsSearch, withSpec, withoutSpec } from "../../lib/games/wow/mythicPlusRunsTypes.ts";
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
