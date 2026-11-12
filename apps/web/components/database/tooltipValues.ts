/**
 * Pure reading of the values a tooltip prints: what the game's tables store
 * is not always what a player sees. No markup here (unit-tested as is).
 */

// Blizzard DB2 descriptions can contain value placeholders that are only
// meaningful after a build-specific lookup. Never render those tokens as if
// they were player-facing text; the API keeps the raw value for diagnostics.
export const UNRESOLVED_TEMPLATE = /\$(?:@spelldesc|[0-9]*[dD]|[0-9]*s[0-9]+|[st][0-9]+|[dD]|[A-Za-z]|[<{])/;

// The game stores these resources in fractions of the unit a player spends: rage, runic power,
// soul shards and astral power in tenths (Mortal Strike 300 = 30 rage, Chaos Bolt 20 = 2 shards),
// insanity in hundredths (5000 = 50). Mana is a percentage; energy, focus, runes, holy power,
// maelstrom, chi, fury and essence are stored as spent.
const POWER_UNITS: Record<number, number> = { 1: 10, 6: 10, 7: 10, 8: 10, 13: 100 };

/** A spell's cost in the units a player spends, from the stored amount of its power type. */
export function powerCost(amount: number, powerType: number) {
  return amount / (POWER_UNITS[powerType] ?? 1);
}

/**
 * Charges of an item's effect as the game's tooltip counts them. The table
 * stores a consumable's charges below zero (the item is spent with the last
 * one): -5 is "5 charges", -1 is a single use, which the game does not print.
 * Zero is no charges at all.
 */
export function chargeCount(charges: unknown) {
  const stored = Number(charges ?? 0);
  if (!Number.isFinite(stored)) return 0;
  return stored === -1 ? 0 : Math.abs(Math.trunc(stored));
}

const DESCRIBED_BY_RESOLVED_TEXT = new Set(["spell", "talent", "pvp_talent"]);

/**
 * Text of a spell's description. The tooltip block keeps the game's template
 * with its values left open; the record's resolved description is the same
 * text with the numbers of the build, so it stands in whenever the catalog has
 * it (a resolved text that still carries a raw token is not one).
 */
export function spellDescriptionText(entity: { type: string; resolvedDescription?: string | null }, blockText: string) {
  const resolved = DESCRIBED_BY_RESOLVED_TEXT.has(entity.type) ? (entity.resolvedDescription ?? "").trim() : "";
  return resolved && !UNRESOLVED_TEMPLATE.test(resolved) ? resolved : blockText;
}
