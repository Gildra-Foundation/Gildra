import type { SearchKind } from "@/lib/platform/catalog/types";

/**
 * One search result as the row draws it, already in the page language. Built on
 * the server (the page and the "show more" route), drawn by the client list, so
 * the first rows and the appended ones are the same row.
 */
export type SearchRow = {
  id: string;
  href: string;
  name: string;
  typeLabel: string;
  iconUrl?: string;
  /** Sprite symbol of the record type, shown while the catalog icon is missing. */
  iconSymbol?: string;
  /** Blizzard item quality 0–7 (data colour of the name and the icon edge). */
  quality?: number;
  description?: string;
  /** Short facts in one line: item level, slot, required level, spell school, cast time. */
  meta: string[];
};

/** The query a result list shares with its "show more" request. */
export type SearchListQuery = {
  q: string;
  kind: SearchKind;
  /** Named only while the site searches several games. */
  game?: string;
};

/** Query string of a "show more" request and of the next-page address without JavaScript. */
export function searchListParams(query: SearchListQuery, cursor: string) {
  const params = new URLSearchParams({ q: query.q });
  if (query.kind !== "all") params.set("type", query.kind);
  if (query.game) params.set("game", query.game);
  params.set("cursor", cursor);
  return params;
}

const CURSOR = /^[A-Za-z0-9_=-]{1,128}$/;

/** A catalog cursor from the address bar, or nothing when it is not one. */
export function searchCursor(value: string | string[] | null | undefined) {
  return typeof value === "string" && CURSOR.test(value) ? value : "";
}
