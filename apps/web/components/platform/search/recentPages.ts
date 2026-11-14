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

/** The page's own title without the " — WowArcana" tail. */
export function pageTitle() {
  return document.title.replace(/\s*[—|·-]\s*(?:WowArcana|Gildra).*$/i, "").trim();
}

/** Queries the reader searched and then opened a result for, newest first. */
const QUERIES_KEY = "gildra-recent-searches";
const QUERIES_LIMIT = 4;

export function readRecentQueries(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(QUERIES_KEY) ?? "[]") as unknown;
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0).slice(0, QUERIES_LIMIT) : [];
  } catch {
    return [];
  }
}

export function rememberQuery(query: string) {
  const text = query.trim().slice(0, 60);
  if (text.length < 2) return;
  try {
    const next = [text, ...readRecentQueries().filter((entry) => entry.toLowerCase() !== text.toLowerCase())].slice(0, QUERIES_LIMIT);
    localStorage.setItem(QUERIES_KEY, JSON.stringify(next));
  } catch {
    // Blocked storage keeps no history.
  }
}
