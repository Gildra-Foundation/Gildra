import "server-only";
import type { Lang } from "@/lib/i18n";
import { getTalentSpecTheme } from "@/lib/talentSpecThemes";
import { abilityIcon } from "@/lib/games/wow/assets";
import { fallbackRotationPreset } from "./fallback";
import type { RotationPreset } from "./types";
import { resolveRotationAbilitySpellId } from "./spellIds";
import { gameAbilityName } from "./abilityNames";
import { localizeRotationCatalog, rotationResourceLabel } from "./locale";
import { getLocalizedTalentSpells } from "@/lib/wow/localizedTalentSpells";
import { apiInternalUrl } from "@/lib/env";

const apiURL = () => (process.env.ROTATION_WORKER_URL ?? apiInternalUrl()).replace(/\/$/, "");

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
        // No real ability icon → empty: AbilityIcon draws a neutral placeholder
        // instead of repeating the specialization portrait on every ability.
        return { ...entry, name: gameAbilityName(entry.name), iconUrl: entry.iconUrl || abilityIcon(entry.id) || "", ...(spellId ? { spellId } : {}) };
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
  // tooltip lookups; keep the request bounded and show the spell ID if a
  // localized tooltip is temporarily unavailable.
  try {
    const spellIds = preset.abilities.map((ability) => ability.spellId ?? 0);
    const localized = await getLocalizedTalentSpells(spellIds, lang, 5_000);
    return localizeRotationCatalog(preset, localized, lang);
  } catch {
    return localizeRotationCatalog(preset, new Map(), lang);
  }
}
