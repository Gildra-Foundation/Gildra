import "server-only";

import type { ApiLocale } from "@/lib/games/registry";
import { internalApiFetch, readApiJson } from "@/lib/api/internal";

export type GenshinEntityKind = "characters" | "weapons" | "artifact-sets";

export type GenshinDetailRecord = {
  id?: number;
  name?: string;
  description?: string;
  iconUrl?: string;
  kind?: string;
  slot?: string;
  position?: number;
  region?: string;
  note?: string;
  sourceKind?: string;
  [key: string]: unknown;
};

export type GenshinEntityDetail = {
  id: number;
  externalId: number;
  slug: string;
  name: string;
  title?: string;
  description?: string;
  rarity?: number;
  minRarity?: number;
  maxRarity?: number;
  element?: string;
  weaponType?: string;
  region?: string;
  baseAttack?: number;
  secondaryStat?: string;
  secondaryStatValue?: number;
  passiveName?: string;
  passiveDescription?: string;
  twoPieceBonus?: string;
  fourPieceBonus?: string;
  iconUrl?: string;
  portraitUrl?: string;
  locale: ApiLocale;
  localeFallback?: boolean;
  stats?: unknown;
  talents?: GenshinDetailRecord[];
  constellations?: GenshinDetailRecord[];
  refinements?: GenshinDetailRecord[];
  pieces?: GenshinDetailRecord[];
  sources?: GenshinDetailRecord[];
};


export async function getGenshinEntityDetail(kind: GenshinEntityKind, slug: string, locale: ApiLocale) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const response = await internalApiFetch(`/genshin-impact/v1/${kind}/${encodeURIComponent(slug)}?locale=${locale}`, { timeoutMs: 10_000, cache: "no-store" });
  if (response.status === 404) return null;
  return readApiJson<GenshinEntityDetail>(response, "Genshin database");
}
