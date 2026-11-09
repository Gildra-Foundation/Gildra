import type { SiteSearchEntry } from "@/lib/search/siteIndex";

/** Lowercase, ё → е, punctuation to spaces: "Сал'ухан" finds "салухан" and "сал ухан". */
export function normalize(value: string) {
  return value.toLowerCase().replace(/ё/g, "е").replace(/['’`]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export type SiteSearchHit = SiteSearchEntry & { score: number };

// The same keys on the English and the Russian keyboard: "ckjdj" typed with
// the wrong layout is "слово".
const EN_KEYS = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const RU_KEYS = "йцукенгшщзхъфывапролджэячсмитьбюё";
const toRu = new Map([...EN_KEYS].map((key, index) => [key, RU_KEYS[index]]));
const toEn = new Map([...RU_KEYS].map((key, index) => [key, EN_KEYS[index]]));

/** The query as it was meant on the other keyboard layout, or null when it reads the same. */
export function otherLayout(query: string) {
  const lower = query.toLowerCase();
  const cyrillic = /[а-яё]/.test(lower);
  const latin = /[a-z]/.test(lower);
  if (cyrillic === latin) return null;
  const map = cyrillic ? toEn : toRu;
  return [...lower].map((char) => map.get(char) ?? char).join("");
}

// Russian letters by their usual Latin spelling (longest first) and back, so
// "nalorak" finds "Налорак" and "друид" finds "Druid".
const LATIN_TO_CYRILLIC: [string, string][] = [
  ["shch", "щ"], ["sch", "щ"], ["zh", "ж"], ["kh", "х"], ["ts", "ц"], ["ch", "ч"], ["sh", "ш"], ["yu", "ю"], ["ya", "я"], ["yo", "е"], ["ye", "е"],
  ["a", "а"], ["b", "б"], ["v", "в"], ["w", "в"], ["g", "г"], ["d", "д"], ["e", "е"], ["z", "з"], ["i", "и"], ["y", "й"], ["k", "к"], ["c", "к"], ["q", "к"],
  ["l", "л"], ["m", "м"], ["n", "н"], ["o", "о"], ["p", "п"], ["r", "р"], ["s", "с"], ["t", "т"], ["u", "у"], ["f", "ф"], ["h", "х"], ["x", "кс"],
];
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

/** The query spelled in the other alphabet, or null when it has no letters of one alphabet only. */
export function transliterate(query: string) {
  const lower = normalize(query);
  if (/[а-я]/.test(lower) && !/[a-z]/.test(lower)) return [...lower].map((char) => CYRILLIC_TO_LATIN[char] ?? char).join("");
  if (/[a-z]/.test(lower) && !/[а-я]/.test(lower)) {
    let out = "";
    for (let index = 0; index < lower.length;) {
      const pair = LATIN_TO_CYRILLIC.find(([latin]) => lower.startsWith(latin, index));
      if (pair) { out += pair[1]; index += pair[0].length; } else { out += lower[index]; index += 1; }
    }
    return out;
  }
  return null;
}

/** At most one letter changed, added, dropped or swapped with its neighbour. */
function nearlyEqual(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  if (i === a.length || i === b.length) return Math.abs(a.length - b.length) <= 1;
  if (a.length === b.length) {
    return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  }
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/** A word of the title that the query word could be a mistyped start of (four letters or more). */
function typoMatch(words: readonly string[], word: string) {
  if (word.length < 4) return false;
  return words.some((candidate) => nearlyEqual(candidate.slice(0, word.length), word) || nearlyEqual(candidate.slice(0, word.length + 1), word) || nearlyEqual(candidate, word));
}

function scoreAll(entries: readonly SiteSearchEntry[], query: string, weight: number, typos: boolean) {
  const words = normalize(query).split(" ").filter(Boolean);
  const hits = new Map<string, SiteSearchHit>();
  if (!words.length) return hits;
  const whole = words.join(" ");
  for (const entry of entries) {
    const title = normalize(entry.t);
    const extra = normalize(`${entry.k ?? ""} ${entry.s}`);
    let score = title.startsWith(whole) ? 40 : 0;
    let titleWords: string[] | null = null;
    let extraWords: string[] | null = null;
    for (const word of words) {
      let best = title.startsWith(word) ? 30
        : ` ${title}`.includes(` ${word}`) ? 22
        : title.includes(word) ? 12
        : ` ${extra}`.includes(` ${word}`) ? 10
        : extra.includes(word) ? 5
        : 0;
      if (!best && typos) {
        titleWords ??= title.split(" ");
        extraWords ??= extra.split(" ");
        best = typoMatch(titleWords, word) ? 9 : typoMatch(extraWords, word) ? 4 : 0;
      }
      if (!best) { score = 0; break; }
      score += best;
    }
    if (score) hits.set(entry.h + entry.t, { ...entry, score: score * weight });
  }
  return hits;
}

/**
 * Every word of the query has to match: the title's start beats a word start,
 * a word start beats a substring, and the other language's names count a
 * little less than the title. Ties go to the shorter title. When the query
 * finds little as typed, it is also tried on the other keyboard layout, in
 * the other alphabet and with one typo per word, each worth less.
 */
export function searchIndex(entries: readonly SiteSearchEntry[], query: string, limit = 40): SiteSearchHit[] {
  const hits = scoreAll(entries, query, 1, false);
  if (hits.size < 3) {
    const tries: [string | null, number][] = [[otherLayout(query), .9], [transliterate(query), .8], [query, .7]];
    for (const [variant, weight] of tries) {
      if (!variant || !variant.trim()) continue;
      for (const [key, hit] of scoreAll(entries, variant, weight, weight === .7)) {
        if ((hits.get(key)?.score ?? 0) < hit.score) hits.set(key, hit);
      }
    }
  }
  return [...hits.values()].sort((a, b) => b.score - a.score || a.t.length - b.t.length).slice(0, limit);
}

/**
 * Where the query's words appear in a title, as [start, end) ranges of the
 * title as written (apostrophes and ё are matched the way `normalize` does).
 */
export function matchRanges(title: string, query: string): [number, number][] {
  const words = normalize(query).split(" ").filter(Boolean);
  if (!words.length) return [];
  // The normalised title with, for each of its characters, the index in the original.
  let flat = "";
  const origin: number[] = [];
  for (let index = 0; index < title.length; index += 1) {
    const char = title[index];
    if (/['’`]/.test(char)) continue;
    const lower = char.toLowerCase() === "ё" ? "е" : char.toLowerCase();
    flat += /[\p{L}\p{N}]/u.test(lower) ? lower : " ";
    origin.push(index);
  }
  const ranges: [number, number][] = [];
  for (const word of words.sort((a, b) => b.length - a.length)) {
    let at = ` ${flat}`.indexOf(` ${word}`);
    if (at < 0) at = flat.indexOf(word);
    if (at < 0) continue;
    const start = origin[at];
    const end = origin[at + word.length - 1] + 1;
    if (ranges.some(([from, to]) => start < to && end > from)) continue;
    ranges.push([start, end]);
  }
  return ranges.sort((a, b) => a[0] - b[0]);
}
