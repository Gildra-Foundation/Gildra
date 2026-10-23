"use client";

import { useConsoleText } from "./consoleLocale";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronRight, CircleAlert, Languages, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  Locale, Section, CatalogStatus, Character, CharacterDetail, Weapon, WeaponDetail,
  ArtifactSet, ArtifactDetail, ImagePreview, CatalogItem, CatalogPage,
} from "./genshin/types";
import { requestJSON } from "./genshin/request";
import {
  sectionOptions, localizedElementOptions, localizedWeaponOptions, sectionLabel,
  contentCategoryLabel,
} from "./genshin/format";
import {
  ElementRail, Metric, FilterSelect, ImageLightbox, CatalogSkeleton, EmptyCatalog,
} from "./genshin/primitives";
import { CatalogCard } from "./genshin/cards";
import { CharacterDialog } from "./genshin/characterDialog";
import { WeaponDialog } from "./genshin/weaponDialog";
import { ArtifactDialog } from "./genshin/artifactDialog";

export function GenshinImpactCatalog() {
  const ct = useConsoleText();
  const [section, setSection] = useState<Section>("characters");
  const [contentCategory, setContentCategory] = useState("");
  const [locale, setLocale] = useState<Locale>("en_US");
  const [query, setQuery] = useState("");
  const [rarity, setRarity] = useState("");
  const [element, setElement] = useState("");
  const [weaponType, setWeaponType] = useState("");
  const [status, setStatus] = useState<CatalogStatus | null>(null);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [nextCursor, setNextCursor] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [characterDetail, setCharacterDetail] = useState<CharacterDetail | null>(null);
  const [characterDetailLoading, setCharacterDetailLoading] = useState(false);
  const [characterDetailError, setCharacterDetailError] = useState("");
  const [selectedWeapon, setSelectedWeapon] = useState<Weapon | null>(null);
  const [weaponDetail, setWeaponDetail] = useState<WeaponDetail | null>(null);
  const [weaponDetailLoading, setWeaponDetailLoading] = useState(false);
  const [weaponDetailError, setWeaponDetailError] = useState("");
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactSet | null>(null);
  const [artifactDetail, setArtifactDetail] = useState<ArtifactDetail | null>(null);
  const [artifactDetailLoading, setArtifactDetailLoading] = useState(false);
  const [artifactDetailError, setArtifactDetailError] = useState("");
  const [imagePreview, setImagePreview] = useState<ImagePreview | null>(null);
  const en = locale === "en_US";

  const endpoint = useMemo(() => {
    const params = new URLSearchParams({ locale, limit: "24" });
    if (query.trim()) params.set("q", query.trim());
    if (rarity && section !== "talents" && section !== "content") params.set("rarity", rarity);
    if (section === "characters" && element) params.set("element", element);
    if ((section === "characters" || section === "weapons") && weaponType) params.set("weaponType", weaponType);
    const path = section === "content" ? `content/${encodeURIComponent(contentCategory)}` : section;
    return `/genshin-impact/v1/${path}?${params}`;
  }, [contentCategory, element, locale, query, rarity, section, weaponType]);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(""); setItems([]); setNextCursor("");
    try {
      const page = await requestJSON<CatalogPage<CatalogItem>>(endpoint, signal);
      setItems(page.data); setHasMore(page.pagination.hasMore);
      setNextCursor(page.pagination.nextCursor ?? "");
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : ct("Не удалось загрузить каталог"));
    } finally { setLoading(false); }
  }, [endpoint]);

  const loadStatus = useCallback(async (signal?: AbortSignal) => {
    try {
      setStatus(await requestJSON<CatalogStatus>("/genshin-impact/v1/status", signal));
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : ct("Не удалось загрузить состояние каталога"));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void load(controller.signal); }, query ? 250 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [load, revision, query]);

  useEffect(() => {
    const controller = new AbortController();
    void loadStatus(controller.signal);
    return () => controller.abort();
  }, [loadStatus, revision]);

  useEffect(() => {
    if (!selectedCharacter) {
      setCharacterDetail(null);
      setCharacterDetailError("");
      return;
    }
    let cancelled = false;
    setCharacterDetail(null);
    setCharacterDetailError("");
    setCharacterDetailLoading(true);
    void requestJSON<CharacterDetail>(`/genshin-impact/v1/characters/${encodeURIComponent(selectedCharacter.slug)}?locale=${locale}`)
      .then((detail) => { if (!cancelled) setCharacterDetail(detail); })
      .catch((reason) => {
        if (!cancelled) setCharacterDetailError(reason instanceof Error ? reason.message : ct("Не удалось загрузить профиль персонажа"));
      })
      .finally(() => { if (!cancelled) setCharacterDetailLoading(false); });
    return () => { cancelled = true; };
  }, [locale, selectedCharacter]);

  useEffect(() => {
    if (!selectedWeapon) {
      setWeaponDetail(null);
      setWeaponDetailError("");
      return;
    }
    let cancelled = false;
    setWeaponDetail(null);
    setWeaponDetailError("");
    setWeaponDetailLoading(true);
    void requestJSON<WeaponDetail>(`/genshin-impact/v1/weapons/${encodeURIComponent(selectedWeapon.slug)}?locale=${locale}`)
      .then((detail) => { if (!cancelled) setWeaponDetail(detail); })
      .catch((reason) => {
        if (!cancelled) setWeaponDetailError(reason instanceof Error ? reason.message : ct("Не удалось загрузить профиль оружия"));
      })
      .finally(() => { if (!cancelled) setWeaponDetailLoading(false); });
    return () => { cancelled = true; };
  }, [locale, selectedWeapon]);

  useEffect(() => {
    if (!selectedArtifact) {
      setArtifactDetail(null);
      setArtifactDetailError("");
      return;
    }
    let cancelled = false;
    setArtifactDetail(null);
    setArtifactDetailError("");
    setArtifactDetailLoading(true);
    void requestJSON<ArtifactDetail>(`/genshin-impact/v1/artifact-sets/${encodeURIComponent(selectedArtifact.slug)}?locale=${locale}`)
      .then((detail) => { if (!cancelled) setArtifactDetail(detail); })
      .catch((reason) => {
        if (!cancelled) setArtifactDetailError(reason instanceof Error ? reason.message : ct("Не удалось загрузить профиль набора"));
      })
      .finally(() => { if (!cancelled) setArtifactDetailLoading(false); });
    return () => { cancelled = true; };
  }, [locale, selectedArtifact]);

  // The dialogs are Valyro ModalLayers: Escape closes the top one, focus stays inside, the page does not scroll.

  function switchSection(next: Section) {
    setLoading(true);
    setItems([]);
    setSection(next);
    if (next === "artifact-sets" || next === "talents") { setElement(""); setWeaponType(""); }
    if (next === "talents") setRarity("");
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true); setError("");
    try {
      const page = await requestJSON<CatalogPage<CatalogItem>>(`${endpoint}&cursor=${encodeURIComponent(nextCursor)}`);
      setItems((current) => [...current, ...page.data]);
      setHasMore(page.pagination.hasMore); setNextCursor(page.pagination.nextCursor ?? "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : ct("Не удалось загрузить следующую страницу"));
    } finally { setLoadingMore(false); }
  }

  function openCharacter(item: Character) {
    setSelectedWeapon(null); setSelectedArtifact(null); setSelectedCharacter(item);
  }

  function openWeapon(item: Weapon) {
    setSelectedCharacter(null); setSelectedArtifact(null); setSelectedWeapon(item);
  }

  function openArtifact(item: ArtifactSet) {
    setSelectedCharacter(null); setSelectedWeapon(null); setSelectedArtifact(item);
  }

  return <div className="flex flex-col gap-5">
    <section className="relative overflow-hidden border border-[#2d3341] bg-[#10141c]">
      <ElementRail />
      <div className="grid gap-8 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[.18em] text-[#8f9bad]"><BookOpen className="size-3.5 text-[#c9a24f]" />{en ? "Local encyclopedia" : ct("Локальная энциклопедия")}</div>
          <h2 className="mt-3 font-[family-name:var(--display)] text-2xl font-semibold tracking-tight text-[#edf0f5] sm:text-3xl">Genshin Impact</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#8792a5]">{en ? "Full bilingual source catalog: characters, talents, weapons, artifacts, food, materials, enemies, domains, quests, interactive maps, TCG and more. Images are stored on the Gildra server." : ct("Полный двуязычный каталог источника: персонажи, таланты, оружие, артефакты, еда, материалы, противники, подземелья, задания, интерактивные карты, TCG и другие записи. Изображения хранятся на сервере Gildra.")}</p>
        </div>
        <div className="grid grid-cols-2 gap-px border border-[#2b3240] bg-[#2b3240] sm:grid-cols-3 lg:grid-cols-6 lg:min-w-[620px]">
          <Metric label={en ? "Characters" : ct("Персонажи")} value={status?.characters ?? 0} />
          <Metric label={en ? "Talents" : ct("Таланты")} value={status?.talents ?? 0} />
          <Metric label={en ? "Weapons" : ct("Оружие")} value={status?.weapons ?? 0} />
          <Metric label={en ? "Sets" : ct("Наборы")} value={status?.artifactSets ?? 0} />
          <Metric label={en ? "All records" : ct("Все записи")} value={status?.contentEntries ?? 0} />
          <Metric label={en ? "Media" : ct("Медиа")} value={status?.mediaAssets ?? 0} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[#29303c] bg-[#0c1017] px-5 py-3 text-[10px] text-[#69758a] sm:px-7">
        <span className={status?.ready ? "text-[#78c395]" : "text-[#d1a451]"}>{status?.ready ? (en ? "Published version available" : ct("Опубликованная версия доступна")) : (en ? "Waiting for first import" : ct("Ожидается первый импорт"))}</span>
        <span>{en ? "Game version" : ct("Версия игры")}: <strong className="font-medium text-[#aeb7c7]">{status?.gameVersion || "—"}</strong></span>
        <span>{en ? "Source" : ct("Источник")}: <strong className="font-mono font-medium text-[#aeb7c7]">{status?.sourceRevision?.slice(0, 12) || "—"}</strong></span>
        <span className="ml-auto">{status?.publishedAt ? new Date(status.publishedAt).toLocaleString(locale === "ru_RU" ? "ru-RU" : "en-US") : (en ? "Release is not published" : ct("Релиз ещё не опубликован"))}</span>
      </div>
    </section>

    <section className="border border-[#2d3341] bg-[#11151d]">
      <div className="flex flex-col gap-4 border-b border-[#2b313e] p-4 sm:p-5 xl:flex-row xl:items-center">
        <div className="flex min-w-0 flex-1 overflow-x-auto" role="tablist" aria-label={ct("Раздел каталога")}>
          {sectionOptions.map((option) => <button key={option.id} type="button" role="tab" aria-selected={section === option.id} onClick={() => switchSection(option.id)} className={cn("flex h-10 shrink-0 items-center gap-2 border-b-2 px-4 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c9a24f]", section === option.id ? "border-[#d1aa53] bg-[#191a1b] text-[#e6c778]" : "border-transparent text-[#7f899d] hover:bg-[#151a23] hover:text-[#d5dbe5]")}><option.icon className="size-3.5" />{sectionLabel(option.id, locale)}</button>)}
          <label className={cn("flex h-10 shrink-0 items-center border-b-2 px-3 text-xs", section === "content" ? "border-[#d1aa53] bg-[#191a1b] text-[#e6c778]" : "border-transparent text-[#7f899d]")}><span className="sr-only">{ct("Все разделы данных")}</span><select value={section === "content" ? contentCategory : ""} onChange={(event) => { const value = event.target.value; if (value) { setLoading(true); setItems([]); setContentCategory(value); setSection("content"); setRarity(""); setElement(""); setWeaponType(""); } }} className="max-w-52 bg-transparent text-xs outline-none"><option value="">{ct("Все разделы данных")}</option>{Object.entries(status?.contentByCategory ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([category, count]) => <option key={category} value={category}>{ct(contentCategoryLabel(category))} ({count.toLocaleString("ru-RU")})</option>)}</select></label>
        </div>
        <div className="flex items-center gap-2">
          <Languages className="size-4 text-[#7d889b]" />
          <button type="button" onClick={() => setLocale("ru_RU")} className={cn("h-8 border px-3 text-[10px] font-semibold", locale === "ru_RU" ? "border-[#8e7540] bg-[#211d13] text-[#e0be6a]" : "border-[#303746] text-[#778297]")}>RU</button>
          <button type="button" onClick={() => setLocale("en_US")} className={cn("h-8 border px-3 text-[10px] font-semibold", locale === "en_US" ? "border-[#8e7540] bg-[#211d13] text-[#e0be6a]" : "border-[#303746] text-[#778297]")}>EN</button>
          <Button type="button" variant="outline" onClick={() => setRevision((value) => value + 1)} disabled={loading} className="ml-1 size-8 rounded-none border-[#303746] bg-[#0c1017] p-0 text-[#8994a6] hover:border-[#8e7540] hover:text-[#e0be6a]" aria-label={ct("Обновить каталог")}><RefreshCw className={cn("size-3.5", loading && "animate-spin")} /></Button>
        </div>
      </div>

      <div className="grid gap-3 border-b border-[#2b313e] bg-[#0d1118] p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-[minmax(260px,1fr)_170px_190px_210px]">
        <label className="relative"><span className="sr-only">{en ? "Search" : ct("Поиск")}</span><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#657185]" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={section === "characters" ? (en ? "Find a character" : ct("Найти персонажа")) : section === "talents" ? (en ? "Find a talent or hero" : ct("Найти талант или героя")) : section === "weapons" ? (en ? "Find a weapon" : ct("Найти оружие")) : section === "artifact-sets" ? (en ? "Find a set" : ct("Найти набор")) : (en ? "Find a record" : ct("Найти запись"))} className="h-10 rounded-none border-[#303746] bg-[#090d13] pl-9 text-xs placeholder:text-[#566175] focus-visible:border-[#9b8148]" /></label>
        {section !== "talents" && section !== "content" ? <FilterSelect label={en ? "Rarity" : ct("Редкость")} value={rarity} onChange={setRarity} options={[["", en ? "Any rarity" : ct("Любая редкость")], ["5", "5 ★"], ["4", "4 ★"], ...(section === "weapons" ? [["3", "3 ★"], ["2", "2 ★"], ["1", "1 ★"]] : [])]} /> : <div className="hidden sm:block" />}
        {section === "characters" ? <FilterSelect label={en ? "Element" : ct("Элемент")} value={element} onChange={setElement} options={localizedElementOptions(locale)} /> : <div className="hidden xl:block" />}
        {section === "characters" || section === "weapons" ? <FilterSelect label={en ? "Weapon type" : ct("Тип оружия")} value={weaponType} onChange={setWeaponType} options={localizedWeaponOptions(locale)} /> : <div className="hidden xl:block" />}
      </div>

      {error ? <div className="m-4 flex items-start gap-3 border border-[#693b3e] bg-[#211215] p-4 text-sm text-[#eba0a3] sm:m-5"><CircleAlert className="mt-0.5 size-4 shrink-0" /><div><strong className="block font-semibold">{ct("Каталог не загрузился")}</strong><span className="mt-1 block text-xs text-[#ad858d]">{error}</span></div></div> : null}

      <div className="p-4 sm:p-5">
        {loading ? <CatalogSkeleton /> : items.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{items.map((item) => <CatalogCard key={`${section}-${item.id}`} section={section} item={item} onOpenCharacter={openCharacter} onOpenWeapon={openWeapon} onOpenArtifact={openArtifact} onOpenImage={setImagePreview} />)}</div> : <EmptyCatalog ready={status?.ready ?? false} query={query} />}
        {hasMore ? <div className="mt-5 flex justify-center border-t border-[#29303c] pt-5"><Button type="button" variant="outline" onClick={() => void loadMore()} disabled={loadingMore} className="rounded-none border-[#49422f] bg-[#15140f] px-6 text-xs text-[#d5b35f] hover:border-[#8e7540] hover:bg-[#1d1a11]">{loadingMore ? <RefreshCw className="size-3.5 animate-spin" /> : <ChevronRight className="size-3.5" />}{ct("Показать ещё")}</Button></div> : null}
      </div>
    </section>
    <CharacterDialog locale={locale} character={selectedCharacter} detail={characterDetail} loading={characterDetailLoading} error={characterDetailError} onClose={() => setSelectedCharacter(null)} onOpenImage={setImagePreview} />
    <WeaponDialog locale={locale} weapon={selectedWeapon} detail={weaponDetail} loading={weaponDetailLoading} error={weaponDetailError} onClose={() => setSelectedWeapon(null)} onOpenImage={setImagePreview} />
    <ArtifactDialog locale={locale} artifact={selectedArtifact} detail={artifactDetail} loading={artifactDetailLoading} error={artifactDetailError} onClose={() => setSelectedArtifact(null)} onOpenImage={setImagePreview} />
    <ImageLightbox preview={imagePreview} onClose={() => setImagePreview(null)} />
  </div>;
}
