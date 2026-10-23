import type { Lang } from "@/lib/i18n-paths";
import { fullWowNameTable } from "./fullWowNameTable";
import { routeText, straightApostrophes, type WowNameRecord, type WowNameTable } from "./wowNameTable";

/** Every string inside a value (props, copy objects); functions are skipped. */
export function collectStrings(value: unknown, into = new Set<string>()): Set<string> {
  if (typeof value === "string") into.add(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, into);
  else if (value && typeof value === "object") for (const item of Object.values(value)) collectStrings(item, into);
  return into;
}

function pickRecords(records: Record<number, WowNameRecord>, ids: Iterable<number>) {
  const picked: Record<number, WowNameRecord> = {};
  for (const id of ids) if (Object.hasOwn(records, id)) picked[id] = records[id];
  return picked;
}

/**
 * The part of the full table a client page can display, so the page renders
 * exactly what the full dictionaries would. `texts` must hold every string the
 * page passes through the translators (props and the copy literals it mixes
 * in); names found in translated text are kept too. English pages only look
 * NPC and spell names up by ID.
 */
export function pickWowNameTable(lang: Lang, texts: Iterable<string>, ids: { npc: Iterable<number>; spell: Iterable<number> }): WowNameTable {
  const npc = pickRecords(fullWowNameTable.npc, ids.npc);
  const spell = pickRecords(fullWowNameTable.spell, ids.spell);
  if (lang === "en") return { source: {}, route: {}, npc, spell };

  const corpus = new Set([...texts].map(straightApostrophes));
  // Translated text goes through the translator at most once more (a step
  // title shown in a combat intel card). Some Russian names contain their
  // English key, so repeating this would never settle.
  for (const text of [...corpus]) corpus.add(routeText(fullWowNameTable, text, lang));
  // A name cannot contain NUL, so a match never spans two texts of the blob.
  const blob = [...corpus].join("\0");
  const route = Object.fromEntries(Object.entries(fullWowNameTable.route).filter(([name]) => blob.includes(name)));
  const source = Object.fromEntries(Object.entries(fullWowNameTable.source).filter(([name]) => corpus.has(name)));
  return { source, route, npc, spell };
}
