/**
 * Explicit internal markers; ordinary names such as Temple and contest remain public. Besides the
 * developers' tags (DNT, DND, PH, REUSE, OBSOLETE…) these are the game's own bookkeeping records:
 * a name led by a patch number ("12.x Professions - Tracker - …"), a placeholder in angle brackets,
 * an item id left in the name, and the racing scoreboards in both languages.
 */
export const LIBRARY_INTERNAL_NAME = /(^|[\s_(<\[])(dnt|dnd|ph|test|testing|unused|deprecated|obsolete|reuse|internal|zzold|delete|dummy|nyi)([\s_)>\]:-]|$)|^Ping(\s|$)|Personal Best Record|личный рекорд|лучшее время|^Vignette\s|^zz|^\d+\.(?:\d+|x)(?:\.\d+)*\s|^<.*>$|\(\d{5,}\)$/i;

/** A currency named as a path ("Torghast - Scoreboard - Floor Clear", «Клыкарры – рыболовная сеть – зона 1») is a hidden counter of the game, not a currency a player holds. */
const COUNTER_PATH = /\s[-–]\s.*\s[-–]\s/;

/**
 * Records of a type that are not a player's choice, by their game id: the follower-dungeon classes
 * (Adventurer, Traveler), the levelling "Initial" specializations, the Adventurer's one and the
 * hunter pets' (Ferocity, Tenacity, Cunning — each stored twice). The game has 13 classes and 40
 * specializations; the catalog lists 15 and 60.
 */
const NOT_PLAYABLE: Record<string, (id: number) => boolean> = {
  class: (id) => id === 14 || id === 15,
  specialization: (id) => (id >= 1444 && id <= 1465) || id === 1478 || [74, 79, 81, 535, 536, 537].includes(id),
};

/** A record the lists leave out: unnamed, tagged as internal, one of the game's hidden counters, or not a player's class or specialization. */
export function isInternalRecord(name: string | null | undefined, type?: string, externalId?: number) {
  const value = (name ?? "").trim();
  return !value || LIBRARY_INTERNAL_NAME.test(value) || (type === "currency" && COUNTER_PATH.test(value))
    || Boolean(type && externalId !== undefined && NOT_PLAYABLE[type]?.(externalId));
}
