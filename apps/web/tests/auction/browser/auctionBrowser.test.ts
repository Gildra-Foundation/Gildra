import assert from "node:assert/strict";
import { test } from "node:test";
import { auctionQuery, parseAuctionListings, auctionPage, copperParts } from "../../../lib/wow/auctionBrowser.ts";
const query = (s = "") => auctionQuery(new URLSearchParams(s));
test("validate region, name, realm, IDs and pagination before API access", () => {
  assert.equal(query().region, "eu");
  assert.equal(query("realm=la-croisade-écarlate").realm, "la-croisade-écarlate");
  assert.equal(query("realm=гордунни").realm, "гордунни");
  for (const s of ["region=cn", "lang=fr", "realm=../../etc", "page=0", "page=1.5", "page=Infinity", "q=a", "q=0", "q=99999999999999999", "market=classic", "sort=bid"]) assert.throws(() => query(s), /invalid_query/, s);
  assert.equal(query("q=Зелье&lang=ru").q, "Зелье");
  assert.equal(query("q=1").q, "1");
});
test("lot buyout is divided by stack size; bid-only auctions stay bid-only", () => {
  const rows = parseAuctionListings({ auctions: [
    { id: 1, item: { id: 100 }, quantity: 10, buyout: 10000, bid: 5000 },
    { id: 2, item: { id: 100 }, quantity: 3, bid: 6000 },
  ] }, "realm");
  assert.equal(rows[0].unitPrice, 1000); assert.equal(rows[0].buyout, 10000);
  assert.equal(rows[1].unitPrice, null); assert.equal(rows[1].buyout, null); assert.equal(rows[1].bid, 6000);
});
test("commodity unit price never becomes a fictitious lot buyout", () => {
  const [row] = parseAuctionListings({ auctions: [{ id: 5, item: { id: 9 }, quantity: 1000, unit_price: 150 }] }, "commodities");
  assert.equal(row.unitPrice, 150); assert.equal(row.buyout, null);
});
test("pet listings and gear variants remain independent", () => {
  const rows = parseAuctionListings({ auctions: [
    { id: 1, item: { id: 100, pet_species_id: 7 }, quantity: 1, buyout: 4000 },
    { id: 2, item: { id: 100, context: 2, bonus_lists: [5, 6], modifiers: [{ type: 9, value: 0 }] }, quantity: 1, buyout: 5000 },
  ] }, "realm");
  assert.equal(rows.length, 2); assert.equal(rows[0].petSpeciesId, 7);
  assert.deepEqual(rows[1].bonusIds, [5, 6]); assert.deepEqual(rows[1].modifiers, [{ type: 9, value: 0 }]);
});
test("malformed snapshots fail rather than fabricating empty markets", () => {
  for (const payload of [{}, { auctions: [{ id: 1 }] }, { auctions: [{ id: 1, item: { id: 5 }, quantity: 0 }] }, { auctions: [{ id: 1, item: { id: 5 }, quantity: 1, buyout: -1 }] }]) assert.throws(() => parseAuctionListings(payload, "realm"));
  assert.throws(() => parseAuctionListings({ auctions: [{ id: 1, item: { id: 5 }, quantity: 1 }] }, "commodities"));
});
test("sorting uses unit price, keeps bids last, filters by ID before paging", () => {
  const rows = parseAuctionListings({ auctions: Array.from({ length: 85 }, (_, i) => ({ id: i + 1, item: { id: i % 2 ? 100 : 200 }, quantity: i + 1, ...(i === 0 ? { bid: 5 } : { buyout: 10000 }) })) }, "realm");
  const cheapest = auctionPage(rows, query()); assert.equal(cheapest.rows[0].id, 85); assert.equal(cheapest.total, 85); assert.equal(cheapest.pages, 3);
  const last = auctionPage(rows, query("page=999")); assert.equal(last.page, 3); assert.equal(last.rows.at(-1)?.id, 1);
  const filtered = auctionPage(rows, query(), new Set([100])); assert.equal(filtered.total, 42); assert.equal(filtered.pages, 2);
  assert.deepEqual(auctionPage(rows, query(), new Set()).rows, []);
});
test("copper formatting preserves gold, silver, copper and rounds fractional units up", () => {
  assert.deepEqual(copperParts(123456), { gold: 12, silver: 34, copper: 56 });
  assert.deepEqual(copperParts(9999.5), { gold: 1, silver: 0, copper: 0 });
});
