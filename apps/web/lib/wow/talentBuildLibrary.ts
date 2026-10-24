export type SavedCharacterBuild = { id: string; name: string; loadout: string; scenario: string; savedAt: string; buildVersion: string };
export type TalentBuildLibrary = { schemaVersion: 3; builds: SavedCharacterBuild[]; deleted: Record<string, string> };
export const emptyBuildLibrary = (): TalentBuildLibrary => ({ schemaVersion: 3, builds: [], deleted: {} });
export const characterBuildLimit = 12;
export function parseBuildLibrary(value: unknown): TalentBuildLibrary {
  const library = emptyBuildLibrary();
  if (!value || typeof value !== "object") return library;
  const object = value as Partial<TalentBuildLibrary>;
  const records = Array.isArray(value) ? value : Array.isArray(object.builds) ? object.builds : [];
  for (const entry of records) {
    if (!entry || typeof entry !== "object") continue;
    const b = entry as SavedCharacterBuild;
    if (typeof b.id !== "string" || !b.id || typeof b.name !== "string" || typeof b.loadout !== "string" || !b.loadout || typeof b.buildVersion !== "string") continue;
    library.builds.push({ id: b.id, name: b.name, loadout: b.loadout, scenario: typeof b.scenario === "string" ? b.scenario : "mythic-plus", savedAt: Number.isFinite(Date.parse(b.savedAt)) ? new Date(b.savedAt).toISOString() : new Date(0).toISOString(), buildVersion: b.buildVersion });
  }
  if (object.deleted && typeof object.deleted === "object" && !Array.isArray(object.deleted)) {
    for (const [id, stamp] of Object.entries(object.deleted)) if (Number.isFinite(Date.parse(stamp))) library.deleted[id] = new Date(stamp).toISOString();
  }
  library.builds = library.builds.filter(b => !Object.hasOwn(library.deleted, b.id));
  return library;
}
export function mergeBuildLibraries(a: TalentBuildLibrary, b: TalentBuildLibrary): TalentBuildLibrary {
  const deleted = { ...a.deleted };
  for (const [id, stamp] of Object.entries(b.deleted)) if (!deleted[id] || Date.parse(stamp) > Date.parse(deleted[id])) deleted[id] = stamp;
  const records = new Map<string, SavedCharacterBuild>();
  for (const build of [...a.builds, ...b.builds]) {
    if (Object.hasOwn(deleted, build.id)) continue;
    const existing = records.get(build.id);
    if (!existing || build.savedAt > existing.savedAt || build.savedAt === existing.savedAt && JSON.stringify(build) > JSON.stringify(existing)) records.set(build.id, build);
  }
  return { schemaVersion: 3, deleted, builds: [...records.values()].sort((x, y) => y.savedAt.localeCompare(x.savedAt) || x.id.localeCompare(y.id)) };
}

/** Old browser records have no account owner. Read only after an explicit recovery action. */
export function recoverLegacyCharacterBuilds(storage: Pick<Storage, "length" | "key" | "getItem">, character: string, specialization: string) {
  const prefix = `gildra:character-talents:build-library:v2:battle-net:${character}:${specialization}:`;
  let library = emptyBuildLibrary();
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(prefix)) continue;
    try { library = mergeBuildLibraries(library, parseBuildLibrary(JSON.parse(storage.getItem(key) ?? "null"))); }
    catch { /* Preserve unreadable records; one damaged entry cannot hide the others. */ }
  }
  return library.builds;
}
