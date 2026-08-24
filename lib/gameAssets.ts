/**
 * Центральный резолвер игровых ассетов.
 * Единственная точка правды для маппинга «спек/класс → официальная иконка»
 * (локальные копии иконок Wowhead CDN в public/assets/).
 */

export const SPEC_ICONS: Record<string, string> = {
  "Frost Death Knight": "frost-dk",
  "Unholy Death Knight": "unholy-dk",
  "Arcane Mage": "arcane-mage",
  "Frost Mage": "frost-mage",
  "Fire Mage": "fire-mage",
  "Augmentation Evoker": "aug-evoker",
  "Devastation Evoker": "dev-evoker",
  "Retribution Paladin": "ret-paladin",
  "Outlaw Rogue": "outlaw-rogue",
  "Assassination Rogue": "assa-rogue",
  "Subtlety Rogue": "sub-rogue",
  "Balance Druid": "balance-druid",
  "Shadow Priest": "shadow-priest",
  "Marksmanship Hunter": "mm-hunter",
  "Beast Mastery Hunter": "bm-hunter",
  "Elemental Shaman": "ele-shaman",
  "Restoration Shaman": "resto-shaman",
  "Enhancement Shaman": "enh-shaman",
  "Affliction Warlock": "aff-lock",
  "Demonology Warlock": "demo-lock",
  "Windwalker Monk": "ww-monk",
  "Fury Warrior": "fury-warrior",
  "Arms Warrior": "arms-warrior",
  "Havoc Demon Hunter": "havoc-dh",
};

export const CLASS_ICONS: Record<string, string> = {
  dk: "deathknight",
  mage: "mage",
  evoker: "evoker",
  pal: "paladin",
  rogue: "rogue",
  druid: "druid",
  priest: "priest",
  hunter: "hunter",
  shaman: "shaman",
  lock: "warlock",
  monk: "monk",
  war: "warrior",
  dh: "demonhunter",
};

export function specIcon(name: string): string | null {
  const a = SPEC_ICONS[name];
  return a ? `/assets/specs/${a}.jpg` : null;
}

export function classIcon(key: string): string | null {
  const c = CLASS_ICONS[key];
  return c ? `/assets/classes/${c}.jpg` : null;
}
