import assert from "node:assert/strict";
import fs from "node:fs";
import zlib from "node:zlib";
import { syncBuiltinESMExports } from "node:module";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { randomBytes } from "node:crypto";
import * as persistence from "../../../lib/wow/auctionGearPersistence.ts";
import * as store from "../../../lib/wow/auctionGearSearchStore.ts";
import { createAuctionGearDiscovery } from "../../../lib/wow/auctionGearDiscovery.ts";

const owner = "async-persistence-test-owner";
function context() {
  const timestamp = new Date().toISOString();
  const market = { id: "synthetic-async-market", sourceUpdatedAt: timestamp, fetchedAt: timestamp, offers: [] };
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
async function isolated(callback) {
  const directory = await mkdtemp(join(tmpdir(), "gildra-auction-async-"));
  const original = process.env.GILDRA_AUCTION_STATE_DIR;
  process.env.GILDRA_AUCTION_STATE_DIR = directory;
  try { await callback(directory); }
  finally {
    for (const entry of [...globalThis.__gildraAuctionGearSearches.values()]) store.deleteAuctionGearSearch(entry.owner, entry.id);
    if (original === undefined) delete process.env.GILDRA_AUCTION_STATE_DIR; else process.env.GILDRA_AUCTION_STATE_DIR = original;
    await rm(directory, { recursive: true, force: true });
  }
}
function compressionBarrier() {
  const original = zlib.gzip;
  let started;
  const entered = new Promise(resolve => { started = resolve; });
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  zlib.gzip = (...args) => { started(); void wait.then(() => original(...args)); };
  syncBuiltinESMExports();
  return { entered, release, restore() { zlib.gzip = original; syncBuiltinESMExports(); } };
}
const read = entry => persistence.readAuctionState("search", entry.id);

test("warm checkpoint bursts across async catalog turns serialize only the latest state", async t => isolated(async () => {
  const entry = store.createAuctionGearSearch(owner, context());
  const barrier = compressionBarrier(), intercepted = zlib.gzip;
  let compressions = 0;
  zlib.gzip = (...args) => { compressions++; return intercepted(...args); };
  syncBuiltinESMExports();
  // Hold only the debounce clock. Real async turns and compression still run;
  // flush must expedite the pending snapshot before returning to the caller.
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    for (let cursor = 1; cursor <= 8; cursor++) {
      entry.allowedKey = `async-catalog-${cursor}`;
      store.scheduleAuctionGearSearchSave(entry);
      await new Promise(resolve => setImmediate(resolve));
    }
    const durable = store.flushAuctionGearSearch(entry);
    barrier.release(); await durable;
    assert.equal(read(entry).data.allowedKey, "async-catalog-8");
    assert.equal(compressions, 1, "Warm async bursts should not serialize an obsolete intermediate snapshot");
  } finally { barrier.release(); barrier.restore(); t.mock.timers.reset(); }
}));

test("checkpoint bursts coalesce into one asynchronous durable snapshot of the latest data", async () => isolated(async directory => {
  const entry = store.createAuctionGearSearch(owner, context());
  const originals = { gzip: zlib.gzip, gzipSync: zlib.gzipSync, writeFileSync: fs.writeFileSync, fsyncSync: fs.fsyncSync };
  let compressions = 0;
  zlib.gzip = (...args) => { compressions++; return originals.gzip(...args); };
  zlib.gzipSync = fs.writeFileSync = fs.fsyncSync = () => { throw Error("checkpoint_used_blocking_bulk_io"); };
  syncBuiltinESMExports();
  try {
    for (let cursor = 1; cursor <= 100; cursor++) {
      entry.allowedKey = `checkpoint-${cursor}`;
      store.scheduleAuctionGearSearchSave(entry);
    }
    entry.excludedVariantKeys = ["item:confirmed"];
    entry.knownVariantKeys = new Set(entry.excludedVariantKeys);
    await store.flushAuctionGearSearch(entry);
    assert.equal(compressions, 1, "Repeated callbacks should serialize/compress one latest snapshot");
  } finally {
    Object.assign(zlib, { gzip: originals.gzip, gzipSync: originals.gzipSync });
    Object.assign(fs, { writeFileSync: originals.writeFileSync, fsyncSync: originals.fsyncSync }); syncBuiltinESMExports();
  }
  assert.equal(read(entry).data.allowedKey, "checkpoint-100");
  assert.deepEqual(read(entry).data.knownVariantKeys, new Set(["item:confirmed"]));
  assert.deepEqual(read(entry).data.excludedVariantKeys, ["item:confirmed"]);
  assert.equal((await readdir(directory)).filter(name => name.endsWith(".tmp")).length, 0);
}));

test("updates arriving during compression are serialized afterwards without losing the latest checkpoint", async () => isolated(async () => {
  const entry = store.createAuctionGearSearch(owner, context()), barrier = compressionBarrier();
  try {
    entry.allowedKey = "first"; store.scheduleAuctionGearSearchSave(entry);
    await barrier.entered;
    for (let cursor = 2; cursor <= 50; cursor++) {
      entry.allowedKey = `latest-${cursor}`; store.scheduleAuctionGearSearchSave(entry);
    }
    const durable = store.flushAuctionGearSearch(entry);
    barrier.release(); await durable;
    assert.equal(read(entry).data.allowedKey, "latest-50");
  } finally { barrier.release(); barrier.restore(); }
}));

test("an in-flight checkpoint cannot resurrect an explicitly deleted search", async () => isolated(async directory => {
  const entry = store.createAuctionGearSearch(owner, context()), barrier = compressionBarrier();
  try {
    store.scheduleAuctionGearSearchSave(entry); await barrier.entered;
    assert(store.deleteAuctionGearSearch(owner, entry.id));
    barrier.release(); await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(read(entry), null);
    assert(!(await readdir(directory)).some(name => name.includes(entry.id)));
  } finally { barrier.release(); barrier.restore(); }
}));

test("a newer synchronous checkpoint cannot be overwritten by an older asynchronous write", async () => isolated(async () => {
  const entry = store.createAuctionGearSearch(owner, context()), barrier = compressionBarrier();
  try {
    entry.allowedKey = "old";
    const oldWrite = persistence.writeAuctionStateAsync("search", entry.id, entry.expiresAt, { allowedKey: "old" }, { metadata: read(entry).metadata });
    await barrier.entered;
    entry.allowedKey = "new-durable"; store.saveAuctionGearSearch(entry);
    barrier.release(); assert.equal(await oldWrite, false);
    assert.equal(read(entry).data.allowedKey, "new-durable");
  } finally { barrier.release(); barrier.restore(); }
}));

test("lifecycle renewal during compression survives without losing either checkpoint data or recency", async () => isolated(async () => {
  const entry = store.createAuctionGearSearch(owner, context()), barrier = compressionBarrier();
  try {
    const before = read(entry);
    const writing = persistence.writeAuctionStateAsync("search", entry.id, entry.expiresAt,
      { ...before.data, allowedKey: "renewed" }, { metadata: before.metadata });
    await barrier.entered;
    store.touchAuctionGearSearch(entry);
    const expected = { recency: entry.recency, expiresAt: entry.expiresAt };
    barrier.release(); assert.equal(await writing, true);
    const record = read(entry);
    assert.equal(record.data.allowedKey, "renewed");
    assert.equal(record.metadata.recency, expected.recency);
    assert(record.expiresAt >= expected.expiresAt);
  } finally { barrier.release(); barrier.restore(); }
}));

test("newer asynchronous generations win even when an older compression finishes later", async () => isolated(async () => {
  const entry = store.createAuctionGearSearch(owner, context()), barrier = compressionBarrier(), before = read(entry);
  try {
    const older = persistence.writeAuctionStateAsync("search", entry.id, entry.expiresAt,
      { ...before.data, allowedKey: "older" }, { metadata: before.metadata });
    await barrier.entered;
    const newer = persistence.writeAuctionStateAsync("search", entry.id, entry.expiresAt,
      { ...before.data, allowedKey: "newer" }, { metadata: before.metadata });
    barrier.release();
    assert.deepEqual(await Promise.all([older, newer]), [false, true]);
    assert.equal(read(entry).data.allowedKey, "newer");
  } finally { barrier.release(); barrier.restore(); }
}));

test("deletion during a temporary-file durability barrier cannot resurrect a record", async () => isolated(async directory => {
  const entry = store.createAuctionGearSearch(owner, context()), original = fs.promises.open;
  let enter, release;
  const entered = new Promise(resolve => { enter = resolve; }), barrier = new Promise(resolve => { release = resolve; });
  fs.promises.open = async (...args) => {
    const handle = await original(...args);
    if (String(args[0]).endsWith(".tmp")) {
      const sync = handle.sync.bind(handle);
      handle.sync = async () => { enter(); await barrier; return sync(); };
    }
    return handle;
  };
  syncBuiltinESMExports();
  try {
    const before = read(entry);
    const writing = persistence.writeAuctionStateAsync("search", entry.id, entry.expiresAt,
      { ...before.data, allowedKey: "never-resurrect" }, { metadata: before.metadata });
    await entered;
    store.deleteAuctionGearSearch(owner, entry.id); release();
    assert.equal(await writing, false);
    assert.equal(read(entry), null);
    assert(!(await readdir(directory)).some(name => name.includes(entry.id)));
  } finally { release(); fs.promises.open = original; syncBuiltinESMExports(); }
}));

test("failed asynchronous file IO preserves the previously acknowledged checkpoint and cleans temporary files", async () => isolated(async directory => {
  const entry = store.createAuctionGearSearch(owner, context()), original = fs.promises.open;
  fs.promises.open = async (...args) => {
    const handle = await original(...args);
    if (String(args[0]).endsWith(".tmp")) handle.writeFile = async () => { const error = new Error("synthetic-EIO"); error.code = "EIO"; throw error; };
    return handle;
  };
  syncBuiltinESMExports();
  try {
    entry.allowedKey = "unacknowledged";
    await assert.rejects(store.flushAuctionGearSearch(entry), /auction_storage_unavailable/);
    assert.notEqual(read(entry).data.allowedKey, "unacknowledged");
    assert.equal((await readdir(directory)).filter(name => name.endsWith(".tmp")).length, 0);
  } finally { fs.promises.open = original; syncBuiltinESMExports(); }
  await store.flushAuctionGearSearch(entry);
  assert.equal(read(entry).data.allowedKey, "unacknowledged");
}));

test("background persistence failures reject publication and a later explicit retry can recover", async () => isolated(async () => {
  const entry = store.createAuctionGearSearch(owner, context()), original = zlib.gzip;
  zlib.gzip = (...args) => { const error = new Error("synthetic-EIO"); error.code = "EIO"; queueMicrotask(() => args.at(-1)(error)); };
  syncBuiltinESMExports();
  try {
    entry.allowedKey = "must-be-durable";
    await assert.rejects(store.flushAuctionGearSearch(entry), /auction_storage_unavailable/);
    assert.notEqual(read(entry).data.allowedKey, "must-be-durable");
  } finally { zlib.gzip = original; syncBuiltinESMExports(); }
  await store.flushAuctionGearSearch(entry);
  assert.equal(read(entry).data.allowedKey, "must-be-durable");
}));

test("compressing a substantial checkpoint yields the event loop and preserves private atomic files", async () => isolated(async directory => {
  const entry = store.createAuctionGearSearch(owner, context());
  entry.context.armory.profile.payload = randomBytes(6 * 1024 * 1024);
  let ticks = 0;
  const timer = setInterval(() => { ticks++; }, 1);
  try { await store.flushAuctionGearSearch(entry); }
  finally { clearInterval(timer); }
  assert(ticks >= 2, `Compression and bulk IO must yield, observed ${ticks} timer ticks`);
  const file = join(directory, `search-${entry.id}.bin`);
  assert.equal(fs.statSync(file).mode & 0o077, 0);
  assert.equal(read(entry).data.context.armory.profile.payload.length, 6 * 1024 * 1024);
}));
