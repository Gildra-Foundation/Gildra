import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { wowPortalFor, wowPortalHref, wowPortalSection, wowPortals } from "../../lib/games/wowPortals.ts";

const portal = (id: string) => wowPortals.find(item => item.id === id)!;

test("the version follows localized paths with a segment boundary", () => {
  for (const path of ["/wow/forever", "/ru/wow/forever", "/wow/forever/", "/ru/wow/forever/raids"]) assert.equal(wowPortalFor(path).id, "forever");
  for (const path of ["/wow/mists", "/ru/wow/mists/talents/mage?talents=123"]) assert.equal(wowPortalFor(path).id, "mists");
  for (const path of ["/", "/ru", "/wow", "/wow/raids", "/ru/library", "/wow/forevermore", "/wow/mistsy"]) assert.equal(wowPortalFor(path).id, "retail");
});

test("switching keeps the section when the target version has it", () => {
  assert.equal(wowPortalHref("ru", portal("forever"), "/ru/wow/raids/voidspire"), "/ru/wow/forever/raids");
  assert.equal(wowPortalHref("en", portal("retail"), "/wow/forever/dungeons/hall-of-thanes"), "/wow/mythic-plus");
  assert.equal(wowPortalHref("en", portal("mists"), "/talents/fire-mage"), "/wow/mists/talents");
  assert.equal(wowPortalHref("en", portal("retail"), "/wow/mists/talents/mage"), "/wow/classes");
  assert.equal(wowPortalSection("/wow/mists"), "classes");
});

test("without an equivalent section the switch lands on the version's hub", () => {
  assert.equal(wowPortalHref("ru", portal("forever"), "/ru/wow/mists/talents/monk"), "/ru/wow/forever/talent-calc");
  assert.equal(wowPortalHref("en", portal("mists"), "/wow/forever/raids"), "/wow/mists");
  assert.equal(wowPortalHref("en", portal("mists"), "/wow/auction"), "/wow/mists");
  assert.equal(wowPortalHref("ru", portal("retail"), "/ru/wow/forever"), "/ru");
});

test("every version has its own emblem file", () => {
  const emblems = new Set(wowPortals.map(item => item.emblem));
  assert.equal(emblems.size, wowPortals.length);
  for (const emblem of emblems) assert.ok(existsSync(new URL(`../../public${emblem}`, import.meta.url)), emblem);
});

test("Forever records switch to section roots without leaking IDs or build state", () => {
  assert.equal(wowPortalHref("ru", portal("retail"), "/ru/wow/forever/library/spell/123?build=abc#rank-2"), "/ru/library");
  assert.equal(wowPortalHref("en", portal("forever"), "/library/items/item/123/foo"), "/wow/forever/library");
  assert.equal(wowPortalHref("en", portal("retail"), "/wow/forever/changes?class=mage"), "/wow/classes");
});
