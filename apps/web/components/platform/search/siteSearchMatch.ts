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

/** Whether a[from, from + length) equals b[at, at + length). */
function same(a: string, from: number, b: string, at: number, length: number) {
  for (let k = 0; k < length; k += 1) if (a.charCodeAt(from + k) !== b.charCodeAt(at + k)) return false;
  return true;
}

/** The first `n` letters of `a` and `b` differ by at most one letter changed, added, dropped or swapped with its neighbour (no slices: this runs for every word of the index). */
function nearlyEqual(a: string, n: number, b: string) {
  const m = b.length;
  if (Math.abs(n - m) > 1) return false;
  let i = 0;
  while (i < n && i < m && a.charCodeAt(i) === b.charCodeAt(i)) i += 1;
  if (i === n || i === m) return true;
  if (n === m) {
    return same(a, i + 1, b, i + 1, n - i - 1) || (a.charCodeAt(i) === b.charCodeAt(i + 1) && a.charCodeAt(i + 1) === b.charCodeAt(i) && same(a, i + 2, b, i + 2, n - i - 2));
  }
  return n > m ? same(a, i + 1, b, i, n - i - 1) : same(a, i, b, i + 1, n - i);
}

/** A word of the title that the query word could be a mistyped start of (four letters or more). */
function typoMatch(words: readonly string[], word: string) {
  if (word.length < 4) return false;
  const length = word.length;
  return words.some((candidate) => nearlyEqual(candidate, Math.min(length, candidate.length), word) || nearlyEqual(candidate, Math.min(length + 1, candidate.length), word) || nearlyEqual(candidate, candidate.length, word));
}

type Prepared = { entry: SiteSearchEntry; key: string; title: string; extra: string; spacedTitle: string; spacedExtra: string; titleWords: string[]; extraWords: string[] };
/** Each index normalised once (the dialog searches the same list on every keystroke). */
const prepared = new WeakMap<readonly SiteSearchEntry[], Prepared[]>();
const preparing = new WeakMap<readonly SiteSearchEntry[], Prepared[]>();
const prepareEntry = (entry: SiteSearchEntry): Prepared => {
  const title = normalize(entry.t);
  const extra = normalize(`${entry.k ?? ""} ${entry.s}`);
  return { entry, key: entry.h + entry.t, title, extra, spacedTitle: ` ${title}`, spacedExtra: ` ${extra}`, titleWords: title.split(" "), extraWords: extra.split(" ") };
};

/**
 * Normalises an index, all at once or, given an idle deadline, as much as fits in it.
 * True once the index is ready (idle time prepares it ahead of the first keystroke).
 */
export function prepareIndex(entries: readonly SiteSearchEntry[], deadline?: { timeRemaining: () => number }) {
  if (prepared.has(entries)) return true;
  const list = preparing.get(entries) ?? [];
  preparing.set(entries, list);
  // A few entries even when the deadline is spent (an idle callback that timed out), so it always moves on.
  for (let count = 0; list.length < entries.length && (!deadline || deadline.timeRemaining() > 1 || count < 16); count += 1) list.push(prepareEntry(entries[list.length]));
  if (list.length < entries.length) return false;
  prepared.set(entries, list);
  preparing.delete(entries);
  return true;
}

function prepare(entries: readonly SiteSearchEntry[]) {
  prepareIndex(entries);
  return prepared.get(entries)!;
}

function scoreAll(entries: readonly SiteSearchEntry[], query: string, weight: number, typos: boolean) {
  const words = normalize(query).split(" ").filter(Boolean);
  const hits = new Map<string, SiteSearchHit>();
  if (!words.length) return hits;
  const whole = words.join(" ");
  const spaced = words.map((word) => ` ${word}`);
  for (const { entry, key, title, extra, spacedTitle, spacedExtra, titleWords, extraWords } of prepare(entries)) {
    let score = title.startsWith(whole) ? 40 : 0;
    for (let index = 0; index < words.length; index += 1) {
      const word = words[index];
      let best = title.startsWith(word) ? 30
        : spacedTitle.includes(spaced[index]) ? 22
        : title.includes(word) ? 12
        : spacedExtra.includes(spaced[index]) ? 10
        : extra.includes(word) ? 5
        : 0;
      if (!best && typos) best = typoMatch(titleWords, word) ? 9 : typoMatch(extraWords, word) ? 4 : 0;
      if (!best) { score = 0; break; }
      score += best;
    }
    if (score) hits.set(key, { ...entry, score: score * weight });
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
  const { flat, origin } = flatten(title);
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

/** The normalised title with, for each of its characters, the index in the original (kept per title: rows redraw on every keystroke). */
const flattened = new Map<string, { flat: string; origin: number[] }>();
function flatten(title: string) {
  let known = flattened.get(title);
  if (!known) {
    let flat = "";
    const origin: number[] = [];
    for (let index = 0; index < title.length; index += 1) {
      const char = title[index];
      if (/['’`]/.test(char)) continue;
      const lower = char.toLowerCase() === "ё" ? "е" : char.toLowerCase();
      flat += /[\p{L}\p{N}]/u.test(lower) ? lower : " ";
      origin.push(index);
    }
    known = { flat, origin };
    if (flattened.size > 2000) flattened.clear();
    flattened.set(title, known);
  }
  return known;
}
