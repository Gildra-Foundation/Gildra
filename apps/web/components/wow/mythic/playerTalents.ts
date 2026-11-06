import { decodeMythicTalentImport, type TalentImportResult, type TalentSpellSelection } from "./mythicTalentImport";
import type { PlayerProfile } from "./playerTools";

/** Revalidate saved strings against today's topology. A stale import never restores optional suggestions silently. */
export function talentsForProfile(profile: PlayerProfile): { selection: TalentSpellSelection; result: TalentImportResult | null } {
  if (!profile.talentString) return { selection: undefined, result: null };
  const decoded = decodeMythicTalentImport(profile.talentString);
  const result: TalentImportResult = decoded.ok && (decoded.specId !== profile.specId || decoded.classId !== profile.classId) ? { ok: false, error: "spec" } : decoded;
  return { selection: new Set(result.ok ? result.selectedSpellIds : []), result };
}
