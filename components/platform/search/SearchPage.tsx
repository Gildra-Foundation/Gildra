import { Suspense } from "react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { Bookmark, Check, Filter, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { PlatformHeader } from "@/components/platform/home/PlatformHeader";
import { PlatformAtmosphere } from "@/components/platform/shared/PlatformAtmosphere";
import { SearchShortcut } from "./SearchShortcut";
import { SearchRouteForm } from "./SearchRouteForm";
import { SavedResults } from "./SavedResults";
import homeStyles from "@/components/platform/home/rotationPageShell.module.css";
import type { Lang } from "@/lib/i18n";
import { catalogGames, type CatalogGameId, type CatalogQueryResult, type SearchKind } from "@/lib/platform/catalog/types";
import type { PlatformHomeData } from "@/lib/platform/home/types";
import styles from "./searchPage.module.css";

const copy = {
  en: {
    scope: "Azeroth & archives", placeholder: "Search characters, items, weapons and runes…", all: "All",
    characters: "Characters", items: "Items", games: "Games", content: "Content Type", apply: "Apply filters",
    active: "Active filters", clear: "Clear all", results: "database results", context: "Search Context",
    byGame: "Results by Game", unavailable: "Catalog temporarily unavailable", empty: "No matching database records",
    emptyHint: "Try a broader term or enable another game catalog.", refine: "Refine your search",
    refineHint: "Use the game and content filters to narrow real catalog records.", open: "Open record",
    index: "Gildra intelligence index", live: "Live database", shortcut: "Quick search", match: "match",
    browse: "Explore a connected catalog", title: "Search the Gildra archives",
    save: "Save", removeSaved: "Remove from saved",
  },
  ru: {
    scope: "Азерот и архивы", placeholder: "Поиск персонажей, предметов, оружия и рун…", all: "Все",
    characters: "Персонажи", items: "Предметы", games: "Игры", content: "Тип контента", apply: "Применить",
    active: "Активные фильтры", clear: "Сбросить", results: "результатов из базы", context: "Контекст поиска",
    byGame: "Результаты по играм", unavailable: "Каталог временно недоступен", empty: "В базе ничего не найдено",
    emptyHint: "Попробуйте более общий запрос или включите другую игру.", refine: "Уточните поиск",
    refineHint: "Фильтры игр и контента работают только по реальным записям каталога.", open: "Открыть запись",
    index: "Интеллектуальный индекс Gildra", live: "Живая база", shortcut: "Быстрый поиск", match: "совпадение",
    browse: "Открыть подключённый каталог", title: "Поиск по архивам Азерота",
    save: "Сохранить", removeSaved: "Убрать из сохранённых",
  },
};

function searchHref(lang: Lang, query: string, kind: SearchKind, games: CatalogGameId[]) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (kind !== "all") params.set("type", kind);
  games.forEach((game) => params.append("game", game));
  const base = `${lang === "ru" ? "/ru" : ""}/search`;
  return `${base}${params.size ? `?${params}` : ""}`;
}

function matchScore(name: string, query: string) {
  if (!query) return 100;
  const normalizedName = name.toLocaleLowerCase();
  const normalizedQuery = query.toLocaleLowerCase();
  if (normalizedName === normalizedQuery) return 100;
  if (normalizedName.startsWith(normalizedQuery)) return 96;
  if (normalizedName.includes(normalizedQuery)) return 91;
  return 82;
}

function normalizeCatalogMediaSrc(src?: string | null) {
  return src?.replace(/^https:\/\/api\.gildra\.net(?=\/v1\/media\/)/, "") ?? "";
}

function optimizedCatalogIcon(src: string, width: number) {
  const params = new URLSearchParams({ url: src, w: String(width), q: "75" });
  return `/_next/image?${params}`;
}

function CatalogResultIcon({ iconUrl, fallbackUrl }: { iconUrl?: string | null; fallbackUrl: string }) {
  const icon = normalizeCatalogMediaSrc(iconUrl) || normalizeCatalogMediaSrc(fallbackUrl);
  const fallback = normalizeCatalogMediaSrc(fallbackUrl);
  const local = icon.startsWith("/");
  // WoW catalog media is already served as a 56×56 image with a public cache
  // header. Running each small result icon through Next's optimizer adds a
  // transform request per card and is uncached in dev, so keep those URLs raw.
  const rawCatalogMedia = icon.startsWith("/v1/media/");
  const src = local && !rawCatalogMedia ? optimizedCatalogIcon(icon, 64) : icon;
  const srcSet = local && !rawCatalogMedia
    ? [48, 64, 96, 128].map((width) => `${optimizedCatalogIcon(icon, width)} ${width}w`).join(", ")
    : undefined;
  return <img src={src} srcSet={srcSet} sizes={local ? "(max-width: 760px) 44px, 54px" : undefined}
    data-fallback-src={fallback} alt="" width={54} height={54} loading="lazy" decoding="async" />;
}

export function SearchPage({
  lang,
  query,
  kind,
  selectedGames,
  results,
  home,
}: {
  lang: Lang;
  query: string;
  kind: SearchKind;
  selectedGames: CatalogGameId[];
  results: { gameId: CatalogGameId; result: Promise<CatalogQueryResult> }[];
  home: PlatformHomeData;
}) {
  const t = copy[lang];
  const prefix = lang === "ru" ? "/ru" : "";
  return (
    <div className={homeStyles.page} data-platform-home>
      <PlatformAtmosphere />
      <SearchShortcut inputId="platform-search-input" />
      <PlatformHeader data={home} lang={lang} active="search" showSearch={false} scopeLabel={t.scope} />
      <main className={styles.page}>
        <section className={styles.searchStage} data-reveal>
          <h1>{t.title}</h1>
          <div className={styles.indexLabel}><Sparkles size={12} />{t.index}<i />{t.live}</div>
          <SearchRouteForm className={styles.heroSearch} action={`${prefix}/search`} role="search">
            <Search aria-hidden="true" />
            <input id="platform-search-input" name="q" defaultValue={query} aria-label={t.placeholder} placeholder={t.placeholder} autoFocus={!query} />
            {kind !== "all" ? <input type="hidden" name="type" value={kind} /> : null}
            {selectedGames.map((game) => <input key={game} type="hidden" name="game" value={game} />)}
            {query ? <Link className={styles.clearQuery} href={searchHref(lang, "", kind, selectedGames)} aria-label={t.clear}><X size={15} /></Link> : <kbd title={t.shortcut}>/</kbd>}
            <button type="submit">{home.labels.nav.search}</button>
          </SearchRouteForm>
        </section>

        <nav className={styles.kindTabs} aria-label={t.content} data-reveal>
          {(["all", "characters", "items"] as const).map((value) => (
            <Link className={kind === value ? styles.active : ""} href={searchHref(lang, query, value, selectedGames)} key={value}>
              {value === "all" ? t.all : value === "characters" ? t.characters : t.items}
            </Link>
          ))}
        </nav>

        <div className={styles.layout}>
          <aside className={styles.filters} data-reveal>
            <SearchRouteForm action={`${prefix}/search`}>
              <input type="hidden" name="q" value={query} />
              {kind !== "all" ? <input type="hidden" name="type" value={kind} /> : null}
              <h2><Filter size={15} />{t.games}</h2>
              {catalogGames.map((game) => (
                <label className={!game.available ? styles.disabled : ""} key={game.id}>
                  <input type="checkbox" name="game" value={game.id} defaultChecked={selectedGames.includes(game.id)} disabled={!game.available} />
                  <img src={game.iconUrl} alt="" width="25" height="25" />
                  <span>{game.name}</span>
                  {!game.available ? <small>{lang === "ru" ? "скоро" : "soon"}</small> : null}
                </label>
              ))}
              <button type="submit">{t.apply}</button>
            </SearchRouteForm>
          </aside>

          <SearchResults lang={lang} query={query} kind={kind} selectedGames={selectedGames} results={results} />
        </div>
      </main>
    </div>
  );
}

function SearchResults({
  lang,
  query,
  kind,
  selectedGames,
  results,
}: {
  lang: Lang;
  query: string;
  kind: SearchKind;
  selectedGames: CatalogGameId[];
  results: { gameId: CatalogGameId; result: Promise<CatalogQueryResult> }[];
}) {
  const t = copy[lang];
  const prefix = lang === "ru" ? "/ru" : "";
  const availableGames = catalogGames.filter((game) => game.available);
  return <>
          <SavedResults className={styles.results} labelledBy="search-results-title">
            <header className={styles.resultHeader}>
              <div><span>{t.active}:</span><b>{selectedGames.length === availableGames.length ? t.scope : selectedGames.map((id) => catalogGames.find((game) => game.id === id)?.name).join(", ")}</b><b>{kind === "all" ? t.all : kind === "characters" ? t.characters : t.items}</b></div>
              <Link href={`${prefix}/search`}>{t.clear}</Link>
            </header>
            <Suspense fallback={<p className={styles.resultCount} aria-live="polite">{lang === "ru" ? "Считаем результаты…" : "Counting results…"}</p>}>
              <SearchResultCount results={results} lang={lang} />
            </Suspense>
            {results.map(({ gameId, result }) => (
              <Suspense key={gameId} fallback={<SearchGameFallback gameId={gameId} lang={lang} />}>
                <SearchGameResults gameId={gameId} result={result} query={query} lang={lang} />
              </Suspense>
            ))}
          </SavedResults>
          <Suspense fallback={<SearchContextFallback lang={lang} />}>
            <SearchContext results={results} lang={lang} />
          </Suspense>
        </>
}

async function SearchGameResults({
  gameId,
  result: resultPromise,
  query,
  lang,
}: {
  gameId: CatalogGameId;
  result: Promise<CatalogQueryResult>;
  query: string;
  lang: Lang;
}) {
  const result = await resultPromise;
  const t = copy[lang];
  const game = catalogGames.find((candidate) => candidate.id === gameId)!;
  if (result.unavailableGames.includes(gameId)) {
    return <div className={styles.warning} role="status">{game.name}: {t.unavailable}</div>;
  }
  if (!result.items.length) {
    return <p className={styles.gameEmpty}>{lang === "ru" ? `В ${game.name} совпадений нет.` : `No matches in ${game.name}.`}</p>;
  }
  const groups = new Map<string, typeof result.items>();
  for (const item of result.items) {
    const label = item.kind === "characters" ? t.characters : item.kind === "entities" ? (lang === "ru" ? "Сущности" : "Entities") : t.items;
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  return <>
    {Array.from(groups).map(([label, items]) => (
      <section className={styles.resultGroup} key={`${gameId}:${label}`}>
        <h2>{label}<span>{items.length}</span></h2>
        {items.map((item) => (
          <article className={styles.resultItem} key={item.id} style={{ "--result-accent": game.accent } as CSSProperties}>
            <span className={styles.resultIcon}><CatalogResultIcon iconUrl={item.iconUrl} fallbackUrl={game.iconUrl} /></span>
            <div>
              <small style={{ color: game.accent }}>{game.name} · {item.entityType.replaceAll("-", " ")}</small>
              <h3><a href={item.href}>{item.name}</a></h3>
              <p>{item.description}</p>
              <ul>{item.meta.slice(1).map((meta) => <li key={meta}>{meta}</li>)}</ul>
            </div>
            <strong className={styles.score}>{matchScore(item.name, query)}%<small>{t.match}</small></strong>
            <a className={styles.openRecord} href={item.href}>{t.open}</a>
            <button type="button" data-save-record={item.id} data-record-name={item.name} data-save-label={t.save} data-remove-label={t.removeSaved} aria-pressed="false" aria-label={`${t.save}: ${item.name}`} title={t.save}>
              <Bookmark size={17} data-icon-unsaved aria-hidden="true" />
              <Check size={17} data-icon-saved aria-hidden="true" />
            </button>
          </article>
        ))}
      </section>
    ))}
  </>;
}

function SearchGameFallback({ gameId, lang }: { gameId: CatalogGameId; lang: Lang }) {
  const game = catalogGames.find((candidate) => candidate.id === gameId)!;
  return <p className={styles.gamePending} aria-live="polite">{lang === "ru" ? `Ищем в ${game.name}…` : `Searching ${game.name}…`}</p>;
}

async function SearchResultCount({
  results,
  lang,
}: {
  results: { gameId: CatalogGameId; result: Promise<CatalogQueryResult> }[];
  lang: Lang;
}) {
  const all = await Promise.all(results.map(({ result }) => result));
  const count = all.reduce((total, result) => total + result.items.length, 0);
  const t = copy[lang];
  const availableGames = catalogGames.filter((game) => game.available);
  return <>
    <p className={styles.resultCount} id="search-results-title"><strong data-count>{count}</strong> {t.results}</p>
    {!count ? <div className={styles.empty} role="status">
      <div className={styles.emptyOrbit}><i /><i /><Search /></div>
      <h2>{t.empty}</h2><p>{t.emptyHint}</p>
      <div className={styles.emptyActions}>{availableGames.map((game) => <Link href={searchHref(lang, "", "all", [game.id])} key={game.id}>
        <img src={game.iconUrl} alt="" width="26" height="26" /><span>{t.browse}<small>{game.name}</small></span><b>→</b>
      </Link>)}</div>
    </div> : null}
  </>;
}

async function SearchContext({
  results,
  lang,
}: {
  results: { gameId: CatalogGameId; result: Promise<CatalogQueryResult> }[];
  lang: Lang;
}) {
  const all = await Promise.all(results.map(({ result }) => result));
  const t = copy[lang];
  const total = all.reduce((sum, result) => sum + result.items.length, 0);
  const counts = catalogGames.map((game) => ({
    game,
    count: all.reduce((sum, result) => sum + result.items.filter((item) => item.gameId === game.id).length, 0),
  }));
  let cursor = 0;
  const distribution = total
    ? `conic-gradient(${counts.filter(({ count }) => count).map(({ game, count }) => {
        const start = cursor;
        cursor += count / total * 100;
        return `${game.accent} ${start}% ${cursor}%`;
      }).join(",")})`
    : "conic-gradient(from 30deg, rgba(216,139,43,.28), rgba(47,104,126,.22), rgba(216,139,43,.28))";
  return <aside className={styles.context} data-reveal>
    <section>
      <h2>{t.context}</h2><h3>{t.byGame}</h3>
      <div className={styles.distribution} style={{ "--distribution": distribution } as CSSProperties}><div><strong data-count>{total}</strong><span>{t.results}</span></div></div>
      <div className={styles.gameCounts}>
        {counts.map(({ game, count }) => <div key={game.id}><img src={game.iconUrl} alt="" width="28" height="28" /><span>{game.name}</span><b data-count>{count}</b></div>)}
      </div>
    </section>
    <section className={styles.refine}><SlidersHorizontal aria-hidden="true" /><div><h2>{t.refine}</h2><p>{t.refineHint}</p></div></section>
  </aside>;
}

function SearchContextFallback({ lang }: { lang: Lang }) {
  return <aside className={styles.context} aria-live="polite"><section>{lang === "ru" ? "Обновляем контекст…" : "Updating search context…"}</section></aside>;
}
