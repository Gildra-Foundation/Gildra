/**
 * Explicit internal markers; ordinary names such as Temple and contest remain public. Besides the
 * developers' tags (DNT, DND, PH, REUSE, OBSOLETE…) these are the game's own bookkeeping records:
 * a name led by a patch number ("12.x Professions - Tracker - …"), a placeholder in angle brackets,
 * an item id left in the name, and the racing scoreboards in both languages.
 */
export const LIBRARY_INTERNAL_NAME = /(^|[\s_(<\[])(dnt|dnd|ph|test|testing|unused|deprecated|obsolete|reuse|internal|zzold|delete|dummy|nyi)([\s_)>\]:-]|$)|^Ping(\s|$)|Personal Best Record|личный рекорд|лучшее время|^Vignette\s|^zz|^\d+\.(?:\d+|x)(?:\.\d+)*\s|^<.*>$|\(\d{5,}\)$/i;

/** A currency named as a path ("Torghast - Scoreboard - Floor Clear", «Клыкарры – рыболовная сеть – зона 1») is a hidden counter of the game, not a currency a player holds. */
const COUNTER_PATH = /\s[-–]\s.*\s[-–]\s/;

/** A record the lists leave out: unnamed, tagged as internal, or one of the game's hidden counters. */
export function isInternalRecord(name: string | null | undefined, type?: string) {
  const value = (name ?? "").trim();
  return !value || LIBRARY_INTERNAL_NAME.test(value) || (type === "currency" && COUNTER_PATH.test(value));
}
