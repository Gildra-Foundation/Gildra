import { Suspense, type CSSProperties } from "react";
import Link from "next/link";
import { Bookmark, Check, Search, X } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasLinkButton, type AtlasStat } from "@/components/atlas";
import { ResilientImage } from "@/components/media/ResilientImage";
import { entityTypeLabel, formatCount, ITEM_QUALITY_COLORS } from "@/components/database/databaseCopy";
import { SearchShortcut } from "./SearchShortcut";
import { SearchRouteForm } from "./SearchRouteForm";
import { SavedResults } from "./SavedResults";
import { searchCopy } from "./searchCopy";
import type { Lang } from "@/lib/i18n";
import { catalogGames, type CatalogGameId, type CatalogQueryResult, type PlatformCatalogItem, type SearchKind } from "@/lib/platform/catalog/types";
import styles from "./searchPage.module.css";

export type SearchCatalogStats = { records: number; types: number };

function searchHref(lang: Lang, query: string, kind: SearchKind, games: CatalogGameId[]) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (kind !== "all") params.set("type", kind);
  games.forEach((game) => params.append("game", game));
  const base = `${lang === "ru" ? "/ru" : ""}/search`;
  return `${base}${params.size ? `?${params}` : ""}`;
}

/** Only games whose catalog can return characters get the Characters tab (WoW search has none). */
function supportsCharacters(games: CatalogGameId[]) {
  return games.some((game) => game !== "wow");
}

export function SearchPage({
  lang,
  query,
  kind,
  selectedGames,
  results,
  stats,
}: {
  lang: Lang;
  query: string;
  kind: SearchKind;
  selectedGames: CatalogGameId[];
  results: { gameId: CatalogGameId; result: Promise<CatalogQueryResult> }[];
  /** Real catalog totals from the API; omitted when the API did not answer in time. */
  stats?: SearchCatalogStats;
}) {
  const t = searchCopy[lang];
  const prefix = lang === "ru" ? "/ru" : "";
  const kinds = (["all", "items", "characters"] as const).filter((value) => value !== "characters" || kind === "characters" || supportsCharacters(selectedGames));
  const heroStats: AtlasStat[] | undefined = stats ? [
    { value: formatCount(stats.records, lang), label: t.statRecords },
    { value: formatCount(stats.types, lang), label: t.statTypes },
  ] : undefined;
  return (
    <AtlasFrame lang={lang} dataAttributes={{ "data-search-root": true }}>
      <SearchShortcut inputId="platform-search-input" />
      <AtlasHero
        className={styles.hero}
        emblem={<Search />}
        eyebrow={t.eyebrow}
        title={t.title}
        lede={t.lede}
        stats={heroStats}
        statsLabel={t.statsLabel}
        actions={(
          <SearchRouteForm className={styles.searchForm} action={`${prefix}/search`} role="search">
            <Search className={styles.searchIcon} aria-hidden="true" />
            <input id="platform-search-input" className={styles.searchInput} name="q" type="search" defaultValue={query} aria-label={t.inputLabel} placeholder={t.placeholder} autoComplete="off" autoFocus={!query} />
            {kind !== "all" ? <input type="hidden" name="type" value={kind} /> : null}
            {selectedGames.length < catalogGames.length ? selectedGames.map((game) => <input key={game} type="hidden" name="game" value={game} />) : null}
            {query
              ? <Link className={styles.clearQuery} href={searchHref(lang, "", kind, selectedGames)} aria-label={t.clearQuery}><X aria-hidden="true" /></Link>
              : <kbd title={t.shortcut} aria-label={t.shortcut}>/</kbd>}
            <button type="submit">{t.submit}</button>
          </SearchRouteForm>
        )}
      />

      <div className={styles.bar}>
        <nav className={styles.kindTabs} aria-label={t.kindsLabel}>
          {kinds.map((value) => (
            <Link aria-current={kind === value ? "page" : undefined} href={searchHref(lang, query, value, selectedGames)} key={value}>
              {value === "all" ? t.all : value === "characters" ? t.characters : t.items}
            </Link>
          ))}
        </nav>
        {query || kind !== "all" ? <Link className={styles.clearAll} href={`${prefix}/search`}>{t.clear}</Link> : null}
      </div>

      <div className={catalogGames.length > 1 ? `${styles.layout} ${styles.withGames}` : styles.layout}>
        {catalogGames.length > 1 ? (
          <aside className={styles.games}>
            <SearchRouteForm action={`${prefix}/search`}>
              {query ? <input type="hidden" name="q" value={query} /> : null}
              {kind !== "all" ? <input type="hidden" name="type" value={kind} /> : null}
              <h2>{t.games}</h2>
              {catalogGames.map((game) => (
                <label data-disabled={!game.available || undefined} key={game.id}>
                  <input type="checkbox" name="game" value={game.id} defaultChecked={selectedGames.includes(game.id)} disabled={!game.available} />
                  <img src={game.iconUrl} alt="" width="24" height="24" />
                  <span>{game.name}</span>
                  {!game.available ? <small>{t.soon}</small> : null}
                </label>
              ))}
              <button type="submit">{t.apply}</button>
            </SearchRouteForm>
          </aside>
        ) : null}

        <SavedResults className={styles.results} labelledBy="search-results-title">
          <h2 className="sr-only" id="search-results-title">{t.results}</h2>
          <Suspense fallback={<p className={styles.resultCount} aria-live="polite">{t.counting}</p>}>
            <SearchResultCount results={results} lang={lang} query={query} />
          </Suspense>
          {results.map(({ gameId, result }) => (
            <Suspense key={gameId} fallback={<SearchGameFallback gameId={gameId} lang={lang} />}>
              <SearchGameResults gameId={gameId} result={result} lang={lang} showGame={catalogGames.length > 1} />
            </Suspense>
          ))}
        </SavedResults>

        <aside className={styles.tips} aria-labelledby="search-tips-title">
          <h2 id="search-tips-title">{t.tipsTitle}</h2>
          <ul>{t.tips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
          <AtlasLinkButton href={`${prefix}/database`} size="sm" iconAfter={<span aria-hidden="true">→</span>}>{t.databaseLink}</AtlasLinkButton>
        </aside>
      </div>
    </AtlasFrame>
  );
}

async function SearchGameResults({
  gameId,
  result: resultPromise,
  lang,
  showGame,
}: {
  gameId: CatalogGameId;
  result: Promise<CatalogQueryResult>;
  lang: Lang;
  showGame: boolean;
}) {
  const result = await resultPromise;
  const t = searchCopy[lang];
  const game = catalogGames.find((candidate) => candidate.id === gameId)!;
  if (result.unavailableGames.includes(gameId)) {
    return <p className={styles.notice} role="status">{game.name}: {t.unavailable}</p>;
  }
  if (!result.items.length) return null;
  return (
    <ul className={styles.resultList}>
      {result.items.map((item) => <SearchResultItem key={item.id} item={item} lang={lang} gameName={showGame ? game.name : undefined} />)}
    </ul>
  );
}

function SearchResultItem({ item, lang, gameName }: { item: PlatformCatalogItem; lang: Lang; gameName?: string }) {
  const t = searchCopy[lang];
  const wow = item.gameId === "wow";
  const typeLabel = wow ? entityTypeLabel(item.entityType, lang) : item.entityType.replaceAll("-", " ");
  const quality = typeof item.attributes.Quality === "number" ? item.attributes.Quality : undefined;
  const qualityColor = item.entityType === "item" && quality !== undefined ? ITEM_QUALITY_COLORS[quality] : undefined;
  const itemLevel = item.attributes["Item Level"];
  // WoW meta is rebuilt from structured attributes so it is localized; other games keep their catalog meta.
  const meta = wow ? (itemLevel ? [`${t.itemLevel} ${itemLevel}`] : []) : item.meta.slice(1);
  // Game text can carry client colour codes (|cFFFFCC99…|r); show the words only.
  const description = item.description.replace(/\|c[0-9a-fA-F]{8}|\|r/g, "");
  return (
    <li className={styles.result} data-quality={qualityColor ? quality : undefined} style={qualityColor ? { "--result-quality": qualityColor } as CSSProperties : undefined}>
      <span className={styles.resultIcon} aria-hidden="true">
        <ResilientImage src={item.iconUrl} alt="" width={52} height={52} loading="lazy" decoding="async" fallback={<span className={styles.iconFallback}>✦</span>} />
      </span>
      <div className={styles.resultBody}>
        <p className={styles.resultType}>{gameName ? `${gameName} · ` : ""}{typeLabel}</p>
        <h3><a href={item.href}>{item.name}</a></h3>
        {description ? <p className={styles.resultText}>{description}</p> : null}
        {meta.length ? <ul className={styles.resultMeta}>{meta.map((entry) => <li key={entry}>{entry}</li>)}</ul> : null}
      </div>
      <a className={styles.open} href={item.href} tabIndex={-1} aria-hidden="true">{t.open}</a>
      <button type="button" className={styles.save} data-save-record={item.id} data-record-name={item.name} data-save-label={t.save} data-remove-label={t.removeSaved} aria-pressed="false" aria-label={`${t.save}: ${item.name}`} title={t.save}>
        <Bookmark size={17} data-icon-unsaved aria-hidden="true" />
        <Check size={17} data-icon-saved aria-hidden="true" />
      </button>
    </li>
  );
}

function SearchGameFallback({ gameId, lang }: { gameId: CatalogGameId; lang: Lang }) {
  const game = catalogGames.find((candidate) => candidate.id === gameId)!;
  return <p className={styles.pending} aria-live="polite">{searchCopy[lang].searching(game.name)}</p>;
}

async function SearchResultCount({
  results,
  lang,
  query,
}: {
  results: { gameId: CatalogGameId; result: Promise<CatalogQueryResult> }[];
  lang: Lang;
  query: string;
}) {
  const all = await Promise.all(results.map(({ result }) => result));
  const count = all.reduce((total, result) => total + result.items.length, 0);
  const unavailable = all.every((result) => result.unavailableGames.length > 0);
  const t = searchCopy[lang];
  const prefix = lang === "ru" ? "/ru" : "";
  return <>
    <p className={styles.resultCount}>
      {t.resultsFor(count, query)}
      {query && count ? <Link href={`${prefix}/database?q=${encodeURIComponent(query)}`}>{t.allInDatabase}</Link> : null}
    </p>
    {!count && !unavailable ? (
      <div className={styles.empty} role="status">
        <Search aria-hidden="true" />
        <h3>{t.empty}</h3>
        <p>{t.emptyHint}</p>
      </div>
    ) : null}
  </>;
}
