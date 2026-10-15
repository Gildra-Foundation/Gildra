// Synthetic private contexts exercise lifetime/ownership only, never live gear data.
import assert from "node:assert/strict";
import {createAuctionGearSearch, getAuctionGearSearch, touchAuctionGearSearch, deleteAuctionGearSearch} from "../lib/wow/auctionGearSearchStore.ts";
const actualNow = Date.now;
let now = actualNow();
Date.now = () => now;
const context = { input: { characterSlug: "synthetic-test", selectedSlots: ["HEAD"] }, simulate: async () => ({}) };
try {
  const original = createAuctionGearSearch("owner-a", context);
  assert.match(original.id, /^[0-9a-f-]{36}$/);assert.equal(original.context, context);assert.equal(original.busy, false);
  assert.equal(getAuctionGearSearch("owner-b", original.id), null);assert.equal(deleteAuctionGearSearch("owner-b", original.id), false);
  const expiry = original.expiresAt;now += 60_000;
  assert.equal(getAuctionGearSearch("owner-b", original.id), null);assert.equal(original.expiresAt, expiry, "Another owner cannot extend retention");
  assert.equal(getAuctionGearSearch("owner-a", original.id), original);assert(original.expiresAt > expiry);
  now += 29 * 60_000;assert.equal(getAuctionGearSearch("owner-a", original.id), original, "Owner reads renew the sliding lifetime");
  now += 30 * 60_000;assert.equal(getAuctionGearSearch("owner-a", original.id), null);assert.throws(() => touchAuctionGearSearch(original), /search_expired/);
  const first = createAuctionGearSearch("owner-limit", context), second = createAuctionGearSearch("owner-limit", context), third = createAuctionGearSearch("owner-limit", context);
  touchAuctionGearSearch(first);
  const fourth = createAuctionGearSearch("owner-limit", context);
  assert.equal(getAuctionGearSearch("owner-limit", second.id), null, "Least recently touched owner search is evicted");
  assert(getAuctionGearSearch("owner-limit", first.id));assert(getAuctionGearSearch("owner-limit", third.id));assert(getAuctionGearSearch("owner-limit", fourth.id));
  for (const entry of [first, third, fourth]) entry.busy = true;
  assert.throws(() => createAuctionGearSearch("owner-limit", context), /search_capacity/);
  now += 31 * 60_000;
  assert.equal(getAuctionGearSearch("owner-limit", first.id), first, "Active work survives idle cleanup");
  for (const entry of [first, third, fourth]) { entry.busy = false;deleteAuctionGearSearch("owner-limit", entry.id); }
  const all = Array.from({length: 40}, (_, index) => createAuctionGearSearch(`global-${index}`, context));
  all[0].busy = true;touchAuctionGearSearch(all[1]);
  const newest = createAuctionGearSearch("global-new", context);
  assert(getAuctionGearSearch("global-0", all[0].id));assert(getAuctionGearSearch("global-1", all[1].id));
  assert.equal(getAuctionGearSearch("global-2", all[2].id), null, "Global eviction skips busy and recently read entries");
  for (const entry of [...all, newest]) if (getAuctionGearSearch(entry.owner, entry.id)) entry.busy = true;
  assert.throws(() => createAuctionGearSearch("global-overflow", context), /search_capacity/);
  assert.equal(deleteAuctionGearSearch("global-new", newest.id), true, "Explicit owner cancellation may remove its unpublished busy context");
} finally { Date.now = actualNow; }
console.log("Auction private search store checks passed: owner isolation, sliding expiry, owner/global recency limits, protected busy work and explicit owner deletion (offline fixtures only).");
