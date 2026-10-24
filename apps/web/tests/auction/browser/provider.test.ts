import assert from "node:assert/strict";
import { test } from "node:test";
import { auctionQuery } from "../../../lib/wow/auctionBrowser.ts";
import { auctionRealms, browseAuctions } from "../../../lib/wow/auctionBrowserData.ts";
import { auctionItemIcon, parseAuctionItemDetails, auctionPreviewMatches } from "../../../lib/wow/auctionItemDetails.ts";
const originalFetch = globalThis.fetch;
test("public Blizzard integration: credentials server-only, shared snapshots, realms, name search, timestamps and errors", async () => {
  const originalId = process.env.BATTLENET_CLIENT_ID, originalSecret = process.env.BATTLENET_CLIENT_SECRET;
  process.env.BATTLENET_CLIENT_ID = "test-client"; process.env.BATTLENET_CLIENT_SECRET = "test-secret";
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input)); calls.push(url.pathname);
    assert(!url.searchParams.has("access_token"));
    if (url.hostname === "oauth.battle.net") {
      assert.equal(init?.body, "grant_type=client_credentials");
      return Response.json({ access_token: "test-server-only-token", expires_in: 86400 });
    }
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer test-server-only-token");
    if (url.pathname.endsWith("/realm/index")) return Response.json({ realms: [{ name: "Test", slug: "test" }, { name: "La Croisade écarlate", slug: "la-croisade-écarlate" }, { name: null, slug: "eu4-auxiliary" }] });
    if (url.pathname.endsWith("/realm/test")) return Response.json({ connected_realm: { href: "https://eu.api.blizzard.com/data/wow/connected-realm/42" } });
    if (url.pathname.includes("/connected-realm/")) return Response.json({ auctions: [{ id: 1, item: { id: 100 }, quantity: 2, buyout: 200 }] }, { headers: { "last-modified": new Date().toUTCString() } });
    if (url.pathname.includes("/commodities")) return Response.json({ auctions: [{ id: 2, item: { id: 100 }, quantity: 9, unit_price: 80 }] });
    if (url.pathname.includes("/search/item")) { assert.equal(url.searchParams.get("name.ru_RU"), "Тест"); return Response.json({ results: [{ data: { id: 100, name: { ru_RU: "Тестовый предмет" } } }, { data: { id: 200, name: { ru_RU: "Неподходящий предмет" } } }], pageCount: 2 }); }
    if (url.pathname.includes("/media/item/")) return Response.json({ assets: [{ key: "icon", value: "https://render.worldofwarcraft.com/eu/icons/56/test.jpg" }] });
    if (url.pathname.includes("/item/")) return Response.json({ id: 100, name: "Тестовый предмет", preview_item: { level: { display_string: "Уровень предмета: 90" }, stats: [{ display: { display_string: "+25 к силе" } }] } });
    throw new Error(`unexpected ${url.pathname}`);
  };
  try {
    const realms = await auctionRealms("eu", "ru"); assert.equal(realms.length, 2); assert(realms.some(r => r.slug === "la-croisade-écarlate")); assert(!realms.some(r => r.slug === "eu4-auxiliary"));
    const q = auctionQuery(new URLSearchParams("region=eu&lang=ru&realm=test&q=Тест"));
    const [a, b] = await Promise.all([browseAuctions(q), browseAuctions(q)]);
    assert.equal(a.rows[0].unitPrice, 100); assert.equal(a.rows[0].name, "Тестовый предмет"); assert.equal(a.stale, false);
    assert.equal(a.connectedRealmId, 42); assert(a.sourceUpdatedAt); assert(a.searchTruncated);
    assert.equal(a.rows[0].item?.iconUrl, "https://render.worldofwarcraft.com/eu/icons/56/test.jpg");
    assert.deepEqual(a.rows[0].item?.stats, ["+25 к силе"]);
    assert(!JSON.stringify(a).includes("test-server-only-token"));
    assert.deepEqual(a, b); assert.equal(calls.filter(p => p.endsWith("/auctions")).length, 1);
    assert.equal(calls.filter(p => p === "/data/wow/media/item/100").length, 1);
    const commodity = await browseAuctions({ ...q, market: "commodities", q: "100" });
    assert.equal(commodity.rows[0].unitPrice, 80); assert.equal(commodity.rows[0].buyout, null);
    assert.equal(commodity.sourceUpdatedAt, null); assert.equal(commodity.stale, true);
    await assert.rejects(browseAuctions({ ...q, realm: "unknown" }), /invalid_realm/);
    assert.equal(calls.filter(p => p === "/token").length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalId === undefined) delete process.env.BATTLENET_CLIENT_ID; else process.env.BATTLENET_CLIENT_ID = originalId;
    if (originalSecret === undefined) delete process.env.BATTLENET_CLIENT_SECRET; else process.env.BATTLENET_CLIENT_SECRET = originalSecret;
  }
});

test("localized item preview keeps variant identity, rejects foreign icons and bounds external text", () => {
  const item = parseAuctionItemDetails({ id: 123, name: "Sword", preview_item: { context: 2, bonus_list: [4, 3], modifiers: [{ type: 9, value: 80 }], stats: [{ display: { display_string: "+10 Strength" } }], spells: [{ description: "Effect" }], weapon: { damage: { display_string: "10–20 Damage" } } } }, 123, null);
  const row = { itemId: 123, context: 2, bonusIds: [3, 4], modifiers: [{ type: 9, value: 80 }] } as Parameters<typeof auctionPreviewMatches>[0];
  assert(auctionPreviewMatches(row, item));
  assert(!auctionPreviewMatches({ ...row, bonusIds: [4, 5] }, item));
  assert(!auctionPreviewMatches({ ...row, modifiers: [{ type: 9, value: 90 }] }, item));
  assert(!auctionPreviewMatches({ ...row, petSpeciesId: 42 }, item));
  assert.deepEqual(item.stats, ["+10 Strength"]); assert.deepEqual(item.weapon, ["10–20 Damage"]);
  for (const value of ["javascript:alert(1)", "https://evil.invalid/icon.jpg", "https://render.worldofwarcraft.com.evil.invalid/icon.jpg", "https://user:password@render.worldofwarcraft.com/icon.jpg"]) assert.equal(auctionItemIcon({ assets: [{ key: "icon", value }] }), null);
  assert.throws(() => parseAuctionItemDetails({ id: 999 }, 123, null), /invalid_item_metadata/);
});

test("missing server credentials produce a distinct configuration error without network calls", async () => {
  const originalId = process.env.BATTLENET_CLIENT_ID, originalSecret = process.env.BATTLENET_CLIENT_SECRET;
  delete process.env.BATTLENET_CLIENT_ID; delete process.env.BATTLENET_CLIENT_SECRET;
  (globalThis as typeof globalThis & { __auctionBrowser?: Map<string, unknown> }).__auctionBrowser?.clear();
  globalThis.fetch = async () => { assert.fail("No network request may be sent without server credentials"); };
  try { await assert.rejects(auctionRealms("us", "en"), /not_configured/); }
  finally {
    globalThis.fetch = originalFetch;
    if (originalId === undefined) delete process.env.BATTLENET_CLIENT_ID; else process.env.BATTLENET_CLIENT_ID = originalId;
    if (originalSecret === undefined) delete process.env.BATTLENET_CLIENT_SECRET; else process.env.BATTLENET_CLIENT_SECRET = originalSecret;
  }
});
