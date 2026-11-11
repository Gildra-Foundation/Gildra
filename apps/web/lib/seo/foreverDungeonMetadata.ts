import type { Metadata } from "next";
import type { Lang } from "@/lib/i18n-paths";
import { newDungeons, returningDungeonDetails } from "@/components/wow/forever/instanceData";
import { instanceName } from "@/components/wow/forever/instanceLocalization";
import { pairedAlternates, pageOpenGraph } from "./metadata";

/** Describe the existing guide and its published level band, in the reader's language. */
export function foreverDungeonMetadata(lang: Lang, slug: string): Metadata {
  const dungeon = [...newDungeons, ...returningDungeonDetails].find((entry) => entry.slug === slug);
  if (!dungeon) return {};
  const name = instanceName(dungeon.name, lang);
  const title = lang === "ru"
    ? `${name}: гайд по подземелью — WoW Forever | WowArcana`
    : `${name} Dungeon Guide — WoW Forever | WowArcana`;
  const description = lang === "ru"
    ? `${name} в WoW Forever: вход, карта и тактика боссов подземелья для уровней ${dungeon.min}–${dungeon.max}.`
    : `${name} in WoW Forever: entrance, map and dungeon boss tactics for levels ${dungeon.min}–${dungeon.max}.`;
  const alternates = pairedAlternates(lang, `/wow/forever/dungeons/${slug}`);
  return { title, description, alternates, openGraph: pageOpenGraph(lang, { title, description, path: String(alternates.canonical) }) };
}
