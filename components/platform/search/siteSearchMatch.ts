import type { SiteSearchEntry } from "@/lib/search/siteIndex";

/** Lowercase, ё → е, punctuation to spaces: "Сал'ухан" finds "салухан" and "сал ухан". */
export function normalize(value: string) {
  return value.toLowerCase().replace(/ё/g, "е").replace(/['’`]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export type SiteSearchHit = SiteSearchEntry & { score: number };

/**
 * Every word of the query has to match: the title's start beats a word start,
 * a word start beats a substring, and the other language's names count a
 * little less than the title. Ties go to the shorter title.
 */
export function searchIndex(entries: readonly SiteSearchEntry[], query: string, limit = 40): SiteSearchHit[] {
  const words = normalize(query).split(" ").filter(Boolean);
  if (!words.length) return [];
  const whole = words.join(" ");
  const hits: SiteSearchHit[] = [];
  for (const entry of entries) {
    const title = normalize(entry.t);
    const extra = normalize(`${entry.k ?? ""} ${entry.s}`);
    let score = title.startsWith(whole) ? 40 : 0;
    for (const word of words) {
      const best = title.startsWith(word) ? 30
        : ` ${title}`.includes(` ${word}`) ? 22
        : title.includes(word) ? 12
        : ` ${extra}`.includes(` ${word}`) ? 10
        : extra.includes(word) ? 5
        : 0;
      if (!best) { score = 0; break; }
      score += best;
    }
    if (score) hits.push({ ...entry, score });
  }
  return hits.sort((a, b) => b.score - a.score || a.t.length - b.t.length).slice(0, limit);
}
