import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";

const mode = process.argv[2], handles = JSON.parse(process.argv[3] ?? "{}");
const now = 1792166400000;
Date.now = () => now;
globalThis.fetch = async () => { throw Error("unexpected_network_request"); };
const store = await import("../../../lib/wow/auctionGearSearchStore.ts");
const { createAuctionGearDiscovery } = await import("../../../lib/wow/auctionGearDiscovery.ts");
const persistence = await import("../../../lib/wow/auctionGearPersistence.ts");
function context() {
  const timestamp = new Date(now).toISOString();
  const market = { id: "synthetic-atomicity-market", sourceUpdatedAt: timestamp, fetchedAt: timestamp, offers: [] };
  const season = { id: "synthetic", patch: "synthetic", expansionId: 11, activityNames: [] };
  return { input: { locale: "en", characterSlug: "synthetic", budgetCopper: 1, scenario: "single-target", selectedSlots: ["HEAD"] },
    character: { id: 1, level: 90, playableClass: { id: 1 }, playableRace: { id: 1 }, faction: { type: "ALLIANCE" } },
    armory: { equipment: { equipped_items: [] }, profile: {}, specializations: {}, activeTalentLoadout: "synthetic" },
    options: [], loadout: [], specId: 72, specSlug: "fury-warrior", market, currentBySlot: new Map(),
    discovery: createAuctionGearDiscovery(market, 1), discoverySeason: season, encounter: { fightLengthSeconds: 120, targets: 1 },
    coverage: {}, searchLimited: true, publicMarket: {}, profileFingerprint: "synthetic", scenario: "single-target", marketChange: {},
    simulate: async () => {}, discoveryContext: () => {},
  };
}
function faultOnce(method, shouldFail, operation) {
  const original = fs[method];
  let failed = false;
  fs[method] = (...args) => {
    if (!failed && shouldFail(...args)) {
      failed = true;
      const error = new Error(`synthetic-${method}-EIO`); error.code = "EIO"; throw error;
    }
    return original(...args);
  };
  syncBuiltinESMExports();
  try { return operation(); }
  finally { fs[method] = original; syncBuiltinESMExports(); }
}
const owner = "synthetic-atomicity-owner";
let output;
if (mode === "write-failure") {
  const entries = Array.from({ length: 3 }, () => store.createAuctionGearSearch(owner, context()));
  faultOnce("writeFileSync", () => true, () => assert.throws(() => store.createAuctionGearSearch(owner, context()), /auction_storage_unavailable/));
  for (const entry of entries) {
    assert(store.getAuctionGearSearch(owner, entry.id), "A failed replacement must retain acknowledged memory state");
    assert(fs.existsSync(join(process.env.GILDRA_AUCTION_STATE_DIR, `search-${entry.id}.bin`)), "A failed replacement must retain acknowledged disk state");
  }
  output = { status: "passed", preservedSearches: entries.length };
} else if (mode === "post-rename-failure") {
  const entries = Array.from({ length: 40 }, (_, index) => store.createAuctionGearSearch(`synthetic-owner-${index}`, context()));
  faultOnce("fsyncSync", fd => fs.fstatSync(fd).isDirectory(), () => assert.throws(() => store.createAuctionGearSearch("synthetic-new-owner", context()), /auction_storage_unavailable/));
  assert.equal(fs.readdirSync(process.env.GILDRA_AUCTION_STATE_DIR).filter(name => /^search-.*\.bin$/.test(name)).length, 40, "A failed post-rename durability barrier must not leave an unacknowledged record");
  for (const [index, entry] of entries.entries()) assert(store.getAuctionGearSearch(`synthetic-owner-${index}`, entry.id));
  assert(store.createAuctionGearSearch("synthetic-next-owner", context()));
  output = { status: "passed" };
} else if (mode === "unlink-failure") {
  const entries = Array.from({ length: 40 }, (_, index) => store.createAuctionGearSearch(`synthetic-owner-${index}`, context()));
  let accepted;
  faultOnce("unlinkSync", path => String(path).includes("/search-"), () => {
    try { accepted = store.createAuctionGearSearch("synthetic-new-owner", context()); }
    catch (error) { assert.match(error.message, /auction_storage_unavailable/); }
  });
  const next = store.createAuctionGearSearch("synthetic-next-owner", context());
  assert(next, "A transient post-commit delete failure must not strand capacity above its bound");
  assert(fs.readdirSync(process.env.GILDRA_AUCTION_STATE_DIR).filter(name => /^search-.*\.bin$/.test(name)).length <= 40);
  if (accepted) assert(store.getAuctionGearSearch("synthetic-new-owner", accepted.id));
  // Only normal LRU evictions may disappear; no acknowledged record may be
  // lost because it was removed before the replacement had a durable file.
  assert(entries.filter(entry => fs.existsSync(join(process.env.GILDRA_AUCTION_STATE_DIR, `search-${entry.id}.bin`))).length >= 38);
  output = { status: "passed" };
} else if (mode === "read-failure") {
  const entry = store.createAuctionGearSearch(owner, context());
  for (const read of [() => persistence.listAuctionStateHeaders("search"), () => persistence.readAuctionState("search", entry.id)]) {
    faultOnce("readSync", () => true, () => assert.throws(read, /auction_storage_unavailable/));
    assert(fs.existsSync(join(process.env.GILDRA_AUCTION_STATE_DIR, `search-${entry.id}.bin`)), "A transient read EIO cannot delete an acknowledged record");
  }
  output = { status: "passed" };
} else if (mode === "renewal-seed") {
  const entry = store.createAuctionGearSearch(owner, context());
  Date.now = () => now + 29 * 60000;
  assert(store.getAuctionGearSearch(owner, entry.id));
  output = { id: entry.id };
} else if (mode === "renewal-read") {
  Date.now = () => now + 31 * 60000;
  assert(store.getAuctionGearSearch(owner, handles.id), "A renewed metadata lease must survive restart after the original compressed-body lease expired");
  output = { status: "passed" };
} else if (mode === "lru-seed" || mode === "lru-read-seed") {
  const entries = Array.from({ length: 3 }, () => store.createAuctionGearSearch(owner, context()));
  if (mode === "lru-read-seed") entries.reverse();
  else entries.sort((a, b) => a.id.localeCompare(b.id));
  for (const entry of entries) {
    store.getAuctionGearSearch(owner, entry.id);
    if (mode === "lru-seed") store.saveAuctionGearSearch(entry);
  }
  output = { expectedOldest: entries[0].id, ids: entries.map(entry => entry.id) };
} else if (mode === "lru-restore") {
  store.createAuctionGearSearch(owner, context());
  const removed = handles.ids.filter(id => !store.getAuctionGearSearch(owner, id));
  assert.deepEqual(removed, [handles.expectedOldest], "A real restart must retain logical LRU ordering when wall-clock timestamps tie");
  output = { status: "passed", removed };
} else throw Error(`unknown_atomicity_mode:${mode}`);
console.log(JSON.stringify(output));
