const knownSpellIds: Readonly<Record<string, number>> = {
  rampage: 184367,
  "heroic-leap": 6544,
  bloodthirst: 23881,
  "raging-blow": 85288,
  execute: 5308,
  "odyns-fury": 385059,
  whirlwind: 190411,
  recklessness: 1719,
  avatar: 107574,
  bladestorm: 227847,
};

export function resolveRotationAbilitySpellId(abilityId: string, supplied?: number) {
  if (Number.isInteger(supplied) && Number(supplied) > 0) return Number(supplied);
  const known = knownSpellIds[abilityId];
  if (known) return known;
  const encoded = /^spell-(\d+)$/.exec(abilityId)?.[1];
  const parsed = Number(encoded);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
