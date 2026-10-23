import { decodeMythicTalentImport, maxTalentStringLength } from "./mythicTalentImport";

export const savedTalentBuildsKey = "gildra:mythic:saved-talent-builds";
export const maxSavedTalentBuilds = 20;
export const maxBuildNameLength = 64;
export type SavedTalentBuild = { id: string; name: string; code: string };
export type BuildSaveError = "name" | "limit" | "invalid";
export type BuildSaveResult = { ok: true; builds: SavedTalentBuild[] } | { ok: false; error: BuildSaveError };

/** Keep outdated exports so users can identify and delete them, never silently apply them. */
export function parseSavedTalentBuilds(raw: string): { builds: SavedTalentBuild[]; corrupt: boolean } {
  if (!raw) return { builds: [], corrupt: false };
  try {
    if (raw.length > 100_000) throw new Error("Oversized library");
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !Array.isArray(value.builds)) throw new Error("Invalid library");
    const builds: SavedTalentBuild[] = [];
    let corrupt = false;
    for (const entry of value.builds) {
      if (!entry || typeof entry.id !== "string" || !entry.id || entry.id.length > 128 || typeof entry.name !== "string" || !entry.name.trim() || entry.name.length > maxBuildNameLength || typeof entry.code !== "string" || !entry.code || entry.code.length > maxTalentStringLength || builds.some(b => b.id === entry.id) || builds.length >= maxSavedTalentBuilds) { corrupt = true; continue; }
      const decoded = decodeMythicTalentImport(entry.code);
      const code = decoded.ok ? decoded.code : entry.code;
      if (builds.some(b => b.code === code)) { corrupt = true; continue; }
      builds.push({ id: entry.id, name: entry.name.trim(), code });
    }
    return { builds, corrupt };
  } catch { return { builds: [], corrupt: true }; }
}

/** Same canonical export updates its name; different allocations remain separate. */
export function saveTalentBuild(builds: SavedTalentBuild[], name: string, raw: string, newId: string): BuildSaveResult {
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > maxBuildNameLength) return { ok: false, error: "name" };
  const decoded = decodeMythicTalentImport(raw);
  if (!decoded.ok) return { ok: false, error: "invalid" };
  const existing = builds.find(build => build.code === decoded.code);
  if (existing) return { ok: true, builds: builds.map(build => build.id === existing.id ? { ...build, name: cleanName } : build) };
  if (builds.length >= maxSavedTalentBuilds) return { ok: false, error: "limit" };
  return { ok: true, builds: [...builds, { id: newId, name: cleanName, code: decoded.code }] };
}

export function removeTalentBuild(builds: SavedTalentBuild[], id: string) {
  return builds.filter(build => build.id !== id);
}
