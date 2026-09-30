export type CharacterDataMode = "fixture" | "battle-net";

/** Keep every character tool on the same authenticated character context. */
export function withCharacterContext<T extends Record<string, unknown>>(input: T, characterSlug: string | undefined, dataMode: CharacterDataMode) {
  return characterSlug ? { ...input, characterSlug, dataMode } : input;
}

export function characterStorageScope(characterSlug: string | undefined, dataMode: CharacterDataMode) {
  return characterSlug ? `${dataMode}:${encodeURIComponent(characterSlug)}` : "reference";
}
