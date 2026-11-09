import type { SiteSearchEntry } from "@/lib/search/siteIndex";
import type { SiteSearchLang } from "./siteSearchCopy";

/** The quick-search index of both languages (app/api/platform/site-search). */
export type SiteIndex = Record<SiteSearchLang, SiteSearchEntry[]>;

let loaded: SiteIndex | null = null;
let indexLoad: Promise<SiteIndex> | null = null;

let failed = false;
const listeners = new Set<() => void>();
const notify = () => { for (const listener of listeners) listener(); };

/** The index once it has arrived in this page life, else null. */
export const loadedIndex = () => loaded;
/** The last load failed (a new subscription tries again). */
export const indexFailed = () => failed;

/** useSyncExternalStore subscription: loads the index if needed and tells when it arrives or fails. */
export function subscribeIndex(callback: () => void) {
  listeners.add(callback);
  if (!loaded) loadIndex().then(notify, notify);
  return () => { listeners.delete(callback); };
}

/** Fetches the index once per page life (the dialog and the 404 suggestions share it). */
export function loadIndex() {
  indexLoad ??= fetch("/api/platform/site-search").then((response) => {
    if (!response.ok) throw new Error(String(response.status));
    return response.json() as Promise<SiteIndex>;
  }).then((data) => {
    failed = false;
    return (loaded = data);
  }).catch((error: unknown) => {
    indexLoad = null;
    failed = true;
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
