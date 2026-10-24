import assert from "node:assert/strict";
import { test } from "node:test";
import { auctionQuery } from "../../../lib/wow/auctionBrowser.ts";
import { auctionRealms, browseAuctions, auctionLotTooltip } from "../../../lib/wow/auctionBrowserData.ts";
import { wowheadTooltipLines, resolveExactAuctionTooltip } from "../../../lib/wow/auctionExactTooltip.ts";
import { auctionItemIcon, parseAuctionItemDetails, auctionPreviewMatches } from "../../../lib/wow/auctionItemDetails.ts";
const originalFetch = globalThis.fetch;
test("game tooltip text must match exact native level, stats, requirements and weapon", () => {
  const exact = { itemLevel: 25, requiredLevel: 8, stats: { agility: 3, stamina: 5 } };
  const html = '<b>Sword</b><br><!--ilvl-->25<br><!--stat3-->+3 Agility<br><!--stat7-->+5 Stamina<br><!--rlvl-->8<script>attack()</script><div class="whtt-sellprice">NPC price</div>';
  assert.deepEqual(wowheadTooltipLines(html, exact), ["Sword", "25", "+3 Agility", "+5 Stamina", "8"]);
  assert.equal(wowheadTooltipLines(html.replace("<!--stat3-->+3", "<!--stat3-->+4"), exact), null);
  assert.equal(wowheadTooltipLines(html.replace("<!--ilvl-->25", "<!--ilvl-->59"), exact), null);
  assert.equal(wowheadTooltipLines(html + "<!--rtg32-->+99", exact), null);
  assert.equal(wowheadTooltipLines(html.replace("<!--rlvl-->8", "<!--rlvl-->80"), exact), null);
});
test("bonus-only game tooltips receive actual bonuses without an invented item level", async () => {
  globalThis.fetch = async input => {
    const url = new URL(String(input)); assert.equal(url.hostname, "nether.wowhead.com");
    assert.equal(url.searchParams.get("bonus"), "6654:1679"); assert(!url.searchParams.has("ilvl")); assert(!url.searchParams.has("lvl"));
    return Response.json({ quality: 2, tooltip: '<b>Sword of the Quickblade</b><br><!--ilvl-->74<br><!--stat3-->+8 Agility<br><!--rtg32-->+8 Critical Strike<br><!--dmg-->18 - 31<br><!--spd-->2.60<br><!--rlvl-->8' });
  };
  try {
    const row = { id: 1, itemId: 15211, quantity: 1, unitPrice: 10000, buyout: 10000, bid: null, timeLeft: "LONG", context: 0, bonusIds: [6654, 1679], modifiers: [] } as Parameters<typeof resolveExactAuctionTooltip>[0];
    const item = parseAuctionItemDetails({ id: 15211, name: "Sword", item_class: { id: 2 }, inventory_type: { type: "WEAPON" }, quality: { type: "UNCOMMON" } }, 15211, null);
    const exact = await resolveExactAuctionTooltip(row, item, "en");
    assert.equal(exact.resolution, "wowhead-bonuses"); assert.equal(exact.itemLevel, 74); assert.equal(exact.stats.crit_rating, 8); assert.equal(exact.weapon?.maxDamage, 31);
  } finally { globalThis.fetch = originalFetch; }
});
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

test("exact tooltip resolves actual market lot modifiers, isolates variants and deduplicates native work", async () => {
  const before = { id: process.env.BATTLENET_CLIENT_ID, secret: process.env.BATTLENET_CLIENT_SECRET, worker: process.env.ROTATION_WORKER_URL };
  process.env.BATTLENET_CLIENT_ID = "test-client"; process.env.BATTLENET_CLIENT_SECRET = "test-secret"; process.env.ROTATION_WORKER_URL = "http://native.test";
  (globalThis as typeof globalThis & { __auctionBrowser?: Map<string, unknown> }).__auctionBrowser?.clear();
  let resolutions = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "oauth.battle.net") return Response.json({ access_token: "private-test-token", expires_in: 86400 });
    if (url.pathname.endsWith("/realm/index")) return Response.json({ realms: [{ name: "Test", slug: "test" }] });
    if (url.pathname.endsWith("/realm/test")) return Response.json({ connected_realm: { href: "https://eu.api.blizzard.com/data/wow/connected-realm/42" } });
    if (url.pathname.endsWith("/auctions")) return Response.json({ auctions: [31, 41].map((level, i) => ({ id: 111 + i, quantity: 1, buyout: 10000, item: { id: 15211, bonus_lists: [6655, 1708 + i], modifiers: [{ type: 9, value: level }, { type: 28, value: 15 }] } })) });
    if (url.pathname.includes("/media/item/")) return Response.json({ assets: [] });
    if (url.pathname === "/data/wow/item/15211") return Response.json({ id: 15211, name: "Sword", item_class: { id: 2 }, item_subclass: { id: 7 }, inventory_type: { type: "WEAPON" }, quality: { type: "UNCOMMON" }, preview_item: { level: { display_string: "BASE 59" } } });
    if (url.hostname === "native.test") {
      resolutions++;
      const request = JSON.parse(String(init?.body)), variant = request.variants[0];
      assert.deepEqual(variant.change.modifiers[1], { type: 28, value: 15 });
      const level = variant.change.modifiers[0].value === 31 ? 25 : 35;
      return Response.json({ engine: "SimulationCraft test", variants: [{ key: variant.key, itemId: 15211, itemLevel: level, requiredLevel: 8, quality: 2, stats: { agility: level === 25 ? 3 : 5 }, weapon: { minDamage: 7, maxDamage: 12, speedSeconds: 2.6, dps: 3.65 } }] }, { headers: { "x-gildra-engine": "simulationcraft" } });
    }
    if (url.hostname === "nether.wowhead.com") {
      assert(url.searchParams.has("bonus")); assert(url.searchParams.has("lvl"));
      const level = Number(url.searchParams.get("ilvl"));
      return Response.json({ quality: 2, tooltip: `<b>Sword ${level}</b><br><!--ilvl-->${level}<br><!--stat3-->+${level === 25 ? 3 : 5} Agility<br><!--dmg-->7 - 12<br><!--spd-->2.60<br><!--rlvl-->8` });
    }
    throw new Error("unexpected_request");
  };
  try {
    const query = auctionQuery(new URLSearchParams("realm=test&lang=en"));
    const [a, b] = await Promise.all([auctionLotTooltip(query, 111), auctionLotTooltip(query, 111)]);
    assert.deepEqual(a, b); assert.equal(resolutions, 1); assert.equal(a.itemLevel, 25); assert.deepEqual(a.stats, { agility: 3 }); assert(a.lines);
    const other = await auctionLotTooltip(query, 112); assert.equal(resolutions, 2); assert.equal(other.itemLevel, 35); assert.deepEqual(other.stats, { agility: 5 });
    await assert.rejects(auctionLotTooltip(query, 999), /listing_not_found/); assert.equal(resolutions, 2);
    assert(!JSON.stringify(a).includes("private-test-token"));
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of [["BATTLENET_CLIENT_ID", before.id], ["BATTLENET_CLIENT_SECRET", before.secret], ["ROTATION_WORKER_URL", before.worker]]) { if (value === undefined) delete process.env[key!]; else process.env[key!] = value; }
  }
});
