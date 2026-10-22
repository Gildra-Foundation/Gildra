/**
 * The labelled sample tier table of /tier-lists (shown with its notice while the
 * meta API is off) — read through lib/specs.ts, never a stand-in for live data.
 */

export type SpecRef = { name: string; cls: string };

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
