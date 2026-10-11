"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { Lang } from "@/lib/i18n-paths";
import { trackCatalogEvent } from "@/lib/catalogAnalytics";
import type { CatalogCategory, CatalogEntityType, CatalogPage, CatalogProduct, CatalogRecord, GameEntity } from "@/lib/api/client";
import { ResilientImage } from "@/components/media/ResilientImage";
import { databaseCopy, entityTypeLabel, FACET_LABELS, formatCount, GROUP_LABELS, highlightLabel, ITEM_QUALITY_COLORS, type DatabaseCopy } from "@/components/database/databaseCopy";
import styles from "@/components/database/databaseHub.module.css";

const FACET_ORDER = ["class", "specialization", "race", "profession", "equipment_slot", "armor_type", "weapon_type", "item_class"];

const loadDatabaseEntityTooltip = () => import("@/components/database/DatabaseEntityTooltip").then((module) => module.EntityTooltip);
const prefetchDatabaseEntityTooltip = () => { void loadDatabaseEntityTooltip().catch(() => undefined); };

const DatabaseEntityTooltip = dynamic(
  loadDatabaseEntityTooltip,
  { loading: () => <div className="db-tooltip-loading" data-atlas-scope aria-hidden="true"><span /></div> },
);

/**
 * Interactive part of the WoW database: search, record-type chips, catalog
 * sections, facet filters, the record list and pagination. The page heading
 * (AtlasHero) is rendered on the server by components/database/DatabaseHub.
 * Library datasets reuse this workspace and get a compact heading of their own.
 */
export function DatabaseDirectory({ lang = "en", catalog, categories, entityTypes, products, totalCount, query = "", selectedProduct = "wow", selectedType = "", selectedCategory = "", selectedFacets = [], cursor = "", minItemLevel = "", maxItemLevel = "", minRequiredLevel = "", maxRequiredLevel = "", libraryDataset }: {
  lang?: Lang; catalog: CatalogPage; categories: CatalogCategory[]; entityTypes: CatalogEntityType[]; products: CatalogProduct[];
  totalCount?: ReactNode;
  query?: string; selectedProduct?: string; selectedType?: string; selectedCategory?: string; selectedFacets?: string[]; cursor?: string; minItemLevel?: string; maxItemLevel?: string; minRequiredLevel?: string; maxRequiredLevel?: string;
  libraryDataset?: { slug: string; name: string; description: string; itemClassId?: number };
}) {
  const [openTooltip, setOpenTooltip] = useState("");
  const [entityDetails, setEntityDetails] = useState<Record<string, CatalogRecord>>({});
  const [tooltipState, setTooltipState] = useState<Record<string, "loading" | "error">>({});
  const [browseOpen, setBrowseOpen] = useState(!selectedType && !query);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const copy = databaseCopy[lang];
  const ru = lang === "ru";
  const openTooltipRef = useRef(openTooltip);
  openTooltipRef.current = openTooltip;
  const entityLoadState = useRef(new Map<string, "loading" | "loaded">());
  const typeRegistry = useMemo(() => new Map(entityTypes.map((type) => [type.type, type])), [entityTypes]);
  // Record types without a single record are not offered as filters; a type
  // selected through the URL stays visible so the active state is honest.
  const allRecordsCount = useMemo(() => entityTypes.reduce((sum, entry) => sum + entry.count, 0), [entityTypes]);
  const typeChips = useMemo(() => entityTypes.filter((entry) => entry.count > 0 || entry.type === selectedType), [entityTypes, selectedType]);
  const groups = useMemo(() => {
    const grouped = new Map<string, CatalogEntityType[]>();
    for (const entityType of entityTypes) {
      if (entityType.count <= 0) continue;
      const entries = grouped.get(entityType.group) ?? [];
      entries.push(entityType);
      grouped.set(entityType.group, entries);
    }
    return Array.from(grouped.entries());
  }, [entityTypes]);
  const facetGroups = useMemo(() => {
    const grouped = new Map<string, CatalogCategory[]>();
    for (const category of categories) {
      if (!FACET_LABELS[category.facet]) continue;
      const entries = grouped.get(category.facet) ?? [];
      entries.push(category);
      grouped.set(category.facet, entries);
    }
    return Array.from(grouped.entries()).sort(([left], [right]) => FACET_ORDER.indexOf(left) - FACET_ORDER.indexOf(right));
  }, [categories]);

  useEffect(() => {
    if (selectedType || query) setBrowseOpen(false);
  }, [query, selectedType]);
  useEffect(() => {
    if (!catalog.data.length && (query || selectedType || selectedCategory || selectedFacets.length)) {
      trackCatalogEvent("catalog_zero_results", lang, { query, type: selectedType, category: selectedCategory, facets: selectedFacets.join(",") });
    }
  }, [catalog.data.length, lang, query, selectedCategory, selectedFacets, selectedType]);

  function navigate(type: string, nextQuery = query, nextCursor = "", category = selectedCategory, product = selectedProduct, minLevel = minItemLevel, maxLevel = maxItemLevel, facets = selectedFacets, requiredMin = minRequiredLevel, requiredMax = maxRequiredLevel) {
    const params = new URLSearchParams();
    if (product && product !== "wow") params.set("product", product);
    if (type) params.set("type", type);
    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    if (nextCursor) params.set("cursor", nextCursor);
    if (category) params.set("category", category);
    for (const facet of facets) if (facet) params.append("facet", facet);
    if (type === "item" && minLevel) params.set("minLevel", minLevel);
    if (type === "item" && maxLevel) params.set("maxLevel", maxLevel);
    if (type === "item" && requiredMin) params.set("minRequiredLevel", requiredMin);
    if (type === "item" && requiredMax) params.set("maxRequiredLevel", requiredMax);
    if (libraryDataset?.itemClassId !== undefined) params.set("itemClassId", String(libraryDataset.itemClassId));
    startTransition(() => router.push(params.size ? `${pathname}?${params}` : pathname));
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const searchValue = String(new FormData(event.currentTarget).get("q") ?? "");
    trackCatalogEvent("catalog_search_submitted", lang, { query: searchValue, type: selectedType });
    navigate(selectedType, searchValue);
  }

  const loadEntity = useCallback(async (entity: CatalogRecord) => {
    if (entityLoadState.current.has(entity.id)) return;
    entityLoadState.current.set(entity.id, "loading");
    setTooltipState((current) => ({ ...current, [entity.id]: "loading" }));
    try {
      const locale = lang === "ru" ? "ru_RU" : "en_US";
      const response = await fetch(`/api/catalog/entities/${entity.id}?locale=${locale}`);
      if (!response.ok) throw new Error(String(response.status));
      const detail = await response.json() as GameEntity;
      setEntityDetails((current) => ({ ...current, [entity.id]: {
        ...entity,
        description: detail.description,
        iconName: detail.iconName ?? entity.iconName,
        iconUrl: detail.iconUrl ?? entity.iconUrl,
        quality: detail.quality ?? entity.quality,
        tooltip: detail.tooltip,
      } }));
      setTooltipState((current) => {
        const next = { ...current };
        delete next[entity.id];
        return next;
      });
      entityLoadState.current.set(entity.id, "loaded");
    } catch {
      setTooltipState((current) => ({ ...current, [entity.id]: "error" }));
      entityLoadState.current.delete(entity.id);
    }
  }, [lang]);

  const openPreview = useCallback((entity: CatalogRecord) => {
    const opening = openTooltipRef.current !== entity.id;
    setOpenTooltip(opening ? entity.id : "");
    if (opening) {
      trackCatalogEvent("catalog_tooltip_opened", lang, { id: entity.externalId, type: entity.type });
      void loadEntity(entity);
    }
  }, [lang, loadEntity]);

  const closePreview = useCallback(() => setOpenTooltip(""), []);
  const foundCount = totalCount ?? (catalog.pagination.total !== undefined ? formatCount(catalog.pagination.total, lang) : "—");
  const hasActiveFilters = Boolean(selectedCategory || selectedFacets.length || minItemLevel || maxItemLevel || minRequiredLevel || maxRequiredLevel);
  const detailRoot = libraryDataset
    ? `${ru ? "/ru" : ""}/library/${encodeURIComponent(libraryDataset.slug)}`
    : `${ru ? "/ru" : ""}/database`;

  return (
    <div className={styles.hub}>
      {libraryDataset ? (
        <header className={styles.libraryHeader}>
          <p className={styles.eyebrow}>{copy.libraryEyebrow}</p>
          <h1>{libraryDataset.name}</h1>
          {libraryDataset.description ? <p>{libraryDataset.description}</p> : null}
        </header>
      ) : null}

      <section className={styles.workspace} aria-label={copy.workspaceLabel}>
        <div className={styles.toolbar}>
          <form className={styles.search} role="search" onSubmit={submitSearch}>
            <label className="sr-only" htmlFor="database-search">{copy.searchLabel}</label>
            <svg className={styles.searchIcon} aria-hidden="true"><use href="#ic-search" /></svg>
            <input key={query} id="database-search" className={styles.searchInput} name="q" type="search" defaultValue={query} placeholder={copy.searchPlaceholder} autoComplete="off" />
            <button type="submit">{copy.searchSubmit}</button>
          </form>
          {products.length > 1 ? (
            <label className={styles.product}>
              <span>{copy.gameVersion}</span>
              <select value={selectedProduct} onChange={(event) => navigate("", "", "", "", event.target.value, "", "", [])}>
                {products.map((product) => <option key={product.slug} value={product.slug}>{product.name}</option>)}
              </select>
            </label>
          ) : null}
        </div>

        {!libraryDataset ? (
          <div className={styles.types} role="group" aria-label={copy.typesLabel}>
            <button type="button" className={styles.chip} aria-pressed={!selectedType} onClick={() => navigate("", query, "", "", selectedProduct, "", "", [])}><span>{copy.allRecords}</span><b>{formatCount(allRecordsCount, lang)}</b></button>
            {typeChips.map((entityType) => (
              <button type="button" key={entityType.type} className={styles.chip} title={entityType.label} aria-pressed={selectedType === entityType.type}
                onClick={() => { trackCatalogEvent("catalog_type_selected", lang, { type: entityType.type }); navigate(entityType.type, query, "", "", selectedProduct, "", "", []); }}>
                <span>{entityType.label}</span><b>{formatCount(entityType.count, lang)}</b>
              </button>
            ))}
          </div>
        ) : null}

        {!libraryDataset && groups.length ? (
          <details className={styles.browse} open={browseOpen} onToggle={(event) => setBrowseOpen(event.currentTarget.open)}>
            <summary>
              <span className={styles.browseTitle}>{copy.browseTitle}</span>
              <span className={styles.browseToggle}>{browseOpen ? copy.browseHide : copy.browseShow}</span>
            </summary>
            <div className={styles.groupGrid}>
              {groups.map(([group, types]) => {
                const primary = types[0];
                const active = types.some((entry) => entry.type === selectedType);
                const total = types.reduce((sum, entry) => sum + entry.count, 0);
                return (
                  <button className={styles.group} type="button" key={group} aria-pressed={active} onClick={() => navigate(primary.type, "", "", "")}>
                    <span className={styles.groupIcon} aria-hidden="true"><svg><use href={primary.iconSymbol} /></svg></span>
                    <span className={styles.groupCopy}>
                      <strong>{GROUP_LABELS[group]?.[ru ? 1 : 0] ?? group}</strong>
                      <small>{types.map((entry) => entry.label).slice(0, 3).join(" · ")}</small>
                    </span>
                    <span className={styles.groupCount}>{formatCount(total, lang)}</span>
                  </button>
                );
              })}
            </div>
          </details>
        ) : null}

        {(facetGroups.length || selectedType === "item") ? (
          <form className={styles.filters} aria-label={copy.filtersLabel} onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); navigate(selectedType, query, "", selectedCategory, selectedProduct, String(data.get("minLevel") ?? ""), String(data.get("maxLevel") ?? ""), data.getAll("facet").map(String).filter(Boolean), String(data.get("minRequiredLevel") ?? ""), String(data.get("maxRequiredLevel") ?? "")); }}>
            {facetGroups.length ? (
              <div className={styles.filterGrid}>
                {facetGroups.map(([facet, entries]) => (
                  <label key={`${facet}:${selectedFacets.join(",")}`}>
                    <span>{FACET_LABELS[facet][ru ? 1 : 0]}</span>
                    <select name="facet" defaultValue={selectedFacets.find((path) => entries.some((entry) => entry.path === path)) ?? ""}>
                      <option value="">{copy.any}</option>
                      {entries.map((category) => <option key={category.id} value={category.path}>{category.name} · {formatCount(category.count, lang)}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            ) : null}
            {selectedType === "item" ? (
              <div className={styles.filterGrid}>
                <label><span>{copy.itemLevelFrom}</span><input name="minLevel" type="number" min="0" max="9999" inputMode="numeric" defaultValue={minItemLevel} /></label>
                <label><span>{copy.itemLevelTo}</span><input name="maxLevel" type="number" min="0" max="9999" inputMode="numeric" defaultValue={maxItemLevel} /></label>
                <label><span>{copy.charLevelFrom}</span><input name="minRequiredLevel" type="number" min="0" max="999" inputMode="numeric" defaultValue={minRequiredLevel} /></label>
                <label><span>{copy.charLevelTo}</span><input name="maxRequiredLevel" type="number" min="0" max="999" inputMode="numeric" defaultValue={maxRequiredLevel} /></label>
              </div>
            ) : null}
            <div className={styles.filterActions}>
              <button type="submit" className={styles.action}>{copy.apply}</button>
              {hasActiveFilters ? <button type="button" className={styles.actionQuiet} onClick={() => navigate(selectedType, query, "", "", selectedProduct, "", "", [], "", "")}>{copy.reset}</button> : null}
            </div>
          </form>
        ) : null}

        <div className={categories.length ? `${styles.catalog} ${styles.withTaxonomy}` : styles.catalog}>
          {categories.length ? (
            <Taxonomy
              categories={categories}
              selectedPath={selectedCategory}
              copy={copy}
              lang={lang}
              onSelect={(path) => navigate(selectedType, query, "", path)}
            />
          ) : null}
          <div className={styles.results}>
            <p className={styles.resultsHead} aria-live="polite">{copy.found}: <b>{foundCount}</b></p>
            {catalog.data.length ? (
              <ul className={styles.records} aria-busy={isPending} data-pending={isPending || undefined} aria-label={copy.resultsLabel}>
                {catalog.data.map((entity) => {
                  const registeredType = typeRegistry.get(entity.type);
                  const detailHref = `${detailRoot}/${encodeURIComponent(entity.type)}/${entity.id}/${encodeURIComponent(entity.slug || String(entity.externalId))}${selectedProduct === "wow" ? "" : `?product=${encodeURIComponent(selectedProduct)}`}`;
                  return (
                    <DatabaseRecordRow
                      key={entity.id}
                      entity={entity}
                      registeredType={registeredType}
                      detail={entityDetails[entity.id]}
                      detailHref={detailHref}
                      lang={lang}
                      copy={copy}
                      open={openTooltip === entity.id}
                      tooltipState={tooltipState[entity.id]}
                      onLoad={loadEntity}
                      onPrefetchTooltip={prefetchDatabaseEntityTooltip}
                      onOpenPreview={openPreview}
                      onClosePreview={closePreview}
                    />
                  );
                })}
              </ul>
            ) : (
              <div className={styles.empty} role="status">
                <h3>{copy.emptyTitle}</h3>
                <p>{copy.emptyText}</p>
              </div>
            )}
          </div>
        </div>

        <nav className={styles.pagination} aria-label={copy.resultsLabel}>
          <button type="button" className={styles.action} onClick={() => router.back()} disabled={!cursor}>{copy.back}</button>
          <button type="button" className={styles.action} disabled={!catalog.pagination.hasMore || !catalog.pagination.nextCursor}
            onClick={() => navigate(selectedType, query, catalog.pagination.nextCursor)}>{copy.next}</button>
        </nav>
      </section>
    </div>
  );
}

const DatabaseRecordRow = memo(function DatabaseRecordRow({ entity, registeredType, detail, detailHref, lang, copy, open, tooltipState, onLoad, onPrefetchTooltip, onOpenPreview, onClosePreview }: {
  entity: CatalogRecord;
  registeredType?: CatalogEntityType;
  detail?: CatalogRecord;
  detailHref: string;
  lang: Lang;
  copy: DatabaseCopy;
  open: boolean;
  tooltipState?: "loading" | "error";
  onLoad: (entity: CatalogRecord) => void;
  onPrefetchTooltip: () => void;
  onOpenPreview: (entity: CatalogRecord) => void;
  onClosePreview: () => void;
}) {
  const typeLabel = entityTypeLabel(entity.type, lang, registeredType?.label);
  const name = entity.name || `${typeLabel} #${entity.externalId}`;
  const qualityColor = entity.quality !== undefined ? ITEM_QUALITY_COLORS[entity.quality] : undefined;
  const hoverPrefetchTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (hoverPrefetchTimer.current !== null) window.clearTimeout(hoverPrefetchTimer.current);
  }, []);
  const prefetchAfterHover = () => {
    if (hoverPrefetchTimer.current !== null) window.clearTimeout(hoverPrefetchTimer.current);
    hoverPrefetchTimer.current = window.setTimeout(onPrefetchTooltip, 180);
  };
  const cancelHoverPrefetch = () => {
    if (hoverPrefetchTimer.current !== null) window.clearTimeout(hoverPrefetchTimer.current);
    hoverPrefetchTimer.current = null;
  };
  const focusPreview = () => {
    cancelHoverPrefetch();
    onLoad(entity);
    onPrefetchTooltip();
  };
  return (
    <li className={styles.record} data-quality={qualityColor ? entity.quality : undefined} style={qualityColor ? { "--record-quality": qualityColor } as CSSProperties : undefined}>
      <span className={styles.recordIcon} aria-hidden="true">
        <ResilientImage src={entity.iconUrl} alt="" width={56} height={56} loading="lazy" fallback={<span className={styles.iconFallback}>✦</span>} />
      </span>
      <div className={styles.recordBody}>
        <p className={styles.recordType}>
          {typeLabel}
          {entity.localeFallback ? <em title={copy.englishOnlyTitle}>{copy.englishOnly}</em> : null}
        </p>
        <h3 className={styles.recordName}>
          <Link href={detailHref} prefetch={false} onClick={() => trackCatalogEvent("catalog_detail_opened", lang, { id: entity.externalId, type: entity.type })}>{name}</Link>
        </h3>
        <p className={styles.recordMeta}>
          {entity.itemLevel ? <span>{copy.itemLevel} <b>{entity.itemLevel}</b></span> : null}
          <span>{copy.gameId} <b>{entity.externalId}</b></span>
        </p>
        {entity.highlights?.length ? (
          <p className={styles.recordHighlights}>{entity.highlights.map((highlight) => highlightLabel(highlight.key, highlight.value, lang)).join(" · ")}</p>
        ) : null}
      </div>
      <button type="button" className={styles.preview} aria-haspopup="dialog" aria-expanded={open} aria-label={copy.previewLabel(name)}
        onPointerEnter={prefetchAfterHover} onPointerLeave={cancelHoverPrefetch} onFocus={focusPreview} onClick={() => onOpenPreview(entity)}>
        {copy.preview}
      </button>
      {detail?.tooltip && open ? <DatabaseEntityTooltip entity={detail} lang={lang} expanded iconSymbol={registeredType?.iconSymbol} onClose={onClosePreview} /> : null}
      {open && tooltipState === "loading" ? <p className={styles.tooltipStatus} role="status">{copy.loadingTooltip}</p> : null}
      {open && tooltipState === "error" ? <p className={styles.tooltipStatus} data-error role="alert">{copy.tooltipError} <button type="button" onClick={() => onLoad(entity)}>{copy.retry}</button></p> : null}
    </li>
  );
});

function Taxonomy({ categories, selectedPath, copy, lang, onSelect }: {
  categories: CatalogCategory[];
  selectedPath: string;
  copy: DatabaseCopy;
  lang: Lang;
  onSelect: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const tree = useMemo(() => buildCategoryTree(categories), [categories]);
  const selectedAncestors = useMemo(() => {
    const paths = new Set<string>();
    const segments = selectedPath.split("/").filter(Boolean);
    for (let index = 1; index < segments.length; index += 1) paths.add(segments.slice(0, index).join("/"));
    return paths;
  }, [selectedPath]);
  const visibleCategories = useMemo(() => flattenVisibleCategories(tree, expanded, selectedAncestors), [tree, expanded, selectedAncestors]);

  function toggleCategory(path: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  return (
    <aside className={styles.taxonomy} aria-label={copy.categories}>
      <div className={styles.taxonomyHead}>
        <span>{copy.categories}</span>
        <button type="button" aria-pressed={!selectedPath} onClick={() => onSelect("")}>{copy.allCategories}</button>
      </div>
      <div className={styles.taxonomyList}>
        {visibleCategories.map((category) => {
          const depth = category.path.split("/").length - 1;
          const hasChildren = tree.children.has(category.path);
          const isExpanded = expanded.has(category.path) || selectedAncestors.has(category.path);
          const active = selectedPath === category.path;
          return (
            <div key={category.id} className={styles.taxonomyRow} data-active={active || undefined} style={{ "--taxonomy-depth": depth } as CSSProperties}>
              {hasChildren
                ? <button type="button" className={styles.taxonomyToggle} aria-label={`${isExpanded ? copy.collapse : copy.expand} ${category.name}`} aria-expanded={isExpanded} onClick={() => toggleCategory(category.path)}><span data-open={isExpanded || undefined} aria-hidden="true">›</span></button>
                : <span className={styles.taxonomyToggle} aria-hidden="true" />}
              <button type="button" className={styles.taxonomySelect} aria-pressed={active} onClick={() => { trackCatalogEvent("catalog_category_selected", lang, { category: category.path }); onSelect(category.path); }}>
                <span>{category.name}</span><b>{formatCount(category.count, lang)}</b>
              </button>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function buildCategoryTree(categories: CatalogCategory[]) {
  const children = new Map<string, CatalogCategory[]>();
  for (const category of categories) {
    const parent = category.parentPath ?? "";
    const siblings = children.get(parent) ?? [];
    siblings.push(category);
    children.set(parent, siblings);
  }
  for (const siblings of children.values()) {
    siblings.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }
  return { children };
}

function flattenVisibleCategories(
  tree: ReturnType<typeof buildCategoryTree>,
  expanded: Set<string>,
  selectedAncestors: Set<string>,
) {
  const visible: CatalogCategory[] = [];
  function visit(parent: string) {
    for (const category of tree.children.get(parent) ?? []) {
      visible.push(category);
      if (expanded.has(category.path) || selectedAncestors.has(category.path)) visit(category.path);
    }
  }
  visit("");
  return visible;
}
