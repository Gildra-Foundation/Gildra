import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(new URL("../data/wow/content-manifest.json", import.meta.url), "utf8"));
const retail = manifest.editions.find((entry) => entry.id === "wow:edition:retail" && entry.status === "live");
assert.equal(retail?.verificationStatus, "official", "Retail season must have official verification");
assert.ok(retail?.season && retail?.patch && retail?.sourceUrl, "Retail season provenance is incomplete");
const activities = manifest.instances.filter((entry) => entry.season === retail.season && entry.status === "live");
assert.ok(activities.length >= 8, "Current season activity denominator is too small");
assert.ok(activities.some((entry) => entry.activity === "raid" && entry.journalId), "Current raid lacks a verified Journal ID");

const clientId = process.env.BATTLENET_CLIENT_ID;
const clientSecret = process.env.BATTLENET_CLIENT_SECRET;
const region = process.env.BATTLENET_REGION || "eu";
let officialSample = [];
if (clientId && clientSecret) {
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokenResponse = await fetch("https://oauth.battle.net/token", { method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
  assert.equal(tokenResponse.ok, true, `Battle.net OAuth failed: ${tokenResponse.status}`);
  const token = (await tokenResponse.json()).access_token;
  const currentEncounterIds = new Set(manifest.encounters.filter((entry) => entry.season === retail.season && entry.status === "live").map((entry) => entry.journalId ?? entry.refs?.encounterId).filter(Boolean));
  const build = activities.find((entry) => entry.activity === "raid" && entry.build)?.build;
  assert.ok(build, "Current raid DB2 build is missing");
  const lootResponse = await fetch(`https://wago.tools/db2/JournalEncounterItem/csv?build=${encodeURIComponent(build)}&locale=enUS`);
  assert.equal(lootResponse.ok, true, `JournalEncounterItem fetch failed: ${lootResponse.status}`);
  const lootRows = (await lootResponse.text()).trim().split("\n").slice(1).map((line) => line.split(","));
  const currentLoot = lootRows.filter((row) => currentEncounterIds.has(Number(row[1]))).slice(0, 60).map((row) => ({ encounterId: Number(row[1]), itemId: Number(row[2]) }));
  assert.ok(currentLoot.length >= 5, "Current raid loot denominator is too small");
  for (const { encounterId, itemId } of currentLoot) {
    const url = new URL(`https://${region}.api.blizzard.com/data/wow/item/${itemId}`);
    url.searchParams.set("namespace", `static-${region}`);
    url.searchParams.set("locale", region === "us" ? "en_US" : "en_GB");
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.ok, true, `Official Item API failed for ${itemId}: ${response.status}`);
    const entry = await response.json();
    if (entry.inventory_type?.type !== "NON_EQUIP") officialSample.push({ encounterId, id: entry.id, name: entry.name, slot: entry.inventory_type?.type, itemClassId: entry.item_class?.id, itemSubclassId: entry.item_subclass?.id, level: entry.level });
    if (officialSample.length === 5) break;
  }
  assert.ok(officialSample.length >= 5, "Official current equippable item sample is too small");
  assert.ok(officialSample.every((item) => currentEncounterIds.has(item.encounterId) && item.id > 0 && item.name && item.slot !== "NON_EQUIP" && Number.isInteger(item.itemClassId) && Number.isInteger(item.itemSubclassId)), "Official current raid item identities are incomplete");
}

console.log(JSON.stringify({ status: "passed", season: retail.season, patch: retail.patch, seasonSource: retail.sourceUrl, activityCount: activities.length, currentRaidJournalIds: activities.filter((entry) => entry.activity === "raid").map((entry) => entry.journalId).filter(Boolean), officialBattleNetSample: officialSample, officialSampleSkipped: !clientId || !clientSecret }, null, 2));
