import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, Search, X } from "lucide-react";
import { AtlasEmpty, AtlasFrame, AtlasHero } from "@/components/atlas";
import { MaterialButton } from "@/components/wow/shared/materialAtlas";
import { libraryKit } from "@/components/library/libraryKit";
import { TYPE_SYMBOLS } from "@/components/database/CatalogGlyph";
import { CatalogRecordRow } from "@/components/database/CatalogRecordRow";
import { entityTypeLabel } from "@/lib/platform/catalog/entityTypeLabel";
import { SearchShortcut } from "./SearchShortcut";
import { SearchRouteForm } from "./SearchRouteForm";
import { searchCopy } from "./searchCopy";
import type { Lang } from "@/lib/i18n";
import { catalogGames, type CatalogGameId, type CatalogQueryResult, type PlatformCatalogItem, type SearchKind } from "@/lib/platform/catalog/types";
import styles from "./searchPage.module.css";

function searchHref(lang: Lang, query: string, kind: SearchKind, games: CatalogGameId[]) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (kind !== "all") params.set("type", kind);
  if (games.length < catalogGames.length) games.forEach((game) => params.append("game", game));
  const base = `${lang === "ru" ? "/ru" : ""}/search`;
  return `${base}${params.size ? `?${params}` : ""}`;
}

/** Only games whose catalog can return characters get the Characters tab (WoW search has none). */
function supportsCharacters(games: CatalogGameId[]) {
  return games.some((game) => game !== "wow");
}

/**
 * /search and /ru/search — the library-wide search: hero like the library's
 * (trail, eyebrow, glass field, painted button), kind tabs with a quiet link
 * to the library, and the result rows (shared CatalogRecordRow). Without a
 * query there are no rows, only an empty state. Server-rendered; the only
 * client code is the soft-navigating form and the "/" shortcut.
 */
export function SearchPage({
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
  const t = searchCopy[lang];
  const prefix = lang === "ru" ? "/ru" : "";
  const kinds = (["all", "items", "characters"] as const).filter((value) => value !== "characters" || kind === "characters" || supportsCharacters(selectedGames));
  const multiGame = catalogGames.length > 1;
  return (
    <AtlasFrame lang={lang} scene="archive" dataAttributes={{ "data-search-root": true }}>
      <SearchShortcut inputId="platform-search-input" />
      <AtlasHero
        breadcrumbs={[{ label: t.wow, href: `${prefix}/wow` }, { label: t.library, href: `${prefix}/library` }, { label: t.crumb }]}
        breadcrumbsLabel={t.breadcrumbsLabel}
        eyebrow={t.eyebrow}
        title={t.title}
        lede={t.lede}
        actions={(
          <SearchRouteForm className={styles.searchForm} action={`${prefix}/search`} role="search">
            <span className={styles.searchField}>
            <Search className={styles.searchIcon} aria-hidden="true" />
            <input id="platform-search-input" name="q" type="search" defaultValue={query} aria-label={t.inputLabel} placeholder={t.placeholder} autoComplete="off" autoFocus={!query} />
            {kind !== "all" ? <input type="hidden" name="type" value={kind} /> : null}
            {selectedGames.length < catalogGames.length ? selectedGames.map((game) => <input key={game} type="hidden" name="game" value={game} />) : null}
            {query
              ? <Link className={styles.clearQuery} href={searchHref(lang, "", kind, selectedGames)} aria-label={t.clearQuery}><X aria-hidden="true" /></Link>
              : <kbd title={t.shortcut} aria-label={t.shortcut}>/</kbd>}
            </span>
            <MaterialButton kit={libraryKit} fit="stack" type="submit" iconAfter={<ArrowRight aria-hidden="true" />}>{t.submit}</MaterialButton>
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
        <Link className={styles.databaseLink} href={`${prefix}/library`} prefetch={false}>
          {t.libraryLink} <span aria-hidden="true">→</span>
        </Link>
      </div>

      <div className={multiGame ? `${styles.layout} ${styles.withGames}` : styles.layout}>
        {multiGame ? (
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

        <section className={styles.results} aria-labelledby="search-results-title">
          <h2 className="sr-only" id="search-results-title">{t.results}</h2>
          {query ? (
            <Suspense fallback={<p className={styles.resultCount} aria-live="polite">{t.counting}</p>}>
              <SearchResultCount results={results} lang={lang} query={query} />
            </Suspense>
          ) : (
            <AtlasEmpty title={t.startTitle}>
              {t.startText}
            </AtlasEmpty>
          )}
          {results.map(({ gameId, result }) => (
            <Suspense key={gameId} fallback={<SearchGameFallback gameId={gameId} lang={lang} />}>
              <SearchGameResults gameId={gameId} result={result} lang={lang} showGame={multiGame} />
            </Suspense>
          ))}
        </section>
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
  const itemLevel = item.attributes["Item Level"];
  // WoW meta is rebuilt from structured attributes so it is localized; other games keep their catalog meta.
  const meta = wow ? (itemLevel ? [`${t.itemLevel}\u00a0${itemLevel}`] : []) : item.meta.slice(1);
  // Game text can carry client colour codes (|cFFFFCC99…|r); show the words only.
  const description = item.description.replace(/\|c[0-9a-fA-F]{8}|\|r/g, "");
  return (
    <CatalogRecordRow
      href={item.href}
      name={item.name}
      typeLabel={gameName ? `${gameName} · ${typeLabel}` : typeLabel}
      iconUrl={item.iconUrl}
      iconSymbol={wow ? TYPE_SYMBOLS[item.entityType] : undefined}
      quality={item.entityType === "item" ? quality : undefined}
      description={description}
      meta={meta}
    />
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
  return <>
    <p className={styles.resultCount}>{t.resultsFor(count, query)}</p>
    {!count && !unavailable ? (
      <div className={styles.empty} role="status">
        <Search aria-hidden="true" />
        <h3>{t.empty}</h3>
        <p>{t.emptyHint}</p>
      </div>
    ) : null}
  </>;
}
