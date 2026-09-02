/** Данные проекта — единый источник для главной. */

export type SpecRef = { name: string; cls: string };

export const liveStats = {
  runs: "42,841",
  specs: 39,
  regions: 4,
  updated: "2h ago",
};

export const season = {
  expansion: "Midnight",
  season: "Season 1",
  patch: "12.0.5",
};

export const patchHighlights = [
  "Class tuning updates",
  "Manaforge Omega raid open",
  "New Mythic+ affix rotation",
  "PvP balance adjustments",
];

export const mythicSpotlight = {
  spec: { name: "Frost Death Knight", cls: "dk" } as SpecRef,
  klass: "Death Knight",
  role: "DPS",
  score: "94.2",
  played: "16.4%",
  avgKey: "+14.7",
  trend: 2,
};

export const mythicRunnersUp = [
  { spec: { name: "Arcane Mage", cls: "mage" }, score: "92.7", trend: 0 },
  { spec: { name: "Augmentation Evoker", cls: "evoker" }, score: "91.8", trend: 1 },
];

export const mythicTierRows: { tier: "a" | "b" | "c"; specs: SpecRef[] }[] = [
  {
    tier: "a",
    specs: [
      { name: "Retribution Paladin", cls: "pal" },
      { name: "Outlaw Rogue", cls: "rogue" },
      { name: "Balance Druid", cls: "druid" },
      { name: "Elemental Shaman", cls: "shaman" },
      { name: "Shadow Priest", cls: "priest" },
    ],
  },
  {
    tier: "b",
    specs: [
      { name: "Affliction Warlock", cls: "lock" },
      { name: "Windwalker Monk", cls: "monk" },
      { name: "Fury Warrior", cls: "war" },
      { name: "Marksmanship Hunter", cls: "hunter" },
    ],
  },
  {
    tier: "c",
    specs: [
      { name: "Havoc Demon Hunter", cls: "dh" },
      { name: "Enhancement Shaman", cls: "shaman" },
      { name: "Frost Mage", cls: "mage" },
    ],
  },
];

export const trends = [
  { rank: "I", spec: { name: "Frost Death Knight", cls: "dk" }, pct: "16.4%", dir: "up" },
  { rank: "II", spec: { name: "Arcane Mage", cls: "mage" }, pct: "15.7%", dir: "flat" },
  { rank: "III", spec: { name: "Augmentation Evoker", cls: "evoker" }, pct: "13.1%", dir: "up" },
  { rank: "IV", spec: { name: "Restoration Shaman", cls: "shaman" }, pct: "8.7%", dir: "down" },
  { rank: "V", spec: { name: "Assassination Rogue", cls: "rogue" }, pct: "7.9%", dir: "flat" },
] as const;

export const raid = {
  label: "Current Raid",
  name: "Manaforge Omega",
  blurb:
    "Boss rankings, spec performance and encounter guides — updated 2h ago from 23,671+ logged parses.",
  links: ["Boss Rankings", "Tier List", "Guides", "Best Specs"],
  topSpecs: [
    { name: "Devastation Evoker", cls: "evoker" },
    { name: "Marksmanship Hunter", cls: "hunter" },
    { name: "Unholy Death Knight", cls: "dk" },
  ] as SpecRef[],
};

export type TableRow = {
  spec: SpecRef;
  score: string;
  bar: number;
  pop: string;
  key: string;
  top1: string;
  star?: boolean;
  trend: { dir: "up" | "down" | "flat"; val?: number };
  hl?: boolean;
};

export const tierTable: { tier: "s" | "a" | "b"; rows: TableRow[] }[] = [
  {
    tier: "s",
    rows: [
      { spec: { name: "Frost Death Knight", cls: "dk" }, score: "94.2", bar: 96.8, pop: "16.4%", key: "+14.7", top1: "+18", star: true, trend: { dir: "up", val: 2 }, hl: true },
      { spec: { name: "Arcane Mage", cls: "mage" }, score: "92.7", bar: 90.8, pop: "15.7%", key: "+14.1", top1: "+17", star: true, trend: { dir: "flat" } },
      { spec: { name: "Augmentation Evoker", cls: "evoker" }, score: "91.8", bar: 87.2, pop: "13.1%", key: "+13.9", top1: "+17", trend: { dir: "up", val: 1 } },
    ],
  },
  {
    tier: "a",
    rows: [
      { spec: { name: "Retribution Paladin", cls: "pal" }, score: "88.4", bar: 73.6, pop: "6.3%", key: "+13.2", top1: "+16", trend: { dir: "up", val: 1 } },
      { spec: { name: "Outlaw Rogue", cls: "rogue" }, score: "86.9", bar: 67.6, pop: "6.8%", key: "+13.0", top1: "+15", trend: { dir: "down", val: 1 } },
      { spec: { name: "Balance Druid", cls: "druid" }, score: "86.1", bar: 64.4, pop: "5.4%", key: "+12.8", top1: "+15", star: true, trend: { dir: "flat" } },
      { spec: { name: "Shadow Priest", cls: "priest" }, score: "85.7", bar: 62.8, pop: "4.1%", key: "+12.6", top1: "+15", trend: { dir: "up", val: 2 } },
    ],
  },
  {
    tier: "b",
    rows: [
      { spec: { name: "Marksmanship Hunter", cls: "hunter" }, score: "81.3", bar: 45.2, pop: "3.9%", key: "+12.1", top1: "+14", star: true, trend: { dir: "down", val: 1 } },
      { spec: { name: "Elemental Shaman", cls: "shaman" }, score: "80.6", bar: 42.4, pop: "3.6%", key: "+12.0", top1: "+14", star: true, trend: { dir: "flat" } },
      { spec: { name: "Affliction Warlock", cls: "lock" }, score: "79.8", bar: 39.2, pop: "2.9%", key: "+11.7", top1: "+14", star: true, trend: { dir: "down", val: 1 } },
    ],
  },
];

export const classChips = [
  { key: "all", label: "All Classes" },
  { key: "dk", label: "Death Knight" },
  { key: "mage", label: "Mage" },
  { key: "evoker", label: "Evoker" },
  { key: "pal", label: "Paladin" },
  { key: "rogue", label: "Rogue" },
  { key: "druid", label: "Druid" },
  { key: "priest", label: "Priest" },
  { key: "hunter", label: "Hunter" },
  { key: "shaman", label: "Shaman" },
  { key: "lock", label: "Warlock" },
];

export const builds = [
  { spec: { name: "Frost Death Knight", cls: "dk" }, title: "Breath of Sindragosa — Frost DK", meta: "By Alexandér · updated 3h ago", tier: "s" },
  { spec: { name: "Arcane Mage", cls: "mage" }, title: "Sunfury Arcane Burst", meta: "By Neri · updated 6h ago", tier: "s" },
  { spec: { name: "Augmentation Evoker", cls: "evoker" }, title: "Chrono Flight — Augmentation", meta: "By Velyne · updated 9h ago", tier: "s" },
  { spec: { name: "Retribution Paladin", cls: "pal" }, title: "Templar's Verdict Cleave", meta: "By Shyra · updated 12h ago", tier: "a" },
  { spec: { name: "Balance Druid", cls: "druid" }, title: "Elune's Chosen — Starfall", meta: "By Lyra · updated 1d ago", tier: "a" },
  { spec: { name: "Shadow Priest", cls: "priest" }, title: "Voidweaver Shadow", meta: "By Kael · updated 1d ago", tier: "a" },
] as const;

export const guidesList = [
  { art: "dk", cat: "Frost Death Knight", title: "Frost DK Mythic+ Guide — Season 1", meta: "By Alexandér · 3h ago" },
  { art: "talents", cat: "Mythic+ Guide", title: "Best Talents for +12–16 Keys", meta: "By Shyra · 8h ago" },
  { art: "arcane", cat: "Class Guide", title: "Arcane Mage Guide — Patch 12.0.5", meta: "By Neri · 10h ago" },
  { art: "gear", cat: "Gear Guide", title: "Best Items for Healers — Season 1", meta: "By Lyra · 12h ago" },
] as const;

export const featuredGuide = {
  cat: "Raid Guide",
  title: "Manaforge Omega — Complete Boss Guide",
  meta: "By Velyne · 5h ago · 14 min read",
};

/* ---- Types for DataSource consumers (lib/data/source.ts) ---- */
export type LiveStats = typeof liveStats;
export type Season = typeof season;
export type MythicSpotlight = typeof mythicSpotlight;
export type RunnerUp = (typeof mythicRunnersUp)[number];
export type MythicTierRow = (typeof mythicTierRows)[number];
export type Trend = (typeof trends)[number];
export type Raid = typeof raid;
export type TierGroup = (typeof tierTable)[number];
export type ClassChip = (typeof classChips)[number];
export type Build = (typeof builds)[number];
export type GuideItem = (typeof guidesList)[number];
export type FeaturedGuide = typeof featuredGuide;
