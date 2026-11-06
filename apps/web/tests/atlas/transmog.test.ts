import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { chrModelIdForRace } from "../../lib/wow/chrModels.ts";
import { chrModelId, classArmor, classIds, singleBody, transmogRaces, type TransmogAppearance } from "../../lib/wow/transmog/model.ts";
import {
  groupVariants, lookIds, offsetCursor, outfitArmor, playerSet, pushHistory, randomOffset, toggleHidden, wearLook, wearSet,
} from "../../lib/wow/transmog/outfit.ts";
import { defaultTransmogState, parseTransmogState, serializeTransmogState } from "../../lib/wow/transmog/state.ts";
import { transmogCopy } from "../../components/wow/transmog/transmogCopy.ts";

const look = (slot: TransmogAppearance["slot"], id: number, extra: Partial<TransmogAppearance> = {}): TransmogAppearance => ({
  modifiedAppearanceId: id, appearanceId: id + 1000, displayId: id + 2000, itemId: id + 3000, inventoryType: 1, slot, viewerSlot: 1,
  name: `Look ${id}`, quality: 4, iconName: "inv_icon", armor: "plate", itemCount: 1, ...extra,
});

describe("transmog share link", () => {
  it("the default outfit has an empty query", () => {
    assert.equal(serializeTransmogState(defaultTransmogState), "");
    assert.deepEqual(parseTransmogState(new URLSearchParams("")), defaultTransmogState);
  });

  it("round-trips every part of the state", () => {
    const state = {
      ...defaultTransmogState, race: "void-elf" as const, gender: "f" as const, cls: "priest" as const,
      looks: { head: 220114, "main-hand": 316217 }, hidden: ["back" as const, "tabard" as const],
      format: "9x16" as const, background: "night", pose: "EmoteDance" as const, title: "Shadow", subtitle: "Silvermoon", mark: false,
    };
    const query = serializeTransmogState(state);
    assert.deepEqual(parseTransmogState(new URLSearchParams(query)), state);
    assert.match(query, /race=void-elf/);
    assert.match(query, /c=priest/);
    assert.match(query, /s=head\.220114~main-hand\.316217/);
  });

  it("reads old links and ignores broken parts", () => {
    const state = parseTransmogState(new URLSearchParams("race=elf&g=x&c=bard&s=head.abc~legs.0~boots.5~feet.42~chest.-3&hide=back~back~nope&f=3x2&bg=nope&pose=Fly&mark=1"));
    assert.equal(state.race, "human");
    assert.equal(state.gender, "m");
    assert.equal(state.cls, "");
    assert.deepEqual(state.looks, { feet: 42 });
    assert.deepEqual(state.hidden, ["back"]);
    assert.equal(state.format, defaultTransmogState.format);
    assert.equal(state.background, defaultTransmogState.background);
    assert.equal(state.pose, "Stand");
    assert.equal(state.mark, true);
  });

  it("keeps captions with separators intact", () => {
    const state = { ...defaultTransmogState, title: "Dawn ~ Dusk & co", subtitle: "a.b~c" };
    assert.deepEqual(parseTransmogState(new URLSearchParams(serializeTransmogState(state))), state);
  });

  it("caps caption text", () => {
    const state = parseTransmogState(new URLSearchParams(`t=${"a".repeat(200)}`));
    assert.equal(state.title.length, 48);
  });
});

describe("transmog races and classes", () => {
  it("every race has a viewer model from chrModels and a name in both languages", () => {
    const ids = new Set<string>();
    for (const race of transmogRaces) {
      assert.ok(!ids.has(race.id), race.id);
      ids.add(race.id);
      assert.equal(chrModelId(race.id, "m"), chrModelIdForRace(race.raceId, false), race.id);
      assert.equal(chrModelId(race.id, "f"), chrModelIdForRace(race.raceId, true), race.id);
      assert.ok(transmogCopy.ru.races[race.id] && transmogCopy.en.races[race.id], race.id);
    }
  });

  it("only Dracthyr has a single body", () => {
    assert.deepEqual(transmogRaces.filter((race) => singleBody(race.id)).map((race) => race.id), ["dracthyr"]);
  });

  it("every class has an armor type and a name", () => {
    for (const entry of classIds) {
      assert.ok(classArmor[entry.slug]);
      assert.ok(transmogCopy.ru.classes[entry.slug] && transmogCopy.en.classes[entry.slug]);
    }
  });
});

describe("transmog outfit logic", () => {
  it("wears, removes and lists looks in slot order", () => {
    let looks = wearLook({}, "legs", look("legs", 7));
    looks = wearLook(looks, "head", look("head", 3));
    assert.deepEqual(Object.keys(lookIds(looks)), ["head", "legs"]);
    looks = wearLook(looks, "legs", undefined);
    assert.deepEqual(lookIds(looks), { head: 3 });
  });

  it("a set replaces only its own slots", () => {
    const looks = wearSet({ head: look("head", 1), feet: look("feet", 2) }, { items: [look("head", 9), look("chest", 10)] });
    assert.deepEqual(lookIds(looks), { head: 9, chest: 10, feet: 2 });
  });

  it("toggles hidden slots and caps undo history", () => {
    assert.deepEqual(toggleHidden(["back"], "head"), ["back", "head"]);
    assert.deepEqual(toggleHidden(["back", "head"], "back"), ["head"]);
    let history: number[] = [];
    for (let index = 0; index < 40; index += 1) history = pushHistory(history, index);
    assert.equal(history.length, 30);
    assert.equal(history.at(-1), 39);
    assert.equal(history[0], 10);
  });

  it("groups variants of one look by name and keeps order", () => {
    const items = [
      look("head", 1, { name: "Gravewarden Casque", quality: 3 }),
      look("head", 2, { name: "Flamewaker Helm" }),
      look("head", 3, { name: "gravewarden casque ", quality: 4 }),
      look("head", 1, { name: "Gravewarden Casque" }),
    ];
    const groups = groupVariants(items);
    assert.deepEqual(groups.map((group) => group.name), ["Gravewarden Casque", "Flamewaker Helm"]);
    assert.deepEqual(groups[0].variants.map((entry) => entry.modifiedAppearanceId), [1, 3]);
    assert.equal(groups[0].quality, 4);
  });

  it("derives the armor of an outfit", () => {
    assert.equal(outfitArmor("mage", { chest: look("chest", 1, { armor: "plate" }) }), "cloth");
    assert.equal(outfitArmor("", { chest: look("chest", 1, { armor: "mail" }) }), "mail");
    assert.equal(outfitArmor("", { chest: look("chest", 1, { armor: "cosmetic" }), legs: look("legs", 2, { armor: "leather" }), feet: look("feet", 3, { armor: "leather" }), head: look("head", 4, { armor: "plate" }) }), "leather");
    assert.equal(outfitArmor("", {}), "plate");
  });

  it("encodes paging cursors like the API and picks offsets in range", () => {
    assert.equal(offsetCursor(2), "Mg");
    assert.equal(offsetCursor(40), "NDA");
    assert.equal(offsetCursor(1049), "MTA0OQ");
    assert.equal(randomOffset(10, () => 0), 0);
    assert.equal(randomOffset(10, () => 0.9999), 9);
    assert.equal(randomOffset(10, () => 1), 9);
    assert.equal(randomOffset(0), 0);
  });

  it("hides developer placeholder sets", () => {
    assert.equal(playerSet({ name: "[DNT] 12.1 Mythic VFX Unlock - All Items" }), false);
    assert.equal(playerSet({ name: "[PH] Raid Set" }), false);
    assert.equal(playerSet({ name: "zzOld Tier Set" }), false);
    assert.equal(playerSet({ name: "Eternal Judgment Armor" }), true);
    assert.equal(playerSet({ name: "Testament of Faith" }), true);
  });
});
