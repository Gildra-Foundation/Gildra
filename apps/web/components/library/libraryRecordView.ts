import type { Lang } from "@/lib/i18n-paths";
import { catalogLocaleView } from "@/lib/catalogLocale";
import { libraryRecordPath } from "@/lib/library/recordPath";
import { entityTypeLabel } from "@/lib/platform/catalog/entityTypeLabel";
import { highlightLabel } from "@/components/database/databaseCopy";

/**
 * What a dataset list, the "show more" request and the search suggestions need of one
 * catalog record, already in the page language. Built on the server (page and the
 * /api/platform/library route handlers), rendered by the client list, so both render the same row.
 */
export type LibraryRecordView = {
  id: string;
  externalId: number;
  type: string;
  /** The record's own address (`libraryRecordPath`): no redirect on the way. */
  href: string;
  name: string;
  /** Singular record type in the page language ("Предмет"). */
  typeLabel: string;
  iconUrl?: string;
  /** Blizzard item quality 0–7 (data colour of the name and the icon edge). */
  quality?: number;
  itemLevel?: number;
  slot?: string;
  requiredLevel?: number;
  /** Spell school and cast time, as the player reads them. */
  school?: string;
  castTime?: string;
  /** One short line (NPC title, gem bonus, quest text), cut to a sentence. */
  description?: string;
};

/** Fields of a catalog summary this module reads (GameEntitySummary). */
export type LibrarySummary = {
  id: string; type: string; externalId: number; slug?: string; name: string; product?: string; description?: string;
  iconUrl?: string; quality?: number; itemLevel?: number; highlights?: { key: string; value: string }[];
  locale?: string; localeFallback?: boolean;
};

/**
 * Client-internal records that the game never shows to a player (do-not-translate
 * placeholders, conversation pings, race-timer bookkeeping). They stay reachable
 * by address; lists and suggestions leave them out.
 */
export const LIBRARY_INTERNAL_NAME = /\bDNT\b|\[PH\]|^Ping\b|Personal Best Record|^zz|\bdeprecated\b|\bunused\b/i;

function shortLine(value: string | undefined, max = 140) {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text || /\$(?:@spelldesc|[0-9]*[dD]|[0-9]*s[0-9]+|[st][0-9]+|[A-Za-z]|[<{])/.test(text)) return undefined;
  return text.length > max ? `${text.slice(0, max - 1).replace(/[\s,.;:—-]+\S*$/, "")}…` : text;
}

/** Cast time as a table cell under the "Cast" heading: "Instant", "1.5 sec" (the heading already says what it is). */
export function castTimeLabel(value: string, lang: Lang) {
  const ru = lang === "ru";
  if (/^instant$/i.test(value.trim())) return ru ? "Мгновенно" : "Instant";
  const ms = /^(\d+)\s*ms$/i.exec(value.trim());
  if (!ms) return value;
  const seconds = (Number(ms[1]) / 1000).toLocaleString(ru ? "ru-RU" : "en-US", { maximumFractionDigits: 2 });
  return ru ? `${seconds} сек.` : `${seconds} sec`;
}

export function libraryRecordView(entity: LibrarySummary, lang: Lang, product = "wow"): LibraryRecordView {
  const view = catalogLocaleView({ ...entity, description: entity.description ?? "" }, lang);
  const typeLabel = entityTypeLabel(entity.type, lang);
  // An English-only record keeps its English name on the Russian page (game names stay English) instead of "Spell #id".
  const name = view.name || entity.name || `${typeLabel} #${entity.externalId}`;
  const highlight = (key: string) => entity.highlights?.find((entry) => entry.key === key)?.value;
  const required = Number(highlight("required_level")?.match(/\d+/)?.[0]);
  const school = highlight("school");
  const cast = highlight("cast_time");
  return {
    id: entity.id,
    externalId: entity.externalId,
    type: entity.type,
    href: libraryRecordPath(lang, entity.type, entity.id, entity.slug || entity.externalId, entity.product || product),
    name,
    typeLabel,
    ...(entity.iconUrl ? { iconUrl: entity.iconUrl } : {}),
    ...(typeof entity.quality === "number" ? { quality: entity.quality } : {}),
    ...(entity.itemLevel ? { itemLevel: entity.itemLevel } : {}),
    ...(highlight("inventory_type") ? { slot: highlight("inventory_type") } : {}),
    ...(required > 0 ? { requiredLevel: required } : {}),
    ...(school ? { school: highlightLabel("school", school, lang) } : {}),
    ...(cast ? { castTime: castTimeLabel(cast, lang) } : {}),
    ...(shortLine(view.description) ? { description: shortLine(view.description) } : {}),
  };
}

/** Rows of one catalog page for a list: internal records out, the rest as views. */
export function libraryRecordViews(entities: LibrarySummary[], lang: Lang, product = "wow") {
  return entities.filter((entity) => !LIBRARY_INTERNAL_NAME.test(entity.name)).map((entity) => libraryRecordView(entity, lang, product));
}

/** Columns of the record table: what a dataset's records really carry. Records without facts get the description instead. */
export type LibraryColumn = "itemLevel" | "slot" | "requiredLevel" | "school" | "castTime";

export function libraryColumns(entityType: string, rows?: LibraryRecordView[]): LibraryColumn[] {
  const columns: LibraryColumn[] = entityType === "item" ? ["itemLevel", "slot", "requiredLevel"] : entityType === "spell" ? ["school", "castTime"] : [];
  // A column that the shown records mostly leave empty is a column of dashes: it is left out.
  if (!rows?.length) return columns;
  return columns.filter((column) => rows.filter((row) => row[column] !== undefined).length >= rows.length * 0.3);
}

// Suggestions: records a player looks for by name come before the spells and quests that share it.
const TYPE_RANK = ["item", "mount", "battle_pet", "toy", "transmog_set", "achievement", "instance", "encounter", "creature",
  "currency", "quest", "faction", "area", "map", "profession", "recipe", "class", "specialization", "pvp_talent", "spell"];

function rank(type: string) {
  const index = TYPE_RANK.indexOf(type);
  return index < 0 ? TYPE_RANK.length - 1 : index;
}

function nameScore(name: string, query: string) {
  const value = name.toLocaleLowerCase();
  if (value === query) return 0;
  if (value.startsWith(query)) return 1;
  if (value.split(/[\s,'«»"()-]+/).some((word) => word.startsWith(query))) return 2;
  return 3;
}

/**
 * Search suggestions: one entry per name and type (the catalog has many spells
 * named like their item), the closest names first, then the kinds of record
 * players search for most; records with an icon win a tie.
 */
export function rankLibrarySuggestions(views: LibraryRecordView[], query: string, limit = 8): LibraryRecordView[] {
  const needle = query.trim().toLocaleLowerCase();
  const seen = new Set<string>();
  const unique = views.filter((view) => {
    if (LIBRARY_INTERNAL_NAME.test(view.name)) return false;
    const key = `${view.type}:${view.name.toLocaleLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const scored = unique.map((view, index) => ({ view, index, score: nameScore(view.name, needle), type: rank(view.type), icon: view.iconUrl ? 0 : 1 }));
  // Records found only by their text (or by the other language's name) stay out when names match;
  // a query in the other language ("thunderfury" on the Russian page) keeps them all.
  const named = scored.some((entry) => entry.score < 3 || entry.view.name.toLocaleLowerCase().includes(needle));
  return scored
    .filter((entry) => !named || entry.score < 3 || entry.view.name.toLocaleLowerCase().includes(needle))
    .sort((a, b) => a.score - b.score || a.type - b.type || a.icon - b.icon || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.view);
}

/** Datasets whose name (in the page language) contains the query: the landing suggests them above the records. */
export function matchLibraryDatasets<T extends { name: string }>(datasets: T[], query: string, limit = 3): T[] {
  const needle = query.trim().toLocaleLowerCase();
  if (needle.length < 2) return [];
  return datasets
    .map((dataset, index) => ({ dataset, index, score: nameScore(dataset.name, needle) }))
    .filter((entry) => entry.score < 3 || entry.dataset.name.toLocaleLowerCase().includes(needle))
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.dataset);
}

/** The list query a dataset page and its "show more" request share. */
export type LibraryListQuery = {
  dataset: string; product: string; q: string; facets: string[];
  minLevel?: number; maxLevel?: number; minRequiredLevel?: number; maxRequiredLevel?: number;
};

const SLUG = /^[a-z0-9-]{2,64}$/;
const LEVEL_KEYS = ["minLevel", "maxLevel", "minRequiredLevel", "maxRequiredLevel"] as const;

function level(value: string | null) {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 9999 ? parsed : null;
}

/** Validates the query of /api/platform/library/records (the same names as the dataset page URL); null when it is malformed. */
export function parseLibraryListQuery(params: URLSearchParams): (LibraryListQuery & { cursor: string; lang: Lang }) | null {
  const dataset = params.get("dataset") ?? "";
  const product = params.get("product") || "wow";
  const q = (params.get("q") ?? "").trim();
  const cursor = params.get("cursor") ?? "";
  const facets = params.getAll("facet").filter(Boolean);
  if (!SLUG.test(dataset) || !/^[a-z0-9_]{2,64}$/.test(product) || q.length > 200 || cursor.length > 128 || !/^[A-Za-z0-9_=-]*$/.test(cursor)) return null;
  if (facets.length > 8 || facets.some((facet) => facet.length > 192)) return null;
  const levels: Partial<Record<(typeof LEVEL_KEYS)[number], number>> = {};
  for (const key of LEVEL_KEYS) {
    const value = level(params.get(key));
    if (value === null) return null;
    if (value !== undefined) levels[key] = value;
  }
  return { dataset, product, q, facets, cursor, lang: params.get("lang") === "ru" ? "ru" : "en", ...levels };
}

/** Query string of a "show more" request (and of the no-JS next-page link it replaces). */
export function libraryListSearch(query: LibraryListQuery, cursor: string, lang?: Lang) {
  const params = new URLSearchParams();
  if (query.product && query.product !== "wow") params.set("product", query.product);
  if (query.q.trim()) params.set("q", query.q.trim());
  if (cursor) params.set("cursor", cursor);
  for (const facet of query.facets) if (facet) params.append("facet", facet);
  for (const key of LEVEL_KEYS) if (query[key] !== undefined) params.set(key, String(query[key]));
  if (lang) {
    params.set("dataset", query.dataset);
    params.set("lang", lang);
  }
  return params.toString();
}
