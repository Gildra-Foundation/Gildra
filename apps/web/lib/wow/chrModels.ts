/**
 * Playable race (Battle.net `playable_race.id`) → ChrModel ids of the Wowhead
 * character viewer, [male, female]. Taken from the game tables ChrRaces and
 * ChrRaceXChrModel; `meta/character/<id>.json` of the viewer names the race and
 * sex of each id. Allied races are not consecutive with the core races (ids
 * 23–52 are NPC models such as Fel Orc, Naga or Skeleton), Pandaren of both
 * factions share one model and Dracthyr is a single model for both sexes.
 */
const chrModelsByRace: Record<number, readonly [male: number, female: number]> = {
  1: [1, 2], 2: [3, 4], 3: [5, 6], 4: [7, 8], 5: [9, 10], 6: [11, 12], 7: [13, 14], 8: [15, 16],
  9: [17, 18], 10: [19, 20], 11: [21, 22], 22: [43, 44],
  24: [47, 48], 25: [47, 48], 26: [47, 48],
  27: [53, 54], 28: [55, 56], 29: [57, 58], 30: [59, 60], 31: [61, 62], 32: [63, 64],
  34: [67, 68], 35: [69, 70], 36: [71, 72], 37: [73, 74],
  52: [89, 89], 70: [89, 89],
  84: [195, 196], 85: [195, 196],
  86: [200, 201], 91: [200, 201],
};

export function chrModelIdForRace(raceId: number, female: boolean): number | undefined {
  const models = chrModelsByRace[raceId];
  return models ? models[female ? 1 : 0] : undefined;
}
