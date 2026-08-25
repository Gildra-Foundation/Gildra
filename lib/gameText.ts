import type { Lang } from "@/lib/i18n";

export function formatQuestText(text: string, lang: Lang) {
  return cleanWowText(text.replaceAll(/\{name\}/gi, lang === "ru" ? "герой" : "adventurer"), lang);
}

/**
 * Converts client-side WoW text tokens into a readable, context-neutral form.
 * Conditional tokens keep both branches because the catalog does not know the
 * viewing character's auras, talents, gender, or other runtime state.
 */
export function cleanWowText(value: string, lang: Lang) {
  const scaling = lang === "ru" ? "масштабируемое количество" : "a scaling amount";
  let readable = value;

  // A branch can itself contain a conditional, so resolve from the inside out.
  for (let pass = 0; pass < 8; pass += 1) {
    let replaced = false;
    readable = readable.replace(/\$\?[^\[\r\n]+\[([^\[\]]*)\]\[([^\[\]]*)\]/g, (_match, whenTrue: string, whenFalse: string) => {
      replaced = true;
      const alternatives = [whenTrue.trim(), whenFalse.trim()].filter((text, index, all) => text && all.indexOf(text) === index);
      return alternatives.join(" / ");
    });
    if (!replaced) break;
  }

  return readable
    .replace(/\|c[0-9a-f]{8}/gi, "")
    .replace(/\|r/gi, "")
    .replace(/\|n/gi, "\n")
    .replace(/\$@spelldesc(\d+)/gi, "Spell #$1")
    .replace(/\$z\b/g, lang === "ru" ? "место привязки" : "your home location")
    .replace(/\$\d+s\d+/gi, scaling)
    .replace(/\$s\d+/gi, scaling)
    .replace(/\$w\d+/gi, scaling)
    .replace(/\$d\b/gi, lang === "ru" ? "указанного времени" : "the listed duration")
    .replace(/\$t\d+/gi, lang === "ru" ? "указанный интервал" : "the listed interval")
    .replace(/\$x\d+/gi, lang === "ru" ? "несколько" : "several")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .trim();
}
