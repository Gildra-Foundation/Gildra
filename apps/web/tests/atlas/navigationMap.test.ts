import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { barePathOf, currentRealm } from "../../components/platform/navigation/navigationMap.ts";

/** Every top route of the site and the tab of the bar it lights (null: none). */
const expected: Record<string, string | null> = {
  "/": null,
  "/wow": null,
  "/wow/forever": null,
  "/wow/forever/dungeons": "forever-dungeons",
  "/wow/forever/dungeons/wailing-caverns": "forever-dungeons",
  "/wow/forever/raids": "forever-raids",
  "/privacy": null,
  "/wow/characters": "heroes",
  "/wow/characters/eu-tarren-mill-andymuerte": "heroes",
  "/wow/shared/abc": "heroes",
  "/wow/classes": "classes",
  "/talents/holy-priest": "classes",
  "/specs/holy-priest": "classes",
  "/wow/rotation/holy-priest": "classes",
  "/wow/mythic-plus": "mythic",
  "/wow/mythic-plus/midnight-season-2/magisters-terrace": "mythic",
  "/wow/mythic-plus/meta": "mythic",
  "/wow/mythic-plus/comps": "mythic",
  "/wow/mythic-plus/stats": "mythic",
  "/wow/mythic-plus/leaderboard": "mythic",
  "/wow/mythic-plus/leaderboard/frost-mage": "mythic",
  "/wow/mythic-plus/routes": "mythic",
  "/wow/mythic-plus/routes/23816340": "mythic",
  "/wow/players/eu/tarren-mill/andymuerte": "mythic",
  "/wow/midnight/season-2": "mythic",
  "/wow/dungeons": "mythic",
  "/wow/raids": "raids",
  "/wow/raids/sporefall/rotmaw": "raids",
  "/wow/raids/composition": "raids",
  "/wow/lairs": "raids",
  "/wow/lairs/nimrissa": "raids",
  "/tier-lists": "meta",
  "/tier-lists/raid": "meta",
  "/tier-lists/arena/3v3": "meta",
  "/wow/auction": "tools",
  "/wow/professions": "tools",
  "/wow/professions/alchemy": "tools",
  "/wow/professions/alchemy/region/us": "tools",
  "/wow/transmog": "tools",
  "/library": "library",
  "/library/items": "library",
  "/library/items/00004a86-3321-43ac-983d-9d73d79d11ae/legguards": "library",
  "/search": "library",
  "/wow/stories": "library",
  "/wow/whats-new": "chronicle",
};

describe("navigation: the tab each page lights", () => {
  for (const [path, realm] of Object.entries(expected)) {
    for (const lang of ["", "/ru"]) {
      const url = `${lang}${path === "/" ? "" : path}` || "/";
      it(url, () => assert.equal(currentRealm(barePathOf(url))?.realm.id ?? null, realm));
    }
  }
  it("a look-alike prefix is not a match", () => {
    assert.equal(currentRealm("/wow/classesx")?.realm.id ?? null, null);
    assert.equal(currentRealm("/talentsx")?.realm.id ?? null, null);
  });
});

describe("navigation: the menus' lead cards", () => {
  it("every lead card is one of its realm's pages and its painting exists", async () => {
    const { existsSync } = await import("node:fs");
    const { navigationRealms, linksFor } = await import("../../components/platform/navigation/navigationMap.ts");
    for (const realm of navigationRealms) {
      const links = linksFor(realm, "en").length > 1 ? linksFor(realm, "en") : linksFor(realm, "ru");
      if (links.length < 2 && !realm.art) continue;
      const lead = realm.feature ?? realm.hub;
      assert.ok(links.some(link => link.href === lead), `${realm.id}: ${lead} is not one of its pages`);
      assert.ok(realm.art, `${realm.id}: no painting`);
      const file = realm.art!.startsWith("/maps/tiles/") ? `public${realm.art}/0_0.webp` : `public${realm.art}`;
      assert.ok(existsSync(new URL(`../../${file}`, import.meta.url)), `${realm.id}: ${file} missing`);
    }
  });
  it("every page of a menu has a one-line note", async () => {
    const { navigationRealms, linksFor } = await import("../../components/platform/navigation/navigationMap.ts");
    for (const realm of navigationRealms) {
      if (linksFor(realm, "ru").length < 2 && !realm.art) continue;
      for (const link of linksFor(realm, "ru")) assert.ok(link.note, `${link.href} has no note`);
    }
  });
});
