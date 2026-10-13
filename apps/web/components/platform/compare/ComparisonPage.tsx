"use client";

import { startTransition, useDeferredValue, useEffect, useRef, useState } from "react";
import { Check, ChevronRight, Copy, Database, Plus, RotateCcw, Search, ShieldCheck, X, Zap } from "lucide-react";
import { PlatformHeader } from "@/components/platform/home/PlatformHeader";
import { PlatformMotion } from "@/components/platform/home/PlatformMotion";
import { PlatformAtmosphere } from "@/components/platform/shared/PlatformAtmosphere";
import { ResilientImage } from "@/components/media/ResilientImage";
import homeStyles from "@/components/platform/home/rotationPageShell.module.css";
import type { Lang } from "@/lib/i18n";
import { catalogGames, isAvailableKind, type CatalogGameId, type ComparisonKind, type PlatformCatalogItem } from "@/lib/platform/catalog/types";
import type { PlatformHomeData } from "@/lib/platform/home/types";
import { ComparisonMetrics } from "./ComparisonMetrics";
import styles from "./comparePage.module.css";

const copy = {
  en: {
    title: "Comparison Lab", subtitle: "Compare database items inside one game catalog.", game: "Game",
    category: "Category", search: "Find an item…", reset: "Reset", share: "Copy link", copied: "Copied",
    scope: "Single-game comparison", scopeHint: "Only items from the selected game and category can enter this comparison.",
    available: "Database items", loading: "Loading catalog…", unavailable: "The database is temporarily unavailable.",
    empty: "No matching records", add: "Add to comparison", added: "Added", max: "Three items selected",
    compare: "Side-by-side comparison", slot: "Choose an item from the database", metrics: "Attributes",
    remove: "Remove", synchronized: "Catalog synchronized", syncing: "Refreshing catalog", records: "indexed records", retry: "Retry connection",
  },
  ru: {
    title: "Лаборатория сравнения", subtitle: "Сравнивайте записи базы только внутри одной игры.", game: "Игра",
    category: "Категория", search: "Найти предмет…", reset: "Сбросить", share: "Скопировать ссылку", copied: "Скопировано",
    scope: "Сравнение внутри одной игры", scopeHint: "В сравнение попадут только предметы выбранной игры и категории.",
    available: "Предметы из базы", loading: "Загружаем каталог…", unavailable: "База временно недоступна.",
    empty: "Совпадений в базе нет", add: "Добавить к сравнению", added: "Добавлено", max: "Выбрано три предмета",
    compare: "Сравнение характеристик", slot: "Выберите предмет из базы", metrics: "Характеристики",
    remove: "Убрать", synchronized: "Каталог синхронизирован", syncing: "Обновляем каталог", records: "записей в индексе", retry: "Повторить подключение",
  },
};

function isComparableItem(item: PlatformCatalogItem, gameId: CatalogGameId, kind: ComparisonKind) {
  return item.gameId === gameId && item.kind === kind;
}

function displayKind(kind: ComparisonKind, lang: Lang) {
  const labels: Record<ComparisonKind, [string, string]> = {
    items: ["Items", "Предметы"], weapons: ["Weapons", "Оружие"],
    "artifact-sets": ["Artifact Sets", "Наборы артефактов"], runes: ["Runes", "Руны"],
  };
  return labels[kind][lang === "ru" ? 1 : 0];
}

function compactGameName(gameId: CatalogGameId) {
  return { wow: "WoW", genshin: "Genshin", diablo: "Diablo IV", league: "League" }[gameId];
}

export function ComparisonPage({ lang, home, initialGame = "wow", initialKind = "items" }: { lang: Lang; home: PlatformHomeData; initialGame?: CatalogGameId; initialKind?: ComparisonKind }) {
  const t = copy[lang];
  const availableGames = catalogGames.filter((game) => game.available && game.kinds.length);
  const safeInitialGame = catalogGames.some((candidate) => candidate.id === initialGame && candidate.available) ? initialGame : "wow";
  const safeInitialKind = isAvailableKind(safeInitialGame, initialKind) ? initialKind : catalogGames.find((candidate) => candidate.id === safeInitialGame)!.kinds[0].id;
  const [gameId, setGameId] = useState<CatalogGameId>(safeInitialGame);
  const game = catalogGames.find((candidate) => candidate.id === gameId) ?? availableGames[0];
  const [kind, setKind] = useState<ComparisonKind>(safeInitialKind);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PlatformCatalogItem[]>([]);
  const [selected, setSelected] = useState<PlatformCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [retry, setRetry] = useState(0);
  const requestSequence = useRef(0);
  const cache = useRef(new Map<string, PlatformCatalogItem[]>());
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    const controller = new AbortController();
    const sequence = ++requestSequence.current;
    const cacheKey = `${lang}:${gameId}:${kind}:${deferredQuery.trim().toLocaleLowerCase()}`;
    const cached = cache.current.get(cacheKey);
    if (cached) {
      setItems(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    const timer = window.setTimeout(async () => {
      setError("");
      try {
        const params = new URLSearchParams({ game: gameId, kind, q: deferredQuery, locale: lang === "ru" ? "ru_RU" : "en_US" });
        const response = await fetch(`/api/platform/catalog?${params}`, { signal: controller.signal, cache: "no-store" });
        const payload = await response.json() as { items?: PlatformCatalogItem[]; unavailableGames?: CatalogGameId[]; error?: string };
        if (!response.ok) throw new Error(payload.error || t.unavailable);
        if (payload.unavailableGames?.includes(gameId)) throw new Error(t.unavailable);
        if (sequence === requestSequence.current) {
          const safeItems = (payload.items ?? []).filter((item) => isComparableItem(item, gameId, kind));
          cache.current.set(cacheKey, safeItems);
          if (cache.current.size > 30) cache.current.delete(cache.current.keys().next().value!);
          startTransition(() => setItems(safeItems));
        }
      } catch (reason) {
        if (controller.signal.aborted) return;
        if (sequence === requestSequence.current) {
          setItems([]);
          setError(reason instanceof Error ? reason.message : t.unavailable);
        }
      } finally {
        if (!controller.signal.aborted && sequence === requestSequence.current) setLoading(false);
      }
    }, 240);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [deferredQuery, gameId, kind, lang, retry, t.unavailable]);

  function changeGame(nextGameId: CatalogGameId) {
    const nextGame = catalogGames.find((candidate) => candidate.id === nextGameId);
    if (!nextGame?.available || !nextGame.kinds.length) return;
    setGameId(nextGameId);
    setKind(nextGame.kinds[0].id);
    setQuery("");
    setItems([]);
    setSelected([]);
  }

  function changeKind(nextKind: ComparisonKind) {
    if (!game.kinds.some((candidate) => candidate.id === nextKind)) return;
    setKind(nextKind);
    setQuery("");
    setItems([]);
    setSelected([]);
  }

  function addItem(item: PlatformCatalogItem) {
    if (!isComparableItem(item, gameId, kind) || selected.length >= 3 || selected.some((candidate) => candidate.id === item.id)) return;
    setSelected((current) => [...current, item]);
  }

  function reset() {
    setQuery("");
    setSelected([]);
  }

  async function copyLink() {
    const url = new URL(window.location.href);
    url.searchParams.set("game", gameId);
    url.searchParams.set("kind", kind);
    await navigator.clipboard?.writeText(url.toString());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className={homeStyles.page} data-platform-home>
      <PlatformMotion />
      <PlatformAtmosphere accent={game.accent} />
      <PlatformHeader data={home} lang={lang} active="compare" scopeLabel={game.name} />
      <main className={styles.page}>
        <header className={styles.hero} data-reveal>
          <div><span><Zap size={11} />{t.scope}</span><h1>{t.title}</h1><p>{t.subtitle}</p></div>
          <div className={styles.heroActions}>
            <button type="button" onClick={reset}><RotateCcw size={15} />{t.reset}</button>
            <button type="button" onClick={copyLink}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? t.copied : t.share}</button>
          </div>
        </header>

        <section className={styles.controls} data-reveal aria-label={t.scope}>
          <div className={styles.gameDock}><span>{t.game}</span><div role="radiogroup" aria-label={t.game}>{catalogGames.map((option) => <button type="button" role="radio" aria-label={option.name} aria-checked={gameId === option.id} disabled={!option.available} className={gameId === option.id ? styles.gameActive : ""} onClick={() => changeGame(option.id)} key={option.id}><img src={option.iconUrl} alt="" width="25" height="25" /><span>{compactGameName(option.id)}</span>{gameId === option.id ? <Check size={12} /> : null}</button>)}</div></div>
          <label><span>{t.category}</span><select value={kind} onChange={(event) => changeKind(event.target.value as ComparisonKind)}>
            {game.kinds.map((option) => <option value={option.id} key={option.id}>{displayKind(option.id, lang)}</option>)}
          </select></label>
          <div className={styles.scopeRule}><ShieldCheck /><div><strong>{t.scope}</strong><span>{t.scopeHint}</span></div></div>
        </section>

        <div className={styles.workspace}>
          <section className={styles.catalog} data-reveal>
            <div className={styles.sectionTitle}><div><span>{game.name}</span><h2>{t.available}</h2></div><b className={loading ? styles.syncing : ""}><Database size={12} />{items.length}</b></div>
            <label className={styles.catalogSearch}><Search aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} aria-label={t.search} /></label>
            <div className={`${styles.catalogStatus} ${error ? styles.statusError : ""}`}><i className={error ? styles.statusErrorDot : loading ? styles.statusBusy : ""} />{error ? t.unavailable : loading ? t.syncing : t.synchronized}<span>{items.length} {t.records}</span></div>
            <div className={styles.catalogList} aria-live="polite" aria-busy={loading}>
              {loading && !items.length ? Array.from({ length: 6 }, (_, index) => <div className={styles.skeleton} key={index}><i /><span /><span /></div>) : null}
              {!loading && error ? <div className={styles.catalogMessage}><ShieldCheck /><strong>{t.unavailable}</strong>{error !== t.unavailable ? <span>{error}</span> : null}<button type="button" onClick={() => setRetry((value) => value + 1)}>{t.retry}<RotateCcw size={12} /></button></div> : null}
              {!loading && !error && !items.length ? <div className={styles.catalogMessage}><Search /><strong>{t.empty}</strong></div> : null}
              {!error ? items.map((item) => {
                const isAdded = selected.some((candidate) => candidate.id === item.id);
                return <article className={styles.catalogItem} key={item.id}>
                  <span className={styles.itemIcon}><ResilientImage src={item.iconUrl} alt="" width="47" height="47" loading="lazy" fallback={<img src={game.iconUrl} alt="" width="47" height="47" loading="lazy" />} /></span>
                  <div><h3>{item.name}</h3><p>{item.meta.slice(1).join(" · ") || item.entityType}</p></div>
                  <button type="button" onClick={() => addItem(item)} disabled={isAdded || selected.length >= 3} aria-label={`${t.add}: ${item.name}`}>
                    {isAdded ? <Check size={15} /> : <Plus size={15} />}<span>{isAdded ? t.added : selected.length >= 3 ? t.max : t.add}</span>
                  </button>
                </article>;
              }) : null}
            </div>
          </section>

          <section className={styles.comparison} data-reveal>
            <div className={styles.sectionTitle}><div><span>{displayKind(kind, lang)}</span><h2>{t.compare}</h2></div><small>{selected.length}/3</small></div>
            <div className={styles.cards}>
              {Array.from({ length: 3 }, (_, index) => {
                const item = selected[index];
                return item ? <article className={styles.compareCard} key={item.id}><span className={styles.rank}>{index + 1}</span>
                  <button type="button" onClick={() => setSelected((current) => current.filter((candidate) => candidate.id !== item.id))} aria-label={`${t.remove}: ${item.name}`}><X size={15} /></button>
                  <span className={styles.compareIcon}><ResilientImage src={item.iconUrl} alt="" width="72" height="72" loading="lazy" fallback={<img src={game.iconUrl} alt="" width="72" height="72" loading="lazy" />} /></span>
                  <small>{game.name}</small><h3>{item.name}</h3><p>{item.description}</p>
                </article> : <article className={styles.emptySlot} key={`slot-${index}`}><Plus /><span>{t.slot}</span><ChevronRight size={13} /></article>;
              })}
            </div>

            <ComparisonMetrics items={selected} lang={lang} />
          </section>
        </div>
      </main>
    </div>
  );
}
