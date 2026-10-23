import type { Lang } from "@/lib/i18n";
import { articlesIndexHref } from "../paths";

/** WoW classes as the CMS stores them (`game.wowClass`); names stay English in both locales (game terms). */
export const WOW_CLASSES = [
  ["death-knight", "Death Knight"],
  ["demon-hunter", "Demon Hunter"],
  ["druid", "Druid"],
  ["evoker", "Evoker"],
  ["hunter", "Hunter"],
  ["mage", "Mage"],
  ["monk", "Monk"],
  ["paladin", "Paladin"],
  ["priest", "Priest"],
  ["rogue", "Rogue"],
  ["shaman", "Shaman"],
  ["warlock", "Warlock"],
  ["warrior", "Warrior"],
] as const;

export type WowClassSlug = (typeof WOW_CLASSES)[number][0];
export const wowClassName = (slug: string | null | undefined) => WOW_CLASSES.find(([s]) => s === slug)?.[1] ?? null;
/** Project class crest (public/assets/classes), the same files lib/games/wow/assets.ts serves. */
export const wowClassIcon = (slug: string) => `/assets/classes/${slug.replace("-", "")}.jpg`;

/** List filters, all in the URL: `?type=guides&class=mage&q=frost&page=2`. */
export type ArticleFilters = { type: string | null; cls: WowClassSlug | null; q: string; page: number };

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseArticleFilters(raw: Raw): ArticleFilters {
  const type = one(raw.type).trim();
  const cls = one(raw.class).trim();
  return {
    type: /^[a-z0-9-]{1,40}$/.test(type) ? type : null,
    cls: (WOW_CLASSES.find(([s]) => s === cls)?.[0] ?? null) as WowClassSlug | null,
    q: one(raw.q).trim().slice(0, 80),
    page: Math.max(1, Math.min(1000, Math.floor(Number(one(raw.page))) || 1)),
  };
}

/** Same list with some filters changed; page resets unless it is given. Empty values drop out of the URL. */
export function articlesListHref(lang: Lang, current: ArticleFilters, patch: Partial<ArticleFilters> = {}, base = articlesIndexHref(lang)): string {
  const next = { ...current, page: 1, ...patch };
  const params = new URLSearchParams();
  if (next.type) params.set("type", next.type);
  if (next.cls) params.set("class", next.cls);
  if (next.q) params.set("q", next.q);
  if (next.page > 1) params.set("page", String(next.page));
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export const hasFilters = (f: ArticleFilters) => Boolean(f.type || f.cls || f.q);
