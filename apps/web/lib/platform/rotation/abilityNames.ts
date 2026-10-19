/**
 * The SimulationCraft worker title-cases action tokens word by word
 * ("touch_of_the_magi" → "Touch Of The Magi"), while the game keeps minor
 * words lower-case ("Touch of the Magi"). Only English minor words between two
 * other words change; every other spelling stays exactly as in the data.
 */
const titledMinorWord = / (A|An|And|As|At|By|For|From|In|Into|Of|On|Or|The|To|With)(?= )/g;

export function gameAbilityName(name: string): string {
  return name.replace(titledMinorWord, (_match, word: string) => ` ${word.toLowerCase()}`);
}
