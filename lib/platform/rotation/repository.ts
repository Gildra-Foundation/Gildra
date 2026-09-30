import "server-only";
import type { Lang } from "@/lib/i18n";
import { getTalentSpecTheme } from "@/lib/talentSpecThemes";
import { abilityIcon } from "@/lib/games/wow/assets";
import { fallbackRotationPreset } from "./fallback";
import type { RotationPreset } from "./types";
import { resolveRotationAbilitySpellId } from "./spellIds";
import { localizeRotationCatalog, rotationResourceLabel } from "./locale";
import { getLocalizedTalentSpells } from "@/lib/wow/localizedTalentSpells";

const apiURL = () => (process.env.ROTATION_WORKER_URL ?? process.env.API_INTERNAL_URL ?? "http://api:8080").replace(/\/$/, "");

function isPreset(value: unknown): value is RotationPreset {
  if (!value || typeof value !== "object") return false;
  const preset = value as Partial<RotationPreset>;
  return typeof preset.slug === "string" && Array.isArray(preset.abilities) && Array.isArray(preset.defaultRules);
}

export async function getRotationPreset(slug: string, lang: Lang): Promise<RotationPreset> {
  const locale = lang === "ru" ? "ru_RU" : "en_US";
  try {
    const response = await fetch(`${apiURL()}/v1/wow/rotation/${encodeURIComponent(slug)}?locale=${locale}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2_500),
    });
    if (!response.ok) throw new Error(`rotation preset request failed (${response.status})`);
    const payload: unknown = await response.json();
    if (!isPreset(payload)) throw new Error("rotation preset response has an invalid shape");
    const theme = getTalentSpecTheme(slug);
    return localizePreset({
      ...payload,
      resourceLabel: rotationResourceLabel(payload.resourceLabel || theme?.resourceLabel || "Resource", lang),
      character: { ...payload.character, iconUrl: payload.character.iconUrl || theme?.iconUrl || "" },
      abilities: payload.abilities.map((entry) => {
        const spellId = resolveRotationAbilitySpellId(entry.id, entry.spellId);
        return { ...entry, iconUrl: entry.iconUrl || abilityIcon(entry.id) || theme?.iconUrl || "", ...(spellId ? { spellId } : {}) };
      }),
    }, lang);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.warn("rotation preset unavailable; using preview contract", error);
    return localizePreset(await fallbackRotationPreset(slug, lang), lang);
  }
}

async function localizePreset(preset: RotationPreset, lang: Lang): Promise<RotationPreset> {
  // The English preset already carries the canonical catalog names. Loading
  // both localized talent trees here only rebuilt an English-to-English map
  // and made every cold rotation request wait on the full talent catalog.
  if (lang === "en") return { ...preset, locale: lang };

  // Only names shown by this preset are needed here. Loading full live talent
  // trees also visits unrelated PvP/talent entries and can trigger dozens of
  // tooltip lookups; keep the request bounded and use English names if a
  // localized tooltip is temporarily unavailable.
  try {
    const spellIds = preset.abilities.map((ability) => ability.spellId ?? 0);
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const localized = await Promise.race([
      getLocalizedTalentSpells(spellIds, lang, 1_500),
      new Promise<Map<number, { name: string; description: string }>>((resolve) => {
        deadline = setTimeout(() => resolve(new Map()), 1_600);
      }),
    ]);
    if (deadline) clearTimeout(deadline);
    return localizeRotationCatalog(preset, localized, lang);
  } catch {
    return preset;
  }
}
