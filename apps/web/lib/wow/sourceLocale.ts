import type { Lang } from "@/lib/i18n-paths";
import { sourceNames } from "./sourceNames";
import { sourceNpcNames } from "./sourceNpcNames";
import { sourceSpellNames } from "./sourceSpellNames";

const apostrophes = (value: string) => value.replace(/[‘’]/g, "'");
const names = new Map(Object.entries(sourceNames).map(([en, ru]) => [apostrophes(en), ru]));
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pattern = new RegExp(`(?<![A-Za-z])(?:${[...names.keys()].sort((a, b) => b.length - a.length).map(escape).join("|")})(?![A-Za-z])`, "g");

/** Use exact source names, including inside guide prose; never translate by inference. */
export function wowSourceText(value: string, lang: Lang) {
  if (lang === "en") return value;
  return apostrophes(value).replace(pattern, (name) => names.get(name) ?? name);
}
export function wowSourceName(value: string, lang: Lang, existingRu?: string) {
  return lang === "en" ? value : names.get(apostrophes(value)) ?? existingRu ?? "Русское название не подтверждено";
}

export function wowNpcName(value: string, lang: Lang, npcId?: number) {
  return npcId ? sourceNpcNames[npcId]?.[lang] ?? wowSourceName(value, lang) : wowSourceName(value, lang);
}
export function wowSpellName(value: string, lang: Lang, spellId?: number) {
  return spellId ? sourceSpellNames[spellId]?.[lang] ?? (lang === "ru" ? `Способность #${spellId}: перевод не подтверждён` : value) : wowSourceName(value, lang);
}

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
