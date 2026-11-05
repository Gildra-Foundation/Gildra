import assert from "node:assert/strict";
import test from "node:test";
import { serviceAuctionRealm } from "../../../lib/wow/auctionBrowser.ts";

// Slugs from Blizzard's realm index (EU/US/KR/TW, 2026-11-05).
const service = [
  "eu1a1inst", "eu4a4instsl", "eu4b1instbfa", "eu1a-account-realm", "us3a-account-realm-old-au", "eu4-100-partner",
  "eu4-auxiliary-70", "tw4-auxiliary-170", "eu7abgru", "au2a3inst", "kr1a1inst", "tw2a1instdft", "rdb-eu", "zzzrdb-eu",
  "rdb-tw", "eu-arena-pass-csbg", "eu-arena-pass-csbg-2", "gmsupport-tw201",
];
const playable = ["silvermoon", "gordunni", "area-52", "azjolnerub", "arakarahm", "sinstralis", "twisting-nether", "eonar", "kazzak"];

test("internal Blizzard realms are not offered on the auction page", () => {
  for (const slug of service) assert.equal(serviceAuctionRealm(slug), true, slug);
});

test("playable realms stay, including names with digits", () => {
  for (const slug of playable) assert.equal(serviceAuctionRealm(slug), false, slug);
});
