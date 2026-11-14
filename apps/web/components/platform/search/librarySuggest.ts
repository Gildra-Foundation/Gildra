import type { LibraryRecordView } from "@/components/library/libraryRecordView";
import type { SiteSearchLang } from "./siteSearchCopy";

/** What the quick search shows of a library record. */
export type LibraryHit = Pick<LibraryRecordView, "id" | "href" | "name" | "typeLabel" | "iconUrl">;

/** Library records are asked for from two letters on (the suggestions endpoint refuses less). */
export const LIBRARY_MIN_QUERY = 2;
/** Records of the library in the quick search: a few, the rest is one row away on the search page. */
export const LIBRARY_LIMIT = 5;

/** The key of a query's records; empty when the query is too short to ask. */
export function libraryQueryKey(query: string, lang: SiteSearchLang) {
  const trimmed = query.trim();
  return trimmed.length < LIBRARY_MIN_QUERY || trimmed.length > 200 ? "" : `${lang}|${trimmed.toLocaleLowerCase()}`;
}

export function librarySuggestUrl(query: string, lang: SiteSearchLang) {
  return `/api/platform/library/suggest?${new URLSearchParams({ q: query.trim(), lang, product: "wow" })}`;
}

/** The records of a suggestions answer the dialog lists: named, with an address, no more than the limit. */
export function libraryHits(payload: unknown, limit = LIBRARY_LIMIT): LibraryHit[] {
  const records = (payload as { records?: unknown } | null)?.records;
  if (!Array.isArray(records)) return [];
  return (records as Partial<LibraryHit>[])
    .filter((record): record is LibraryHit => typeof record?.id === "string" && typeof record.href === "string" && record.href.startsWith("/") && typeof record.name === "string" && record.name.trim() !== "")
    .slice(0, limit)
    .map(({ id, href, name, typeLabel, iconUrl }) => ({ id, href, name, typeLabel: typeLabel ?? "", ...(iconUrl ? { iconUrl } : {}) }));
}

const known = new Map<string, LibraryHit[]>();

/** Records already fetched for this query in this page life. */
export const knownLibraryHits = (key: string) => known.get(key);

/** Fetches a query's records once per page life; a failed request leaves the list empty and is asked again next time. */
export async function loadLibraryHits(query: string, lang: SiteSearchLang, signal?: AbortSignal): Promise<LibraryHit[]> {
  const key = libraryQueryKey(query, lang);
  if (!key) return [];
  const cached = known.get(key);
  if (cached) return cached;
  const response = await fetch(librarySuggestUrl(query, lang), { signal });
  if (!response.ok) return [];
  const hits = libraryHits(await response.json());
  if (known.size > 200) known.clear();
  known.set(key, hits);
  return hits;
}
