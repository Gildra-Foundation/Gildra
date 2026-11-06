import type { CSSProperties } from "react";
import { Crosshair, HeartPulse, Shield, Sparkle, Swords } from "lucide-react";
import { tierStyle } from "@/components/blocks/wow/tierWorkspace/tierVisuals";
import type { SpecBoard, SpecTier } from "@/lib/games/wow/classMeta";
import type { TalentSpecTheme } from "@/lib/talentSpecThemes";
import type { Lang as Locale } from "@/lib/i18n-paths";
import type { ClassCopy } from "./classCopy";
import styles from "./classCatalog.module.css";

export type { Locale };
export type SpecEntry = TalentSpecTheme & { classSlug: string };

/** Class colour tokens of app/styles/tokens.css (--c-*), used only on the class identity. */
const classColorKey: Record<string, string> = {
  deathknight: "dk", demonhunter: "dh", evoker: "evoker", mage: "mage", paladin: "pal", rogue: "rogue",
  druid: "druid", priest: "priest", hunter: "hunter", shaman: "shaman", warlock: "lock", monk: "monk", warrior: "war",
};
export const classColorStyle = (classKey: string) => ({ "--class-color": `var(--c-${classColorKey[classKey]}, var(--atlas-accent))` }) as CSSProperties;

export const prefixOf = (locale: Locale) => (locale === "ru" ? "/ru" : "");
export const classHref = (locale: Locale, classSlug: string) => `${prefixOf(locale)}/wow/classes/${classSlug}`;
export const specHref = (locale: Locale, spec: SpecEntry) => `${prefixOf(locale)}/wow/classes/${spec.classSlug}/${spec.slug}`;
export const talentsHref = (locale: Locale, slug: string) => `${prefixOf(locale)}/talents/${slug}`;
export const boardHref = (locale: Locale, slug: string) => `${prefixOf(locale)}/wow/mythic-plus/leaderboard/${slug}`;
export const rotationHref = (locale: Locale, slug: string) => `${prefixOf(locale)}/wow/rotation/${slug}`;
/** The calculator opened on a build (hero tree preselected). */
export const buildHref = (locale: Locale, slug: string, loadout: string, heroId?: number) => {
  const params = new URLSearchParams();
  if (heroId) params.set("hero", String(heroId));
  params.set("build", loadout);
  return `${talentsHref(locale, slug)}?${params.toString()}`;
};

export const specName = (spec: TalentSpecTheme, locale: Locale) => (locale === "ru" ? spec.specNameRu : spec.specName);
export const className = (spec: TalentSpecTheme, locale: Locale) => (locale === "ru" ? spec.classNameRu : spec.className);
export const heroTreeName = (spec: TalentSpecTheme, id: number, locale: Locale, fallback = "") => {
  const hero = spec.heroPaths.find((path) => path.id === id);
  return hero ? (locale === "ru" ? hero.nameRu : hero.name) : fallback;
};

export const formatShare = (value: number, copy: ClassCopy) => `${Math.round(value * 100).toLocaleString(copy.numberLocale)}%`;
export const formatScore = (value: number, copy: ClassCopy) => Math.round(value).toLocaleString(copy.numberLocale);

const roleIcons = { tank: Shield, healer: HeartPulse, melee: Swords, ranged: Crosshair, support: Sparkle } as const;

export function RoleBadge({ role, copy }: { role: TalentSpecTheme["role"]; copy: ClassCopy }) {
  const Icon = roleIcons[role];
  return <span className={styles.role} data-role={role}><Icon aria-hidden="true" />{copy.roles[role]}</span>;
}

/** The tier letter in the tier's colour (the colours of /tier-lists). */
export function TierChip({ tier, label, size = "small" }: { tier: string; label?: string; size?: "small" | "large" }) {
  return <span className={styles.tier} data-size={size} style={tierStyle(tier)} aria-label={label} role={label ? "img" : undefined}>{tier}</span>;
}

export const mythicTier = (tiers: SpecTier[] | undefined) => tiers?.find((item) => item.source === "gildra" && item.activity === "mythic_plus");

/** "Slayer 71% · Mountain Thane 29%": the hero trees the top players pick. */
export function HeroShares({ board, spec, locale, copy }: { board?: SpecBoard; spec: TalentSpecTheme; locale: Locale; copy: ClassCopy }) {
  const heroes = board?.heroes.length ? board.heroes : spec.heroPaths.map((path) => ({ id: path.id, name: path.name, share: -1 }));
  return (
    <span className={styles.heroShares}>
      {heroes.map((hero) => (
        <span key={hero.id} className={styles.heroShare}>
          {heroTreeName(spec, hero.id, locale, hero.name)}
          {hero.share >= 0 ? <b>{formatShare(hero.share, copy)}</b> : null}
        </span>
      ))}
    </span>
  );
}
