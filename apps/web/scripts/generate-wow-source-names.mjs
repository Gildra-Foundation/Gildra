/** Rebuild the small display dictionary from the checked-in original catalog records. */
import fs from "node:fs";
const source = JSON.parse(fs.readFileSync(new URL("../data/wow/source-localizations.json", import.meta.url)));
const manifest = JSON.parse(fs.readFileSync(new URL("../../../packages/game-data/src/content-manifest.json", import.meta.url)));
const raidSpells = JSON.parse(fs.readFileSync(new URL("../components/wow/raid/midnightRaidSpells.json", import.meta.url)));
source.records.push(...["instances", "encounters", "abilities", "phases"].flatMap((key) => (manifest[key] ?? []).filter((record) => record.names?.en && record.names?.ru).map((record) => ({ en: record.names.en, ru: record.names.ru }))));
source.records.push(...raidSpells.map((record) => ({ en: record.nameEn, ru: record.nameRu })));
const russianName = (value) => /[А-Яа-яЁё]/.test(value) && !/[A-Za-z]/.test(value);
const localizedName = (record) => ({ en: record.en, ...(russianName(record.ru) ? { ru: record.ru } : {}) });
const pairs = new Map();
const ambiguous = new Set();
for (const record of source.records) {
  if (!russianName(record.ru)) continue;
  for (const name of [record.en, ...(record.aliases ?? [])]) {
    if (pairs.has(name) && pairs.get(name) !== record.ru) ambiguous.add(name);
    pairs.set(name, record.ru);
  }
}
for (const name of [...ambiguous, "Midnight"]) pairs.delete(name);
fs.writeFileSync(new URL("../lib/wow/sourceNames.ts", import.meta.url),
  "// Generated from data/wow/source-localizations.json; names are copied verbatim from the source.\n" +
  "export const sourceNames: Record<string, string> = " + JSON.stringify(Object.fromEntries([...pairs].sort()), null, 2) + ";\n");
console.log(`${pairs.size} source names; ${ambiguous.size} ambiguous names omitted`);

// Spell headings resolve by the provided identity, never by a similar label.
const spells = new Map();
for (const record of source.records) if (record.type === "spell" && Number.isSafeInteger(record.id)) spells.set(record.id, localizedName(record));
for (const record of manifest.abilities ?? []) if (record.refs?.spellId && record.names?.en && record.names?.ru) spells.set(record.refs.spellId, { en: record.names.en, ru: record.names.ru });
for (const record of raidSpells) spells.set(record.spellId, { en: record.nameEn, ru: record.nameRu });
fs.writeFileSync(new URL("../lib/wow/sourceSpellNames.ts", import.meta.url), "// Generated from original catalog and verified journal records.\nexport const sourceSpellNames: Record<number, { en: string; ru?: string }> = " + JSON.stringify(Object.fromEntries(spells), null, 2) + ";\n");

const creatures = new Map();
for (const record of source.records) if (record.type === "creature" && Number.isSafeInteger(record.id)) creatures.set(record.id, localizedName(record));
fs.writeFileSync(new URL("../lib/wow/sourceNpcNames.ts", import.meta.url), "// Generated from original localized NPC records; display names resolve by identity.\nexport const sourceNpcNames: Record<number, { en: string; ru?: string }> = " + JSON.stringify(Object.fromEntries(creatures), null, 2) + ";\n");
