// Synthetic transport fixtures for offline regression tests only; never live data.
import assert from "node:assert/strict";
import { getAuctionEquippedPresentation } from "../lib/wow/auctionGearEquipment.ts";

const character = { id: 123, name: "Testcharacter", region: "eu", realm: { id: 456, slug: "test-realm" } };
const item = { item: { id: 100 }, slot: { type: "HEAD" }, name: "Test helm", level: { value: 139 }, context: 17, bonus_list: [10, 20], quality: { type: "RARE", name: "Rare" }, inventory_type: { type: "HEAD" }, requirements: { level: { value: 78, display_string: "Requires level 78" } }, stats: [{ type: { type: "STRENGTH", name: "Strength" }, value: 31, display: { display_string: "+31 Strength" } }], spells: [{ spell: { id: 900, name: "Test effect" }, description: "Equip: Actual test effect 15." }], armor: { value: 50 }, modifiers: [{ type: 9, value: 81 }], enchantments: [{ enchantment_id: 5, enchantment_slot: { id: 0 } }], sockets: [{ socket_type: { type: "PRISMATIC" }, item: { id: 700 } }] };
const equipment = { character: { id: character.id, realm: { id: character.realm.id } }, equipped_items: [item] };
const original = structuredClone(equipment);
const translated = structuredClone(equipment);
Object.assign(translated.equipped_items[0], { name: "Тестовый шлем", bonus_list: [20, 10], spells: [{ spell: { id: 900, name: "Тестовый эффект" }, description: "Если на персонаже: настоящий тестовый эффект 15." }] });
translated.equipped_items[0].stats[0].display.display_string = "+31 Сила";
const request = { character, equipment, locale: "ru", token: "synthetic-secret-token", signal: new AbortController().signal };
const originalFetch = globalThis.fetch;
try {
  let calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url: new URL(url), init }); return new Response(JSON.stringify(translated)); };
  const english = await getAuctionEquippedPresentation({ ...request, locale: "en" });
  assert.equal(calls.length, 0);assert.equal(english.get("HEAD").name, "Test helm");assert.deepEqual(english.get("HEAD").effects, ["Equip: Actual test effect 15."]);
  const russian = await getAuctionEquippedPresentation(request);
  assert.deepEqual(russian.get("HEAD"), { itemId: 100, name: "Тестовый шлем", effects: ["Если на персонаже: настоящий тестовый эффект 15."] });
  assert.deepEqual(equipment, original, "Canonical simulation values must remain unchanged");
  assert.deepEqual(Object.keys(russian.get("HEAD")).sort(), ["effects", "itemId", "name"]);
  assert.equal(calls[0].url.origin, "https://eu.api.blizzard.com");assert.equal(calls[0].url.pathname, "/profile/wow/character/test-realm/testcharacter/equipment");
  assert.equal(calls[0].url.searchParams.get("locale"), "ru_RU");assert.equal(calls[0].url.searchParams.get("namespace"), "profile-eu");
  assert.equal(calls[0].init.headers.Authorization, "Bearer synthetic-secret-token");assert.equal(calls[0].init.cache, "no-store");assert(calls[0].init.signal instanceof AbortSignal);
  const changed = [
    value => { value.character.id++; }, value => { value.character.realm.id++; },
    value => { value.equipped_items[0].item.id++; }, value => { value.equipped_items[0].slot.type = "WRIST"; },
    value => { value.equipped_items[0].level.value++; }, value => { value.equipped_items[0].context++; },
    value => { value.equipped_items[0].bonus_list.push(30); }, value => { value.equipped_items[0].modifiers[0].value++; },
    value => { value.equipped_items[0].stats[0].value++; }, value => { value.equipped_items[0].armor.value++; },
    value => { value.equipped_items[0].spells[0].spell.id++; }, value => { value.equipped_items[0].sockets[0].item.id++; },
    value => { value.equipped_items[0].enchantments[0].enchantment_id++; }, value => { value.equipped_items.push({ ...structuredClone(value.equipped_items[0]), slot: { type: "WRIST" } }); },
  ];
  for (const mutate of changed) {
    const value = structuredClone(translated);mutate(value);globalThis.fetch = async () => new Response(JSON.stringify(value));
    await assert.rejects(getAuctionEquippedPresentation(request), /character_snapshot_changed/);
  }
  for (const value of [{}, { ...translated, equipped_items: [translated.equipped_items[0], translated.equipped_items[0]] }]) {
    globalThis.fetch = async () => new Response(JSON.stringify(value));await assert.rejects(getAuctionEquippedPresentation(request), /character_snapshot_changed|equipment_presentation_unavailable/);
  }
  for (const response of [new Response("unavailable", { status: 503 }), new Response("not-json"), new Response("x".repeat(3 * 1024 * 1024))]) {
    globalThis.fetch = async () => response;await assert.rejects(getAuctionEquippedPresentation(request), /equipment_presentation_unavailable/);
  }
  globalThis.fetch = async () => new Response("expired", { status: 401 });await assert.rejects(getAuctionEquippedPresentation(request), /session_expired/);
  globalThis.fetch = async () => { throw new Error("upstream URL and synthetic-secret-token must not escape"); };
  await assert.rejects(getAuctionEquippedPresentation(request), error => error.message === "equipment_presentation_unavailable" && !error.message.includes(request.token));
  const controller = new AbortController();controller.abort();calls = [];
  globalThis.fetch = async (...args) => { calls.push(args);throw new Error("must not fetch"); };
  await assert.rejects(getAuctionEquippedPresentation({ ...request, signal: controller.signal }), /abort/i);assert.equal(calls.length, 0);
} finally { globalThis.fetch = originalFetch; }
console.log("Auction equipped presentation checks passed: official RU text, exact item/slot variants, immutable canonical numbers, bounded authenticated transport and cancellation (offline fixtures only).");
