"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { t, type Lang } from "@/lib/i18n";
import { formatQuestText } from "@/lib/gameText";
import { trackCatalogEvent } from "@/lib/catalogAnalytics";
import type { CatalogCategory, CatalogEntityType, CatalogPage, CatalogProduct, CatalogRecord, GameEntity } from "@/lib/api/client";
import { RichDescription, TooltipOwners, verifiedMediaURL } from "@/components/database/TooltipRelations";

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

const PLAYABLE_CLASS_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

const FACET_LABELS: Record<string, [string, string]> = {
  class: ["Class", "Класс"], specialization: ["Specialization", "Специализация"], race: ["Race", "Раса"],
  equipment_slot: ["Equipment slot", "Слот"], armor_type: ["Armor type", "Тип брони"], weapon_type: ["Weapon type", "Тип оружия"],
  profession: ["Profession", "Профессия"], item_class: ["Item class", "Класс предмета"],
};
const FACET_ORDER = ["class", "specialization", "race", "profession", "equipment_slot", "armor_type", "weapon_type", "item_class"];

export function DatabaseDirectory({ lang = "en", catalog, categories, entityTypes, products, query = "", selectedProduct = "wow", selectedType = "", selectedCategory = "", selectedFacets = [], cursor = "", minItemLevel = "", maxItemLevel = "", minRequiredLevel = "", maxRequiredLevel = "", libraryDataset }: {
  lang?: Lang; catalog: CatalogPage; categories: CatalogCategory[]; entityTypes: CatalogEntityType[]; products: CatalogProduct[];
  query?: string; selectedProduct?: string; selectedType?: string; selectedCategory?: string; selectedFacets?: string[]; cursor?: string; minItemLevel?: string; maxItemLevel?: string; minRequiredLevel?: string; maxRequiredLevel?: string;
  libraryDataset?: { slug: string; name: string; description: string; itemClassId?: number };
}) {
  const [searchValue, setSearchValue] = useState(query);
  const [openTooltip, setOpenTooltip] = useState("");
  const [entityDetails, setEntityDetails] = useState<Record<string, CatalogRecord>>({});
  const [tooltipState, setTooltipState] = useState<Record<string, "loading" | "error">>({});
  const [browseOpen, setBrowseOpen] = useState(!selectedType && !query);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const tt = t(lang);
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

  useEffect(() => setSearchValue(query), [query]);
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
    trackCatalogEvent("catalog_search_submitted", lang, { query: searchValue, type: selectedType });
    navigate(selectedType, searchValue);
  }

  const loadEntity = useCallback(async (entity: CatalogRecord) => {
    if (entityDetails[entity.id] || tooltipState[entity.id] === "loading") return;
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
    } catch {
      setTooltipState((current) => ({ ...current, [entity.id]: "error" }));
    }
  }, [entityDetails, lang, tooltipState]);

  function openPreview(entity: CatalogRecord) {
    const opening = openTooltip !== entity.id;
    setOpenTooltip(opening ? entity.id : "");
    if (opening) {
      trackCatalogEvent("catalog_tooltip_opened", lang, { id: entity.externalId, type: entity.type });
      void loadEntity(entity);
    }
  }

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
          <span className={catalog.data.length ? "db-live-state is-live" : "db-live-state"}>{catalog.pagination.total?.toLocaleString(lang === "ru" ? "ru-RU" : "en-US") ?? "—"} {tt("records")}</span>
        </div>
        {products.length > 1 ? <label className="db-product-select"><span>{lang === "ru" ? "Версия игры" : "Game version"}</span><select value={selectedProduct} onChange={(event) => navigate("", "", "", "", event.target.value, "", "", [])}>{products.map((product) => <option key={product.slug} value={product.slug}>{product.name}</option>)}</select></label> : null}
        <form className="db-catalog-search" onSubmit={submitSearch}>
          <label className="sr-only" htmlFor="database-search">{tt("Search the game database")}</label>
          <svg className="i" aria-hidden="true"><use href="#ic-search" /></svg>
          <input id="database-search" type="search" value={searchValue} onChange={(event) => setSearchValue(event.target.value)} placeholder={tt("Search by name or game ID...")} />
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
                  <article className={`db-record quality-${entity.quality ?? 0}${openTooltip === entity.id ? " is-open" : ""}`} key={entity.id}>
                    <div className="db-record-trigger">
                      <span className="db-record-icon" aria-hidden="true">
                        {entity.iconUrl ? <img src={entity.iconUrl} alt="" loading="lazy" /> : <svg className="i"><use href={registeredType?.iconSymbol ?? "#ic-gem"} /></svg>}
                      </span>
                      <span className="db-record-body">
                        <span className="db-record-type">{registeredType?.label ?? entity.type}{entity.localeFallback ? <em>{lang === "ru" ? "EN" : "fallback"}</em> : null}</span>
                        <h3><Link href={detailHref} onClick={() => trackCatalogEvent("catalog_detail_opened", lang, { id: entity.externalId, type: entity.type })}>{entity.name || `${registeredType?.label ?? entity.type} #${entity.externalId}`}</Link></h3>
                        <span className="db-record-meta">
                          {entity.itemLevel ? <><span>{lang === "ru" ? "Уровень предмета" : "Item level"}</span> <b>{entity.itemLevel}</b><i aria-hidden="true">·</i></> : null}
                          <span>{tt("Game record ID")}</span> <b>{entity.externalId}</b>
                        </span>
                        {entity.highlights?.length ? <span className="db-record-highlights">{entity.highlights.map((highlight) => <span key={highlight.key}>{highlight.value}</span>)}</span> : null}
                      </span>
                      <button type="button" className="db-record-preview" aria-haspopup="dialog" aria-expanded={openTooltip === entity.id} onPointerEnter={() => void loadEntity(entity)} onFocus={() => void loadEntity(entity)} onClick={() => openPreview(entity)}>{lang === "ru" ? "Tooltip" : "Tooltip"}</button>
                    </div>
					{detail?.tooltip ? <EntityTooltip entity={detail} lang={lang} expanded={openTooltip === entity.id} iconSymbol={registeredType?.iconSymbol} onClose={closePreview} /> : null}
                    {openTooltip === entity.id && tooltipState[entity.id] === "loading" ? <div className="db-tooltip-status" role="status">{lang === "ru" ? "Загружаем полную информацию…" : "Loading full details…"}</div> : null}
                    {openTooltip === entity.id && tooltipState[entity.id] === "error" ? <div className="db-tooltip-status is-error" role="alert">{lang === "ru" ? "Не удалось загрузить tooltip." : "Could not load the tooltip."} <button type="button" onClick={() => void loadEntity(entity)}>{lang === "ru" ? "Повторить" : "Retry"}</button></div> : null}
                  </article>
                );})}
              </div>
            ) : (
              <div className="db-live-empty"><span aria-hidden="true">◇</span><div><h3>{tt("No matching records")}</h3><p>{tt("Try another search term or choose a different data type.")}</p></div></div>
            )}
          </div>
        </div>
        <div className="db-pagination">
          <button type="button" onClick={() => router.back()} disabled={!cursor}>{tt("Back")}</button>
          <span>{tt("Found")}: <b>{catalog.pagination.total?.toLocaleString(lang === "ru" ? "ru-RU" : "en-US") ?? "—"}</b></span>
          <button type="button" disabled={!catalog.pagination.hasMore || !catalog.pagination.nextCursor}
            onClick={() => navigate(selectedType, query, catalog.pagination.nextCursor)}>{tt("Next page")}</button>
        </div>
      </section>
    </div>
  );
}

function Taxonomy({ categories, selectedPath, lang, onSelect }: {
  categories: CatalogCategory[];
  selectedPath: string;
  lang: Lang;
  onSelect: (path: string) => void;
}) {
  const tt = t(lang);
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

export function DatabaseEntityDetail({ entity, lang, iconSymbol }: { entity: GameEntity; lang: Lang; iconSymbol?: string }) {
	const record: CatalogRecord = {
		id: entity.id, product: entity.product, type: entity.type, externalId: entity.externalId,
		slug: entity.slug, locale: entity.locale, name: entity.name, description: entity.description,
		iconName: entity.iconName, iconUrl: entity.iconUrl, quality: entity.quality,
		buildId: entity.buildId, updatedAt: entity.updatedAt, tooltip: entity.tooltip,
	};
	return <div className="db-entity-detail-tooltip"><EntityTooltip entity={record} lang={lang} expanded={false} detailPage iconSymbol={iconSymbol} onClose={() => undefined} /></div>;
}

function EntityTooltip({ entity, lang, expanded, detailPage = false, iconSymbol = "#ic-gem", onClose }: { entity: CatalogRecord; lang: Lang; expanded: boolean; detailPage?: boolean; iconSymbol?: string; onClose: () => void }) {
	const tooltip = entity.tooltip;
	const [mounted, setMounted] = useState(false);
	const dialogRef = useRef<HTMLDivElement>(null);
	const closeRef = useRef<HTMLButtonElement>(null);
	const previousFocusRef = useRef<HTMLElement | null>(null);
	useEffect(() => setMounted(true), []);
	useEffect(() => {
		if (!expanded) return;
		previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		function handleKey(event: KeyboardEvent) {
			if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
			if (event.key !== "Tab" || !dialogRef.current) return;
			const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),[tabindex]:not([tabindex='-1'])"));
			if (!focusable.length) { event.preventDefault(); dialogRef.current.focus(); return; }
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
			else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
		}
		window.addEventListener("keydown", handleKey);
		return () => {
			window.removeEventListener("keydown", handleKey);
			document.body.style.overflow = previousOverflow;
			previousFocusRef.current?.focus();
		};
	}, [expanded, onClose]);
	useEffect(() => {
		if (!expanded || !mounted) return;
		const focusClose = () => closeRef.current?.focus();
		focusClose();
		const frame = requestAnimationFrame(focusClose);
		const retry = window.setTimeout(focusClose, 50);
		return () => {
			cancelAnimationFrame(frame);
			window.clearTimeout(retry);
		};
	}, [expanded, mounted]);
	if (!tooltip) return null;
	const seenAcquisition = new Set<string>();
	const descriptionMentions = tooltip.blocks.find((block) => String(block.type ?? "") === "description_mentions")?.entries;
	const mentions = Array.isArray(descriptionMentions) ? descriptionMentions as Record<string, unknown>[] : [];
	const blocks = tooltip.blocks.filter((block) => {
	if (String(block.type ?? "") === "description") {
	  const text = String(block.text ?? "");
	  if ((entity.type === "spell" || entity.type === "talent") && !text.trim()) return false;
	}
		if (String(block.type ?? "") !== "acquisition") return true;
    const key = `${String(block.source_type ?? "")}:${String(block.name ?? "")}:${String(block.location ?? "")}`;
    if (seenAcquisition.has(key)) return false;
    seenAcquisition.add(key);
    return true;
  });
	const content = (
		<div ref={dialogRef} className={`db-wow-tooltip quality-${entity.quality ?? 0}${expanded ? " is-expanded" : ""}${detailPage ? " is-detail-page" : ""}`} id={`tooltip-${entity.id}`} role={expanded ? "dialog" : detailPage ? "region" : "tooltip"} aria-modal={expanded ? true : undefined} aria-labelledby={expanded || detailPage ? `tooltip-name-${entity.id}` : undefined} tabIndex={expanded ? -1 : undefined}>
			{expanded ? <button ref={closeRef} type="button" className="db-tooltip-close" aria-label={lang === "ru" ? "Закрыть подсказку" : "Close tooltip"} onClick={onClose}>×</button> : null}
      <span className="db-tooltip-icon" aria-hidden="true">
        {entity.iconUrl ? <img src={entity.iconUrl} alt="" /> : <svg className="i"><use href={iconSymbol} /></svg>}
      </span>
      <div className="db-tooltip-panel">
        <div className="db-tooltip-name" id={`tooltip-name-${entity.id}`}>{entity.name || `${entity.type.replaceAll("_", " ")} #${entity.externalId}`}</div>
        {blocks.map((block, index) => (
          <TooltipBlock key={`${String(block.type)}-${index}`} block={block} entityType={entity.type} lang={lang} mentions={mentions} />
        ))}
      </div>
		</div>
	);
	return expanded && mounted ? createPortal(<><div className="db-tooltip-backdrop" aria-hidden="true" onMouseDown={onClose} />{content}</>, document.body) : content;
}

function TooltipBlock({ block, entityType, lang, mentions }: { block: Record<string, unknown>; entityType: string; lang: Lang; mentions: Record<string, unknown>[] }) {
  const type = String(block.type ?? "");
  if (type === "name") return null;
	if (type === "item_level") return <div className="db-tooltip-level">{lang === "ru" ? "Уровень предмета (DB2)" : "Item level (DB2)"} {String(block.value ?? "")}</div>;
  if (type === "slot") return <div>{inventoryTypeLabel(Number(block.code), lang)}</div>;
  if (type === "subclass") return <div className="db-tooltip-muted">{subclassLabel(Number(block.class_id), Number(block.subclass_id), lang)}</div>;
  if (type === "binding") return <div>{bindingLabel(Number(block.code), lang)}</div>;
  if (type === "required_level") return <div>{lang === "ru" ? "Требуется уровень" : "Requires Level"} {String(block.value ?? "")}</div>;
  if (type === "required_skill") return <div>{requiredSkillLabel(Number(block.skill_id), Number(block.rank), lang)}</div>;
  if (type === "stack_limit") return <div>{lang === "ru" ? "Максимум в стопке" : "Maximum stack"}: {String(block.value ?? "")}</div>;
  if (type === "container_slots") return <div>{lang === "ru" ? "Ячеек в сумке" : "Bag slots"}: {String(block.value ?? "")}</div>;
  if (type === "price") return <TooltipPrice buy={Number(block.buy ?? 0)} sell={Number(block.sell ?? 0)} lang={lang} />;
  if (type === "name_description") return <div className="db-tooltip-muted">{String(block.text ?? "")}</div>;
  if (type === "item_set") return <div className="db-tooltip-set">{lang === "ru" ? "Комплект" : "Set"}: {String(block.name ?? "")}</div>;
  if (type === "limit_category") return <div>{String(block.name ?? "")}{Number(block.quantity ?? 0) > 0 ? ` (${String(block.quantity)})` : ""}</div>;
  if (type === "stats" && Array.isArray(block.entries)) return <TooltipStats entries={block.entries as Record<string, unknown>[]} lang={lang} />;
  if (type === "subtext" && typeof block.text === "string") return <div className="db-tooltip-subtext">{block.text}</div>;
  if (type === "cast_time") return <div className="db-tooltip-mechanic">{formatCastTime(Number(block.milliseconds), lang)}</div>;
  if (type === "range") return <div className="db-tooltip-mechanic">{String(block.yards ?? "")} {lang === "ru" ? "м" : "yd range"}</div>;
  if (type === "cooldown") return <div className="db-tooltip-mechanic">{formatDuration(Number(block.milliseconds), lang)} {lang === "ru" ? "восстановление" : "cooldown"}</div>;
  if (type === "duration") return <div className="db-tooltip-mechanic">{lang === "ru" ? "Время действия" : "Duration"}: {formatDuration(Number(block.milliseconds), lang)}</div>;
  if (type === "power") return <div className="db-tooltip-mechanic">{formatPower(block, lang)}</div>;
  if (type === "sockets") return <div className="db-tooltip-socket">◇ {lang === "ru" ? "Есть гнездо" : "Has socket"}</div>;
  if (type === "profession") return <div className="db-tooltip-crafted">{lang === "ru" ? "Создаётся профессией" : "Crafted by a profession"}</div>;
  if (type === "acquisition") return <div className="db-tooltip-acquisition">{acquisitionLabel(block, lang)}</div>;
  if (type === "spell_owners" && Array.isArray(block.entries)) return <TooltipOwners entries={block.entries as Record<string, unknown>[]} lang={lang} />;
  if (type === "spell_talents" && Array.isArray(block.entries)) return <SpellTalents entries={block.entries as Record<string, unknown>[]} lang={lang} />;
  if (type === "talent_spells" && Array.isArray(block.entries)) return <TalentSpells entries={block.entries as Record<string, unknown>[]} lang={lang} />;
  if (type === "talent_info") return <TalentInfo block={block} lang={lang} />;
	if (type === "profession_info") return <ProfessionInfo block={block} lang={lang} />;
	if (type === "recipe_info") return <RecipeInfo block={block} lang={lang} />;
	if (type === "item_requirements") return <ItemRequirements block={block} lang={lang} />;
	if (type === "item_registry") return <ItemRegistry block={block} lang={lang} />;
	if (type === "item_effect_metadata" && Array.isArray(block.entries)) return <ItemEffectMetadata entries={block.entries as Record<string, unknown>[]} lang={lang} />;
	if (type === "item_variants" && Array.isArray(block.entries)) return <ItemVariants entries={block.entries as Record<string, unknown>[]} lang={lang} />;
	if (type === "quest_info") return <QuestInfo block={block} lang={lang} />;
	if (type === "quest_reward_package") return <QuestRewardPackage block={block} lang={lang} />;
	if (type === "creature_info") return <CreatureInfo block={block} lang={lang} />;
	if (type === "provenance") return <TooltipProvenance block={block} lang={lang} />;
	if (type === "spell_effects" && Array.isArray(block.entries)) return <SpellEffects entries={block.entries as Record<string, unknown>[]} lang={lang} />;
  if (type === "unique_equipped") return <div>{lang === "ru" ? "Уникальный использующийся" : "Unique-Equipped"}</div>;
  if (type === "use" || type === "equip") return <div className="db-tooltip-effect">{String(block.text ?? "")}</div>;
  if (type === "effect") return <div className="db-tooltip-effect">{effectPrefix(Number(block.trigger), lang)}{cleanWowText(String(block.text ?? ""), lang)}</div>;
  if (type === "description" && typeof block.text === "string") {
    return entityType === "spell" || entityType === "talent" || entityType === "pvp_talent"
		? <RichDescription text={block.text} mentions={mentions} lang={lang} />
		: <div className="db-tooltip-description">“{entityType === "quest" ? formatQuestText(block.text, lang) : block.text}”</div>;
  }
  return null;
}

function ItemRegistry({ block, lang }: { block: Record<string, unknown>; lang: Lang }) {
	const fields = [
		[lang === "ru" ? "Класс предмета" : "Item class", block.class_id],
		[lang === "ru" ? "Подкласс" : "Subclass", block.subclass_id],
		[lang === "ru" ? "Тип экипировки" : "Inventory type", block.inventory_type],
		["FileDataID", block.icon_file_data_id],
	].filter((entry) => entry[1] !== null && entry[1] !== undefined && entry[1] !== "");
	return <div className="db-tooltip-item-context">
		{Boolean(block.registry_only) ? <div className="db-tooltip-muted">{lang === "ru" ? "Запись реестра игрового клиента" : "Game client registry record"}</div> : null}
		{fields.map(([label, value]) => <div key={String(label)}><b>{String(label)}:</b> {String(value)}</div>)}
	</div>;
}

function ProfessionInfo({ block, lang }: { block: Record<string, unknown>; lang: Lang }) {
  const recipes = Number(block.recipe_count ?? 0);
  const categories = Number(block.category_count ?? 0);
	const parentID = Number(block.parent_skill_line_id ?? 0);
	const recipesList = Array.isArray(block.recipes) ? block.recipes as Record<string, unknown>[] : [];
  return <div className="db-tooltip-profession-info">
    <div><b>{lang === "ru" ? "Линия навыка" : "Skill line"}:</b> {String(block.skill_line_id ?? "")}</div>
    {parentID > 0 ? <div>{lang === "ru" ? "Родительская ветка" : "Parent skill line"}: {parentID}</div> : null}
    <div>{lang === "ru" ? "Рецептов в базе" : "Recipes in database"}: {recipes.toLocaleString(lang === "ru" ? "ru-RU" : "en-US")}</div>
    {categories > 0 ? <div>{lang === "ru" ? "Разделов рецептов" : "Recipe categories"}: {categories.toLocaleString(lang === "ru" ? "ru-RU" : "en-US")}</div> : null}
		{Boolean(block.can_link) ? <div>{lang === "ru" ? "Можно делиться ссылкой на профессию в игре" : "Can be linked in game"}</div> : null}
		{recipesList.length ? <div className="db-tooltip-related"><b>{lang === "ru" ? "Примеры рецептов" : "Recipe examples"}:</b>{recipesList.map((recipe) => <span key={String(recipe.id)}>{String(recipe.name || `ID ${recipe.external_id}`)}{Number(recipe.min_skill_rank ?? 0) > 0 ? ` (${lang === "ru" ? "навык" : "skill"} ${String(recipe.min_skill_rank)})` : ""}</span>)}</div> : null}
	</div>;
}

function RecipeInfo({ block, lang }: { block: Record<string, unknown>; lang: Lang }) {
	const professions = Array.isArray(block.professions) ? block.professions as Record<string, unknown>[] : [];
	const reagents = Array.isArray(block.reagents) ? block.reagents as Record<string, unknown>[] : [];
	const currencies = Array.isArray(block.currencies) ? block.currencies as Record<string, unknown>[] : [];
	const outputs = Array.isArray(block.outputs) ? block.outputs as Record<string, unknown>[] : [];
	return <div className="db-tooltip-recipe-info">
		{professions.length ? <div><b>{lang === "ru" ? "Профессия" : "Profession"}:</b> {professions.map((entry) => `${String(entry.name || entry.external_id)}${Number(entry.min_skill_rank ?? 0) > 0 ? ` (${String(entry.min_skill_rank)})` : ""}`).join(", ")}</div> : null}
		{outputs.length ? <div className="db-tooltip-related"><b>{lang === "ru" ? "Создаёт" : "Creates"}:</b>{outputs.map((entry) => <span key={String(entry.external_id)}>{String(entry.name || `Item #${entry.external_id}`)}</span>)}</div> : null}
		{reagents.length ? <div className="db-tooltip-related"><b>{lang === "ru" ? "Реагенты" : "Reagents"}:</b>{reagents.map((entry, index) => <span key={`${String(entry.external_id)}-${index}`}>{String(entry.name || `Item #${entry.external_id}`)} ×{String(entry.quantity ?? 0)}{Number(entry.recraft_quantity ?? 0) > 0 ? ` (${lang === "ru" ? "перекрафт" : "recraft"}: ${String(entry.recraft_quantity)})` : ""}</span>)}</div> : null}
		{currencies.length ? <div className="db-tooltip-related"><b>{lang === "ru" ? "Валюта" : "Currency"}:</b>{currencies.map((entry) => <span key={String(entry.external_id)}>#{String(entry.external_id)} ×{String(entry.quantity ?? 0)}</span>)}</div> : null}
	</div>;
}

function ItemRequirements({ block, lang }: { block: Record<string, unknown>; lang: Lang }) {
	const classMask = BigInt(String(block.class_mask ?? "-1"));
	const classNames = classMask === -1n ? [] : PLAYABLE_CLASS_IDS.filter((id) => (BigInt.asUintN(32, classMask) & (1n << BigInt(id - 1))) !== 0n).map((id) => className(id, lang));
	const raceRestricted = String(block.race_mask_0 ?? "-1") !== "-1" || String(block.race_mask_1 ?? "-1") !== "-1";
	const ability = Number(block.required_ability_id ?? 0);
	const faction = Number(block.faction_id ?? 0);
	const holiday = Number(block.holiday_id ?? 0);
	if (!classNames.length && !raceRestricted && !ability && !faction && !holiday) return null;
	return <div className="db-tooltip-requirements">
		{classNames.length ? <div>{lang === "ru" ? "Классы" : "Classes"}: {classNames.join(", ")}</div> : null}
		{raceRestricted ? <div>{lang === "ru" ? "Есть ограничение по расе" : "Race restricted"}</div> : null}
		{ability ? <div>{lang === "ru" ? "Требуется способность" : "Requires ability"}: {ability}</div> : null}
		{faction ? <div>{lang === "ru" ? "Требуется репутация" : "Requires reputation"}: {faction} ({String(block.reputation ?? 0)})</div> : null}
		{holiday ? <div>{lang === "ru" ? "Событие" : "Event"}: {holiday}</div> : null}
	</div>;
}

function ItemEffectMetadata({ entries, lang }: { entries: Record<string, unknown>[]; lang: Lang }) {
	return <div className="db-tooltip-effect-meta">{entries.map((effect, index) => <div key={`${String(effect.spell_id)}-${index}`}>
		{Number(effect.charges ?? 0) !== 0 ? <span>{lang === "ru" ? "Заряды" : "Charges"}: {String(effect.charges)} </span> : null}
		{Number(effect.cooldown_ms ?? 0) > 0 ? <span>{lang === "ru" ? "Восстановление" : "Cooldown"}: {formatDuration(Number(effect.cooldown_ms), lang)} </span> : null}
		{Number(effect.specialization_id ?? 0) > 0 ? <span>{lang === "ru" ? "Специализация" : "Specialization"}: {specializationName(Number(effect.specialization_id), lang) || String(effect.specialization_id)}</span> : null}
	</div>)}</div>;
}

function ItemVariants({ entries, lang }: { entries: Record<string, unknown>[]; lang: Lang }) {
	return <div className="db-tooltip-variants">
		<b>{lang === "ru" ? "Варианты предмета" : "Item variants"}</b>
		{entries.map((variant, variantIndex) => {
			const stats = Array.isArray(variant.stats) ? variant.stats as Record<string, unknown>[] : [];
			const effects = Array.isArray(variant.effects) ? variant.effects as Record<string, unknown>[] : [];
			return <details key={`${String(variant.key)}-${variantIndex}`} open={entries.length === 1}>
				<summary>{String(variant.key || "base")}{Number(variant.item_level ?? 0) > 0 ? ` · ${lang === "ru" ? "уровень" : "level"} ${String(variant.item_level)}` : ""}</summary>
				{stats.length ? <div className="db-tooltip-related"><b>{lang === "ru" ? "Характеристики" : "Stats"}:</b>{stats.map((stat, index) => <span key={`${String(stat.index)}-${index}`}>{String(stat.label || stat.key || `Stat ${stat.type}`)}{stat.value !== null && stat.value !== undefined ? `: ${String(stat.value)}` : ""}{Number(stat.allocation ?? 0) !== 0 ? ` · ${lang === "ru" ? "масштаб" : "allocation"} ${String(stat.allocation)}` : ""}</span>)}</div> : null}
				{effects.length ? <div className="db-tooltip-related"><b>{lang === "ru" ? "Эффекты" : "Effects"}:</b>{effects.map((effect, index) => <span key={`${String(effect.index)}-${index}`}>{lang === "ru" ? "Заклинание" : "Spell"} #{String(effect.spell_id || "—")}{Number(effect.cooldown_ms ?? 0) > 0 ? ` · ${formatDuration(Number(effect.cooldown_ms), lang)}` : ""}</span>)}</div> : null}
				{String(variant.source_artifact_id ?? "") ? <small>{lang === "ru" ? "Источник" : "Source proof"}: {String(variant.source_artifact_id)}</small> : null}
			</details>;
		})}
	</div>;
}

function QuestInfo({ block, lang }: { block: Record<string, unknown>; lang: Lang }) {
	const objectives = Array.isArray(block.objectives) ? block.objectives as Record<string, unknown>[] : [];
	const lines = Array.isArray(block.quest_lines) ? block.quest_lines as Record<string, unknown>[] : [];
	const rewards = Array.isArray(block.rewards) ? block.rewards as Record<string, unknown>[] : [];
	return <div className="db-tooltip-quest-info">
		{String(block.bullet_text ?? "") ? <div>{formatQuestText(String(block.bullet_text), lang)}</div> : null}
		{objectives.length ? <div className="db-tooltip-related"><b>{lang === "ru" ? "Цели" : "Objectives"}:</b>{objectives.map((objective) => <span key={String(objective.id)}>• {String(objective.description || `${lang === "ru" ? "Объект" : "Object"} ${objective.object_id ?? ""}`)}{Number(objective.amount ?? 0) > 1 ? ` ×${String(objective.amount)}` : ""}</span>)}</div> : null}
		{lines.length ? <div>{lang === "ru" ? "Цепочка" : "Quest line"}: {lines.map((line) => String(line.name || line.id)).join(", ")}</div> : null}
		{rewards.length ? <QuestRewards rewards={rewards} lang={lang} /> : null}
		{Number(block.poi_count ?? 0) > 0 ? <div>{lang === "ru" ? "Точек на карте" : "Map points"}: {String(block.poi_count)}</div> : null}
	</div>;
}

function QuestRewardPackage({ block, lang }: { block: Record<string, unknown>; lang: Lang }) {
	const items = Array.isArray(block.items) ? block.items as Record<string, unknown>[] : [];
	const prefix = lang === "ru" ? "/ru" : "";
	return <div className="db-tooltip-quest-info">
		<div><b>{lang === "ru" ? "Пакет" : "Package"}:</b> #{String(block.package_id ?? "—")}</div>
		<div className="db-tooltip-muted">{lang === "ru"
			? "Клиентский набор предметов. Связь с конкретным заданием пока не подтверждена источником."
			: "Client item package. A link to a specific quest is not yet proved by a source."}</div>
		{items.length ? <div className="db-tooltip-related db-tooltip-rewards">
			<b>{lang === "ru" ? "Предметы в пакете" : "Package items"}:</b>
			<div className="db-tooltip-reward-group">{items.map((item, index) => {
				const externalID = Number(item.item_external_id ?? 0);
				const entityID = String(item.entity_id ?? "");
				const icon = verifiedMediaURL(String(item.icon_url ?? ""));
				const label = String(item.name || `Item #${externalID || "—"}`);
				const quantity = Number(item.quantity ?? 0);
				const displayType = Number(item.display_type ?? 0);
				const content = <>{icon ? <img src={icon} alt="" loading="lazy" /> : <span className="db-tooltip-reward-marker" aria-hidden="true">◇</span>}<span><strong>{label}</strong><small>{quantity > 0 ? `×${quantity.toLocaleString(lang === "ru" ? "ru-RU" : "en-US")}` : ""}{displayType > 0 ? ` · DisplayType ${displayType}` : ""}</small></span></>;
				return entityID
					? <Link className="db-tooltip-reward" href={`${prefix}/database/item/${encodeURIComponent(entityID)}/${encodeURIComponent(String(externalID || "item"))}`} key={`${externalID}-${index}`}>{content}</Link>
					: <span className="db-tooltip-reward" key={`${externalID}-${index}`}>{content}</span>;
			})}</div>
		</div> : <div className="db-tooltip-muted">{lang === "ru" ? "В пакете нет подтверждённых строк предметов." : "The package has no proved item rows."}</div>}
	</div>;
}

function QuestRewards({ rewards, lang }: { rewards: Record<string, unknown>[]; lang: Lang }) {
	const guaranteed = rewards.filter((reward) => !Boolean(reward.choice));
	const choices = rewards.filter((reward) => Boolean(reward.choice));
	const renderReward = (reward: Record<string, unknown>, index: number) => {
		const type = String(reward.type ?? "other");
		const entityType = String(reward.entity_type || questRewardEntityType(type));
		const externalID = Number(reward.external_id ?? 0);
		const entityID = String(reward.entity_id ?? "");
		const slug = String(reward.slug || externalID || "reward");
		const icon = verifiedMediaURL(String(reward.icon_url ?? ""));
		const quality = Number(reward.quality ?? 0);
		const label = String(reward.name || questRewardTypeLabel(type, lang, externalID));
		const amount = Number(reward.amount ?? 0);
		const details = [questRewardAmount(type, amount, lang), Boolean(reward.choice) ? (lang === "ru" ? "на выбор" : "choice") : ""].filter(Boolean).join(" · ");
		const content = <>{icon ? <img src={icon} alt="" loading="lazy" /> : <span className="db-tooltip-reward-marker" aria-hidden="true">◇</span>}<span><strong className={`quality-${quality}`}>{label}</strong>{details ? <small>{details}</small> : null}</span></>;
		return entityID
			? <Link className="db-tooltip-reward" href={`${lang === "ru" ? "/ru" : ""}/database/${encodeURIComponent(entityType)}/${encodeURIComponent(entityID)}/${encodeURIComponent(slug)}`} key={`${type}-${externalID}-${index}`}>{content}</Link>
			: <span className="db-tooltip-reward" key={`${type}-${externalID}-${index}`}>{content}</span>;
	};
	return <div className="db-tooltip-related db-tooltip-rewards">
		<b>{lang === "ru" ? "Награды" : "Rewards"}:</b>
		{guaranteed.length ? <div className="db-tooltip-reward-group">{choices.length ? <em>{lang === "ru" ? "Гарантировано" : "Guaranteed"}</em> : null}{guaranteed.map(renderReward)}</div> : null}
		{choices.length ? <div className="db-tooltip-reward-group"><em>{lang === "ru" ? "Выберите одну награду" : "Choose one reward"}</em>{choices.map(renderReward)}</div> : null}
	</div>;
}

function questRewardEntityType(type: string) {
	return type === "reputation" ? "faction" : type;
}

function questRewardTypeLabel(type: string, lang: Lang, externalID: number) {
	const labels: Record<string, [string, string]> = {
		item: ["Item", "Предмет"], currency: ["Currency", "Валюта"], money: ["Money", "Деньги"],
		experience: ["Experience", "Опыт"], reputation: ["Reputation", "Репутация"], spell: ["Spell", "Заклинание"],
		title: ["Title", "Звание"], other: ["Reward", "Награда"],
	};
	const label = labels[type]?.[lang === "ru" ? 1 : 0] ?? (lang === "ru" ? "Награда" : "Reward");
	return externalID > 0 ? `${label} #${externalID}` : label;
}

function questRewardAmount(type: string, amount: number, lang: Lang) {
	if (!Number.isFinite(amount) || amount <= 0) return "";
	const formatted = amount.toLocaleString(lang === "ru" ? "ru-RU" : "en-US");
	if (type === "experience") return `${formatted} ${lang === "ru" ? "опыта" : "XP"}`;
	if (type === "money") return formatQuestMoney(amount, lang);
	if (type === "reputation") return `+${formatted} ${lang === "ru" ? "репутации" : "reputation"}`;
	if ((type === "spell" || type === "title") && amount === 1) return "";
	return `×${formatted}`;
}

function formatQuestMoney(copper: number, lang: Lang) {
	const whole = Math.floor(copper);
	const gold = Math.floor(whole / 10_000);
	const silver = Math.floor((whole % 10_000) / 100);
	const remainder = whole % 100;
	const parts = [];
	if (gold) parts.push(`${gold.toLocaleString(lang === "ru" ? "ru-RU" : "en-US")} ${lang === "ru" ? "з." : "g"}`);
	if (silver) parts.push(`${silver} ${lang === "ru" ? "с." : "s"}`);
	if (remainder || !parts.length) parts.push(`${remainder} ${lang === "ru" ? "м." : "c"}`);
	return parts.join(" ");
}

function CreatureInfo({ block, lang }: { block: Record<string, unknown>; lang: Lang }) {
	const roles = Array.isArray(block.roles) ? block.roles as Record<string, unknown>[] : [];
	const locations = Array.isArray(block.locations) ? block.locations as Record<string, unknown>[] : [];
	const lootTables = Array.isArray(block.loot_tables) ? block.loot_tables as Record<string, unknown>[] : [];
	return <div className="db-tooltip-creature-info">
		{String(block.creature_type ?? "") ? <div>{lang === "ru" ? "Тип" : "Type"}: {String(block.creature_type)}</div> : null}
		{String(block.creature_family ?? "") ? <div>{lang === "ru" ? "Семейство" : "Family"}: {String(block.creature_family)}</div> : null}
		{Number(block.difficulty_count ?? 0) > 0 ? <div>{lang === "ru" ? "Вариантов сложности" : "Difficulty variants"}: {String(block.difficulty_count)}</div> : null}
		{roles.length ? <div>{lang === "ru" ? "Роли" : "Roles"}: {roles.map((role) => String(role.role)).join(", ")}</div> : null}
		{locations.length ? <div className="db-tooltip-related"><b>{lang === "ru" ? "Местоположение" : "Location"}:</b>{locations.map((location, index) => <span key={`${String(location.ui_map_id)}-${index}`}>{lang === "ru" ? "Карта" : "Map"} {String(location.ui_map_id || location.map_id || "—")}: {Number(location.x).toFixed(1)}, {Number(location.y).toFixed(1)}</span>)}</div> : null}
		{lootTables.length ? <LootTables tables={lootTables} lang={lang} /> : null}
	</div>;
}

function LootTables({ tables, lang }: { tables: Record<string, unknown>[]; lang: Lang }) {
	const prefix = lang === "ru" ? "/ru" : "";
	const kindLabels: Record<string, [string, string]> = {
		creature: ["Loot", "Добыча"], pickpocket: ["Pickpocket", "Карманная кража"],
		skinning: ["Skinning", "Снятие шкур"], vendor: ["Vendor inventory", "Товары продавца"],
		container: ["Container", "Контейнер"], fishing: ["Fishing", "Рыбалка"], other: ["Other", "Другое"],
	};
	return <div className="db-tooltip-loot-tables"><b>{lang === "ru" ? "Подтверждённые источником предметы" : "Source-verified items"}</b>{tables.map((table) => {
		const entries = Array.isArray(table.entries) ? table.entries as Record<string, unknown>[] : [];
		const kind = String(table.kind ?? "other");
		return <section key={String(table.id)}>
			<header><span>{kindLabels[kind]?.[lang === "ru" ? 1 : 0] ?? kind}</span>{Number(table.difficulty_id ?? 0) > 0 ? <small>{lang === "ru" ? "Сложность" : "Difficulty"} {String(table.difficulty_id)}</small> : null}</header>
			{entries.map((entry) => {
				const icon = verifiedMediaURL(String(entry.icon_url ?? ""));
				const chance = entry.chance_percent === null || entry.chance_percent === undefined ? "" : `${formatGameNumber(Number(entry.chance_percent))}%`;
				const hasQuantity = entry.min_quantity !== null && entry.min_quantity !== undefined && entry.max_quantity !== null && entry.max_quantity !== undefined;
				const min = hasQuantity ? Number(entry.min_quantity) : 0;
				const max = hasQuantity ? Number(entry.max_quantity) : 0;
				const quantity = !hasQuantity || (min === 1 && max === 1) ? "" : min === max ? ` ×${min}` : ` ×${min}–${max}`;
				const content = <>{icon ? <img src={icon} alt="" loading="lazy" /> : <span className="db-loot-icon-fallback" aria-hidden="true">◇</span>}<span><strong>{String(entry.name || `Item #${String(entry.item_external_id)}`)}{quantity}</strong><small>{chance || (lang === "ru" ? "Шанс не указан источником" : "Chance not stated by source")}</small></span></>;
				return entry.item_entity_id ? <a key={`${String(table.id)}-${String(entry.index)}`} href={`${prefix}/database/item/${encodeURIComponent(String(entry.item_entity_id))}/${encodeURIComponent(String(entry.item_external_id))}`}>{content}</a> : <span className="db-tooltip-loot-unresolved" key={`${String(table.id)}-${String(entry.index)}`}>{content}</span>;
			})}
		</section>;
	})}</div>;
}

function TooltipProvenance({ block, lang }: { block: Record<string, unknown>; lang: Lang }) {
	const sourceURL = String(block.source_url ?? "");
	const updated = block.updated_at ? new Date(String(block.updated_at)) : null;
	return <div className="db-tooltip-provenance"><span>{lang === "ru" ? "Сборка" : "Build"}: {String(block.build || block.build_number || "—")}</span>{updated && !Number.isNaN(updated.valueOf()) ? <span>{lang === "ru" ? "Обновлено" : "Updated"}: {updated.toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US")}</span> : null}{sourceURL ? <a href={sourceURL} target="_blank" rel="noreferrer">{lang === "ru" ? "Источник данных" : "Data source"} ↗</a> : null}</div>;
}

function SpellEffects({ entries, lang }: { entries: Record<string, unknown>[]; lang: Lang }) {
	const meaningful = entries.filter((effect) => Number(effect.base_points ?? 0) !== 0 || Number(effect.coefficient ?? 0) !== 0 || Number(effect.attack_power_coefficient ?? 0) !== 0 || Number(effect.amplitude_ms ?? 0) > 0 || Number(effect.chain_targets ?? 0) > 0 || Number((effect.attributes as Record<string, unknown> | undefined)?.trigger_spell_id ?? 0) > 0);
	if (!meaningful.length) return null;
	return <div className="db-tooltip-spell-effects"><b>{lang === "ru" ? "Параметры эффектов" : "Effect parameters"}</b>{meaningful.map((effect, index) => {
		const attributes = (effect.attributes ?? {}) as Record<string, unknown>;
		return <div key={`${String(effect.index)}-${String(effect.difficulty_id)}-${index}`}>
			<span>#{String(Number(effect.index ?? 0) + 1)}</span>
			{Number(effect.base_points ?? 0) !== 0 ? <span>{lang === "ru" ? "база" : "base"} {formatGameNumber(Number(effect.base_points))}</span> : null}
			{Number(effect.coefficient ?? 0) !== 0 ? <span>SP ×{formatGameNumber(Number(effect.coefficient))}</span> : null}
			{Number(effect.attack_power_coefficient ?? 0) !== 0 ? <span>AP ×{formatGameNumber(Number(effect.attack_power_coefficient))}</span> : null}
			{Number(effect.amplitude_ms ?? 0) > 0 ? <span>{lang === "ru" ? "период" : "period"} {formatDuration(Number(effect.amplitude_ms), lang)}</span> : null}
			{Number(effect.chain_targets ?? 0) > 0 ? <span>{lang === "ru" ? "целей" : "targets"} {String(effect.chain_targets)}</span> : null}
			{Number(attributes.trigger_spell_id ?? 0) > 0 ? <span>{lang === "ru" ? "вызывает заклинание" : "triggers spell"} {String(attributes.trigger_spell_id)}</span> : null}
		</div>;
	})}</div>;
}

function SpellTalents({ entries, lang }: { entries: Record<string, unknown>[]; lang: Lang }) {
	const unique = Array.from(new Map(entries.filter((entry) => String(entry.name ?? "")).map((entry) => [String(entry.talent_id), entry])).values());
	if (!unique.length) return null;
	return <div className="db-tooltip-talent-link"><b>{lang === "ru" ? "Связанные таланты:" : "Related talents:"}</b><span className="db-tooltip-related-inline">{unique.map((entry) => {
		const icon = verifiedMediaURL(String(entry.icon_url ?? ""));
		const relation = String(entry.relationship ?? "grants");
		return <span className="db-tooltip-owner-badge" key={String(entry.talent_id)}>{icon ? <img src={icon} alt="" loading="lazy" /> : null}<span>{String(entry.name)}{relation !== "grants" ? ` (${relation})` : ""}</span></span>;
	})}</span></div>;
}

function TalentSpells({ entries, lang }: { entries: Record<string, unknown>[]; lang: Lang }) {
	if (!entries.length) return null;
	const relationLabels: Record<string, [string, string]> = {
		grants: ["Grants", "Даёт"],
		replaces: ["Replaces", "Заменяет"],
		modifies: ["Modifies", "Изменяет"],
	};
	const localePrefix = lang === "ru" ? "/ru" : "";
	return <div className="db-tooltip-talent-spells"><b>{lang === "ru" ? "Связанные заклинания и эффекты" : "Related spells and effects"}</b>{entries.map((entry) => {
		const relation = String(entry.relationship ?? "grants");
		const icon = verifiedMediaURL(String(entry.icon_url ?? ""));
		const effects = Array.isArray(entry.effects) ? entry.effects as Record<string, unknown>[] : [];
		return <div className="db-tooltip-talent-spell" key={`${relation}-${String(entry.entity_id)}`}>
			<a className="db-tooltip-owner-badge" href={`${localePrefix}/database/spell/${encodeURIComponent(String(entry.entity_id ?? ""))}/${encodeURIComponent(String(entry.external_id ?? "spell"))}`}>
				{icon ? <img src={icon} alt="" loading="lazy" /> : null}<span>{relationLabels[relation]?.[lang === "ru" ? 1 : 0] ?? relation}: {String(entry.name || `Spell #${String(entry.external_id)}`)}</span>
			</a>
			<SpellEffects entries={effects} lang={lang} />
		</div>;
	})}</div>;
}

function TalentInfo({ block, lang }: { block: Record<string, unknown>; lang: Lang }) {
  const appearances = Array.isArray(block.appearances) ? block.appearances as Record<string, unknown>[] : [];
  const specs = Array.from(new Set(appearances.map((appearance) => specializationName(Number(appearance.spec_id ?? 0), lang)).filter(Boolean)));
  const ranks = Number(block.max_ranks ?? 1);
  const talentType = String(block.talent_type ?? "");
  const requiredLevel = Number(block.level_required ?? 0);
  const playerCondition = Number(block.player_condition_id ?? 0);
  const overridesSpell = Number(block.overrides_spell_id ?? 0);
  return <div className="db-tooltip-talent-info">
    <div>{talentType === "pvp" ? (lang === "ru" ? "PvP-талант" : "PvP talent") : talentType === "active" ? (lang === "ru" ? "Активная способность" : "Active ability") : (lang === "ru" ? "Пассивный эффект" : "Passive effect")}</div>
    {ranks > 1 ? <div>{lang === "ru" ? "Максимальный ранг" : "Maximum rank"}: {ranks}</div> : null}
    {specs.length ? <div>{lang === "ru" ? "Специализации" : "Specializations"}: {specs.join(", ")}</div> : null}
    {requiredLevel > 0 ? <div>{lang === "ru" ? "Требуется уровень" : "Requires level"}: {requiredLevel}</div> : null}
    {overridesSpell > 0 ? <div>{lang === "ru" ? "Заменяет заклинание" : "Replaces spell"}: ID {overridesSpell}</div> : null}
    {playerCondition > 0 ? <div className="db-tooltip-muted">PlayerCondition ID {playerCondition}</div> : null}
  </div>;
}

function className(id: number, lang: Lang) {
  const names: Record<number, [string, string]> = {
    1: ["Warrior", "Воин"], 2: ["Paladin", "Паладин"], 3: ["Hunter", "Охотник"], 4: ["Rogue", "Разбойник"],
    5: ["Priest", "Жрец"], 6: ["Death Knight", "Рыцарь смерти"], 7: ["Shaman", "Шаман"], 8: ["Mage", "Маг"],
    9: ["Warlock", "Чернокнижник"], 10: ["Monk", "Монах"], 11: ["Druid", "Друид"],
    12: ["Demon Hunter", "Охотник на демонов"], 13: ["Evoker", "Пробудитель"],
  };
  return names[id]?.[lang === "ru" ? 1 : 0] ?? "";
}

function specializationName(id: number, lang: Lang) {
  const names: Record<number, [string, string]> = {
    62:["Arcane","Тайная магия"],63:["Fire","Огонь"],64:["Frost","Лед"],65:["Holy","Свет"],66:["Protection","Защита"],70:["Retribution","Воздаяние"],
    71:["Arms","Оружие"],72:["Fury","Неистовство"],73:["Protection","Защита"],102:["Balance","Баланс"],103:["Feral","Сила зверя"],104:["Guardian","Страж"],105:["Restoration","Исцеление"],
    250:["Blood","Кровь"],251:["Frost","Лед"],252:["Unholy","Нечестивость"],253:["Beast Mastery","Повелитель зверей"],254:["Marksmanship","Стрельба"],255:["Survival","Выживание"],
    256:["Discipline","Послушание"],257:["Holy","Свет"],258:["Shadow","Тьма"],259:["Assassination","Ликвидация"],260:["Outlaw","Головорез"],261:["Subtlety","Скрытность"],
    262:["Elemental","Стихии"],263:["Enhancement","Совершенствование"],264:["Restoration","Исцеление"],265:["Affliction","Колдовство"],266:["Demonology","Демонология"],267:["Destruction","Разрушение"],
    268:["Brewmaster","Хмелевар"],269:["Windwalker","Танцующий с ветром"],270:["Mistweaver","Ткач туманов"],577:["Havoc","Истребление"],581:["Vengeance","Месть"],
    1467:["Devastation","Опустошитель"],1468:["Preservation","Хранитель"],1473:["Augmentation","Насыщение"],1480:["Devourer","Пожиратель"],
  };
  return names[id]?.[lang === "ru" ? 1 : 0] ?? "";
}

function TooltipPrice({ buy, sell, lang }: { buy: number; sell: number; lang: Lang }) {
  return <div className="db-tooltip-price">
    {buy > 0 ? <span>{lang === "ru" ? "Цена покупки" : "Buy price"}: {formatCopper(buy)}</span> : null}
    {sell > 0 ? <span>{lang === "ru" ? "Цена продажи" : "Sell price"}: {formatCopper(sell)}</span> : null}
  </div>;
}

function formatCopper(value: number) {
  const gold = Math.floor(value / 10000);
  const silver = Math.floor((value % 10000) / 100);
  const copper = value % 100;
  return [gold ? `${gold}з` : "", silver ? `${silver}с` : "", copper || (!gold && !silver) ? `${copper}м` : ""].filter(Boolean).join(" ");
}

function TooltipStats({ entries, lang }: { entries: Record<string, unknown>[]; lang: Lang }) {
  const visible = entries.filter((entry) => Number(entry.id ?? entry.stat_type ?? -1) >= 0 && Number.isFinite(Number(entry.value)));
  if (!visible.length) return null;
  return <div className="db-tooltip-stats">{visible.map((entry, index) => {
    const statID = Number(entry.id ?? entry.stat_type);
    return <div key={`${statID}-${index}`}><span>+{String(entry.value)} {statName(statID, lang)}</span></div>;
  })}</div>;
}

function statName(id: number, lang: Lang) {
  const names: Record<number, [string, string]> = {
    0: ["Mana", "Мана"], 1: ["Health", "Здоровье"], 3: ["Agility", "Ловкость"], 4: ["Strength", "Сила"],
    5: ["Intellect", "Интеллект"], 7: ["Stamina", "Выносливость"], 12: ["Defense", "Защита"],
    13: ["Dodge", "Уклонение"], 14: ["Parry", "Парирование"], 31: ["Hit", "Меткость"],
    32: ["Critical Strike", "Критический удар"], 35: ["Resilience", "Устойчивость"], 36: ["Haste", "Скорость"],
    37: ["Expertise", "Мастерство"], 40: ["Versatility", "Универсальность"], 49: ["Mastery", "Искусность"],
    71: ["Agility / Strength / Intellect", "Ловкость / сила / интеллект"],
    72: ["Agility / Strength", "Ловкость / сила"], 73: ["Agility / Intellect", "Ловкость / интеллект"],
    74: ["Strength / Intellect", "Сила / интеллект"],
  };
  return names[id]?.[lang === "ru" ? 1 : 0] ?? `${lang === "ru" ? "Характеристика" : "Stat"} #${id}`;
}

function acquisitionLabel(block: Record<string, unknown>, lang: Lang) {
  const sourceType = String(block.source_type ?? "");
  const name = String(block.name ?? "");
  const location = String(block.location ?? "");
  if (sourceType === "encounter") {
    const prefix = lang === "ru" ? "Добывается: " : "Dropped by: ";
		const chance = Number(block.chance_percent ?? 0);
    return `${prefix}${name || `Encounter #${String(block.source_id ?? "")}`}${location ? ` — ${location}` : ""}${chance > 0 ? ` — ${chance}%` : ""}`;
  }
  if (sourceType === "crafting_recipe") return `${lang === "ru" ? "Создаётся по рецепту: " : "Crafted with: "}${name || `Spell #${String(block.source_id ?? "")}`}`;
  return lang === "ru" ? "Источник: Blizzard API" : "Source: Blizzard API";
}

function effectPrefix(trigger: number, lang: Lang) {
  const labels: Record<number, [string, string]> = {
    0: ["Use: ", "Использование: "], 1: ["Equip: ", "Если на персонаже: "], 2: ["Chance on hit: ", "Вероятность при попадании: "],
  };
  return labels[trigger]?.[lang === "ru" ? 1 : 0] ?? "";
}

function cleanWowText(value: string, lang: Lang) {
  const scaling = lang === "ru" ? "масштабируемое количество" : "a scaling amount";
  return value
    .replace(/\|c[0-9a-f]{8}/gi, "")
    .replace(/\|r/gi, "")
    .replace(/\$@spelldesc(\d+)/gi, "Spell #$1")
    .replace(/\$z\b/g, lang === "ru" ? "место привязки" : "your home location")
    .replace(/\$\d+s\d+/gi, scaling)
    .replace(/\$s\d+/gi, scaling)
    .replace(/\$w\d+/gi, scaling)
    .replace(/\$d\b/gi, lang === "ru" ? "указанного времени" : "the listed duration")
    .replace(/\$t\d+/gi, lang === "ru" ? "указанный интервал" : "the listed interval")
    .replace(/\$x\d+/gi, lang === "ru" ? "несколько" : "several")
    .replace(/\$\?[^[]+\[/g, "")
    .replace(/\]\[\]/g, "")
    .trim();
}

function formatCastTime(milliseconds: number, lang: Lang) {
  if (milliseconds <= 0) return lang === "ru" ? "Мгновенное применение" : "Instant";
  return `${formatDuration(milliseconds, lang)} ${lang === "ru" ? "применение" : "cast"}`;
}

function formatDuration(milliseconds: number, lang: Lang) {
  const seconds = milliseconds / 1000;
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60} ${lang === "ru" ? "мин" : "min"}`;
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} ${lang === "ru" ? "сек" : "sec"}`;
}

function formatPower(block: Record<string, unknown>, lang: Lang) {
  const amount = Number(block.amount ?? 0);
  const percent = Number(block.percent ?? 0);
  const powerType = Number(block.power_type ?? 0);
  const labels: Record<number, [string, string]> = { 0: ["Mana", "маны"], 1: ["Rage", "ярости"], 2: ["Focus", "концентрации"], 3: ["Energy", "энергии"] };
  const label = labels[powerType]?.[lang === "ru" ? 1 : 0] ?? (lang === "ru" ? "ресурса" : "resource");
  return `${percent > 0 ? `${formatGameNumber(percent)}%` : formatGameNumber(amount)} ${label}`;
}

function formatGameNumber(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Number(value.toFixed(4)).toLocaleString("en-US", { maximumFractionDigits: 4, useGrouping: false });
}

function bindingLabel(code: number, lang: Lang) {
  const labels: Record<number, [string, string]> = {
    1: ["Binds when picked up", "Становится персональным при получении"],
    2: ["Binds when equipped", "Становится персональным при надевании"],
    3: ["Binds when used", "Становится персональным при использовании"],
    4: ["Quest Item", "Задание"],
  };
  return labels[code]?.[lang === "ru" ? 1 : 0] ?? "";
}

function requiredSkillLabel(skillID: number, rank: number, lang: Lang) {
  const skills: Record<number, [string, string]> = {
    164: ["Blacksmithing", "Кузнечное дело"], 165: ["Leatherworking", "Кожевничество"],
    171: ["Alchemy", "Алхимия"], 197: ["Tailoring", "Портняжное дело"],
    202: ["Engineering", "Инженерное дело"], 333: ["Enchanting", "Наложение чар"],
    755: ["Jewelcrafting", "Ювелирное дело"], 773: ["Inscription", "Начертание"],
  };
  const name = skills[skillID]?.[lang === "ru" ? 1 : 0] ?? `${lang === "ru" ? "Навык" : "Skill"} ${skillID}`;
  return `${lang === "ru" ? "Требуется" : "Requires"} ${name}${rank > 0 ? ` (${rank})` : ""}`;
}

function inventoryTypeLabel(code: number, lang: Lang) {
  const labels: Record<number, [string, string]> = {
    1: ["Head", "Голова"], 2: ["Neck", "Шея"], 3: ["Shoulder", "Плечи"], 5: ["Chest", "Грудь"],
    6: ["Waist", "Пояс"], 7: ["Legs", "Ноги"], 8: ["Feet", "Ступни"], 9: ["Wrist", "Запястья"],
    10: ["Hands", "Кисти рук"], 11: ["Finger", "Палец"], 12: ["Trinket", "Аксессуар"],
    13: ["One-Hand", "Одноручное"], 14: ["Shield", "Щит"], 15: ["Ranged", "Дальний бой"],
    16: ["Back", "Спина"], 17: ["Two-Hand", "Двуручное"], 21: ["Main Hand", "Правая рука"],
    22: ["Off Hand", "Левая рука"], 23: ["Held In Off-hand", "Левая рука"], 26: ["Ranged", "Дальний бой"],
  };
  return labels[code]?.[lang === "ru" ? 1 : 0] ?? (lang === "ru" ? "Экипировка" : "Equipment");
}

function subclassLabel(classID: number, subclassID: number, lang: Lang) {
  const armor: Record<number, [string, string]> = { 1: ["Cloth", "Ткань"], 2: ["Leather", "Кожа"], 3: ["Mail", "Кольчуга"], 4: ["Plate", "Латы"], 6: ["Shield", "Щит"] };
  const weapons: Record<number, [string, string]> = {
    0: ["Axe", "Топор"], 1: ["Two-Handed Axe", "Двуручный топор"], 2: ["Bow", "Лук"], 3: ["Gun", "Ружьё"],
    4: ["Mace", "Дробящее"], 5: ["Two-Handed Mace", "Двуручное дробящее"], 6: ["Polearm", "Древковое"],
    7: ["Sword", "Меч"], 8: ["Two-Handed Sword", "Двуручный меч"], 9: ["Warglaive", "Боевой клинок"],
    10: ["Staff", "Посох"], 13: ["Fist Weapon", "Кистевое"], 15: ["Dagger", "Кинжал"], 18: ["Crossbow", "Арбалет"], 19: ["Wand", "Жезл"],
  };
  const label = classID === 4 ? armor[subclassID] : classID === 2 ? weapons[subclassID] : undefined;
  return label?.[lang === "ru" ? 1 : 0] ?? "";
}
