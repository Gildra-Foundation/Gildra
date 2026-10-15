import "server-only";
import type { BattleNetCharacter } from "./battleNetCharacters";

export type AuctionEquippedPresentation = { itemId: number; name: string; effects: string[] };
type ObjectValue = Record<string, unknown>;
const unavailable = () => new Error("equipment_presentation_unavailable");
const object = (value: unknown): ObjectValue => value && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : {};
const integer = (value: unknown, minimum = 0): number => {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) throw unavailable();
  return Number(value);
};
function array(value: unknown): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 128) throw unavailable();
  return value;
}
function number(value: unknown) {
  if (value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw unavailable();
  return value;
}
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function sorted(values: unknown[]) { return values.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))); }

/** Compare mechanics only: localized names, descriptions and display strings differ. */
function identity(raw: ObjectValue) {
  const weapon = object(raw.weapon), damage = object(weapon.damage);
  return JSON.stringify({
    itemId: integer(object(raw.item).id, 1),
    slot: text(object(raw.slot).type),
    itemLevel: integer(object(raw.level).value, 1),
    context: integer(raw.context ?? 0),
    bonuses: sorted(array(raw.bonus_list).map(value => integer(value, 1))),
    modifiers: sorted(array(raw.modifiers).map(value => ({ type: integer(object(value).type, 1), value: integer(object(value).value) }))),
    craftingStats: sorted(array(raw.modified_crafting_stat).map(value => integer(object(value).id, 1))),
    quality: text(object(raw.quality).type),
    inventory: text(object(raw.inventory_type).type),
    requiredLevel: number(object(object(raw.requirements).level).value),
    armor: number(object(raw.armor).value),
    stats: sorted(array(raw.stats).map(value => {
      const stat = object(value), type = text(object(stat.type).type);
      if (!type) throw unavailable();
      return { type, value: number(stat.value), negated: stat.is_negated === true };
    })),
    spellIds: sorted(array(raw.spells).map(value => integer(object(object(value).spell).id, 1))),
    enchantments: sorted(array(raw.enchantments).map(value => ({
      id: integer(object(value).enchantment_id, 1),
      slot: integer(object(object(value).enchantment_slot).id ?? 0),
    }))),
    sockets: array(raw.sockets).map(value => ({ type: text(object(object(value).socket_type).type), itemId: integer(object(object(value).item).id ?? 0) })),
    weapon: {
      minimum: number(damage.min_value), maximum: number(damage.max_value),
      speed: number(object(weapon.attack_speed).value), dps: number(object(weapon.dps).value),
    },
    timewalkerLevel: number(raw.timewalker_level),
  });
}

function equipped(equipment: unknown, character: BattleNetCharacter) {
  const raw = object(equipment), owner = object(raw.character);
  if (owner.id !== character.id) throw new Error("character_snapshot_changed");
  const realmId = object(owner.realm).id;
  if (realmId !== undefined && realmId !== character.realm.id) throw new Error("character_snapshot_changed");
  const items = raw.equipped_items;
  if (!Array.isArray(items) || !items.length || items.length > 30) throw unavailable();
  const slots = new Map<string, { identity: string; presentation: AuctionEquippedPresentation }>();
  for (const value of items) {
    const item = object(value), slot = text(object(item.slot).type), name = text(item.name);
    if (!slot || !name || slots.has(slot)) throw unavailable();
    slots.set(slot, { identity: identity(item), presentation: {
      itemId: integer(object(item.item).id, 1), name,
      effects: array(item.spells).flatMap(spell => { const description = text(object(spell).description); return description ? [description] : []; }),
    } });
  }
  return slots;
}

async function localizedEquipment(url: string, token: string, signal: AbortSignal): Promise<unknown> {
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    });
    if (response.status === 401) throw new Error("session_expired");
    if (!response.ok || !response.body) throw unavailable();
    const reader = response.body.getReader(), chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 2 * 1024 * 1024) { await reader.cancel(); throw unavailable(); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof Error && error.message === "session_expired") throw error;
    throw unavailable();
  }
}

/** Display text only. The canonical English snapshot remains the simulation source. */
export async function getAuctionEquippedPresentation(input: {
  character: BattleNetCharacter;
  equipment: Record<string, unknown>;
  locale: "en" | "ru";
  token: string;
  signal: AbortSignal;
}): Promise<Map<string, AuctionEquippedPresentation>> {
  input.signal.throwIfAborted();
  const canonical = equipped(input.equipment, input.character);
  if (input.locale === "en") return new Map([...canonical].map(([slot, entry]) => [slot, entry.presentation]));
  if (!["eu", "us", "kr", "tw"].includes(input.character.region) || !input.token || !input.character.realm.slug || !input.character.name) throw unavailable();
  const url = new URL(`https://${input.character.region}.api.blizzard.com/profile/wow/character/${encodeURIComponent(input.character.realm.slug)}/${encodeURIComponent(input.character.name.toLowerCase())}/equipment`);
  url.searchParams.set("namespace", `profile-${input.character.region}`);
  url.searchParams.set("locale", "ru_RU");
  const localized = equipped(await localizedEquipment(url.toString(), input.token, input.signal), input.character);
  input.signal.throwIfAborted();
  if (canonical.size !== localized.size) throw new Error("character_snapshot_changed");
  for (const [slot, item] of canonical) if (localized.get(slot)?.identity !== item.identity) throw new Error("character_snapshot_changed");
  return new Map([...localized].map(([slot, entry]) => [slot, entry.presentation]));
}
