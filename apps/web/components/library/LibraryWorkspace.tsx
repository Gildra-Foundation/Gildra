import type { ReactNode } from "react";
import { catalogLocaleView } from "@/lib/catalogLocale";
import { Search, X } from "lucide-react";
import type { Lang } from "@/lib/i18n-paths";
import type { CatalogCategory, CatalogEntityType, CatalogPage, CatalogProduct, CatalogRecord } from "@/lib/api/client";
import { AtlasDisclosure, AtlasField, AtlasInput, AtlasSelect } from "@/components/atlas";
import { CatalogBehavior } from "@/components/database/CatalogBehavior";
import { RecordPreviewButton } from "@/components/database/RecordPreviewButton";
import { databaseCopy, FACET_LABELS, formatCount, highlightLabel, previewCopy, type DatabaseCopy } from "@/components/database/databaseCopy";
import { entityTypeLabel } from "@/lib/platform/catalog/entityTypeLabel";
import { LibraryHoverPreview } from "@/components/library/LibraryHoverPreview";
import { LibraryRecordCard, type LibraryCardLayout } from "@/components/library/LibraryRecordCard";
import { libraryCardCopy } from "@/components/library/libraryCardCopy";
import type { LibraryRail } from "@/components/library/libraryRails";
import styles from "./libraryWorkspace.module.css";
import { AtlasPagination } from "@gildra/atlas-ui/AtlasPagination";

const FACET_ORDER = ["class", "specialization", "race", "profession", "equipment_slot", "armor_type", "weapon_type", "item_class"];
const ROOT_ID = "catalog-workspace";
const RESULTS_ID = "catalog-results";
const LEVELS = ["minLevel", "maxLevel", "minRequiredLevel", "maxRequiredLevel"] as const;

/**
 * Client-internal records that the game never shows to a player (do-not-translate
 * placeholders, conversation pings, race-timer bookkeeping). They stay reachable
 * by address; the default lists leave them out.
 */
const INTERNAL_NAME = /\bDNT\b|\[PH\]|^Ping\b|Personal Best Record|^zz|\bdeprecated\b|\bunused\b/i;

type State = { product: string; q: string; cursor: string; facets: string[] } & Record<(typeof LEVELS)[number], string>;

function href(base: string, state: State) {
  const params = new URLSearchParams();
  if (state.product && state.product !== "wow") params.set("product", state.product);
  if (state.q.trim()) params.set("q", state.q.trim());
  if (state.cursor) params.set("cursor", state.cursor);
  for (const facet of state.facets) if (facet) params.append("facet", facet);
  for (const key of LEVELS) if (state[key]) params.set(key, state[key]);
  return params.size ? `${base}?${params}` : base;
}

type Filter = { id: string; label: string; categories: CatalogCategory[] };

/**
 * Records of one library dataset (gildra-wow-material-design §3.7, §3.10): one
 * glass toolbar — name search and every filter as a select (they submit on
 * change), item-level bounds folded away — the applied filters as chips with
 * one reset, then the cards and paging. Server-rendered links and GET forms;
 * CatalogBehavior upgrades them to soft navigation, LibraryHoverPreview shows
 * the in-game tooltip on hover.
 */
export function LibraryWorkspace({ lang, dataset, catalog, categories, entityType, products, totalCount, query = "", selectedProduct = "wow", selectedFacets = [], cursor = "", levels, layout = "cards", rails = [] }: {
  lang: Lang; dataset: { slug: string; name: string; entityType: string }; catalog: CatalogPage; categories: CatalogCategory[];
  entityType?: CatalogEntityType; products: CatalogProduct[]; totalCount?: ReactNode;
  query?: string; selectedProduct?: string; selectedFacets?: string[]; cursor?: string;
  levels: Record<(typeof LEVELS)[number], string>; layout?: LibraryCardLayout; rails?: LibraryRail[];
}) {
  const copy = databaseCopy[lang];
  const ru = lang === "ru";
  const facets = selectedFacets.filter(Boolean);
  const items = dataset.entityType === "item";
  const base = `${ru ? "/ru" : ""}/library/${encodeURIComponent(dataset.slug)}`;
  const state: State = { product: selectedProduct, q: query, cursor: "", facets, ...(items ? levels : { minLevel: "", maxLevel: "", minRequiredLevel: "", maxRequiredLevel: "" }) };
  const link = (patch: Partial<State>) => href(base, { ...state, ...patch });

  // Rails (picked categories of the dataset) first, then the other facets of the type; each one select.
  // A facet a rail already offers (slot, item class…) is not offered twice.
  const railFacets = new Set(rails.flatMap((rail) => rail.categories.map((category) => category.facet)));
  const filters: Filter[] = [
    ...rails.map((rail) => ({ id: rail.id, label: rail.label, categories: rail.categories })),
    ...groupFacets(categories).filter(([facet, entries]) => entries.length > 1 && !railFacets.has(facet))
      .map(([facet, entries]) => ({ id: facet, label: FACET_LABELS[facet][ru ? 1 : 0], categories: entries })),
  ];
  const selectedCategory = (filter: Filter) => filter.categories.find((category) => facets.includes(category.path));
  const known = new Map(filters.flatMap((filter) => filter.categories.map((category) => [category.path, category] as const)));
  const levelCount = items ? LEVELS.filter((key) => levels[key]).length : 0;
  const narrowed = Boolean(query.trim() || facets.length || levelCount);
  const records = catalog.data.filter((entity) => !INTERNAL_NAME.test(entity.name));
  const zeroResults = !catalog.data.length && narrowed ? JSON.stringify({ query, type: dataset.entityType, facets: facets.join(",") }) : undefined;
  const preview = previewCopy(lang);
  const hidden = (fields: Record<string, string>) => Object.entries(fields).filter(([key, value]) => value && !(key === "product" && value === "wow"))
    .map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />);

  return (
    <section id={ROOT_ID} className={styles.workspace} aria-label={dataset.name}>
      <CatalogBehavior rootId={ROOT_ID} lang={lang} zeroResults={zeroResults} />

      <form className={styles.toolbar} role="search" action={base} method="get" data-catalog-form data-track="catalog_search_submitted" data-track-props={JSON.stringify({ type: dataset.entityType })}>
        <div className={styles.search}>
          <label className="sr-only" htmlFor="library-dataset-search">{copy.searchLabel(dataset.name)}</label>
          <Search className={styles.searchIcon} aria-hidden="true" />
          <input key={query} id="library-dataset-search" name="q" type="search" defaultValue={query} placeholder={copy.searchPlaceholder} autoComplete="off" maxLength={200} />
          <button type="submit" className={styles.submit}>{copy.searchSubmit}</button>
        </div>
        {hidden({ product: selectedProduct })}
        {products.length > 1 ? (
          <AtlasField label={copy.gameVersion} htmlFor="library-product" className={styles.field}>
            <AtlasSelect id="library-product" name="product" defaultValue={selectedProduct} data-autosubmit key={selectedProduct}>
              {products.map((product) => <option key={product.slug} value={product.slug}>{product.name}</option>)}
            </AtlasSelect>
          </AtlasField>
        ) : null}
        {filters.map((filter) => (
          <AtlasField key={filter.id} label={filter.label} htmlFor={`library-filter-${filter.id}`} className={styles.field}>
            <AtlasSelect id={`library-filter-${filter.id}`} name="facet" defaultValue={selectedCategory(filter)?.path ?? ""} data-autosubmit key={`${filter.id}:${facets.join(",")}`}>
              <option value="">{copy.any}</option>
              {filter.categories.map((category) => <option key={category.id} value={category.path}>{categoryName(category, lang)} · {formatCount(category.count, lang)}</option>)}
            </AtlasSelect>
          </AtlasField>
        ))}
        {/* Facets chosen by URL that no select offers stay applied. */}
        {facets.filter((facet) => !known.has(facet)).map((facet) => <input key={facet} type="hidden" name="facet" value={facet} />)}
        {items ? (
          <AtlasDisclosure className={styles.levels} open={levelCount > 0 || undefined} summary={<>{copy.levelsTitle}{levelCount ? <b>{levelCount}</b> : null}</>}>
            <div className={styles.levelGrid}>
              <AtlasField label={copy.itemLevelFrom} htmlFor="filter-minLevel"><AtlasInput id="filter-minLevel" name="minLevel" type="number" min="0" max="9999" inputMode="numeric" defaultValue={levels.minLevel} /></AtlasField>
              <AtlasField label={copy.itemLevelTo} htmlFor="filter-maxLevel"><AtlasInput id="filter-maxLevel" name="maxLevel" type="number" min="0" max="9999" inputMode="numeric" defaultValue={levels.maxLevel} /></AtlasField>
              <AtlasField label={copy.charLevelFrom} htmlFor="filter-minRequiredLevel"><AtlasInput id="filter-minRequiredLevel" name="minRequiredLevel" type="number" min="0" max="999" inputMode="numeric" defaultValue={levels.minRequiredLevel} /></AtlasField>
              <AtlasField label={copy.charLevelTo} htmlFor="filter-maxRequiredLevel"><AtlasInput id="filter-maxRequiredLevel" name="maxRequiredLevel" type="number" min="0" max="999" inputMode="numeric" defaultValue={levels.maxRequiredLevel} /></AtlasField>
              <button type="submit" className={styles.apply}>{copy.apply}</button>
            </div>
          </AtlasDisclosure>
        ) : null}
      </form>

      {narrowed ? (
        <div className={styles.applied} aria-live="polite">
          {query.trim() ? null : <p className={styles.found}>{copy.found}: <b>{totalCount ?? "—"}</b></p>}
          <ul className={styles.chips} aria-label={copy.appliedLabel}>
            {query.trim() ? <li><a className={styles.chip} href={link({ q: "" })} data-catalog-nav>«{query.trim()}»<X aria-hidden="true" /><span className="sr-only">{copy.remove}</span></a></li> : null}
            {facets.map((facet) => (
              <li key={facet}><a className={styles.chip} href={link({ facets: facets.filter((entry) => entry !== facet) })} data-catalog-nav>
                {known.get(facet) ? categoryName(known.get(facet)!, lang) : facet.split("/").pop()}<X aria-hidden="true" /><span className="sr-only">{copy.remove}</span>
              </a></li>
            ))}
            {levelCount ? <li><a className={styles.chip} href={link({ minLevel: "", maxLevel: "", minRequiredLevel: "", maxRequiredLevel: "" })} data-catalog-nav>{copy.levelsTitle}<X aria-hidden="true" /><span className="sr-only">{copy.remove}</span></a></li> : null}
          </ul>
          <a className={styles.reset} href={href(base, { product: selectedProduct, q: "", cursor: "", facets: [], minLevel: "", maxLevel: "", minRequiredLevel: "", maxRequiredLevel: "" })} data-catalog-nav>{copy.reset}</a>
        </div>
      ) : null}

      <div className={styles.results} id={RESULTS_ID}>
        {/* Record names are h3: the outline stays h1 → h2 → h3 for screen readers. */}
        <h2 className="sr-only">{copy.resultsLabel(dataset.name)}</h2>
        {records.length ? (
          <>
            <ul className={layout === "tray" ? `${styles.records} ${styles.tray}` : `${styles.records} ${styles.cards}`}>
              {records.map((entity) => (
                <LibraryCard key={entity.id} entity={entity} registeredType={entityType} lang={lang} copy={copy} preview={preview} layout={layout}
                  href={`${base}/${encodeURIComponent(entity.type)}/${entity.id}/${encodeURIComponent(entity.slug || String(entity.externalId))}${selectedProduct === "wow" ? "" : `?product=${encodeURIComponent(selectedProduct)}`}`} />
              ))}
            </ul>
            <LibraryHoverPreview rootId={RESULTS_ID} lang={lang} iconSymbol={entityType?.iconSymbol} loadingLabel={libraryCardCopy[lang].hoverLoading} />
          </>
        ) : (
          <div className={styles.empty} role="status">
            <h3>{copy.emptyTitle}</h3>
            <p>{copy.emptyText}</p>
          </div>
        )}
        {cursor || (catalog.pagination.hasMore && catalog.pagination.nextCursor) ? (
          <AtlasPagination
            label={copy.pagesLabel}
            prev={cursor ? { href: link({ cursor: "" }), label: copy.back, attributes: { "data-history-back": true } } : undefined}
            next={catalog.pagination.hasMore && catalog.pagination.nextCursor ? { href: link({ cursor: catalog.pagination.nextCursor }), label: copy.next, attributes: { "data-catalog-nav": true, "data-scroll-to": RESULTS_ID } } : undefined}
          />
        ) : null}
      </div>
    </section>
  );
}

/** The RU client calls the trade-goods class «Хозяйственные товары»; the library names it like its dataset. */
const CATEGORY_NAMES: Record<string, Partial<Record<Lang, string>>> = {
  "item-types/trade-goods": { ru: "Ремесленные товары" },
};

function categoryName(category: CatalogCategory, lang: Lang) {
  return CATEGORY_NAMES[category.path]?.[lang] ?? category.name;
}

function LibraryCard({ entity, registeredType, href: cardHref, lang, copy, preview, layout }: {
  entity: CatalogRecord; registeredType?: CatalogEntityType; href: string; lang: Lang; copy: DatabaseCopy; preview: ReturnType<typeof previewCopy>; layout: LibraryCardLayout;
}) {
  const cardCopy = libraryCardCopy[lang];
  const typeLabel = entityTypeLabel(entity.type, lang, registeredType?.label);
  // An English-only record keeps its English name on the Russian page (game names stay English) instead of "Spell #id".
  const name = catalogLocaleView(entity, lang).name || entity.name || `${typeLabel} #${entity.externalId}`;
  const highlight = (key: string) => entity.highlights?.find((entry) => entry.key === key)?.value;
  const required = highlight("required_level")?.match(/\d+/)?.[0];
  // Highlights the card already shows in its own places are not repeated in the facts line.
  const rest = (entity.highlights ?? []).filter((entry) => entry.key !== "required_level" && entry.key !== "inventory_type").map((entry) => highlightLabel(entry.key, entry.value, lang));
  return (
    <LibraryRecordCard
      id={entity.id}
      href={cardHref}
      name={name}
      lang={lang}
      layout={layout}
      iconUrl={entity.iconUrl}
      iconSymbol={registeredType?.iconSymbol}
      quality={entity.quality}
      itemLevel={entity.itemLevel}
      slot={highlight("inventory_type")}
      description={layout === "tray" ? entity.description || undefined : undefined}
      facts={[required ? cardCopy.requiredLevel(required) : null, ...rest].filter((fact): fact is string => Boolean(fact))}
      track={{ event: "catalog_detail_opened", props: { id: entity.externalId, type: entity.type } }}
      action={<RecordPreviewButton id={entity.id} externalId={entity.externalId} type={entity.type} lang={lang} iconSymbol={registeredType?.iconSymbol} iconUrl={entity.iconUrl}
        labels={{ label: copy.previewLabel(name), ...preview }} className={styles.preview} errorClassName={styles.previewError} />}
    />
  );
}

function groupFacets(categories: CatalogCategory[]) {
  const grouped = new Map<string, CatalogCategory[]>();
  for (const category of categories) {
    if (!FACET_LABELS[category.facet] || category.count <= 0) continue;
    const entries = grouped.get(category.facet) ?? [];
    entries.push(category);
    grouped.set(category.facet, entries);
  }
  const byPath = new Map(categories.map((category) => [category.path, category]));
  for (const [facet, entries] of grouped) {
    entries.sort((a, b) => b.count - a.count || a.sortOrder - b.sortOrder);
    // Specializations share names across classes (Holy, Frost, Restoration): the class tells them apart.
    const names = Map.groupBy(entries, (entry) => entry.name);
    grouped.set(facet, entries.map((entry) => {
      const parent = entry.parentPath ? byPath.get(entry.parentPath)?.name : undefined;
      return (names.get(entry.name)?.length ?? 0) > 1 && parent ? { ...entry, name: `${entry.name} · ${parent}` } : entry;
    }));
  }
  return Array.from(grouped.entries()).sort(([left], [right]) => FACET_ORDER.indexOf(left) - FACET_ORDER.indexOf(right));
}
