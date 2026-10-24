import { RaidAtlasPage } from "@/components/wow/raid/RaidAtlasPage";
import { MythicAtlasPage } from "@/components/wow/mythic/MythicAtlasPage";
import type { Locale, PublishedContent } from "@/lib/data/gamecontent/types";
import { ContentStatus } from "./ContentState";

export function PublishedRaidCatalog({ data, locale }: { data: PublishedContent<"raids">; locale: Locale }) {
  return <div data-game-content-release={data.release.releaseId} data-game-content-module="raids"><ContentStatus locale={locale} stale={data.stale} /><RaidAtlasPage locale={locale} content={data.payload} /></div>;
}

export function PublishedMythicCatalog({ data, locale }: { data: PublishedContent<"mythic-plus">; locale: Locale }) {
  return <div data-game-content-release={data.release.releaseId} data-game-content-module="mythic-plus"><ContentStatus locale={locale} stale={data.stale} /><MythicAtlasPage locale={locale} content={data.payload} /></div>;
}
