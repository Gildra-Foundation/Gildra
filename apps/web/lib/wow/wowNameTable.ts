import type { Lang } from "@/lib/i18n-paths";

export type WowNameRecord = { en: string; ru?: string };

/**
 * Confirmed source names, as plain data. The full table (fullWowNameTable.ts)
 * is server-side; a client page receives only the slice it can display
 * (pickWowNameTable.ts), so the browser never downloads the dictionaries.
 */
export type WowNameTable = {
  /** Exact source names → Russian, keyed with straight apostrophes. */
  source: Record<string, string>;
  /** Source names plus shortened route-note aliases, matched inside route prose. */
  route: Record<string, string>;
  npc: Record<number, WowNameRecord>;
  spell: Record<number, WowNameRecord>;
};

export const emptyWowNameTable: WowNameTable = { source: {}, route: {}, npc: {}, spell: {} };

export const straightApostrophes = (value: string) => value.replace(/[‘’]/g, "'");
/** `source` of a table: the source-name dictionary keyed with straight apostrophes. */
export const sourceNameMap = (names: Record<string, string>) =>
  Object.fromEntries(Object.entries(names).map(([en, ru]) => [straightApostrophes(en), ru]));
const own = <T>(map: Record<string | number, T>, key: string | number) => Object.hasOwn(map, key) ? map[key] : undefined;
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const patterns = new WeakMap<Record<string, string>, RegExp>();
/** Longest name first, never inside a longer Latin word. */
function namePattern(names: Record<string, string>) {
  let pattern = patterns.get(names);
  if (!pattern) {
    pattern = new RegExp(`(?<![A-Za-z])(?:${Object.keys(names).sort((a, b) => b.length - a.length).map(escape).join("|")})(?![A-Za-z])`, "g");
    patterns.set(names, pattern);
  }
  return pattern;
}
const replaceNames = (names: Record<string, string>, value: string) =>
  Object.keys(names).length ? value.replace(namePattern(names), (name) => own(names, name) ?? name) : value;

/** Use exact source names, including inside guide prose; never translate by inference. */
export function sourceText(table: Pick<WowNameTable, "source">, value: string, lang: Lang) {
  if (lang === "en") return value;
  return replaceNames(table.source, straightApostrophes(value));
}
/** Without a confirmed Russian name the original English name is shown (game names may stay English). */
export function sourceName(table: Pick<WowNameTable, "source">, value: string, lang: Lang, existingRu?: string) {
  return lang === "en" ? value : own(table.source, straightApostrophes(value)) ?? existingRu ?? value;
}
/** `lang` attribute for a rendered source name: "en" when a Russian page falls back to the English original. */
export function sourceNameLang(table: Pick<WowNameTable, "source">, value: string, lang: Lang, existingRu?: string): "en" | undefined {
  return lang === "ru" && !Object.hasOwn(table.source, straightApostrophes(value)) && !existingRu ? "en" : undefined;
}

export function npcName(table: Pick<WowNameTable, "source" | "npc">, value: string, lang: Lang, npcId?: number) {
  return (npcId ? own(table.npc, npcId)?.[lang] : undefined) ?? sourceName(table, value, lang);
}
export function spellName(table: Pick<WowNameTable, "source" | "spell">, value: string, lang: Lang, spellId?: number) {
  return (spellId ? own(table.spell, spellId)?.[lang] : undefined) ?? sourceName(table, value, lang);
}

/** Display-only route prose: keep English keys, IDs, saved routes and calculations intact. */
export function routeText(table: Pick<WowNameTable, "route">, value: string, lang: Lang) {
  if (lang === "en") return value === "Adderis и Aspix" ? "Adderis and Aspix" : value;
  return replaceNames(table.route, straightApostrophes(value));
}
