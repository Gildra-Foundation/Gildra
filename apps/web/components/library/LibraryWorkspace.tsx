import { libraryCopy } from "@/components/library/libraryCopy";
import type { ReactNode } from "react";
import { ArrowRight, SlidersHorizontal, X } from "lucide-react";
import type { Lang } from "@/lib/i18n-paths";
import type { CatalogCategory, CatalogEntityType, CatalogPage, CatalogProduct, LibraryDataset } from "@/lib/api/client";
import { AtlasDisclosure, AtlasField, AtlasInput, AtlasSelect } from "@/components/atlas";
import { CatalogBehavior } from "@/components/database/CatalogBehavior";
import { databaseCopy, FACET_LABELS, formatCount } from "@/components/database/databaseCopy";
import { LibraryHoverPreview } from "@/components/library/LibraryHoverPreview";
import { LibraryResults, type LibraryListLayout } from "@/components/library/LibraryResults";
import { LibrarySearchBox } from "@/components/library/LibrarySearchBox";
import { libraryCardCopy } from "@/components/library/libraryCardCopy";
import { libraryColumns, libraryListSearch, libraryRecordViews, type LibraryListQuery } from "@/components/library/libraryRecordView";
import type { LibraryRail } from "@/components/library/libraryRails";
import { MaterialButton, MaterialPlaque, materialButtonStyle, materialIconFrameStyle } from "@/components/wow/shared/materialAtlas";
import { libraryKit } from "@/components/library/libraryKit";
import styles from "./libraryWorkspace.module.css";
import { LibraryPager } from "@/components/library/LibraryPager";

const FACET_ORDER = ["class", "specialization", "race", "profession", "equipment_slot", "armor_type", "weapon_type", "item_class"];
const ROOT_ID = "catalog-workspace";
const RESULTS_ID = "catalog-results";
const LEVELS = ["minLevel", "maxLevel", "minRequiredLevel", "maxRequiredLevel"] as const;

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

const level = (value: string) => (value && Number.isFinite(Number(value)) ? Number(value) : undefined);

/**
 * Records of one library dataset (gildra-wow-material-design §3.7, §3.10): one
 * form on the library plaque — the name search with instant suggestions and the
 * painted button, every filter as a select (they submit on change; on phones
 * folded under one "Filters" toggle), item-level bounds folded away — the
 * applied filters as chips with one reset, then the records (a table, or icon
 * tiles for collections) with "show more". Server-rendered links and GET forms;
 * CatalogBehavior upgrades them to soft navigation, LibraryHoverPreview shows
 * the in-game tooltip on hover.
 */
export function LibraryWorkspace({ lang, dataset, catalog, categories, entityType, products, totalCount, query = "", selectedProduct = "wow", selectedFacets = [], cursor = "", levels, layout = "table", rails = [] }: {
  lang: Lang; dataset: Pick<LibraryDataset, "slug" | "name" | "entityType" | "entityCount" | "applicability">; catalog: CatalogPage; categories: CatalogCategory[];
  entityType?: CatalogEntityType; products: CatalogProduct[]; totalCount?: ReactNode;
  query?: string; selectedProduct?: string; selectedFacets?: string[]; cursor?: string;
  levels: Record<(typeof LEVELS)[number], string>; layout?: LibraryListLayout; rails?: LibraryRail[];
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
  const rows = libraryRecordViews(catalog.data, lang, selectedProduct);
  const next = catalog.pagination.hasMore && catalog.pagination.nextCursor ? catalog.pagination.nextCursor : undefined;
  const listQuery: LibraryListQuery = {
    dataset: dataset.slug, product: selectedProduct, q: query, facets,
    minLevel: level(state.minLevel), maxLevel: level(state.maxLevel), minRequiredLevel: level(state.minRequiredLevel), maxRequiredLevel: level(state.maxRequiredLevel),
  };
  const zeroResults = !catalog.data.length && narrowed ? JSON.stringify({ query, type: dataset.entityType, facets: facets.join(",") }) : undefined;
  const hidden = (fields: Record<string, string>) => Object.entries(fields).filter(([key, value]) => value && !(key === "product" && value === "wow"))
    .map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />);
  const filterCount = facets.length + levelCount + (selectedProduct === "wow" ? 0 : 1);
  const hasFilters = filters.length > 0 || products.length > 1 || items;

  return (
    <section id={ROOT_ID} className={styles.workspace} aria-label={dataset.name}>
      <CatalogBehavior rootId={ROOT_ID} lang={lang} zeroResults={zeroResults} />

      <MaterialPlaque kit={libraryKit} className={styles.plaque}>
        <form className={styles.toolbar} role="search" action={base} method="get" data-catalog-form data-track="catalog_search_submitted" data-track-props={JSON.stringify({ type: dataset.entityType })}>
          <div className={styles.search}>
            <AtlasField label={copy.searchLabel(dataset.name)} htmlFor="library-dataset-search" className={styles.searchField}>
              <LibrarySearchBox key={query} lang={lang} id="library-dataset-search" defaultValue={query} placeholder={copy.searchPlaceholder} dataset={dataset.slug} product={selectedProduct} />
            </AtlasField>
            <MaterialButton kit={libraryKit} fit="stack" type="submit" variant="primary" iconAfter={<ArrowRight aria-hidden="true" />}>{copy.searchSubmit}</MaterialButton>
          </div>
          {selectedProduct === "wow" || products.length > 1 ? null : hidden({ product: selectedProduct })}
          {hasFilters ? (
            <>
              {/* Phones fold the selects under one toggle (a checkbox, so it works without JavaScript); wider screens always show them. */}
              <input id="library-filters-toggle" type="checkbox" className={styles.filtersToggle} defaultChecked={filterCount > 0} aria-controls="library-filters" />
              <label htmlFor="library-filters-toggle" className={styles.filtersButton}>
                <SlidersHorizontal aria-hidden="true" />{libraryCardCopy[lang].filters}{filterCount ? <b>{filterCount}</b> : null}
              </label>
              <div id="library-filters" className={styles.filters}>
                {filters.map((filter) => (
                  <AtlasField key={filter.id} label={filter.label} htmlFor={`library-filter-${filter.id}`} className={styles.field}>
                    <AtlasSelect id={`library-filter-${filter.id}`} name="facet" defaultValue={selectedCategory(filter)?.path ?? ""} data-autosubmit key={`${filter.id}:${facets.join(",")}`}>
                      <option value="">{copy.any}</option>
                      {filter.categories.map((category) => <option key={category.id} value={category.path}>{categoryName(category, lang)} · {formatCount(category.count, lang)}</option>)}
                    </AtlasSelect>
                  </AtlasField>
                ))}
                {products.length > 1 ? (
                  <AtlasField label={copy.gameVersion} htmlFor="library-product" className={styles.field}>
                    <AtlasSelect id="library-product" name="product" defaultValue={selectedProduct} data-autosubmit key={selectedProduct}>
                      {products.map((product) => <option key={product.slug} value={product.slug}>{product.name}</option>)}
                    </AtlasSelect>
                  </AtlasField>
                ) : null}
                {/* Facets chosen by URL that no select offers stay applied. */}
                {facets.filter((facet) => !known.has(facet)).map((facet) => <input key={facet} type="hidden" name="facet" value={facet} />)}
                {items ? (
                  <AtlasDisclosure className={styles.levels} open={levelCount > 0 || undefined} summary={<>{copy.levelsTitle}{levelCount ? <b>{levelCount}</b> : null}</>}>
                    <div className={styles.levelGrid}>
                      <AtlasField label={copy.itemLevelFrom} htmlFor="filter-minLevel"><AtlasInput id="filter-minLevel" name="minLevel" type="number" min="0" max="9999" inputMode="numeric" defaultValue={levels.minLevel} /></AtlasField>
                      <AtlasField label={copy.itemLevelTo} htmlFor="filter-maxLevel"><AtlasInput id="filter-maxLevel" name="maxLevel" type="number" min="0" max="9999" inputMode="numeric" defaultValue={levels.maxLevel} /></AtlasField>
                      <AtlasField label={copy.charLevelFrom} htmlFor="filter-minRequiredLevel"><AtlasInput id="filter-minRequiredLevel" name="minRequiredLevel" type="number" min="0" max="999" inputMode="numeric" defaultValue={levels.minRequiredLevel} /></AtlasField>
                      <AtlasField label={copy.charLevelTo} htmlFor="filter-maxRequiredLevel"><AtlasInput id="filter-maxRequiredLevel" name="maxRequiredLevel" type="number" min="0" max="999" inputMode="numeric" defaultValue={levels.maxRequiredLevel} /></AtlasField>
                      <MaterialButton kit={libraryKit} fit="stack" type="submit">{copy.apply}</MaterialButton>
                    </div>
                  </AtlasDisclosure>
                ) : null}
              </div>
            </>
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
      </MaterialPlaque>

      <div className={styles.results} id={RESULTS_ID}>
        {/* Record names are row headers (h1 → h2 for screen readers, the table carries the rest). */}
        <h2 className="sr-only">{copy.resultsLabel(dataset.name)}</h2>
        {rows.length ? (
          <>
            {/* A new query is a new list: the key drops the rows "show more" added to the previous one. */}
            <LibraryResults key={`${libraryListSearch(listQuery, cursor)}`} lang={lang} layout={layout} columns={layout === "table" ? libraryColumns(dataset.entityType, rows) : []}
              rows={rows} next={next} query={listQuery} nextHref={next ? link({ cursor: next }) : undefined} iconSymbol={entityType?.iconSymbol}
              rowFrame={materialIconFrameStyle(libraryKit, 48)} tileFrame={materialIconFrameStyle(libraryKit, 76)} buttonStyle={materialButtonStyle(libraryKit)} />
            <LibraryHoverPreview rootId={RESULTS_ID} lang={lang} iconSymbol={entityType?.iconSymbol} loadingLabel={libraryCardCopy[lang].hoverLoading} />
          </>
        ) : (
          <div className={styles.empty} role="status">
            {dataset.entityCount === 0 ? <p>{dataset.applicability === "not_applicable"
              ? libraryCopy[lang].unavailableProduct
              : libraryCopy[lang].emptyProduct}</p>
              : <><h3>{copy.emptyTitle}</h3><p>{copy.emptyText}</p></>}
          </div>
        )}
        {/* A page opened at a cursor (old links, no JavaScript) can go back to the start of the list. */}
        {cursor ? <LibraryPager label={copy.pagesLabel} prev={{ href: link({ cursor: "" }), label: copy.back, attributes: { "data-catalog-nav": true } }} /> : null}
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
