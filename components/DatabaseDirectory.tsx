import type { ReactNode } from "react";
import { ChevronRight, Search, SlidersHorizontal } from "lucide-react";
import type { Lang } from "@/lib/i18n-paths";
import type { CatalogCategory, CatalogEntityType, CatalogPage, CatalogProduct, CatalogRecord } from "@/lib/api/client";
import { AtlasDisclosure, AtlasField, AtlasInput, AtlasSelect } from "@/components/atlas";
import { CatalogBehavior } from "@/components/database/CatalogBehavior";
import { CatalogRecordRow } from "@/components/database/CatalogRecordRow";
import { RecordPreviewButton } from "@/components/database/RecordPreviewButton";
import { databaseCopy, entityTypeLabel, FACET_LABELS, formatCount, GROUP_LABELS, highlightLabel, previewCopy, type DatabaseCopy } from "@/components/database/databaseCopy";
import styles from "@/components/database/databaseHub.module.css";
import { AtlasPagination } from "@gildra/atlas-ui/AtlasPagination";

const FACET_ORDER = ["class", "specialization", "race", "profession", "equipment_slot", "armor_type", "weapon_type", "item_class"];
const ROOT_ID = "catalog-workspace";
const RESULTS_ID = "catalog-results";

type CatalogState = {
  product: string; type: string; q: string; cursor: string; category: string; facets: string[];
  minLevel: string; maxLevel: string; minRequiredLevel: string; maxRequiredLevel: string;
};

/** URL of one catalog view; empty values are left out, level bounds only apply to items. */
function catalogHref(base: string, state: CatalogState, itemFilters: boolean) {
  const params = new URLSearchParams();
  if (state.product && state.product !== "wow") params.set("product", state.product);
  if (state.type) params.set("type", state.type);
  if (state.q.trim()) params.set("q", state.q.trim());
  if (state.cursor) params.set("cursor", state.cursor);
  if (state.category) params.set("category", state.category);
  for (const facet of state.facets) if (facet) params.append("facet", facet);
  if (itemFilters) {
    if (state.minLevel) params.set("minLevel", state.minLevel);
    if (state.maxLevel) params.set("maxLevel", state.maxLevel);
    if (state.minRequiredLevel) params.set("minRequiredLevel", state.minRequiredLevel);
    if (state.maxRequiredLevel) params.set("maxRequiredLevel", state.maxRequiredLevel);
  }
  return params.size ? `${base}?${params}` : base;
}

/**
 * Catalog workspace of /database and /library/<dataset>, rendered on the
 * server: search, sections → record types (one filtering model), optional
 * category tree and facet filters, record rows and paging. Every control is a
 * link or a GET form; CatalogBehavior upgrades them to soft navigation and
 * analytics, and RecordPreviewButton opens a row's in-game tooltip.
 */
export function DatabaseDirectory({ lang = "en", catalog, categories, entityTypes, products, totalCount, query = "", selectedProduct = "wow", selectedType = "", selectedCategory = "", selectedFacets = [], cursor = "", minItemLevel = "", maxItemLevel = "", minRequiredLevel = "", maxRequiredLevel = "", libraryDataset }: {
  lang?: Lang; catalog: CatalogPage; categories: CatalogCategory[]; entityTypes: CatalogEntityType[]; products: CatalogProduct[];
  totalCount?: ReactNode;
  query?: string; selectedProduct?: string; selectedType?: string; selectedCategory?: string; selectedFacets?: string[]; cursor?: string; minItemLevel?: string; maxItemLevel?: string; minRequiredLevel?: string; maxRequiredLevel?: string;
  /** Library dataset mode: the dataset (in the path) is the filter, so no sections or category tree. */
  libraryDataset?: { slug: string };
}) {
  const copy = databaseCopy[lang];
  const ru = lang === "ru";
  const facets = selectedFacets.filter(Boolean);
  const itemFilters = selectedType === "item";
  const base = libraryDataset ? `${ru ? "/ru" : ""}/library/${encodeURIComponent(libraryDataset.slug)}` : `${ru ? "/ru" : ""}/database`;
  // Library datasets carry their record type in the path, so it never goes into the query string.
  const urlType = libraryDataset ? "" : selectedType;
  const state: CatalogState = { product: selectedProduct, type: urlType, q: query, cursor: "", category: selectedCategory, facets, minLevel: minItemLevel, maxLevel: maxItemLevel, minRequiredLevel, maxRequiredLevel };
  const href = (patch: Partial<CatalogState>) => catalogHref(base, { ...state, ...patch }, itemFilters && (patch.type === undefined || patch.type === "item"));
  const cleared = { cursor: "", category: "", facets: [], minLevel: "", maxLevel: "", minRequiredLevel: "", maxRequiredLevel: "" };

  const typeRegistry = new Map(entityTypes.map((type) => [type.type, type]));
  const groups = libraryDataset ? [] : groupTypes(entityTypes, selectedType);
  const activeGroup = groups.find((group) => group.types.some((entry) => entry.type === selectedType));
  const facetGroups = groupFacets(categories);
  const showTaxonomy = !libraryDataset && categories.length > 0;
  const levelCount = [minItemLevel, maxItemLevel, minRequiredLevel, maxRequiredLevel].filter(Boolean).length;
  const activeFilters = facets.length + (itemFilters ? levelCount : 0);
  const narrowed = Boolean(libraryDataset || selectedType || query.trim() || selectedCategory || activeFilters);
  // A list narrowed to one record type does not repeat that type on every row.
  const oneType = Boolean(libraryDataset || selectedType) && new Set(catalog.data.map((entity) => entity.type)).size === 1;
  const foundCount = totalCount ?? (catalog.pagination.total !== undefined ? formatCount(catalog.pagination.total, lang) : "—");
  const zeroResults = !catalog.data.length && (query || selectedType || selectedCategory || facets.length)
    ? JSON.stringify({ query, type: selectedType, category: selectedCategory, facets: facets.join(",") })
    : undefined;
  const hidden = (fields: Partial<Record<"product" | "type" | "q" | "category", string>>) => Object.entries(fields)
    .filter(([key, value]) => value && !(key === "product" && value === "wow"))
    .map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />);
  const levelHidden = itemFilters ? [["minLevel", minItemLevel], ["maxLevel", maxItemLevel], ["minRequiredLevel", minRequiredLevel], ["maxRequiredLevel", maxRequiredLevel]]
    .filter(([, value]) => value).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />) : null;
  const preview = previewCopy(lang);

  return (
    <section id={ROOT_ID} className={styles.workspace} aria-label={copy.workspaceLabel}>
      <CatalogBehavior rootId={ROOT_ID} lang={lang} zeroResults={zeroResults} />

      <div className={styles.toolbar}>
        <form className={styles.search} role="search" action={base} method="get" data-catalog-form data-track="catalog_search_submitted" data-track-props={JSON.stringify({ type: selectedType })}>
          <label className="sr-only" htmlFor="database-search">{copy.searchLabel}</label>
          <Search className={styles.searchIcon} aria-hidden="true" />
          <input key={query} id="database-search" name="q" type="search" defaultValue={query} placeholder={copy.searchPlaceholder} autoComplete="off" />
          {hidden({ product: selectedProduct, type: urlType, category: selectedCategory })}
          {facets.map((facet) => <input key={facet} type="hidden" name="facet" value={facet} />)}
          {levelHidden}
          <button type="submit">{copy.searchSubmit}</button>
        </form>
        {products.length > 1 ? (
          <form className={styles.product} action={base} method="get" data-catalog-form>
            <AtlasField label={copy.gameVersion} htmlFor="database-product">
              <AtlasSelect id="database-product" name="product" defaultValue={selectedProduct} data-autosubmit key={selectedProduct}>
                {products.map((product) => <option key={product.slug} value={product.slug}>{product.name}</option>)}
              </AtlasSelect>
            </AtlasField>
          </form>
        ) : null}
      </div>

      {groups.length ? (
        <nav className={styles.sections} aria-label={copy.sectionsLabel}>
          <a className={styles.section} href={href({ type: "", ...cleared })} data-catalog-nav aria-current={!selectedType ? "true" : undefined}>{copy.allRecords}</a>
          {groups.map((group) => (
            <a key={group.id} className={styles.section} href={href({ type: group.types[0].type, ...cleared })} data-catalog-nav aria-current={group === activeGroup ? "true" : undefined}
              data-track="catalog_type_selected" data-track-props={JSON.stringify({ type: group.types[0].type })}>
              {GROUP_LABELS[group.id]?.[ru ? 1 : 0] ?? group.id}<b>{formatCount(group.total, lang)}</b>
            </a>
          ))}
        </nav>
      ) : null}

      {activeGroup && activeGroup.types.length > 1 ? (
        <nav className={styles.types} aria-label={copy.typesLabel}>
          {activeGroup.types.map((entry) => (
            <a key={entry.type} className={styles.type} href={href({ type: entry.type, ...cleared })} data-catalog-nav aria-current={entry.type === selectedType ? "true" : undefined}
              data-track="catalog_type_selected" data-track-props={JSON.stringify({ type: entry.type })}>
              {entry.label}<b>{formatCount(entry.count, lang)}</b>
            </a>
          ))}
        </nav>
      ) : null}

      {facetGroups.length || itemFilters ? (
        <AtlasDisclosure className={styles.filters} open={activeFilters > 0 || undefined}
          summary={<><SlidersHorizontal aria-hidden="true" />{copy.filtersTitle}{activeFilters ? <b>{copy.filtersActive(activeFilters)}</b> : null}</>}>
          <form key={`${facets.join(",")}|${minItemLevel}|${maxItemLevel}|${minRequiredLevel}|${maxRequiredLevel}`} action={base} method="get" data-catalog-form>
            {hidden({ product: selectedProduct, type: urlType, q: query, category: selectedCategory })}
            <div className={styles.filterGrid}>
              {facetGroups.map(([facet, entries]) => (
                <AtlasField key={facet} label={FACET_LABELS[facet][ru ? 1 : 0]} htmlFor={`facet-${facet}`}>
                  <AtlasSelect id={`facet-${facet}`} name="facet" defaultValue={facets.find((path) => entries.some((entry) => entry.path === path)) ?? ""}>
                    <option value="">{copy.any}</option>
                    {entries.map((category) => <option key={category.id} value={category.path}>{category.name} · {formatCount(category.count, lang)}</option>)}
                  </AtlasSelect>
                </AtlasField>
              ))}
              {itemFilters ? (
                <>
                  <AtlasField label={copy.itemLevelFrom} htmlFor="filter-minLevel"><AtlasInput id="filter-minLevel" name="minLevel" type="number" min="0" max="9999" inputMode="numeric" defaultValue={minItemLevel} /></AtlasField>
                  <AtlasField label={copy.itemLevelTo} htmlFor="filter-maxLevel"><AtlasInput id="filter-maxLevel" name="maxLevel" type="number" min="0" max="9999" inputMode="numeric" defaultValue={maxItemLevel} /></AtlasField>
                  <AtlasField label={copy.charLevelFrom} htmlFor="filter-minRequiredLevel"><AtlasInput id="filter-minRequiredLevel" name="minRequiredLevel" type="number" min="0" max="999" inputMode="numeric" defaultValue={minRequiredLevel} /></AtlasField>
                  <AtlasField label={copy.charLevelTo} htmlFor="filter-maxRequiredLevel"><AtlasInput id="filter-maxRequiredLevel" name="maxRequiredLevel" type="number" min="0" max="999" inputMode="numeric" defaultValue={maxRequiredLevel} /></AtlasField>
                </>
              ) : null}
            </div>
            <div className={styles.filterActions}>
              <button type="submit" className={styles.primary}>{copy.apply}</button>
              {activeFilters ? <a className={styles.quiet} href={href({ facets: [], minLevel: "", maxLevel: "", minRequiredLevel: "", maxRequiredLevel: "" })} data-catalog-nav>{copy.reset}</a> : null}
            </div>
          </form>
        </AtlasDisclosure>
      ) : null}

      <div className={showTaxonomy ? `${styles.catalog} ${styles.withTaxonomy}` : styles.catalog}>
        {showTaxonomy ? <Taxonomy categories={categories} selectedPath={selectedCategory} copy={copy} lang={lang} hrefFor={(path) => href({ category: path, cursor: "" })} /> : null}
        <div className={styles.results} id={RESULTS_ID}>
          {/* Record names are h3: this keeps the outline h1 → h2 → h3 for screen readers. */}
          <h2 className="sr-only">{copy.resultsLabel}</h2>
          {/* Text-search totals are not counted (too slow on common terms): the rows and paging answer instead. */}
          {narrowed && !query.trim() ? <p className={styles.resultsHead} aria-live="polite">{copy.found}: <b>{foundCount}</b></p> : null}
          {catalog.data.length ? (
            <ul className={styles.records} aria-label={copy.resultsLabel}>
              {catalog.data.map((entity) => (
                <RecordRow key={entity.id} entity={entity} registeredType={typeRegistry.get(entity.type)} lang={lang} copy={copy} preview={preview} hideType={oneType}
                  href={`${base}/${encodeURIComponent(entity.type)}/${entity.id}/${encodeURIComponent(entity.slug || String(entity.externalId))}${selectedProduct === "wow" ? "" : `?product=${encodeURIComponent(selectedProduct)}`}`} />
              ))}
            </ul>
          ) : (
            <div className={styles.empty} role="status">
              <h3>{copy.emptyTitle}</h3>
              <p>{copy.emptyText}</p>
            </div>
          )}
          {cursor || (catalog.pagination.hasMore && catalog.pagination.nextCursor) ? (
            <AtlasPagination
              label={copy.pagesLabel}
              prev={cursor ? { href: href({ cursor: "" }), label: copy.back, attributes: { "data-history-back": true } } : undefined}
              next={catalog.pagination.hasMore && catalog.pagination.nextCursor ? { href: href({ cursor: catalog.pagination.nextCursor }), label: copy.next, attributes: { "data-catalog-nav": true, "data-scroll-to": RESULTS_ID } } : undefined}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}

function RecordRow({ entity, registeredType, href, lang, copy, preview, hideType = false }: {
  entity: CatalogRecord; registeredType?: CatalogEntityType; href: string; lang: Lang; copy: DatabaseCopy; preview: ReturnType<typeof previewCopy>; hideType?: boolean;
}) {
  const typeLabel = entityTypeLabel(entity.type, lang, registeredType?.label);
  const name = entity.name || `${typeLabel} #${entity.externalId}`;
  const meta: ReactNode[] = [
    entity.itemLevel ? `${copy.itemLevel}\u00a0${entity.itemLevel}` : null,
    ...(entity.highlights ?? []).map((highlight) => highlightLabel(highlight.key, highlight.value, lang)),
    `${copy.gameId}\u00a0${entity.externalId}`,
  ];
  return (
    <CatalogRecordRow
      href={href}
      name={name}
      typeLabel={hideType && !entity.localeFallback ? null : <>{hideType ? null : typeLabel}{entity.localeFallback ? <em title={copy.englishOnlyTitle}>{copy.englishOnly}</em> : null}</>}
      iconUrl={entity.iconUrl}
      iconSymbol={registeredType?.iconSymbol}
      quality={entity.quality}
      meta={meta}
      track={{ event: "catalog_detail_opened", props: { id: entity.externalId, type: entity.type } }}
      action={<RecordPreviewButton id={entity.id} externalId={entity.externalId} type={entity.type} lang={lang} iconSymbol={registeredType?.iconSymbol}
        labels={{ label: copy.previewLabel(name), ...preview }} className={styles.preview} errorClassName={styles.previewError} />}
    />
  );
}

/** Record types with at least one record, grouped into catalog sections (a type selected by URL stays visible). */
function groupTypes(entityTypes: CatalogEntityType[], selectedType: string) {
  const groups: { id: string; types: CatalogEntityType[]; total: number }[] = [];
  for (const entry of entityTypes) {
    if (entry.count <= 0 && entry.type !== selectedType) continue;
    let group = groups.find((candidate) => candidate.id === entry.group);
    if (!group) { group = { id: entry.group, types: [], total: 0 }; groups.push(group); }
    group.types.push(entry);
    group.total += entry.count;
  }
  return groups;
}

function groupFacets(categories: CatalogCategory[]) {
  const grouped = new Map<string, CatalogCategory[]>();
  for (const category of categories) {
    if (!FACET_LABELS[category.facet]) continue;
    const entries = grouped.get(category.facet) ?? [];
    entries.push(category);
    grouped.set(category.facet, entries);
  }
  return Array.from(grouped.entries()).sort(([left], [right]) => FACET_ORDER.indexOf(left) - FACET_ORDER.indexOf(right));
}

/**
 * Category tree of the selected record type as a drill-down: the top level,
 * plus the children of every category on the selected path. Choosing a
 * category opens its branch, so nothing hidden is rendered.
 */
function Taxonomy({ categories, selectedPath, copy, lang, hrefFor }: {
  categories: CatalogCategory[]; selectedPath: string; copy: DatabaseCopy; lang: Lang; hrefFor: (path: string) => string;
}) {
  const children = new Map<string, CatalogCategory[]>();
  for (const category of categories) {
    const siblings = children.get(category.parentPath ?? "") ?? [];
    siblings.push(category);
    children.set(category.parentPath ?? "", siblings);
  }
  for (const siblings of children.values()) siblings.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const segments = selectedPath.split("/").filter(Boolean);
  const openPaths = new Set(segments.map((_, index) => segments.slice(0, index + 1).join("/")));

  const branch = (parent: string): ReactNode => (
    <ul>
      {(children.get(parent) ?? []).map((category) => {
        const hasChildren = children.has(category.path);
        const open = hasChildren && openPaths.has(category.path);
        return (
          <li key={category.id}>
            <a href={hrefFor(category.path)} data-catalog-nav aria-current={category.path === selectedPath ? "true" : undefined} data-open={open || undefined}
              data-track="catalog_category_selected" data-track-props={JSON.stringify({ category: category.path })}>
              {hasChildren ? <ChevronRight className={styles.chevron} aria-hidden="true" /> : null}
              <span>{category.name}</span><b>{formatCount(category.count, lang)}</b>
            </a>
            {open ? branch(category.path) : null}
          </li>
        );
      })}
    </ul>
  );

  return (
    <nav className={styles.taxonomy} aria-label={copy.categories}>
      <div className={styles.taxonomyHead}>
        <span>{copy.categories}</span>
        <a href={hrefFor("")} data-catalog-nav aria-current={!selectedPath ? "true" : undefined}>{copy.allCategories}</a>
      </div>
      <div className={styles.taxonomyTree}>{branch("")}</div>
    </nav>
  );
}
