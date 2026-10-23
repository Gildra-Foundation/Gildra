import data from "@/lib/data/wow/mythicPlayerTools";
import type { PullMechanic, PullRole } from "./mdtPullIntel";
import { decodeMythicTalentImport, maxTalentStringLength, type TalentSpellSelection, type TalentImportResult } from "./mythicTalentImport";

export type Localized = { ru: string; en: string };
export type EffectType = "magic" | "curse" | "poison" | "disease" | "bleed" | "enrage";
export type ToolKind = "interrupt" | "stop" | "dispel" | "purge" | "defend";
export type PlayerOption = { spellId: number; talentSpellId?: number; effects?: EffectType[]; mechanicSpellIds?: number[]; note?: Localized; extraEffects?: { effects: EffectType[]; talentSpellId: number } };
export type PlayerSpec = { id: number; classId: number; className: Localized; name: Localized; role: PullRole } & Record<ToolKind, PlayerOption[]>;
export type PlayerSpell = { id: number; name: Localized; iconUrl: string; source: string };
type PlayerCatalogue = { patch: string; checkedAt: string; sources: string[]; specs: PlayerSpec[]; spells: Record<string, PlayerSpell>; mechanicEffects: Record<string, EffectType> };
export const playerCatalogue = data as PlayerCatalogue;
export const playerSpecs = playerCatalogue.specs;
export const playerClasses = [...new Map(playerSpecs.map(spec => [spec.classId, { id: spec.classId, name: spec.className }])).values()];
export type PlayerProfile = { classId: number | null; specId: number | null; talentString?: string };
export const playerProfileKey = "gildra:mythic:player-profile";

export function parsePlayerProfile(raw: unknown): PlayerProfile {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!value || typeof value !== "object" || !playerClasses.some(c => c.id === value.classId)) return { classId: null, specId: null };
    const spec = playerSpecs.find(s => s.id === value.specId && s.classId === value.classId);
    const profile: PlayerProfile = { classId: value.classId, specId: spec?.id ?? null };
    if (spec && value.talentString !== undefined && value.talentString !== "") profile.talentString = typeof value.talentString === "string" && value.talentString.length <= maxTalentStringLength ? value.talentString : "!";
    return profile;
  } catch { return { classId: null, specId: null }; }
}

/** Revalidate saved strings against today's topology. A stale import never restores optional suggestions silently. */
export function talentsForProfile(profile: PlayerProfile): { selection: TalentSpellSelection; result: TalentImportResult | null } {
  if (!profile.talentString) return { selection: undefined, result: null };
  const decoded = decodeMythicTalentImport(profile.talentString);
  const result: TalentImportResult = decoded.ok && (decoded.specId !== profile.specId || decoded.classId !== profile.classId) ? { ok: false, error: "spec" } : decoded;
  return { selection: new Set(result.ok ? result.selectedSpellIds : []), result };
}

const kinds: Partial<Record<PullMechanic["action"], ToolKind>> = { "Кик": "interrupt", "Стоп": "stop", "Диспел": "dispel", "Пурж": "purge", "Защита": "defend" };
export function mechanicKind(mechanic: PullMechanic) { return kinds[mechanic.action]; }
export function mechanicEffect(mechanic: PullMechanic) { return mechanic.spellId ? playerCatalogue.mechanicEffects[mechanic.spellId] : undefined; }

/** Effect identity and specialization membership are explicit; translated prose never selects a spell. */
export function toolsForMechanic(spec: PlayerSpec, mechanic: PullMechanic, selectedSpells?: TalentSpellSelection) {
  const kind = mechanicKind(mechanic);
  if (!kind) return [];
  const effect = mechanicEffect(mechanic);
  if ((kind === "dispel" || kind === "purge") && !effect) return [];
  return spec[kind].flatMap(option => {
    if (selectedSpells && option.talentSpellId && !selectedSpells.has(option.talentSpellId)) return [];
    const extra = effect && option.extraEffects?.effects.includes(effect) && (!selectedSpells || selectedSpells.has(option.extraEffects.talentSpellId));
    const specific = mechanic.spellId && option.mechanicSpellIds?.includes(mechanic.spellId);
    if ((kind === "dispel" || kind === "purge") && effect && !option.effects?.includes(effect) && !extra && !specific) return [];
    const spell = playerCatalogue.spells[option.spellId];
    if (!spell) return [];
    const talentIds = [...new Set([option.talentSpellId, ...(extra ? [option.extraEffects?.talentSpellId] : [])].filter((id): id is number => Boolean(id)))];
    return [{ spell, note: option.note, talents: talentIds.flatMap(id => playerCatalogue.spells[id] ? [playerCatalogue.spells[id]] : []) }];
  });
}

/** Tanks can kick and damage dealers can remove supported ally debuffs regardless of the default role assignment. */
export function canHelpWithMechanic(spec: PlayerSpec, mechanic: PullMechanic, selectedSpells?: TalentSpellSelection) {
  const kind = mechanicKind(mechanic);
  return Boolean(kind && kind !== "defend" && toolsForMechanic(spec, mechanic, selectedSpells).length);
}
