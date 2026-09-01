"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen, Box, ChevronRight, CircleAlert, Gem, ImageIcon, Languages,
  RefreshCw, Search, Sparkles, Swords,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Locale = "en_US" | "ru_RU";
type Section = "characters" | "talents" | "weapons" | "artifact-sets" | "content";

type CatalogStatus = {
  ready: boolean;
  releaseId?: string;
  sourceRevision?: string;
  gameVersion?: string;
  publishedAt?: string;
  characters: number;
  weapons: number;
  artifactSets: number;
  talents: number;
  contentEntries: number;
  contentByCategory: Record<string, number>;
  mediaAssets: number;
  locales: string[];
};

type Character = {
  id: number; externalId: number; slug: string; name: string; title: string;
  rarity: number; element: string; weaponType: string; region: string;
  iconUrl: string | null; portraitUrl: string | null; locale: Locale;
  localeFallback: boolean; talentCount: number;
};

type Weapon = {
  id: number; externalId: number; slug: string; name: string; rarity: number;
  weaponType: string; baseAttack: number | null; secondaryStat: string;
  secondaryStatValue: number | null; iconUrl: string | null; locale: Locale;
  localeFallback: boolean;
};

type ArtifactSet = {
  id: number; externalId: number; slug: string; name: string; minRarity: number;
  maxRarity: number; twoPieceBonus: string; fourPieceBonus: string;
  iconUrl: string | null; locale: Locale; localeFallback: boolean; pieceCount: number;
};

type Talent = {
  id: number; characterSlug: string; characterName: string; externalKey: string;
  kind: string; displayOrder: number; name: string; description: string;
  iconUrl: string | null; locale: Locale; localeFallback: boolean;
};

type ContentMedia = { role: string; filename: string; url?: string | null };
type Content = {
  id: number; externalId?: number | null; category: string; slug: string; name: string; description: string;
  iconUrl: string | null; media: ContentMedia[]; sourcePayload: Record<string, unknown>;
  localizedPayload: Record<string, unknown>; locale: Locale; localeFallback: boolean;
};

type CatalogItem = Character | Talent | Weapon | ArtifactSet | Content;
type CatalogPage<T> = { data: T[]; pagination: { nextCursor?: string; hasMore: boolean; limit: number } };

const sectionOptions: { id: Section; label: string; icon: typeof Swords }[] = [
  { id: "characters", label: "Персонажи", icon: Swords },
  { id: "talents", label: "Таланты", icon: BookOpen },
  { id: "weapons", label: "Оружие", icon: Sparkles },
  { id: "artifact-sets", label: "Артефакты", icon: Gem },
];

const elementOptions = [
  ["", "Все элементы"], ["none", "Без элемента"], ["anemo", "Анемо"], ["geo", "Гео"], ["electro", "Электро"],
  ["dendro", "Дендро"], ["hydro", "Гидро"], ["pyro", "Пиро"], ["cryo", "Крио"],
];

const weaponOptions = [
  ["", "Все типы оружия"], ["sword", "Одноручное"], ["claymore", "Двуручное"],
  ["polearm", "Копьё"], ["bow", "Лук"], ["catalyst", "Катализатор"],
];

const elementColors: Record<string, string> = {
  anemo: "border-[#5bbcac] text-[#84ded0] bg-[#10201f]",
  geo: "border-[#b98b35] text-[#e5bd61] bg-[#211a0e]",
  electro: "border-[#8e6bc5] text-[#c4a2f1] bg-[#1b1426]",
  dendro: "border-[#7a9d38] text-[#b1d766] bg-[#17200f]",
  hydro: "border-[#4f89c7] text-[#86b9ed] bg-[#101a27]",
  pyro: "border-[#b65d43] text-[#ed9277] bg-[#25130f]",
  cryo: "border-[#75aeba] text-[#a9dde4] bg-[#112024]",
};

async function requestJSON<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "include", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    let detail = "Не удалось загрузить данные Genshin Impact";
    try {
      const body = await response.json() as { detail?: string };
      detail = body.detail ?? detail;
    } catch { /* response without JSON */ }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export function GenshinImpactCatalog() {
  const [section, setSection] = useState<Section>("characters");
  const [contentCategory, setContentCategory] = useState("");
  const [locale, setLocale] = useState<Locale>("ru_RU");
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

  const endpoint = useMemo(() => {
    const params = new URLSearchParams({ locale, limit: "24" });
    if (query.trim()) params.set("q", query.trim());
    if (rarity && section !== "talents" && section !== "content") params.set("rarity", rarity);
    if (section === "characters" && element) params.set("element", element);
    if ((section === "characters" || section === "weapons") && weaponType) params.set("weaponType", weaponType);
    const path = section === "content" ? `content/${encodeURIComponent(contentCategory)}` : section;
    return `/genshin-impact/v1/${path}?${params}`;
  }, [contentCategory, element, locale, query, rarity, section, weaponType]);

  const load = useCallback(async () => {
    setLoading(true); setError(""); setItems([]); setNextCursor("");
    try {
      const [catalogStatus, page] = await Promise.all([
        requestJSON<CatalogStatus>("/genshin-impact/v1/status"),
        requestJSON<CatalogPage<CatalogItem>>(endpoint),
      ]);
      setStatus(catalogStatus); setItems(page.data); setHasMore(page.pagination.hasMore);
      setNextCursor(page.pagination.nextCursor ?? "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить каталог");
    } finally { setLoading(false); }
  }, [endpoint]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, query ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, revision, query]);

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
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить следующую страницу");
    } finally { setLoadingMore(false); }
  }

  return <div className="flex flex-col gap-5">
    <section className="relative overflow-hidden border border-[#2d3341] bg-[#10141c]">
      <ElementRail />
      <div className="grid gap-8 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-[9px] uppercase tracking-[.18em] text-[#8f9bad]"><BookOpen className="size-3.5 text-[#c9a24f]" />Локальная энциклопедия</div>
          <h2 className="mt-3 font-[var(--display)] text-2xl font-semibold tracking-tight text-[#edf0f5] sm:text-3xl">Genshin Impact</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#8792a5]">Полный двуязычный каталог источника: персонажи, таланты, оружие, артефакты, еда, материалы, противники, подземелья, TCG и другие записи. Изображения хранятся на сервере Gildra.</p>
        </div>
        <div className="grid grid-cols-2 gap-px border border-[#2b3240] bg-[#2b3240] sm:grid-cols-3 lg:grid-cols-6 lg:min-w-[620px]">
          <Metric label="Персонажи" value={status?.characters ?? 0} />
          <Metric label="Таланты" value={status?.talents ?? 0} />
          <Metric label="Оружие" value={status?.weapons ?? 0} />
          <Metric label="Наборы" value={status?.artifactSets ?? 0} />
          <Metric label="Все записи" value={status?.contentEntries ?? 0} />
          <Metric label="Медиа" value={status?.mediaAssets ?? 0} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[#29303c] bg-[#0c1017] px-5 py-3 text-[10px] text-[#69758a] sm:px-7">
        <span className={status?.ready ? "text-[#78c395]" : "text-[#d1a451]"}>{status?.ready ? "Опубликованная версия доступна" : "Ожидается первый импорт"}</span>
        <span>Версия игры: <strong className="font-medium text-[#aeb7c7]">{status?.gameVersion || "—"}</strong></span>
        <span>Источник: <strong className="font-mono font-medium text-[#aeb7c7]">{status?.sourceRevision?.slice(0, 12) || "—"}</strong></span>
        <span className="ml-auto">{status?.publishedAt ? new Date(status.publishedAt).toLocaleString(locale === "ru_RU" ? "ru-RU" : "en-US") : "Релиз ещё не опубликован"}</span>
      </div>
    </section>

    <section className="border border-[#2d3341] bg-[#11151d]">
      <div className="flex flex-col gap-4 border-b border-[#2b313e] p-4 sm:p-5 xl:flex-row xl:items-center">
        <div className="flex min-w-0 flex-1 overflow-x-auto" role="tablist" aria-label="Раздел каталога">
          {sectionOptions.map((option) => <button key={option.id} type="button" role="tab" aria-selected={section === option.id} onClick={() => switchSection(option.id)} className={cn("flex h-10 shrink-0 items-center gap-2 border-b-2 px-4 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c9a24f]", section === option.id ? "border-[#d1aa53] bg-[#191a1b] text-[#e6c778]" : "border-transparent text-[#7f899d] hover:bg-[#151a23] hover:text-[#d5dbe5]")}><option.icon className="size-3.5" />{option.label}</button>)}
          <label className={cn("flex h-10 shrink-0 items-center border-b-2 px-3 text-xs", section === "content" ? "border-[#d1aa53] bg-[#191a1b] text-[#e6c778]" : "border-transparent text-[#7f899d]")}><span className="sr-only">Все разделы данных</span><select value={section === "content" ? contentCategory : ""} onChange={(event) => { const value = event.target.value; if (value) { setLoading(true); setItems([]); setContentCategory(value); setSection("content"); setRarity(""); setElement(""); setWeaponType(""); } }} className="max-w-52 bg-transparent text-xs outline-none"><option value="">Все разделы данных</option>{Object.entries(status?.contentByCategory ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([category, count]) => <option key={category} value={category}>{contentCategoryLabel(category)} ({count.toLocaleString("ru-RU")})</option>)}</select></label>
        </div>
        <div className="flex items-center gap-2">
          <Languages className="size-4 text-[#7d889b]" />
          <button type="button" onClick={() => setLocale("ru_RU")} className={cn("h-8 border px-3 text-[10px] font-semibold", locale === "ru_RU" ? "border-[#8e7540] bg-[#211d13] text-[#e0be6a]" : "border-[#303746] text-[#778297]")}>RU</button>
          <button type="button" onClick={() => setLocale("en_US")} className={cn("h-8 border px-3 text-[10px] font-semibold", locale === "en_US" ? "border-[#8e7540] bg-[#211d13] text-[#e0be6a]" : "border-[#303746] text-[#778297]")}>EN</button>
          <Button type="button" variant="outline" onClick={() => setRevision((value) => value + 1)} disabled={loading} className="ml-1 size-8 rounded-none border-[#303746] bg-[#0c1017] p-0 text-[#8994a6] hover:border-[#8e7540] hover:text-[#e0be6a]" aria-label="Обновить каталог"><RefreshCw className={cn("size-3.5", loading && "animate-spin")} /></Button>
        </div>
      </div>

      <div className="grid gap-3 border-b border-[#2b313e] bg-[#0d1118] p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-[minmax(260px,1fr)_170px_190px_210px]">
        <label className="relative"><span className="sr-only">Поиск</span><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#657185]" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={section === "characters" ? "Найти персонажа" : section === "talents" ? "Найти талант или героя" : section === "weapons" ? "Найти оружие" : section === "artifact-sets" ? "Найти набор" : "Найти запись"} className="h-10 rounded-none border-[#303746] bg-[#090d13] pl-9 text-xs placeholder:text-[#566175] focus-visible:border-[#9b8148]" /></label>
        {section !== "talents" && section !== "content" ? <FilterSelect label="Редкость" value={rarity} onChange={setRarity} options={[["", "Любая редкость"], ["5", "5 звёзд"], ["4", "4 звезды"], ...(section === "weapons" ? [["3", "3 звезды"], ["2", "2 звезды"], ["1", "1 звезда"]] : [])]} /> : <div className="hidden sm:block" />}
        {section === "characters" ? <FilterSelect label="Элемент" value={element} onChange={setElement} options={elementOptions} /> : <div className="hidden xl:block" />}
        {section === "characters" || section === "weapons" ? <FilterSelect label="Тип оружия" value={weaponType} onChange={setWeaponType} options={weaponOptions} /> : <div className="hidden xl:block" />}
      </div>

      {error ? <div className="m-4 flex items-start gap-3 border border-[#693b3e] bg-[#211215] p-4 text-sm text-[#eba0a3] sm:m-5"><CircleAlert className="mt-0.5 size-4 shrink-0" /><div><strong className="block font-semibold">Каталог не загрузился</strong><span className="mt-1 block text-xs text-[#ad858d]">{error}</span></div></div> : null}

      <div className="p-4 sm:p-5">
        {loading ? <CatalogSkeleton /> : items.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{items.map((item) => <CatalogCard key={`${section}-${item.id}`} section={section} item={item} />)}</div> : <EmptyCatalog ready={status?.ready ?? false} query={query} />}
        {hasMore ? <div className="mt-5 flex justify-center border-t border-[#29303c] pt-5"><Button type="button" variant="outline" onClick={() => void loadMore()} disabled={loadingMore} className="rounded-none border-[#49422f] bg-[#15140f] px-6 text-xs text-[#d5b35f] hover:border-[#8e7540] hover:bg-[#1d1a11]">{loadingMore ? <RefreshCw className="size-3.5 animate-spin" /> : <ChevronRight className="size-3.5" />}Показать ещё</Button></div> : null}
      </div>
    </section>
  </div>;
}

function ElementRail() {
  return <div className="grid h-1 grid-cols-7" aria-hidden="true"><span className="bg-[#62c6b4]" /><span className="bg-[#d0a743]" /><span className="bg-[#9874cf]" /><span className="bg-[#86a943]" /><span className="bg-[#5b94d1]" /><span className="bg-[#ca684c]" /><span className="bg-[#83bdc7]" /></div>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="bg-[#0c1017] px-3 py-3"><div className="text-[8px] uppercase tracking-[.12em] text-[#667185]">{label}</div><div className="mt-1 font-[var(--display)] text-lg font-semibold tabular-nums text-[#dce1e9]">{value.toLocaleString("ru-RU")}</div></div>;
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  return <label><span className="sr-only">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full border border-[#303746] bg-[#090d13] px-3 text-xs text-[#abb4c3] outline-none focus:border-[#9b8148]">{options.map(([id, text]) => <option key={`${label}-${id}`} value={id}>{text}</option>)}</select></label>;
}

function CatalogCard({ section, item }: { section: Section; item: CatalogItem }) {
  const imageURL = "portraitUrl" in item ? item.portraitUrl ?? item.iconUrl : item.iconUrl ?? ("media" in item ? item.media.find((media) => media.url)?.url ?? null : null);
  const rarityValue = "rarity" in item ? item.rarity : "maxRarity" in item ? item.maxRarity : 0;
  return <article className="group flex min-h-64 flex-col overflow-hidden border border-[#2b323f] bg-[#0d1118] transition-colors hover:border-[#6e603e]">
    <div className="relative grid h-40 place-items-center overflow-hidden border-b border-[#28303d] bg-[radial-gradient(circle_at_50%_35%,rgba(201,162,79,.12),transparent_52%),linear-gradient(135deg,#111721,#090d13)]">
      {imageURL ? <img src={imageURL} alt="" className="h-full w-full object-contain p-3 transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none" loading="lazy" /> : <ImageIcon className="size-8 text-[#3f4a5d]" strokeWidth={1.25} />}
      {rarityValue ? <div className="absolute left-3 top-3 flex gap-0.5 text-[#d9b65e]" aria-label={`${rarityValue} звёзд`}>{Array.from({ length: rarityValue }, (_, index) => <span key={index} className="text-[10px]">★</span>)}</div> : null}
      {"element" in item ? <span className={cn("absolute right-3 top-3 border px-2 py-1 text-[8px] font-semibold uppercase tracking-[.12em]", elementColors[item.element] ?? "border-[#394151] text-[#9ca6b8]")}>{elementLabel(item.element)}</span> : null}
    </div>
    <div className="flex flex-1 flex-col p-4">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-[var(--display)] text-base font-semibold text-[#e2e6ed]">{item.name}</h3>{"title" in item && item.title ? <p className="mt-1 truncate text-[10px] text-[#7a8599]">{item.title}</p> : null}</div>{item.localeFallback ? <span className="shrink-0 border border-[#51452e] px-1.5 py-0.5 text-[8px] text-[#c3a258]">EN</span> : null}</div>
      <div className="mt-4 grid grid-cols-2 gap-px border border-[#262d39] bg-[#262d39] text-[9px]">
        {section === "characters" ? <CharacterFacts item={item as Character} /> : section === "talents" ? <TalentFacts item={item as Talent} /> : section === "weapons" ? <WeaponFacts item={item as Weapon} /> : section === "artifact-sets" ? <ArtifactFacts item={item as ArtifactSet} /> : <ContentFacts item={item as Content} />}
      </div>
      {section === "artifact-sets" ? <div className="mt-3 line-clamp-3 text-[10px] leading-4 text-[#7d899b]">{(item as ArtifactSet).twoPieceBonus || "Бонус комплекта появится после импорта локализации."}</div> : null}
      {section === "talents" ? <div className="mt-3 line-clamp-4 text-[10px] leading-4 text-[#7d899b]">{(item as Talent).description}</div> : null}
      {section === "content" ? <ContentDetails item={item as Content} /> : null}
    </div>
  </article>;
}

function CharacterFacts({ item }: { item: Character }) {
  return <><Fact label="Оружие" value={weaponLabel(item.weaponType)} /><Fact label="Таланты" value={String(item.talentCount)} /><Fact label="Регион" value={item.region || "—"} /><Fact label="ID" value={String(item.externalId)} mono /></>;
}

function TalentFacts({ item }: { item: Talent }) {
  return <><Fact label="Персонаж" value={item.characterName} /><Fact label="Тип" value={talentKindLabel(item.kind)} /><Fact label="Ключ" value={item.externalKey} mono /><Fact label="ID" value={String(item.id)} mono /></>;
}

function WeaponFacts({ item }: { item: Weapon }) {
  return <><Fact label="Тип" value={weaponLabel(item.weaponType)} /><Fact label="Атака" value={item.baseAttack == null ? "—" : String(item.baseAttack)} /><Fact label="Доп. стат" value={item.secondaryStat || "—"} /><Fact label="ID" value={String(item.externalId)} mono /></>;
}

function ArtifactFacts({ item }: { item: ArtifactSet }) {
  return <><Fact label="Предметов" value={String(item.pieceCount)} /><Fact label="Редкость" value={`${item.minRarity}–${item.maxRarity}`} /></>;
}

function ContentFacts({ item }: { item: Content }) {
  const media = item.media ?? [];
  return <><Fact label="Раздел" value={contentCategoryLabel(item.category)} /><Fact label="ID" value={item.externalId == null ? "—" : String(item.externalId)} mono /><Fact label="Медиа" value={media.length ? String(media.length) : "—"} /><Fact label="Ключ" value={item.slug} mono /></>;
}

function ContentDetails({ item }: { item: Content }) {
  const media = item.media ?? [];
  return <div className="mt-3">
    <div className="line-clamp-4 whitespace-pre-line text-[10px] leading-4 text-[#7d899b]">{item.description || "Полное содержимое доступно в исходном JSON ниже."}</div>
    {media.length ? <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Изображения записи">{media.map((media) => media.url ? <img key={`${media.role}-${media.filename}`} src={media.url} alt={media.role} title={media.filename} className="size-12 shrink-0 rounded-sm border border-[#2b323f] bg-[#090d13] object-contain p-1" loading="lazy" /> : null)}</div> : null}
    <details className="mt-3 border border-[#2b323f] bg-[#0a0e14]">
      <summary className="cursor-pointer px-3 py-2 text-[10px] text-[#c9a24f]">Показать полный JSON</summary>
      <div className="border-t border-[#2b323f] p-3">
        <div className="mb-2 text-[9px] uppercase tracking-[.12em] text-[#68758a]">Локализованные данные</div>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words font-mono text-[9px] leading-4 text-[#aeb7c7]">{JSON.stringify(item.localizedPayload, null, 2)}</pre>
        <div className="mb-2 mt-4 text-[9px] uppercase tracking-[.12em] text-[#68758a]">Исходные данные</div>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words font-mono text-[9px] leading-4 text-[#aeb7c7]">{JSON.stringify(item.sourcePayload, null, 2)}</pre>
      </div>
    </details>
  </div>;
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="min-w-0 bg-[#10151d] px-2.5 py-2"><div className="uppercase tracking-[.1em] text-[#5f6a7d]">{label}</div><div className={cn("mt-1 truncate text-[10px] text-[#adb5c4]", mono && "font-mono")}>{value}</div></div>;
}

function CatalogSkeleton() {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" aria-label="Загрузка каталога">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-72 animate-pulse border border-[#28303d] bg-[linear-gradient(110deg,#0d1118_25%,#151b25_42%,#0d1118_58%)] bg-[length:200%_100%] motion-reduce:animate-none" />)}</div>;
}

function EmptyCatalog({ ready, query }: { ready: boolean; query: string }) {
  return <div className="grid min-h-64 place-items-center border border-dashed border-[#303847] bg-[#0c1017] px-5 text-center"><div className="max-w-md"><Box className="mx-auto size-8 text-[#536075]" strokeWidth={1.3} /><h3 className="mt-4 font-[var(--display)] text-lg font-semibold text-[#cfd5df]">{query ? "Ничего не найдено" : ready ? "В этом разделе пока нет записей" : "База готова к первому импорту"}</h3><p className="mt-2 text-xs leading-5 text-[#738095]">{query ? "Измените запрос или сбросьте фильтры." : ready ? "Опубликованный релиз не содержит выбранный тип данных." : "Структура PostgreSQL и API уже подключены. Здесь появятся данные после загрузки первого проверенного релиза."}</p></div></div>;
}

function elementLabel(value: string) {
  return ({ none: "Без элемента", anemo: "Анемо", geo: "Гео", electro: "Электро", dendro: "Дендро", hydro: "Гидро", pyro: "Пиро", cryo: "Крио" } as Record<string, string>)[value] ?? value;
}

function talentKindLabel(value: string) {
  return ({ normal_attack: "Обычная атака", elemental_skill: "Элементальный навык", elemental_burst: "Взрыв стихии", alternate_sprint: "Особое движение", passive: "Пассивный" } as Record<string, string>)[value] ?? value;
}

function weaponLabel(value: string) {
  return ({ sword: "Одноручное", claymore: "Двуручное", polearm: "Копьё", bow: "Лук", catalyst: "Катализатор" } as Record<string, string>)[value] ?? value;
}

function contentCategoryLabel(value: string) {
  const labels: Record<string, string> = {
    achievementgroups: "Группы достижений", achievements: "Достижения", adventureranks: "Ранги приключений",
    animals: "Животные", artifacts: "Артефакты", characters: "Персонажи (полные данные)", constellations: "Созвездия",
    crafts: "Рецепты создания", domains: "Подземелья", elements: "Элементы", emojis: "Эмодзи", enemies: "Противники",
    foods: "Еда", geographies: "Локации", materials: "Материалы", namecards: "Именные карты", outfits: "Костюмы",
    rarity: "Редкость", talentmaterialtypes: "Материалы талантов", talents: "Данные талантов", tcgactioncards: "Карты действий TCG",
    tcgcardbacks: "Рубашки карт TCG", tcgcardboxes: "Столы TCG", tcgcharactercards: "Карты персонажей TCG",
    tcgdetailedrules: "Правила TCG", tcgenemycards: "Карты противников TCG", tcgkeywords: "Ключевые слова TCG",
    tcglevelrewards: "Награды уровней TCG", tcgstatuseffects: "Эффекты состояний TCG", tcgsummons: "Призываемые сущности TCG",
    voiceovers: "Озвучка", weaponmaterialtypes: "Материалы оружия", weapons: "Оружие (полные данные)", windgliders: "Планеры",
    events: "События и баннеры",
  };
  return labels[value] ?? value;
}
