import "server-only";

import type { ApiLocale } from "@/lib/games/registry";

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

const apiURL = () => (process.env.API_INTERNAL_URL ?? "http://api:8080").replace(/\/$/, "");

export async function getGenshinEntityDetail(kind: GenshinEntityKind, slug: string, locale: ApiLocale) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const response = await fetch(`${apiURL()}/genshin-impact/v1/${kind}/${encodeURIComponent(slug)}?locale=${locale}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Genshin database request failed (${response.status})`);
  return await response.json() as GenshinEntityDetail;
}
