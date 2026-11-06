import type { Lang } from "@/lib/i18n";
import { gameTextCopy } from "./gameTextCopy";

/** Quest text addresses the player by name, class and race: the page reads them as the game's own words for a hero. */
export function formatQuestText(text: string, lang: Lang) {
  return text
    .replaceAll(/\{name\}/gi, gameTextCopy[lang].adventurer)
    .replaceAll(/\{(?:class|race)\}/gi, gameTextCopy[lang].hero);
}

// The catalog writes a value it could not resolve for the build as a phrase
// ("Deals a game-defined value Fire damage", "Наносит значение, определяемое игрой ед. урона").
// A player reads such a value as X, the way the game's own unfinished tooltips do.
const UNKNOWN_VALUE = /\ba game-defined value\b|значени(?:е|я|ем|ю), определяем(?:ое|ого|ым|ому) игрой/gi;

/** Description or effect text as a player reads it: unresolved values as X, quest addresses as words. */
export function playerText(text: string, lang: Lang) {
  if (!text) return text;
  return formatQuestText(text.replaceAll(UNKNOWN_VALUE, "X"), lang)
    // "X%" / "X сек." read as they are; "на X." at the end of a sentence too. Doubled spaces from the source go.
    .replaceAll(/[ \t]{2,}/g, " ");
}
