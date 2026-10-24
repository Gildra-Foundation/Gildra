import assert from "node:assert/strict";
import { test } from "node:test";
import { auctionQuery } from "../../../lib/wow/auctionBrowser.ts";
import { auctionRealms, browseAuctions } from "../../../lib/wow/auctionBrowserData.ts";
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
    if (url.pathname.endsWith("/realm/index")) return Response.json({ realms: [{ name: "Test", slug: "test" }] });
    if (url.pathname.endsWith("/realm/test")) return Response.json({ connected_realm: { href: "https://eu.api.blizzard.com/data/wow/connected-realm/42" } });
    if (url.pathname.includes("/connected-realm/")) return Response.json({ auctions: [{ id: 1, item: { id: 100 }, quantity: 2, buyout: 200 }] }, { headers: { "last-modified": new Date().toUTCString() } });
    if (url.pathname.includes("/commodities")) return Response.json({ auctions: [{ id: 2, item: { id: 100 }, quantity: 9, unit_price: 80 }] });
    if (url.pathname.includes("/search/item")) { assert.equal(url.searchParams.get("name.ru_RU"), "Тест"); return Response.json({ results: [{ data: { id: 100 } }], pageCount: 2 }); }
    if (url.pathname.includes("/item/")) return Response.json({ name: "Тестовый предмет" });
    throw new Error(`unexpected ${url.pathname}`);
  };
  try {
    const realms = await auctionRealms("eu", "ru"); assert.deepEqual(realms, [{ name: "Test", slug: "test" }]);
    const q = auctionQuery(new URLSearchParams("region=eu&lang=ru&realm=test&q=Тест"));
    const [a, b] = await Promise.all([browseAuctions(q), browseAuctions(q)]);
    assert.equal(a.rows[0].unitPrice, 100); assert.equal(a.rows[0].name, "Тестовый предмет"); assert.equal(a.stale, false);
    assert.equal(a.connectedRealmId, 42); assert(a.sourceUpdatedAt); assert(a.searchTruncated);
    assert(!JSON.stringify(a).includes("test-server-only-token"));
    assert.deepEqual(a, b); assert.equal(calls.filter(p => p.endsWith("/auctions")).length, 1);
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
