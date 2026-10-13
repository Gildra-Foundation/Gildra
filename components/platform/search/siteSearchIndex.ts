import type { SiteSearchEntry } from "@/lib/search/siteIndex";
import type { SiteSearchLang } from "./siteSearchCopy";

/** The quick-search index of both languages (app/api/platform/site-search). */
export type SiteIndex = Record<SiteSearchLang, SiteSearchEntry[]>;

let loaded: SiteIndex | null = null;
let indexLoad: Promise<SiteIndex> | null = null;

/** The index once it has arrived in this page life, else null. */
export const loadedIndex = () => loaded;

/** Fetches the index once per page life (the dialog and the 404 suggestions share it). */
export function loadIndex() {
  indexLoad ??= fetch("/api/platform/site-search").then((response) => {
    if (!response.ok) throw new Error(String(response.status));
    return response.json() as Promise<SiteIndex>;
  }).then((data) => (loaded = data)).catch((error: unknown) => {
    indexLoad = null;
    throw error;
  });
  return indexLoad;
}

/** Event the toolbar's quick search listens for; `detail` is the starting query. */
export const OPEN_SITE_SEARCH = "gildra-open-search";

/** Opens the quick search from anywhere on the page. */
export function openSiteSearch(query = "") {
  window.dispatchEvent(new CustomEvent(OPEN_SITE_SEARCH, { detail: query }));
}
