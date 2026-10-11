/**
 * URL slug from a title in English or Russian: Cyrillic is transliterated
 * (ГОСТ 7.79-2000 system B, simplified), everything else becomes dashes.
 * The result always passes `validateSlug()` (lowercase letters, digits, dashes).
 * Shared by the admin slug field (client) and server code.
 */
const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

export const SLUG_MAX_LENGTH = 80;

export function slugify(title: string): string {
  const latin = Array.from(title.toLowerCase().normalize("NFKD"))
    .map((ch) => CYRILLIC[ch] ?? ch)
    .join("")
    // Drop combining marks left by NFKD (é → e).
    .replace(/[̀-ͯ]/g, "");
  const slug = latin
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= SLUG_MAX_LENGTH) return slug;
  // Cut on a word boundary when possible.
  const cut = slug.slice(0, SLUG_MAX_LENGTH);
  const lastDash = cut.lastIndexOf("-");
  return (lastDash > 20 ? cut.slice(0, lastDash) : cut).replace(/-+$/g, "");
}
