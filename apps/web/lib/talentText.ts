// Text clean-up for talent descriptions that reach the page with game template leftovers.

const word = "[\\p{L}-]+";
// "3 дополнительных удара:дополнительных ударов глефой": the number, its words, then the other plural form glued by a colon.
const pluralPair = new RegExp(`(\\d+(?:[.,]\\d+)?)(\\s+)((?:${word}\\s+){0,2}${word}):((?:${word}\\s+){0,3}${word})`, "gu");

/** Picks the Russian plural form a number needs when a description still carries "few:many" forms. */
export function resolvePluralForms(text: string) {
  return text.replace(pluralPair, (_match, amount: string, space: string, few: string, rest: string) => {
    const size = few.split(/\s+/).length;
    const after = rest.split(/\s+/);
    const many = after.slice(0, size).join(" ");
    const tail = after.slice(size).join(" ");
    const value = Number(amount.replace(",", "."));
    const lastTwo = Math.floor(value) % 100;
    const last = Math.floor(value) % 10;
    const useFew = Number.isInteger(value) && last >= 1 && last <= 4 && !(lastTwo >= 11 && lastTwo <= 14);
    return `${amount}${space}${useFew ? few : many}${tail ? ` ${tail}` : ""}`;
  });
}
