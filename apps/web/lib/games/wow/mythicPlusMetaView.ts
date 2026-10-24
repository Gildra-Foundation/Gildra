import { classColors } from "@/lib/atlas/dataPalette";
import { talentSpecThemes } from "@/lib/talentSpecThemes";
import { specIcon } from "./assets";

/** Stored payload of the mplus-meta-mythicstats dataset (schema_version 1, scraper/parsers/mythicstats_meta.py). */
export type MetaRole = "tank" | "healer" | "dps";
export type MythicPlusMetaPayload = {
  schema_version: 1;
  source_name: string;
  source_url: string;
  fetched_at: string;
  seasons: Array<{
    slug: string;
    label: string;
    source_url: string;
    weeks: Array<{
      period_id: number;
      week: number;
      average_key: number;
      gini: { all: number; dps: number; tank: number; healer: number };
      source_url: string;
      specs: Array<{ role: MetaRole; class_slug: string; spec_slug: string; presence: number }>;
    }>;
  }>;
  current_period: null | {
    period_id: number;
    week: number;
    season: string;
    affixes: string[];
    keys: number;
    characters: number;
    unique_characters: number;
    average_key: number;
    source_url: string;
  };
};

type Week = MythicPlusMetaPayload["seasons"][number]["weeks"][number];

export type MetaSpec = {
  key: string;
  role: MetaRole;
  rank: number;
  specName: string;
  className: string;
  classSlug: string;
  color: string;
  icon: string | null;
  presence: number;
  /** Percentage points against the previous week of the same season. */
  delta: number | null;
  /** Presence per week of the season, oldest first (null: the spec was not listed that week). */
  trend: Array<number | null>;
};

export type MetaWeekSummary = { week: number; periodId: number; averageKey: number; gini: Week["gini"]; sourceUrl: string };

export type MythicPlusMetaView = {
  season: { slug: string; label: string; number: number | null; sourceUrl: string };
  week: MetaWeekSummary;
  previous: MetaWeekSummary | null;
  period: MythicPlusMetaPayload["current_period"];
  roles: Record<MetaRole, MetaSpec[]>;
  /** Every week of the season, oldest first. */
  weeks: MetaWeekSummary[];
  sourceUrl: string;
};

export const metaRoles: MetaRole[] = ["tank", "healer", "dps"];

const themes = new Map(talentSpecThemes.map((theme) => [theme.slug, theme]));
const words = (slug: string) => slug.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
const seasonNumber = (slug: string) => Number(/^mid(\d+)$/.exec(slug)?.[1]) || null;
const summary = (week: Week): MetaWeekSummary => ({ week: week.week, periodId: week.period_id, averageKey: week.average_key, gini: week.gini, sourceUrl: week.source_url });

/** Latest season and week of the payload, ranked by role, with week-on-week change and the season trend. */
export function mythicPlusMetaView(payload: MythicPlusMetaPayload): MythicPlusMetaView | null {
  const season = payload.seasons[0];
  const latest = season?.weeks[0];
  if (!season || !latest) return null;
  const previous = season.weeks[1] ?? null;
  const chronological = [...season.weeks].reverse();
  const presenceBy = (week: Week) => new Map(week.specs.map((spec) => [`${spec.class_slug}:${spec.spec_slug}`, spec.presence]));
  const history = chronological.map(presenceBy);
  const before = previous ? presenceBy(previous) : null;
  const roles = { tank: [], healer: [], dps: [] } as Record<MetaRole, MetaSpec[]>;
  for (const spec of latest.specs) {
    const key = `${spec.class_slug}:${spec.spec_slug}`;
    const theme = themes.get(`${spec.spec_slug}-${spec.class_slug}`);
    const specName = theme?.specName ?? words(spec.spec_slug);
    const prior = before?.get(key);
    roles[spec.role].push({
      key,
      role: spec.role,
      rank: 0,
      specName,
      className: theme?.className ?? words(spec.class_slug),
      classSlug: spec.class_slug,
      color: classColors[spec.class_slug as keyof typeof classColors] ?? "var(--atlas-text-muted)",
      icon: specIcon(specName, spec.class_slug, spec.spec_slug),
      presence: spec.presence,
      delta: prior === undefined ? null : Math.round((spec.presence - prior) * 10) / 10,
      trend: history.map((week) => week.get(key) ?? null),
    });
  }
  for (const role of metaRoles) {
    roles[role].sort((a, b) => b.presence - a.presence || a.specName.localeCompare(b.specName));
    roles[role].forEach((spec, index) => { spec.rank = index + 1; });
  }
  const period = payload.current_period?.period_id === latest.period_id ? payload.current_period : null;
  return {
    season: { slug: season.slug, label: season.label, number: seasonNumber(season.slug), sourceUrl: season.source_url },
    week: summary(latest),
    previous: previous ? summary(previous) : null,
    period,
    roles,
    weeks: chronological.map(summary),
    sourceUrl: payload.source_url,
  };
}
