import type { BattleNetCharacter } from "./battleNetCharacters";

/** URL slug of a Battle.net character: region--realm--name. Pure, safe on the client. */
export function characterSlug(character: Pick<BattleNetCharacter, "region" | "realm" | "name">) {
  return `${character.region}--${character.realm.slug}--${encodeURIComponent(character.name.toLowerCase())}`;
}
