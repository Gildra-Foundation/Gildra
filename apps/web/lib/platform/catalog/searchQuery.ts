/**
 * The search text as the catalog should get it. Quotes, brackets and sentence punctuation are not
 * part of any name's words (the catalog matches words: `Hero (Mythic)` finds what `Hero Mythic`
 * finds), but a query that carries them takes the catalog's slow path: `"fire"` or `a'` run into
 * its ten-second limit and come back as "catalog unavailable". Apostrophes and hyphens stay
 * (Sen'jin, Kel'Thuzad, Two-Handed). A query with fewer than two letters or digits is not asked
 * at all: one letter is the same slow path, and nothing a player looks for.
 */
export function catalogSearchQuery(raw: string): string {
  const cleaned = raw
    .replace(/["“”„«»‹›;:!?()[\]{}|\\/*~^=<>+]|--+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const letters = cleaned.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  return letters < 2 ? "" : cleaned;
}
