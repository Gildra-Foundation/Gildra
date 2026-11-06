/**
 * Raid composition planner: which Midnight specialization brings which raid buff, cooldown,
 * dispel and utility (hand-curated, checked once per patch), plus the roster logic shared by the
 * page and its tests — slot layout per raid size, coverage, role and armor counts, the compact
 * roster code kept in the URL and in localStorage. Client-safe data.
 */
import { talentSpecThemes } from "@/lib/talentSpecThemes";
import { PLANNER_SPELLS, type PlannerSpellId } from "./spells";

export type CompRole = "tank" | "healer" | "melee" | "ranged";
export type Armor = "cloth" | "leather" | "mail" | "plate";
export type RaidSize = "mythic" | "flex";

/** Mythic is 20 players in 4 groups; Heroic and Normal take 10–30 players in up to 6 groups. */
export const RAID_SIZES: Record<RaidSize, { groups: number; min: number; max: number }> = {
  mythic: { groups: 4, min: 20, max: 20 },
  flex: { groups: 6, min: 10, max: 30 },
};
export const GROUP_SIZE = 5;
export const slotCount = (size: RaidSize) => RAID_SIZES[size].groups * GROUP_SIZE;

const ARMOR: Record<string, Armor> = {
  mage: "cloth", priest: "cloth", warlock: "cloth",
  demonhunter: "leather", druid: "leather", monk: "leather", rogue: "leather",
  evoker: "mail", hunter: "mail", shaman: "mail",
  deathknight: "plate", paladin: "plate", warrior: "plate",
};
export const ARMORS: Armor[] = ["cloth", "leather", "mail", "plate"];
export const ROLES: CompRole[] = ["tank", "healer", "melee", "ranged"];

/**
 * One character per specialization in the shared roster code. Codes are permanent: a new
 * specialization takes an unused character, an existing one never changes (old links keep working).
 */
const SPEC_CODES: Record<string, string> = {
  "blood-death-knight": "a", "frost-death-knight": "b", "unholy-death-knight": "c",
  "havoc-demon-hunter": "d", "vengeance-demon-hunter": "e", "devourer-demon-hunter": "f",
  "balance-druid": "g", "feral-druid": "h", "guardian-druid": "i", "restoration-druid": "j",
  "devastation-evoker": "k", "preservation-evoker": "l", "augmentation-evoker": "m",
  "beast-mastery-hunter": "n", "marksmanship-hunter": "o", "survival-hunter": "p",
  "arcane-mage": "q", "fire-mage": "r", "frost-mage": "s",
  "brewmaster-monk": "t", "mistweaver-monk": "u", "windwalker-monk": "v",
  "holy-paladin": "w", "protection-paladin": "x", "retribution-paladin": "y",
  "discipline-priest": "z", "holy-priest": "A", "shadow-priest": "B",
  "assassination-rogue": "C", "outlaw-rogue": "D", "subtlety-rogue": "E",
  "elemental-shaman": "F", "enhancement-shaman": "G", "restoration-shaman": "H",
  "affliction-warlock": "I", "demonology-warlock": "J", "destruction-warlock": "K",
  "arms-warrior": "L", "fury-warrior": "M", "protection-warrior": "N",
};
const EMPTY_CODE = "-";

export type PlannerSpec = {
  slug: string;
  code: string;
  specId: number;
  classKey: string;
  /** Class slug of the site's URLs and icons ("death-knight"). */
  classSlug: string;
  specShort: string;
  className: string;
  classNameRu: string;
  specName: string;
  specNameRu: string;
  role: CompRole;
  armor: Armor;
};

const CLASS_SLUGS: Record<string, string> = {
  druid: "druid", evoker: "evoker", priest: "priest", deathknight: "death-knight", hunter: "hunter", rogue: "rogue",
  shaman: "shaman", paladin: "paladin", mage: "mage", warrior: "warrior", warlock: "warlock", monk: "monk", demonhunter: "demon-hunter",
};

export const PLANNER_SPECS: PlannerSpec[] = talentSpecThemes.map((theme) => {
  const classSlug = CLASS_SLUGS[theme.classKey];
  return {
    slug: theme.slug,
    code: SPEC_CODES[theme.slug],
    specId: theme.specId,
    classKey: theme.classKey,
    classSlug,
    specShort: theme.slug.endsWith(`-${classSlug}`) ? theme.slug.slice(0, -classSlug.length - 1) : theme.slug,
    className: theme.className,
    classNameRu: theme.classNameRu,
    specName: theme.specName,
    specNameRu: theme.specNameRu,
    // Augmentation is a ranged damage dealer in the raid's role count.
    role: theme.role === "support" ? "ranged" : theme.role,
    armor: ARMOR[theme.classKey],
  };
});

export const specBySlug = new Map(PLANNER_SPECS.map((spec) => [spec.slug, spec]));
const specByCode = new Map(PLANNER_SPECS.map((spec) => [spec.code, spec]));

/** Classes in palette order with their specializations. */
export const PLANNER_CLASSES = [...new Set(PLANNER_SPECS.map((spec) => spec.classKey))].map((classKey) => ({
  classKey,
  specs: PLANNER_SPECS.filter((spec) => spec.classKey === classKey),
}));

// ---------------------------------------------------------------------------
// What each specialization brings.

const ofClass = (...classKeys: string[]) => PLANNER_SPECS.filter((spec) => classKeys.includes(spec.classKey)).map((spec) => spec.slug);
const except = (classKey: string, ...slugs: string[]) => ofClass(classKey).filter((slug) => !slugs.includes(slug));

export type CoverageSource = { spell: PlannerSpellId; specs: readonly string[] };
export type CoverageItem = { id: string; sources: readonly CoverageSource[] };
export type CoverageGroupId = "buffs" | "essentials" | "movement" | "dispels" | "externals" | "raidDefensives" | "healing";
export type CoverageGroup = { id: CoverageGroupId; items: readonly CoverageItem[] };

const one = (id: string, spell: PlannerSpellId, specs: readonly string[]): CoverageItem => ({ id, sources: [{ spell, specs }] });

export const COVERAGE: readonly CoverageGroup[] = [
  { id: "buffs", items: [
    one("fortitude", 21562, ofClass("priest")),
    one("battle-shout", 6673, ofClass("warrior")),
    one("arcane-intellect", 1459, ofClass("mage")),
    one("mark-of-the-wild", 1126, ofClass("druid")),
    one("skyfury", 462854, ofClass("shaman")),
    one("blessing-of-the-bronze", 364342, ofClass("evoker")),
    one("mystic-touch", 8647, ofClass("monk")),
    one("chaos-brand", 1490, ofClass("demonhunter")),
    one("hunters-mark", 257284, ofClass("hunter")),
    one("devotion-aura", 465, ofClass("paladin")),
  ] },
  { id: "essentials", items: [
    { id: "bloodlust", sources: [
      { spell: 2825, specs: ofClass("shaman") },
      { spell: 80353, specs: ofClass("mage") },
      { spell: 390386, specs: ofClass("evoker") },
      { spell: 264667, specs: ofClass("hunter") },
    ] },
    { id: "battle-res", sources: [
      { spell: 20484, specs: ofClass("druid") },
      { spell: 61999, specs: ofClass("deathknight") },
      { spell: 20707, specs: ofClass("warlock") },
      { spell: 391054, specs: ofClass("paladin") },
    ] },
  ] },
  { id: "movement", items: [
    one("stampeding-roar", 106898, ofClass("druid")),
    one("wind-rush-totem", 192077, ofClass("shaman")),
    one("time-spiral", 374968, ofClass("evoker")),
    one("demonic-gateway", 111771, ofClass("warlock")),
  ] },
  { id: "dispels", items: [
    { id: "magic", sources: [
      { spell: 527, specs: ["discipline-priest", "holy-priest"] },
      { spell: 4987, specs: ["holy-paladin"] },
      { spell: 77130, specs: ["restoration-shaman"] },
      { spell: 115450, specs: ["mistweaver-monk"] },
      { spell: 88423, specs: ["restoration-druid"] },
      { spell: 360823, specs: ["preservation-evoker"] },
      { spell: 32375, specs: ofClass("priest") },
      { spell: 89808, specs: ofClass("warlock") },
    ] },
    { id: "curse", sources: [
      { spell: 475, specs: ofClass("mage") },
      { spell: 2782, specs: except("druid", "restoration-druid") },
      { spell: 88423, specs: ["restoration-druid"] },
      { spell: 51886, specs: except("shaman", "restoration-shaman") },
      { spell: 77130, specs: ["restoration-shaman"] },
      { spell: 374251, specs: ofClass("evoker") },
    ] },
    { id: "poison", sources: [
      { spell: 2782, specs: except("druid", "restoration-druid") },
      { spell: 88423, specs: ["restoration-druid"] },
      { spell: 213644, specs: except("paladin", "holy-paladin") },
      { spell: 4987, specs: ["holy-paladin"] },
      { spell: 218164, specs: except("monk", "mistweaver-monk") },
      { spell: 115450, specs: ["mistweaver-monk"] },
      { spell: 360823, specs: ["preservation-evoker"] },
      { spell: 365585, specs: except("evoker", "preservation-evoker") },
      { spell: 374251, specs: ofClass("evoker") },
    ] },
    { id: "disease", sources: [
      { spell: 527, specs: ["discipline-priest", "holy-priest"] },
      { spell: 213634, specs: ["shadow-priest"] },
      { spell: 4987, specs: ["holy-paladin"] },
      { spell: 213644, specs: except("paladin", "holy-paladin") },
      { spell: 115450, specs: ["mistweaver-monk"] },
      { spell: 218164, specs: except("monk", "mistweaver-monk") },
      { spell: 374251, specs: ofClass("evoker") },
    ] },
    { id: "enrage", sources: [
      { spell: 2908, specs: ofClass("druid") },
      { spell: 19801, specs: ofClass("hunter") },
      { spell: 5938, specs: ofClass("rogue") },
    ] },
  ] },
  { id: "externals", items: [
    one("blessing-of-protection", 1022, ofClass("paladin")),
    one("blessing-of-sacrifice", 6940, ofClass("paladin")),
    one("pain-suppression", 33206, ["discipline-priest"]),
    one("guardian-spirit", 47788, ["holy-priest"]),
    one("ironbark", 102342, ["restoration-druid"]),
    one("life-cocoon", 116849, ["mistweaver-monk"]),
    one("time-dilation", 357170, ["preservation-evoker"]),
    one("power-infusion", 10060, ofClass("priest")),
    one("innervate", 29166, ofClass("druid")),
  ] },
  { id: "raidDefensives", items: [
    one("rallying-cry", 97462, ofClass("warrior")),
    one("darkness", 196718, ofClass("demonhunter")),
    one("anti-magic-zone", 51052, ofClass("deathknight")),
    one("spirit-link-totem", 98008, ["restoration-shaman"]),
    one("aura-mastery", 31821, ["holy-paladin"]),
    one("power-word-barrier", 62618, ["discipline-priest"]),
    one("zephyr", 374227, ofClass("evoker")),
  ] },
  { id: "healing", items: [
    one("tranquility", 740, ["restoration-druid"]),
    one("divine-hymn", 64843, ["holy-priest"]),
    one("revival", 115310, ["mistweaver-monk"]),
    one("rewind", 363534, ["preservation-evoker"]),
    one("vampiric-embrace", 15286, ["shadow-priest"]),
  ] },
];

export const spellOf = (id: PlannerSpellId) => PLANNER_SPELLS[id];

// ---------------------------------------------------------------------------
// Roster logic. A roster is a fixed-length list of slots (group-major), each a spec slug or null.

export type Roster = (string | null)[];

export function emptyRoster(size: RaidSize): Roster {
  return Array.from({ length: slotCount(size) }, () => null);
}

/** Resize to a raid size; going down, players of the dropped groups move into free slots first. */
export function resizeRoster(roster: Roster, size: RaidSize): Roster {
  const length = slotCount(size);
  if (roster.length <= length) return [...roster, ...Array.from({ length: length - roster.length }, () => null)];
  const next = roster.slice(0, length);
  for (const slug of roster.slice(length)) {
    if (!slug) continue;
    const free = next.indexOf(null);
    if (free === -1) break;
    next[free] = slug;
  }
  return next;
}

/** Compact code of a roster: one character per slot, trailing empty slots left out ("ab-q"). */
export function encodeRoster(roster: Roster): string {
  return roster.map((slug) => (slug && specBySlug.get(slug)?.code) || EMPTY_CODE).join("").replace(/-+$/, "");
}

/** The roster of a code; unknown characters become empty slots, extra characters are dropped. */
export function decodeRoster(code: string, size: RaidSize): Roster {
  const roster = emptyRoster(size);
  [...code.slice(0, roster.length)].forEach((char, index) => { roster[index] = specByCode.get(char)?.slug ?? null; });
  return roster;
}

export const isRaidSize = (value: string | null | undefined): value is RaidSize => value === "mythic" || value === "flex";

export type Coverage = { item: CoverageItem; providers: string[] };

/** For every coverage item, the roster's specializations that bring it (one entry per player). */
export function coverageOf(roster: Roster): Map<string, Coverage> {
  const players = roster.filter((slug): slug is string => Boolean(slug));
  const result = new Map<string, Coverage>();
  for (const group of COVERAGE) {
    for (const item of group.items) {
      const providers = players.filter((slug) => item.sources.some((source) => source.specs.includes(slug)));
      result.set(item.id, { item, providers });
    }
  }
  return result;
}

export function roleCounts(roster: Roster): Record<CompRole, number> {
  const counts: Record<CompRole, number> = { tank: 0, healer: 0, melee: 0, ranged: 0 };
  for (const slug of roster) { const spec = slug ? specBySlug.get(slug) : undefined; if (spec) counts[spec.role] += 1; }
  return counts;
}

export function armorCounts(roster: Roster): Record<Armor, number> {
  const counts: Record<Armor, number> = { cloth: 0, leather: 0, mail: 0, plate: 0 };
  for (const slug of roster) { const spec = slug ? specBySlug.get(slug) : undefined; if (spec) counts[spec.armor] += 1; }
  return counts;
}

/** A common Mythic roster: two tanks, four healers, fourteen damage dealers, every buff covered. */
export const TYPICAL_MYTHIC: string[] = [
  "blood-death-knight", "vengeance-demon-hunter", "fury-warrior", "frost-death-knight", "retribution-paladin",
  "restoration-shaman", "holy-paladin", "discipline-priest", "restoration-druid", "windwalker-monk",
  "arcane-mage", "fire-mage", "devastation-evoker", "augmentation-evoker", "marksmanship-hunter",
  "affliction-warlock", "assassination-rogue", "shadow-priest", "balance-druid", "elemental-shaman",
];
