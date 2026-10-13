/**
 * "Recently opened" of the quick search: the last inner pages the reader
 * visited, kept in this browser only. Paths are stored without the /ru prefix,
 * titles as the page announced them.
 */
const KEY = "gildra-recent-pages";
const LIMIT = 8;

export type RecentPage = { h: string; t: string };

export function readRecentPages(): RecentPage[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(value) ? value.filter((entry): entry is RecentPage => typeof entry?.h === "string" && typeof entry?.t === "string") : [];
  } catch {
    return [];
  }
}

export function rememberPage(path: string, title: string) {
  if (path === "/" || !title) return;
  try {
    const next = [{ h: path, t: title }, ...readRecentPages().filter((entry) => entry.h !== path)].slice(0, LIMIT);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private windows and blocked storage simply have no history.
  }
}

/** The page's own title without the " — Gildra" tail. */
export function pageTitle() {
  return document.title.replace(/\s*[—|·-]\s*Gildra.*$/i, "").trim();
}
