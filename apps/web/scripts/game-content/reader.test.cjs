require("./register.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const { createGameContentReader, PublicationNotFound } = require("../../lib/data/gamecontent/reader.ts");

function fixture(edition = "retail", timer = 1800, release = "11111111-1111-4111-8111-111111111111") {
  const context = { game: "wow", edition, channel: "live", region: "global", progressionKind: "none", progressionId: null };
  const snapshotId = "22222222-2222-4222-8222-222222222222";
  return {
    catalog: { schemaVersion: 1, releaseId: release, contentHash: "fixture", generation: 1, context, modules: { "mythic-plus": snapshotId }, publishedAt: "2026-10-21T00:00:00Z" },
    snapshot: { schemaVersion: 1, snapshotId, releaseId: release, context, moduleId: "mythic-plus", payload: {
      edition, catalog: { season: { slug: "test-season" }, dungeonOrder: ["fixture"] },
      dungeons: { fixture: { slug: "fixture", timerSeconds: timer, bossCount: 1 } }, combatIntel: { fixture: {} }, verification: {},
    } },
  };
}

test("reads the module belonging to the exact release and refreshes without code changes", async () => {
  let data = fixture();
  const calls = [];
  const read = createGameContentReader("http://localhost:15474", async (url) => { calls.push(url); return url.endsWith("catalog") ? data.catalog : data.snapshot; });
  const first = await read("retail", "mythic-plus");
  data = fixture("retail", 1860, "33333333-3333-4333-8333-333333333333");
  const next = await read("retail", "mythic-plus");
  assert.equal(first.payload.dungeons.fixture.timerSeconds, 1800);
  assert.equal(next.payload.dungeons.fixture.timerSeconds, 1860);
  assert.equal(next.stale, false);
  assert.ok(calls[3].includes(data.catalog.releaseId));
});

test("failed new snapshot returns the complete previous release, not mixed data", async () => {
  let data = fixture(); let fail = false;
  const read = createGameContentReader("http://localhost", async (url) => {
    if (url.endsWith("catalog")) return data.catalog;
    if (fail) throw new Error("offline");
    return data.snapshot;
  });
  const first = await read("retail", "mythic-plus");
  data = fixture("retail", 1900, "33333333-3333-4333-8333-333333333333"); fail = true;
  const previous = await read("retail", "mythic-plus");
  assert.equal(previous.release.releaseId, first.release.releaseId);
  assert.equal(previous.payload.dungeons.fixture.timerSeconds, 1800);
  assert.equal(previous.stale, true);
});

test("a retail cache cannot satisfy Forever or an unavailable first request", async () => {
  const data = fixture();
  const read = createGameContentReader("http://localhost", async (url) => url.endsWith("catalog") ? data.catalog : data.snapshot);
  await read("retail", "mythic-plus");
  await assert.rejects(read("forever", "mythic-plus"), /Incompatible/);
  const offline = createGameContentReader("http://localhost", async () => { throw new Error("offline"); });
  await assert.rejects(offline("retail", "mythic-plus"), /offline/);
});

test("wrong snapshot IDs, context, schema and invalid timers are rejected", async () => {
  for (const mutate of [
    (d) => { d.snapshot.snapshotId = "wrong"; },
    (d) => { d.snapshot.schemaVersion = 2; },
    (d) => { d.snapshot.context = { ...d.snapshot.context, edition: "forever" }; },
    (d) => { d.snapshot.payload.dungeons.fixture.timerSeconds = 0; },
  ]) {
    const data = fixture(); mutate(data);
    const read = createGameContentReader("http://localhost", async (url) => url.endsWith("catalog") ? data.catalog : data.snapshot);
    await assert.rejects(read("retail", "mythic-plus"));
  }
});

test("credentials in the API URL are rejected before any request", () => {
  assert.throws(() => createGameContentReader("https://user:password@example.test", async () => null), /Invalid/);
});

test("immutable payload is reused while the publication pointer is checked", async () => {
  const data = fixture(); const calls = [];
  const read = createGameContentReader("http://localhost", async (url) => { calls.push(url); return url.endsWith("catalog") ? data.catalog : data.snapshot; });
  await read("retail", "mythic-plus"); await read("retail", "mythic-plus");
  assert.equal(calls.filter((url) => url.endsWith("catalog")).length, 2);
  assert.equal(calls.filter((url) => url.endsWith("mythic-plus")).length, 1);
});

test("authoritative withdrawal clears the formerly public cache", async () => {
  const data = fixture(); let withdrawn = false;
  const read = createGameContentReader("http://localhost", async (url) => {
    if (withdrawn) throw new PublicationNotFound("withdrawn");
    return url.endsWith("catalog") ? data.catalog : data.snapshot;
  });
  await read("retail", "mythic-plus"); withdrawn = true;
  await assert.rejects(read("retail", "mythic-plus"), PublicationNotFound);
  await assert.rejects(read("retail", "mythic-plus"), PublicationNotFound);
});
