import assert from "node:assert/strict";
import test from "node:test";
import { auctionGearProfileFingerprint as fingerprint } from "../../../lib/wow/auctionGearFingerprint.ts";

// Source: SimC18428cd, engine/player/azerite_data.cpp::parse_blizzard_azerite_information.
// Descriptions and links are synthetic presentation; native IDs/ranks/level are mechanics.
const snapshot = () => ({ profile: { level: 81, character_class: { id: 1 }, race: { id: 1 } },
  activeSpecializationId: 72, activeTalentLoadout: "synthetic", equipment: { equipped_items: [{
    slot: { type: "CHEST" }, item: { id: 999001 }, azerite_details: {
      selected_powers: [{ id: 1, name: "Synthetic A" }, { id: 2, name: "Synthetic B" }],
      selected_essences: [{ slot: 0, essence: { id: 3, name: "Synthetic major" }, rank: 2 }],
      level: { value: 20, display_string: "Synthetic level" },
    },
  }] } });
const details = value => value.equipment.equipped_items[0].azerite_details;
test("fingerprint: Azerite localized text and links preserve mechanical identity", () => {
  const before = snapshot(), after = structuredClone(before);
  details(after).selected_powers[0].name = "Синтетическое имя";
  details(after).selected_powers[0].description = "Synthetic description";
  details(after).selected_essences[0].essence.name = "Новое имя";
  details(after).level.display_string = "Уровень20";
  details(after)._links = { self: { href: "https://example.invalid/changed" } };
  assert.equal(fingerprint(after), fingerprint(before));
});
test("fingerprint: Azerite power ordering preserves mechanical identity", () => {
  const before = snapshot(), after = structuredClone(before);
  details(after).selected_powers.reverse();
  assert.equal(fingerprint(after), fingerprint(before));
});
test("fingerprint: Azerite power, essence, rank, major slot and level changes invalidate", () => {
  const before = snapshot();
  for (const mutate of [d => d.selected_powers[0].id++, d => d.selected_essences[0].essence.id++,
    d => d.selected_essences[0].rank++, d => d.selected_essences[0].slot = 1, d => d.level.value++]) {
    const after = structuredClone(before);mutate(details(after));
    assert.notEqual(fingerprint(after), fingerprint(before));
  }
});
