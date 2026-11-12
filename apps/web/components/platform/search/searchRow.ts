import { TYPE_SYMBOLS } from "@/components/database/CatalogGlyph";
import { highlightLabel } from "@/components/database/databaseCopy";
import { libraryCardCopy } from "@/components/library/libraryCardCopy";
import { playerText } from "@/lib/gameText";
import type { Lang } from "@/lib/i18n-paths";
import { entityTypeLabel } from "@/lib/platform/catalog/entityTypeLabel";
import { catalogGames, type PlatformCatalogItem } from "@/lib/platform/catalog/types";
import { searchCopy } from "./searchCopy";
import type { SearchRow } from "./searchList";

/**
 * The facts a WoW record carries, as the library shows them: an item's level,
 * slot and required level, a spell's school and cast time. Same-named records
 * differ in them; a record without facts has an empty line.
 */
function wowFacts(item: PlatformCatalogItem, lang: Lang) {
  const card = libraryCardCopy[lang];
  const text = (key: string) => (typeof item.attributes[key] === "string" ? item.attributes[key] as string : "");
  const itemLevel = item.attributes["Item Level"];
  const required = Number(text("required_level").match(/\d+/)?.[0]);
  return [
    itemLevel ? `${searchCopy[lang].itemLevel}\u00a0${itemLevel}` : "",
    text("inventory_type"),
    required > 0 ? card.requiredLevel(required) : "",
    text("school") ? highlightLabel("school", text("school"), lang) : "",
    text("cast_time") ? highlightLabel("cast_time", text("cast_time"), lang) : "",
  ].filter(Boolean);
}

/** A catalog record as a search row in the page language. Server-side: the page and the "show more" route build the rows. */
export function searchRow(item: PlatformCatalogItem, lang: Lang): SearchRow {
  const wow = item.gameId === "wow";
  const typeLabel = wow ? entityTypeLabel(item.entityType, lang) : item.entityType.replaceAll("-", " ");
  // With several games on the site every row names its game.
  const gameName = catalogGames.length > 1 ? catalogGames.find((game) => game.id === item.gameId)?.name : undefined;
  const quality = typeof item.attributes.Quality === "number" ? item.attributes.Quality : undefined;
  // Game text can carry client colour codes (|cFFFFCC99…|r); show the words only.
  const description = playerText(item.description.replace(/\|c[0-9a-fA-F]{8}|\|r/g, ""), lang);
  const iconSymbol = wow ? TYPE_SYMBOLS[item.entityType] : undefined;
  return {
    id: item.id,
    href: item.href,
    name: item.name,
    typeLabel: gameName ? `${gameName} · ${typeLabel}` : typeLabel,
    ...(item.iconUrl ? { iconUrl: item.iconUrl } : {}),
    ...(iconSymbol ? { iconSymbol } : {}),
    ...(item.entityType === "item" && quality !== undefined ? { quality } : {}),
    ...(description ? { description } : {}),
    // WoW facts are rebuilt from structured attributes so they are localized; other games keep their catalog meta.
    meta: wow ? wowFacts(item, lang) : item.meta.slice(1),
  };
}
