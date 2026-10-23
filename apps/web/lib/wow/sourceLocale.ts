import type { Lang } from "@/lib/i18n-paths";
import { fullWowNameTable as table } from "./fullWowNameTable";
import { npcName, sourceName, sourceNameLang, sourceText, spellName } from "./wowNameTable";

// Server-side lookups over every confirmed name. Client components translate
// with a page-scoped table instead (lib/wow/wowNameTable.ts), so the
// dictionaries stay out of the browser bundle.

/** Use exact source names, including inside guide prose; never translate by inference. */
export const wowSourceText = (value: string, lang: Lang) => sourceText(table, value, lang);
/** Without a confirmed Russian name the original English name is shown (game names may stay English). */
export const wowSourceName = (value: string, lang: Lang, existingRu?: string) => sourceName(table, value, lang, existingRu);
/** `lang` attribute for a rendered source name: "en" when a Russian page falls back to the English original. */
export const wowSourceNameLang = (value: string, lang: Lang, existingRu?: string) => sourceNameLang(table, value, lang, existingRu);
export const wowNpcName = (value: string, lang: Lang, npcId?: number) => npcName(table, value, lang, npcId);
export const wowSpellName = (value: string, lang: Lang, spellId?: number) => spellName(table, value, lang, spellId);

/** Strategy prose also contains interface terms for modes, roles and combat notation. */
export function wowGuideText(value: string, lang: Lang) {
  if (lang === "en") return value;
  const text = wowSourceText(value
    .replace(/Frost Orbs/g, "ледяные сферы")
    .replace(/Bubblefin Frostscale/g, "мурлок с защитной аурой")
    .replace(/Bubblefin/g, "мурлоки")
    .replace(/Frostscale/g, "мурлок с защитной аурой")
    .replace(/перед Pop!/g, "перед взрывом"), lang);
  return text
    .replace(/(?<![А-Яа-яЁёA-Za-z])на Mythic\b/g, "на эпохальной сложности")
    .replace(/(?<![А-Яа-яЁёA-Za-z])На Mythic\b/g, "На эпохальной сложности")
    .replace(/(?<![А-Яа-яЁёA-Za-z])на Heroic\b/g, "на героической сложности")
    .replace(/(?<![А-Яа-яЁёA-Za-z])На Heroic\b/g, "На героической сложности")
    .replace(/Mythic-луч/g, "Луч на эпохальной сложности")
    .replace(/\bMythic\b/g, "эпохальная сложность")
    .replace(/\bHeroic\b/g, "героическая сложность")
    .replace(/\bNormal\b/g, "обычная сложность")
    .replace(/\bLairs\b/g, "логов")
    .replace(/\bDPS\b/g, "бойцы")
    .replace(/\bDoT\b/g, "периодический эффект")
    .replace(/frost-урон/g, "урон от магии льда")
    .replace(/\bhealing CD\b/g, "мощное исцеляющее заклинание")
    .replace(/мягкий enrage/g, "постепенное нарастание урона")
    .replace(/\bsoak\b/g, "разделения урона")
    .replace(/\bShards\b/g, "осколки")
    .replace(/\bMotes\b/g, "частицы")
    .replace(/\bilvl\b/g, "ур. предметов");
}
