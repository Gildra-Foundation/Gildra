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
  "Destruction Warlock": "destro-lock",
  "Windwalker Monk": "ww-monk",
  "Fury Warrior": "fury-warrior",
  "Arms Warrior": "arms-warrior",
  "Havoc Demon Hunter": "havoc-dh",
  "Devourer Demon Hunter": "devourer-dh",
  "Survival Hunter": "survival-hunter",
  "Feral Druid": "feral-druid",
  "Holy Paladin": "holy-paladin",
  "Holy Priest": "holy-priest",
  "Preservation Evoker": "preservation-evoker",
  "Mistweaver Monk": "mistweaver-monk",
  "Restoration Druid": "restoration-druid",
  "Discipline Priest": "discipline-priest",
  "Blood Death Knight": "blood-dk",
  "Vengeance Demon Hunter": "vengeance-dh",
  "Guardian Druid": "guardian-druid",
  "Brewmaster Monk": "brewmaster-monk",
  "Protection Paladin": "prot-paladin",
  "Protection Warrior": "prot-warrior",
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

export const SPEC_SLUG_ICONS: Record<string, string> = {
  "death-knight:blood": "blood-dk", "death-knight:frost": "frost-dk", "death-knight:unholy": "unholy-dk",
  "demon-hunter:devourer": "devourer-dh", "demon-hunter:havoc": "havoc-dh", "demon-hunter:vengeance": "vengeance-dh",
  "druid:balance": "balance-druid", "druid:feral": "feral-druid", "druid:guardian": "guardian-druid", "druid:restoration": "restoration-druid",
  "evoker:augmentation": "aug-evoker", "evoker:devastation": "dev-evoker", "evoker:preservation": "preservation-evoker",
  "hunter:beast-mastery": "bm-hunter", "hunter:marksmanship": "mm-hunter", "hunter:survival": "survival-hunter",
  "mage:arcane": "arcane-mage", "mage:fire": "fire-mage", "mage:frost": "frost-mage",
  "monk:brewmaster": "brewmaster-monk", "monk:mistweaver": "mistweaver-monk", "monk:windwalker": "ww-monk",
  "paladin:holy": "holy-paladin", "paladin:protection": "prot-paladin", "paladin:retribution": "ret-paladin",
  "priest:discipline": "discipline-priest", "priest:holy": "holy-priest", "priest:shadow": "shadow-priest",
  "rogue:assassination": "assa-rogue", "rogue:combat": "outlaw-rogue", "rogue:outlaw": "outlaw-rogue", "rogue:subtlety": "sub-rogue",
  "shaman:elemental": "ele-shaman", "shaman:enhancement": "enh-shaman", "shaman:restoration": "resto-shaman",
  "warlock:affliction": "aff-lock", "warlock:demonology": "demo-lock", "warlock:destruction": "destro-lock",
  "warrior:arms": "arms-warrior", "warrior:fury": "fury-warrior", "warrior:protection": "prot-warrior",
};

/**
 * Local copies of the official in-game spell icons used by interactive WoW
 * tools. Keeping the mapping here prevents page components from coupling to a
 * CDN path or inventing visual substitutes when the catalog is unavailable.
 */
export const ABILITY_ICONS: Record<string, string> = {
  "bloodthirst": "/assets/abilities/bloodthirst.jpg",
  "bloodbath": "/assets/abilities/bloodthirst.jpg",
  "raging-blow": "/assets/abilities/raging-blow.jpg",
  "crushing-blow": "/assets/abilities/raging-blow.jpg",
  "rampage": "/assets/abilities/rampage.jpg",
  "execute": "/assets/abilities/execute.jpg",
  "odyns-fury": "/assets/abilities/odyns-fury.jpg",
  "whirlwind": "/assets/abilities/whirlwind.jpg",
  "recklessness": "/assets/abilities/recklessness.jpg",
  "heroic-leap": "/assets/abilities/heroic-leap.jpg",
  "avatar": "/assets/abilities/avatar.jpg",
  "bladestorm": "/assets/abilities/bladestorm.jpg",
  "bloodlust": "/assets/abilities/bloodlust.jpg",
};

export function specIcon(name: string, classSlug?: string, specSlug?: string): string | null {
  const a = SPEC_ICONS[name] ?? (classSlug && specSlug ? SPEC_SLUG_ICONS[`${classSlug}:${specSlug}`] : undefined);
  return a ? `/assets/specs/${a}.jpg` : null;
}

export function classIcon(key: string): string | null {
  const c = CLASS_ICONS[key];
  return c ? `/assets/classes/${c}.jpg` : null;
}

export function abilityIcon(slug: string): string | null {
  return ABILITY_ICONS[slug] ?? null;
}

type AbilityIconCandidate = { id: string; name: string; spellId?: number; iconUrl?: string };
type TalentIconSource = {
  trees: Record<string, { nodes: Array<{ choices: Array<{ name: string; spellId?: number; iconUrl?: string; iconFallback?: boolean }> }> }>;
};

const normalizedAbilityName = (value: string) => value
  .normalize("NFKD")
  .replace(/[’']/g, "")
  .replace(/[^a-zA-Z0-9]+/g, "-")
  .replace(/^-|-$/g, "")
  .toLowerCase();

/** Resolve an action icon from the live talent catalog, preferring spell IDs over names. */
export function talentAbilityIcon(ability: AbilityIconCandidate, talentData?: TalentIconSource | null): string | null {
  if (!talentData) return null;
  const choices = Object.values(talentData.trees).flatMap((tree) => tree.nodes.flatMap((node) => node.choices));
  const bySpell = ability.spellId ? choices.find((choice) => choice.spellId === ability.spellId && choice.iconUrl && !choice.iconFallback) : undefined;
  if (bySpell?.iconUrl) return bySpell.iconUrl;
  const keys = new Set([normalizedAbilityName(ability.id), normalizedAbilityName(ability.name)]);
  return choices.find((choice) => keys.has(normalizedAbilityName(choice.name)) && choice.iconUrl && !choice.iconFallback)?.iconUrl ?? null;
}
