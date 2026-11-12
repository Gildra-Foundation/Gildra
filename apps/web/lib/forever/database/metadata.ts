import type { Metadata } from "next";
import { libraryCopy } from "@/components/wow/forever/library/libraryCopy";
import { slotNames } from "@/components/wow/forever/library/slotNames";
import { clipDescription, pageOpenGraph } from "@/lib/seo/metadata";
import { foreverRecordPath, isForeverType, type ForeverLocale, type ForeverRecord } from "./contract";
import { foreverHasRussian } from "./russian";
import { foreverRecord } from "./server";

const kind = {
  en: { item: "item", spell: "spell", npc: "NPC", quest: "quest", recipe: "recipe" },
  ru: { item: "предмет", spell: "заклинание", npc: "персонаж", quest: "задание", recipe: "рецепт" },
} as const;

const words = {
  en: { of: "of World of Warcraft: Forever", level: (value: number) => `level ${value}`, requires: (value: number) => `requires level ${value}`, skill: (value: number) => `skill ${value}` },
  ru: { of: "World of Warcraft: Forever", level: (value: number) => `уровень ${value}`, requires: (value: number) => `требуется уровень ${value}`, skill: (value: number) => `навык ${value}` },
} as const;

/**
 * What the page itself shows about the record, in one line: its game text, or its kind with
 * the facts of the plaque (slot, quality, levels, profession and skill, where it stands).
 */
export function foreverRecordDescription(record: ForeverRecord, lang: ForeverLocale) {
  const copy = libraryCopy[lang];
  const w = words[lang];
  const name = record.name[lang] || record.name.en;
  const text = (record.description?.[lang] || record.description?.en || record.effects?.[0] || "").replace(/\s+/g, " ").trim();
  const profession = record.category && record.category in copy.professions ? copy.professions[record.category as keyof typeof copy.professions] : undefined;
  const skill = typeof record.facts.skill === "number" ? record.facts.skill : undefined;
  const facts = [
    record.slotId ? slotNames[lang][record.slotId] : undefined,
    record.type === "item" && record.quality !== undefined ? copy.qualities[record.quality] : undefined,
    profession,
    skill ? w.skill(skill) : undefined,
    record.level ? w.level(record.level) : undefined,
    record.requiredLevel ? w.requires(record.requiredLevel) : undefined,
    record.locations?.[0],
  ].filter(Boolean).join(", ");
  const line = `${name} — ${kind[lang][record.type]} ${w.of}${facts ? `: ${facts}` : ""}.`;
  return clipDescription(text.length >= 70 ? text : text ? `${text} ${line}` : line);
}

/**
 * Metadata of one Forever record page. A Russian page of a record the snapshot has no Russian
 * name for repeats the English page: it stays out of the index and the English page names no
 * Russian twin (the sitemap lists the same pages, app/sitemaps/forever).
 */
export async function foreverRecordMetadata(lang: ForeverLocale, params: Promise<{ type: string; id: string }>): Promise<Metadata> {
  const { type, id } = await params;
  const record = isForeverType(type) && /^[1-9]\d{0,9}$/.test(id) ? await foreverRecord(type, Number(id)) : null;
  if (!record) return { title: "Forever — WowArcana" };
  const en = foreverRecordPath(record.type, record.id, "en");
  const ru = foreverRecordPath(record.type, record.id, "ru");
  const own = foreverHasRussian(record);
  const canonical = lang === "ru" ? ru : en;
  const title = `${record.name[lang] || record.name.en} — Forever — WowArcana`;
  const description = foreverRecordDescription(record, lang);
  return {
    title,
    description,
    ...(lang === "ru" && !own ? { robots: { index: false, follow: true } } : {}),
    alternates: { canonical, languages: own ? { en, ru, "x-default": en } : { en, "x-default": en } },
    openGraph: pageOpenGraph(lang, { title, description, path: canonical }),
  };
}
