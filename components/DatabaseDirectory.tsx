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

const SOURCES = [
  { label: "Raidbots", href: "https://www.raidbots.com/developers" },
  { label: "Blizzard API", href: "https://community.developer.battle.net/documentation/world-of-warcraft/game-data-apis" },
  { label: "wow.export", href: "https://github.com/Kruithne/wow.export" },
  { label: "wow-listfile", href: "https://github.com/wowdev/wow-listfile" },
  { label: "Wago.Tools", href: "https://wago.tools/" },
];

const GROUP_LABELS: Record<string, [string, string]> = {
  equipment: ["Equipment", "Экипировка"], combat: ["Classes & combat", "Классы и бой"],
  encounters: ["Dungeons & raids", "Подземелья и рейды"], crafting: ["Professions", "Профессии"],
  world: ["World & quests", "Мир и задания"], collections: ["Collections", "Коллекции"],
  system: ["Game systems", "Игровые системы"], other: ["Other records", "Другие записи"],
};

const FACET_LABELS: Record<string, [string, string]> = {
  class: ["Class", "Класс"], specialization: ["Specialization", "Специализация"], race: ["Race", "Раса"],
  equipment_slot: ["Equipment slot", "Слот"], armor_type: ["Armor type", "Тип брони"], weapon_type: ["Weapon type", "Тип оружия"],
  profession: ["Profession", "Профессия"], item_class: ["Item class", "Класс предмета"],
};
const FACET_ORDER = ["class", "specialization", "race", "profession", "equipment_slot", "armor_type", "weapon_type", "item_class"];

const DB_RU: Record<string, string> = {
  records: "записей",
  "Search by name or game ID...": "Поиск по названию или игровому ID...",
  Found: "Найдено",
  All: "Все",
  "World of Warcraft Database": "База данных World of Warcraft",
  "Azeroth reference index": "Справочник Азерота",
  "A structured catalog of items, spells, quests, creatures and every system that shapes World of Warcraft.":
    "Структурированный каталог предметов, заклинаний, заданий, существ и всех систем World of Warcraft.",
  "Catalog scope": "Охват каталога",
  "Build-aware": "С учётом версий",
  "English & Russian": "Русский и английский",
  "Built from traceable data": "Данные с проверяемым происхождением",
  "Catalog search": "Поиск по каталогу",
  "Explore imported game data": "Поиск по импортированным данным",
  "Search the game database": "Поиск по игровой базе данных",
  Search: "Найти",
  "Catalog type": "Тип данных",
  "All records": "Все записи",
  "Browse the catalog": "Навигация по каталогу",
  "Choose a category": "Выберите категорию",
  "Game record ID": "ID в игре",
  "No matching records": "Подходящих записей нет",
  "Try another search term or choose a different data type.":
    "Попробуйте другой запрос или выберите иной тип данных.",
  Back: "Назад",
  "Next page": "Следующая страница",
  Categories: "Категории",
  "Category index": "Категории",
};

const translateDatabase = (lang: Lang) => (text: string) =>
  lang === "ru" ? DB_RU[text] ?? text : text;

const loadDatabaseEntityTooltip = () => import("@/components/database/DatabaseEntityTooltip").then((module) => module.EntityTooltip);
const prefetchDatabaseEntityTooltip = () => { void loadDatabaseEntityTooltip().catch(() => undefined); };

const DatabaseEntityTooltip = dynamic(
  loadDatabaseEntityTooltip,
  { loading: () => <div className="db-tooltip-loading" aria-hidden="true"><span /></div> },
);

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
  const tt = translateDatabase(lang);
  const openTooltipRef = useRef(openTooltip);
  openTooltipRef.current = openTooltip;
  const entityLoadState = useRef(new Map<string, "loading" | "loaded">());
  const typeRegistry = useMemo(() => new Map(entityTypes.map((type) => [type.type, type])), [entityTypes]);
  const groups = useMemo(() => {
    const grouped = new Map<string, CatalogEntityType[]>();
    for (const entityType of entityTypes) {
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

  return (
    <div className="db-page">
      <header className="db-hero db-hero-compact" aria-labelledby="database-title">
        <div className="db-intro">
          <p className="cap gold">{libraryDataset ? (lang === "ru" ? "Публичная библиотека" : "Public library") : tt("Azeroth reference index")}</p>
          <h1 id="database-title">{libraryDataset?.name ?? tt("World of Warcraft Database")}</h1>
          <p className="db-lede">{libraryDataset?.description ?? tt("A structured catalog of items, spells, quests, creatures and every system that shapes World of Warcraft.")}</p>
          <div className="db-scope" aria-label={tt("Catalog scope")}><span>{products.find((product) => product.slug === selectedProduct)?.name ?? "World of Warcraft"}</span><span>{tt("Build-aware")}</span><span>{tt("English & Russian")}</span></div>
        </div>
        <details className="db-source-panel"><summary>{tt("Built from traceable data")}</summary><div className="db-source-links">{SOURCES.map((source) => <a key={source.label} href={source.href} target="_blank" rel="noreferrer">{source.label}<span aria-hidden="true">↗</span></a>)}</div></details>
      </header>

      <section className="db-live" aria-labelledby="database-live-title">
        <div className="db-live-head">
          <div><p className="cap">{tt("Catalog search")}</p><h2 id="database-live-title">{tt("Explore imported game data")}</h2></div>
          <span className={catalog.data.length ? "db-live-state is-live" : "db-live-state"}>{totalCount ?? catalog.pagination.total?.toLocaleString(lang === "ru" ? "ru-RU" : "en-US") ?? "—"} {tt("records")}</span>
        </div>
        {products.length > 1 ? <label className="db-product-select"><span>{lang === "ru" ? "Версия игры" : "Game version"}</span><select value={selectedProduct} onChange={(event) => navigate("", "", "", "", event.target.value, "", "", [])}>{products.map((product) => <option key={product.slug} value={product.slug}>{product.name}</option>)}</select></label> : null}
        <form className="db-catalog-search" onSubmit={submitSearch}>
          <label className="sr-only" htmlFor="database-search">{tt("Search the game database")}</label>
          <svg className="i" aria-hidden="true"><use href="#ic-search" /></svg>
          <input key={query} id="database-search" name="q" type="search" defaultValue={query} placeholder={tt("Search by name or game ID...")} />
          <button type="submit">{tt("Search")}</button>
        </form>
        {(facetGroups.length || selectedType === "item") ? <form className="db-quick-filters" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); navigate(selectedType, query, "", selectedCategory, selectedProduct, String(data.get("minLevel") ?? ""), String(data.get("maxLevel") ?? ""), data.getAll("facet").map(String).filter(Boolean), String(data.get("minRequiredLevel") ?? ""), String(data.get("maxRequiredLevel") ?? "")); }}>
          <div className="db-facet-grid">{facetGroups.map(([facet, entries]) => <label key={`${facet}:${selectedFacets.join(",")}`}><span>{FACET_LABELS[facet][lang === "ru" ? 1 : 0]}</span><select name="facet" defaultValue={selectedFacets.find((path) => entries.some((entry) => entry.path === path)) ?? ""}><option value="">{lang === "ru" ? "Любой" : "Any"}</option>{entries.map((category) => <option key={category.id} value={category.path}>{category.name} · {category.count.toLocaleString(lang === "ru" ? "ru-RU" : "en-US")}</option>)}</select></label>)}</div>
          {selectedType === "item" ? <div className="db-level-grid"><label><span>{lang === "ru" ? "Уровень предмета от" : "Item level from"}</span><input name="minLevel" type="number" min="0" max="9999" inputMode="numeric" defaultValue={minItemLevel} /></label><label><span>{lang === "ru" ? "Уровень предмета до" : "Item level to"}</span><input name="maxLevel" type="number" min="0" max="9999" inputMode="numeric" defaultValue={maxItemLevel} /></label><label><span>{lang === "ru" ? "Уровень персонажа от" : "Character level from"}</span><input name="minRequiredLevel" type="number" min="0" max="999" inputMode="numeric" defaultValue={minRequiredLevel} /></label><label><span>{lang === "ru" ? "Уровень персонажа до" : "Character level to"}</span><input name="maxRequiredLevel" type="number" min="0" max="999" inputMode="numeric" defaultValue={maxRequiredLevel} /></label></div> : null}
          <button type="submit">{lang === "ru" ? "Применить" : "Apply"}</button>
          {(selectedCategory || selectedFacets.length || minItemLevel || maxItemLevel || minRequiredLevel || maxRequiredLevel) ? <button type="button" className="is-clear" onClick={() => navigate(selectedType, query, "", "", selectedProduct, "", "", [], "", "")}>{lang === "ru" ? "Сбросить" : "Reset"}</button> : null}
        </form> : null}
        {!libraryDataset ? <div className="db-type-filters" aria-label={tt("Catalog type")}><button type="button" className={!selectedType ? "is-active" : ""} aria-pressed={!selectedType} onClick={() => navigate("", query, "", "", selectedProduct, "", "", [])}>{tt("All records")}</button>{entityTypes.map((entityType) => <button type="button" key={entityType.type} className={selectedType === entityType.type ? "is-active" : ""} aria-pressed={selectedType === entityType.type} onClick={() => { trackCatalogEvent("catalog_type_selected", lang, { type: entityType.type }); navigate(entityType.type, query, "", "", selectedProduct, "", "", []); }}>{entityType.label}<b>{entityType.count.toLocaleString(lang === "ru" ? "ru-RU" : "en-US")}</b></button>)}</div> : null}

        {!libraryDataset ? <details className="db-category-section db-category-disclosure" open={browseOpen} onToggle={(event) => setBrowseOpen(event.currentTarget.open)}>
          <summary><span><span className="cap">{tt("Browse the catalog")}</span><strong id="database-categories">{tt("Choose a category")}</strong></span><span>{browseOpen ? (lang === "ru" ? "Скрыть" : "Hide") : (lang === "ru" ? "Показать разделы" : "Show sections")}</span></summary>
          <div className="db-category-grid">{groups.map(([group, types]) => { const primary = types[0]; const active = types.some((entry) => entry.type === selectedType); return <button className={`db-category-card${active ? " is-active" : ""}`} type="button" key={group} aria-pressed={active} onClick={() => navigate(primary.type, "", "", "")}><span className="db-category-icon" aria-hidden="true"><svg className="i"><use href={primary.iconSymbol} /></svg></span><span className="db-category-copy"><strong>{GROUP_LABELS[group]?.[lang === "ru" ? 1 : 0] ?? group}</strong><small>{types.map((entry) => entry.label).slice(0, 3).join(" · ")}</small></span><span className="db-category-state is-live">{types.reduce((sum, entry) => sum + entry.count, 0).toLocaleString(lang === "ru" ? "ru-RU" : "en-US")}</span></button>; })}</div>
        </details> : null}

        <div className={categories.length ? "db-catalog-layout has-taxonomy" : "db-catalog-layout"}>
          {categories.length ? (
            <Taxonomy
              categories={categories}
              selectedPath={selectedCategory}
              lang={lang}
              onSelect={(path) => navigate(selectedType, query, "", path)}
            />
          ) : null}
          <div className="db-catalog-results">
            {catalog.data.length ? (
              <div className={`db-records${isPending ? " is-pending" : ""}`} aria-busy={isPending}>
                {catalog.data.map((entity) => {
                  const registeredType = typeRegistry.get(entity.type);
                  const detail = entityDetails[entity.id];
                  const detailRoot = libraryDataset
                    ? `${lang === "ru" ? "/ru" : ""}/library/${encodeURIComponent(libraryDataset.slug)}`
                    : `${lang === "ru" ? "/ru" : ""}/database`;
                  const detailHref = `${detailRoot}/${encodeURIComponent(entity.type)}/${entity.id}/${encodeURIComponent(entity.slug || String(entity.externalId))}${selectedProduct === "wow" ? "" : `?product=${encodeURIComponent(selectedProduct)}`}`;
                  return (
                    <DatabaseRecordRow
                      key={entity.id}
                      entity={entity}
                      registeredType={registeredType}
                      detail={detail}
                      detailHref={detailHref}
                      lang={lang}
                      open={openTooltip === entity.id}
                      tooltipState={tooltipState[entity.id]}
                      recordIdLabel={tt("Game record ID")}
                      onLoad={loadEntity}
                      onPrefetchTooltip={prefetchDatabaseEntityTooltip}
                      onOpenPreview={openPreview}
                      onClosePreview={closePreview}
                    />
                );})}
              </div>
            ) : (
              <div className="db-live-empty"><span aria-hidden="true">◇</span><div><h3>{tt("No matching records")}</h3><p>{tt("Try another search term or choose a different data type.")}</p></div></div>
            )}
          </div>
        </div>
        <div className="db-pagination">
          <button type="button" onClick={() => router.back()} disabled={!cursor}>{tt("Back")}</button>
          <span>{tt("Found")}: <b>{totalCount ?? catalog.pagination.total?.toLocaleString(lang === "ru" ? "ru-RU" : "en-US") ?? "—"}</b></span>
          <button type="button" disabled={!catalog.pagination.hasMore || !catalog.pagination.nextCursor}
            onClick={() => navigate(selectedType, query, catalog.pagination.nextCursor)}>{tt("Next page")}</button>
        </div>
      </section>
    </div>
  );
}

const DatabaseRecordRow = memo(function DatabaseRecordRow({ entity, registeredType, detail, detailHref, lang, open, tooltipState, recordIdLabel, onLoad, onPrefetchTooltip, onOpenPreview, onClosePreview }: {
  entity: CatalogRecord;
  registeredType?: CatalogEntityType;
  detail?: CatalogRecord;
  detailHref: string;
  lang: Lang;
  open: boolean;
  tooltipState?: "loading" | "error";
  recordIdLabel: string;
  onLoad: (entity: CatalogRecord) => void;
  onPrefetchTooltip: () => void;
  onOpenPreview: (entity: CatalogRecord) => void;
  onClosePreview: () => void;
}) {
  const ru = lang === "ru";
  const typeLabel = registeredType?.label ?? entity.type;
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
    <article className={`db-record quality-${entity.quality ?? 0}${open ? " is-open" : ""}`}>
      <div className="db-record-trigger">
        <span className="db-record-icon" aria-hidden="true">
          <ResilientImage src={entity.iconUrl} alt="" loading="lazy" fallback={<span className="db-icon-fallback">✦</span>} />
        </span>
        <span className="db-record-body">
          <span className="db-record-type">{typeLabel}{entity.localeFallback ? <em>{ru ? "EN" : "fallback"}</em> : null}</span>
          <h3><Link href={detailHref} prefetch={false} onClick={() => trackCatalogEvent("catalog_detail_opened", lang, { id: entity.externalId, type: entity.type })}>{entity.name || `${typeLabel} #${entity.externalId}`}</Link></h3>
          <span className="db-record-meta">
            {entity.itemLevel ? <><span>{ru ? "Уровень предмета" : "Item level"}</span> <b>{entity.itemLevel}</b><i aria-hidden="true">·</i></> : null}
            <span>{recordIdLabel}</span> <b>{entity.externalId}</b>
          </span>
          {entity.highlights?.length ? <span className="db-record-highlights">{entity.highlights.map((highlight) => <span key={highlight.key}>{highlight.value}</span>)}</span> : null}
        </span>
        <button type="button" className="db-record-preview" aria-haspopup="dialog" aria-expanded={open} onPointerEnter={prefetchAfterHover} onPointerLeave={cancelHoverPrefetch} onFocus={focusPreview} onClick={() => onOpenPreview(entity)}>Tooltip</button>
      </div>
      {detail?.tooltip && open ? <DatabaseEntityTooltip entity={detail} lang={lang} expanded iconSymbol={registeredType?.iconSymbol} onClose={onClosePreview} /> : null}
      {open && tooltipState === "loading" ? <div className="db-tooltip-status" role="status">{ru ? "Загружаем полную информацию…" : "Loading full details…"}</div> : null}
      {open && tooltipState === "error" ? <div className="db-tooltip-status is-error" role="alert">{ru ? "Не удалось загрузить tooltip." : "Could not load the tooltip."} <button type="button" onClick={() => onLoad(entity)}>{ru ? "Повторить" : "Retry"}</button></div> : null}
    </article>
  );
});

function Taxonomy({ categories, selectedPath, lang, onSelect }: {
  categories: CatalogCategory[];
  selectedPath: string;
  lang: Lang;
  onSelect: (path: string) => void;
}) {
  const tt = translateDatabase(lang);
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
    <aside className="db-taxonomy" aria-label={tt("Categories")}>
      <div className="db-taxonomy-head">
        <span>{tt("Category index")}</span>
        <button type="button" className={!selectedPath ? "is-active" : ""} onClick={() => onSelect("")}>{tt("All")}</button>
      </div>
      <div className="db-taxonomy-list">
        {visibleCategories.map((category) => {
          const depth = category.path.split("/").length - 1;
          const hasChildren = tree.children.has(category.path);
          const isExpanded = expanded.has(category.path) || selectedAncestors.has(category.path);
          return (
            <div key={category.id} className={`db-taxonomy-row${selectedPath === category.path ? " is-active" : ""}`} style={{ "--taxonomy-depth": depth } as CSSProperties}>
              {hasChildren ? <button type="button" className="db-taxonomy-toggle" aria-label={`${isExpanded ? (lang === "ru" ? "Свернуть" : "Collapse") : (lang === "ru" ? "Развернуть" : "Expand")} ${category.name}`} aria-expanded={isExpanded} onClick={() => toggleCategory(category.path)}><span className={`db-taxonomy-chevron${isExpanded ? " is-open" : ""}`} aria-hidden="true">›</span></button> : <span className="db-taxonomy-toggle is-leaf" aria-hidden="true" />}
              <button type="button" className="db-taxonomy-select" aria-pressed={selectedPath === category.path} onClick={() => { trackCatalogEvent("catalog_category_selected", lang, { category: category.path }); onSelect(category.path); }}><span>{category.name}</span><b>{category.count.toLocaleString(lang === "ru" ? "ru-RU" : "en-US")}</b></button>
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
