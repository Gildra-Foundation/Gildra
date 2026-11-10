/** Normalize apostrophes and accents for RU names and English aliases alike. */
export function searchText(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/ё/g, "е").replace(/[’‘']/g, "").trim();
}
export function matchesSearch(query: string, values: string[]) {
  const haystack = searchText(values.join(" "));
  return searchText(query).split(/\s+/).every(word => haystack.includes(word));
}
export function matchesLevel(level: string, min: number, max: number) {
  return level === "" || (Number(level) >= min && Number(level) <= max);
}
