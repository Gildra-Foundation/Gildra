/**
 * The SimulationCraft worker title-cases action tokens word by word
 * ("touch_of_the_magi" → "Touch Of The Magi"), while the game keeps minor
 * words lower-case ("Touch of the Magi"). Only English minor words between two
 * other words change; every other spelling stays exactly as in the data.
 */
const titledMinorWord = / (A|An|And|As|At|By|For|From|In|Into|Of|On|Or|The|To|With)(?= )/g;

/** SimulationCraft tokens drop the apostrophe of a possessive ("odyns_fury"); the game spells it out. */
const possessives: Record<string, string> = {
  "Odyns Fury": "Odyn's Fury", "Elunes Guidance": "Elune's Guidance", "Ashamanes Guidance": "Ashamane's Guidance",
  "Kil Jaedens Cunning": "Kil'jaeden's Cunning", "Hand Of Guldan": "Hand of Gul'dan", "Hand of Guldan": "Hand of Gul'dan",
  "Nature S Swiftness": "Nature's Swiftness", "Natures Swiftness": "Nature's Swiftness",
  "Tyrs Deliverance": "Tyr's Deliverance", "Avengers Shield": "Avenger's Shield", "Hunters Mark": "Hunter's Mark",
"Death S Advance": "Death's Advance", "Deaths Advance": "Death's Advance", "Deaths Caress": "Death's Caress",
};

export function gameAbilityName(name: string): string {
  const spelled = name.replace(titledMinorWord, (_match, word: string) => ` ${word.toLowerCase()}`);
  return possessives[spelled] ?? spelled;
}

/** A SimulationCraft token without a label ("sudden-death", "touch_of_the_magi") as the game names it. */
export function gameTokenName(token: string): string {
  return gameAbilityName(token.split(/[-_ ]+/).filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1)).join(" "));
}
