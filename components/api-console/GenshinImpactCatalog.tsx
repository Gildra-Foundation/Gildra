"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen, Box, ChevronRight, CircleAlert, Gem, ImageIcon, Languages,
  Maximize2, RefreshCw, Search, Sparkles, Swords, X,
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

type CharacterDetail = Character & {
  description: string;
  stats?: CharacterStats | null;
  ascensionCosts: UpgradeCostStage[];
  talents: Talent[];
  constellations: Constellation[];
};

type CharacterStats = {
  base: { hp: number; attack: number; defense: number; critRate: number; critDamage: number };
  curve: Record<string, string>;
  promotion: CharacterPromotion[];
  specialized: string;
};

type CharacterPromotion = {
  hp: number; attack: number; defense: number; maxLevel: number; specialized: number;
};

type UpgradeCostItem = {
  id: number; name: string; count: number; iconUrl?: string | null;
  locale?: Locale; localeFallback?: boolean;
};

type UpgradeCostStage = { key: string; stage: number; maxLevel?: number; items: UpgradeCostItem[] };

type Weapon = {
  id: number; externalId: number; slug: string; name: string; rarity: number;
  weaponType: string; baseAttack: number | null; secondaryStat: string;
  secondaryStatValue: number | null; iconUrl: string | null; locale: Locale;
  localeFallback: boolean; description?: string; passiveName?: string; passiveDescription?: string;
};

type WeaponDetail = Weapon & {
  description: string; passiveName: string; passiveDescription: string;
  stats?: WeaponStats | null;
  refinements: WeaponRefinement[]; ascensionCosts: UpgradeCostStage[];
};

type WeaponRefinement = { level: number; values: string[]; description: string };
type WeaponStats = {
  base: { attack: number; specialized: number };
  curve: Record<string, string>;
  promotion: WeaponPromotion[];
  specialized: string;
};
type WeaponPromotion = { attack: number; maxLevel: number };

type ArtifactSet = {
  id: number; externalId: number; slug: string; name: string; minRarity: number;
  maxRarity: number; twoPieceBonus: string; fourPieceBonus: string;
  iconUrl: string | null; locale: Locale; localeFallback: boolean; pieceCount: number;
};

type ArtifactPiece = {
  id: number; slot: string; name: string; description: string; iconUrl: string | null;
  locale: Locale; localeFallback: boolean;
};

type ArtifactSource = {
  slug: string; name: string; region: string; entranceName: string;
  unlockRank: number; recommendedLevel: number;
};

type ArtifactDetail = ArtifactSet & { pieces: ArtifactPiece[]; sources: ArtifactSource[] };

type Talent = {
  id: number; characterSlug: string; characterName: string; externalKey: string;
  kind: string; displayOrder: number; name: string; description: string;
  iconUrl: string | null; locale: Locale; localeFallback: boolean;
};

type Constellation = {
  id: number; characterSlug: string; externalKey: string; position: number;
  name: string; description: string; iconUrl: string | null; locale: Locale;
  localeFallback: boolean;
};

type ImagePreview = { url: string; label: string };

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
        if (!cancelled) setCharacterDetailError(reason instanceof Error ? reason.message : "Не удалось загрузить профиль персонажа");
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
        if (!cancelled) setWeaponDetailError(reason instanceof Error ? reason.message : "Не удалось загрузить профиль оружия");
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
        if (!cancelled) setArtifactDetailError(reason instanceof Error ? reason.message : "Не удалось загрузить профиль набора");
      })
      .finally(() => { if (!cancelled) setArtifactDetailLoading(false); });
    return () => { cancelled = true; };
  }, [locale, selectedArtifact]);

  useEffect(() => {
    if (!selectedCharacter && !selectedWeapon && !selectedArtifact && !imagePreview) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (imagePreview) setImagePreview(null);
        else if (selectedCharacter) setSelectedCharacter(null);
        else if (selectedWeapon) setSelectedWeapon(null);
        else setSelectedArtifact(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [imagePreview, selectedArtifact, selectedCharacter, selectedWeapon]);

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
          <div className="flex items-center gap-2 text-[9px] uppercase tracking-[.18em] text-[#8f9bad]"><BookOpen className="size-3.5 text-[#c9a24f]" />Локальная энциклопедия</div>
          <h2 className="mt-3 font-[var(--display)] text-2xl font-semibold tracking-tight text-[#edf0f5] sm:text-3xl">Genshin Impact</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#8792a5]">Полный двуязычный каталог источника: персонажи, таланты, оружие, артефакты, еда, материалы, противники, подземелья, задания, интерактивные карты, TCG и другие записи. Изображения хранятся на сервере Gildra.</p>
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
        {loading ? <CatalogSkeleton /> : items.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{items.map((item) => <CatalogCard key={`${section}-${item.id}`} section={section} item={item} onOpenCharacter={openCharacter} onOpenWeapon={openWeapon} onOpenArtifact={openArtifact} onOpenImage={setImagePreview} />)}</div> : <EmptyCatalog ready={status?.ready ?? false} query={query} />}
        {hasMore ? <div className="mt-5 flex justify-center border-t border-[#29303c] pt-5"><Button type="button" variant="outline" onClick={() => void loadMore()} disabled={loadingMore} className="rounded-none border-[#49422f] bg-[#15140f] px-6 text-xs text-[#d5b35f] hover:border-[#8e7540] hover:bg-[#1d1a11]">{loadingMore ? <RefreshCw className="size-3.5 animate-spin" /> : <ChevronRight className="size-3.5" />}Показать ещё</Button></div> : null}
      </div>
    </section>
    <CharacterDialog character={selectedCharacter} detail={characterDetail} loading={characterDetailLoading} error={characterDetailError} onClose={() => setSelectedCharacter(null)} onOpenImage={setImagePreview} />
    <WeaponDialog weapon={selectedWeapon} detail={weaponDetail} loading={weaponDetailLoading} error={weaponDetailError} onClose={() => setSelectedWeapon(null)} onOpenImage={setImagePreview} />
    <ArtifactDialog artifact={selectedArtifact} detail={artifactDetail} loading={artifactDetailLoading} error={artifactDetailError} onClose={() => setSelectedArtifact(null)} onOpenImage={setImagePreview} />
    <ImageLightbox preview={imagePreview} onClose={() => setImagePreview(null)} />
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

function CatalogCard({ section, item, onOpenCharacter, onOpenWeapon, onOpenArtifact, onOpenImage }: {
  section: Section;
  item: CatalogItem;
  onOpenCharacter: (character: Character) => void;
  onOpenWeapon: (weapon: Weapon) => void;
  onOpenArtifact: (artifact: ArtifactSet) => void;
  onOpenImage: (preview: ImagePreview) => void;
}) {
  const imageURL = "portraitUrl" in item ? item.portraitUrl ?? item.iconUrl : item.iconUrl ?? ("media" in item ? item.media.find((media) => media.url)?.url ?? null : null);
  const rarityValue = "rarity" in item ? item.rarity : "maxRarity" in item ? item.maxRarity : 0;
  const interactive = section === "characters" || section === "weapons" || section === "artifact-sets";
  const character = section === "characters" ? item as Character : null;
  const weapon = section === "weapons" ? item as Weapon : null;
  const artifact = section === "artifact-sets" ? item as ArtifactSet : null;
  const activate = () => {
    if (character) onOpenCharacter(character);
    else if (weapon) onOpenWeapon(weapon);
    else if (artifact) onOpenArtifact(artifact);
  };
  return <article
    className={cn("group flex min-h-64 flex-col overflow-hidden border border-[#2b323f] bg-[#0d1118] transition-colors hover:border-[#6e603e]", interactive && "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d1aa53]")}
    onClick={interactive ? activate : undefined}
    onKeyDown={interactive ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); } } : undefined}
    role={interactive ? "button" : undefined}
    tabIndex={interactive ? 0 : undefined}
    aria-label={interactive ? `Открыть профиль: ${item.name}` : undefined}
  >
    <div className="relative grid h-48 place-items-center overflow-hidden border-b border-[#28303d] bg-[radial-gradient(circle_at_50%_35%,rgba(201,162,79,.12),transparent_52%),linear-gradient(135deg,#111721,#090d13)] sm:h-52">
      {imageURL ? <button type="button" className="relative grid h-full w-full place-items-center cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#e6c77a]" onClick={(event) => { event.stopPropagation(); onOpenImage({ url: imageURL, label: item.name }); }} aria-label={`Открыть изображение: ${item.name}`}>
        <img src={imageURL} alt="" className="h-full w-full object-contain p-3 transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none" loading="lazy" />
        <span className="absolute bottom-2 right-2 grid size-7 place-items-center border border-[#5b4c2b] bg-[#0a0d13]/85 text-[#d9b65e] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" aria-hidden="true"><Maximize2 className="size-3.5" /></span>
      </button> : <ImageIcon className="size-8 text-[#3f4a5d]" strokeWidth={1.25} />}
      {rarityValue ? <div className="absolute left-3 top-3 flex gap-0.5 text-[#d9b65e]" aria-label={`${rarityValue} звёзд`}>{Array.from({ length: rarityValue }, (_, index) => <span key={index} className="text-[10px]">★</span>)}</div> : null}
      {"element" in item ? <span className={cn("absolute right-3 top-3 border px-2 py-1 text-[8px] font-semibold uppercase tracking-[.12em]", elementColors[item.element] ?? "border-[#394151] text-[#9ca6b8]")}>{elementLabel(item.element)}</span> : null}
    </div>
    <div className="flex flex-1 flex-col p-4">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-[var(--display)] text-base font-semibold text-[#e2e6ed]">{item.name}</h3>{"title" in item && item.title ? <p className="mt-1 truncate text-[10px] text-[#7a8599]">{item.title}</p> : null}</div>{item.localeFallback ? <span className="shrink-0 border border-[#51452e] px-1.5 py-0.5 text-[8px] text-[#c3a258]">EN</span> : null}</div>
      <div className="mt-4 grid grid-cols-2 gap-px border border-[#262d39] bg-[#262d39] text-[9px]">
        {section === "characters" ? <CharacterFacts item={item as Character} /> : section === "talents" ? <TalentFacts item={item as Talent} /> : section === "weapons" ? <WeaponFacts item={item as Weapon} /> : section === "artifact-sets" ? <ArtifactFacts item={item as ArtifactSet} /> : <ContentFacts item={item as Content} />}
      </div>
      {section === "artifact-sets" ? <ArtifactEffectsPreview item={item as ArtifactSet} /> : null}
      {section === "weapons" ? <WeaponEffectPreview item={item as Weapon} /> : null}
      {section === "talents" ? <div className="mt-3 line-clamp-4 text-[10px] leading-4 text-[#7d899b]">{(item as Talent).description}</div> : null}
      {section === "content" ? <ContentDetails item={item as Content} /> : null}
      {interactive ? <div className="mt-auto flex items-center justify-between gap-3 border-t border-[#262d39] pt-3 text-[9px] uppercase tracking-[.12em] text-[#8e7540]"><span>Открыть профиль</span><ChevronRight className="size-3.5" /></div> : null}
    </div>
  </article>;
}

function ArtifactEffectsPreview({ item }: { item: ArtifactSet }) {
  return <div className="mt-3 space-y-2 text-[10px] leading-4 text-[#8995a8]">
    <div><span className="mr-1 uppercase tracking-[.08em] text-[#c9a24f]">2 предмета</span>{item.twoPieceBonus || "Бонус не указан."}</div>
    <div><span className="mr-1 uppercase tracking-[.08em] text-[#c9a24f]">4 предмета</span>{item.fourPieceBonus || "Бонус не указан."}</div>
  </div>;
}

function WeaponEffectPreview({ item }: { item: Weapon }) {
  const description = item.passiveDescription?.replace(/\{\d+\}/g, "…") ?? "";
  return item.passiveName || description ? <div className="mt-3 line-clamp-4 text-[10px] leading-4 text-[#8995a8]"><span className="mr-1 uppercase tracking-[.08em] text-[#c9a24f]">{item.passiveName || "Пассивный эффект"}</span>{description || "Описание эффекта отсутствует."}</div> : null;
}

function CharacterDialog({ character, detail, loading, error, onClose, onOpenImage }: {
  character: Character | null;
  detail: CharacterDetail | null;
  loading: boolean;
  error: string;
  onClose: () => void;
  onOpenImage: (preview: ImagePreview) => void;
}) {
  if (!character) return null;
  const profile = detail ?? character;
  const imageURL = profile.portraitUrl ?? profile.iconUrl;
  return <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-[#05070b]/85 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-labelledby="genshin-character-dialog-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="my-auto flex max-h-[calc(100vh-1.5rem)] w-full max-w-6xl flex-col overflow-hidden border border-[#4b4029] bg-[#0d1118] shadow-[0_28px_90px_rgba(0,0,0,.65)] sm:max-h-[calc(100vh-3rem)]">
      <div className="flex items-start justify-between gap-4 border-b border-[#2b313e] bg-[#11151d] px-4 py-4 sm:px-6">
        <div className="min-w-0"><div className="text-[9px] uppercase tracking-[.18em] text-[#c9a24f]">Профиль персонажа</div><h2 id="genshin-character-dialog-title" className="mt-1 truncate font-[var(--display)] text-xl font-semibold text-[#edf0f5] sm:text-2xl">{profile.name}</h2><p className="mt-1 text-xs text-[#8290a4]">{profile.title || profile.region || "Genshin Impact"}</p></div>
        <button type="button" onClick={onClose} className="grid size-9 shrink-0 place-items-center border border-[#343b4a] text-[#9da7b7] transition-colors hover:border-[#8e7540] hover:text-[#e6c778]" aria-label="Закрыть профиль"><X className="size-4" /></button>
      </div>
      <div className="min-h-0 overflow-y-auto">
        <div className="grid gap-5 border-b border-[#2b313e] bg-[radial-gradient(circle_at_18%_18%,rgba(201,162,79,.1),transparent_35%),#0b0f16] p-4 sm:grid-cols-[220px_minmax(0,1fr)] sm:p-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="relative flex min-h-64 items-center justify-center overflow-hidden border border-[#343c4b] bg-[linear-gradient(145deg,#161d29,#090d13)] sm:min-h-80">
            {imageURL ? <button type="button" className="relative h-full min-h-64 w-full cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#e6c77a]" onClick={() => onOpenImage({ url: imageURL, label: profile.name })} aria-label={`Открыть изображение: ${profile.name}`}><img src={imageURL} alt={profile.name} className="h-full max-h-[28rem] w-full object-contain p-3" /><span className="absolute bottom-3 right-3 grid size-8 place-items-center border border-[#5b4c2b] bg-[#0a0d13]/85 text-[#d9b65e]"><Maximize2 className="size-4" /></span></button> : <ImageIcon className="size-10 text-[#4c586b]" strokeWidth={1.2} />}
          </div>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Stars count={profile.rarity} /><span className={cn("border px-2 py-1 text-[9px] font-semibold uppercase tracking-[.1em]", elementColors[profile.element] ?? "border-[#394151] text-[#9ca6b8]")}>{elementLabel(profile.element)}</span><span className="border border-[#343c4b] px-2 py-1 text-[9px] text-[#aeb7c7]">{weaponLabel(profile.weaponType)}</span></div><p className="mt-5 max-w-3xl whitespace-pre-line text-sm leading-6 text-[#b0bac9]">{detail?.description || "Описание персонажа загружается вместе с профилем."}</p><div className="mt-6 grid grid-cols-2 gap-px border border-[#2b3340] bg-[#2b3340] sm:grid-cols-4"><Fact label="Регион" value={profile.region || "—"} /><Fact label="Таланты" value={String(profile.talentCount)} /><Fact label="ID" value={String(profile.externalId)} mono /><Fact label="Язык" value={profile.locale === "ru_RU" ? "Русский" : "English"} /></div></div>
        </div>
        {loading ? <div className="grid min-h-56 place-items-center p-6"><RefreshCw className="size-6 animate-spin text-[#c9a24f]" /><span className="sr-only">Загрузка профиля</span></div> : error ? <div className="m-4 border border-[#693b3e] bg-[#211215] p-4 text-sm text-[#eba0a3] sm:m-6">{error}</div> : <div className="space-y-8 p-4 sm:p-6"><CharacterProgression detail={detail} onOpenImage={onOpenImage} /><div className="grid gap-8 lg:grid-cols-2 lg:gap-10"><CharacterTalentList talents={detail?.talents ?? []} onOpenImage={onOpenImage} /><CharacterConstellationList constellations={detail?.constellations ?? []} onOpenImage={onOpenImage} /></div></div>}
      </div>
    </div>
  </div>;
}

function CharacterProgression({ detail, onOpenImage }: { detail: CharacterDetail | null; onOpenImage: (preview: ImagePreview) => void }) {
  if (!detail) return null;
  const stats = detail.stats;
  return <section className="space-y-6" aria-labelledby="genshin-character-progression-title">
    <div className="flex items-end justify-between gap-3 border-b border-[#3a3425] pb-3"><div><div className="text-[9px] uppercase tracking-[.16em] text-[#8e7540]">Развитие персонажа</div><h3 id="genshin-character-progression-title" className="mt-1 font-[var(--display)] text-lg font-semibold text-[#e3e7ee]">Базовые характеристики и возвышение</h3></div><span className="text-[10px] text-[#7d899b]">90 ур.</span></div>
    {stats ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <StatTile label="HP на 1 уровне" value={formatStat(stats.base.hp)} />
      <StatTile label="Атака на 1 уровне" value={formatStat(stats.base.attack)} />
      <StatTile label="Защита на 1 уровне" value={formatStat(stats.base.defense)} />
      <StatTile label="Шанс крит. попадания" value={formatPercent(stats.base.critRate)} />
      <StatTile label="Крит. урон" value={formatPercent(stats.base.critDamage)} />
    </div> : <EmptyDetail text="Базовые характеристики для этой формы персонажа пока не опубликованы в источнике." />}
    {stats?.promotion.length ? <div className="overflow-x-auto border border-[#2b3340] bg-[#0c1017]"><table className="min-w-[680px] w-full text-left text-[10px]"><caption className="border-b border-[#2b3340] px-3 py-2 text-left text-[9px] uppercase tracking-[.12em] text-[#8e7540]">Прирост по возвышениям</caption><thead className="bg-[#111720] text-[#68758a]"><tr><th className="px-3 py-2 font-medium">Макс. уровень</th><th className="px-3 py-2 font-medium">HP</th><th className="px-3 py-2 font-medium">Атака</th><th className="px-3 py-2 font-medium">Защита</th><th className="px-3 py-2 font-medium">Спец. стат</th></tr></thead><tbody>{stats.promotion.map((row, index) => <tr key={`${row.maxLevel}-${index}`} className="border-t border-[#252d3a] text-[#aeb7c7]"><td className="px-3 py-2 font-semibold text-[#d5b35f]">{row.maxLevel}</td><td className="px-3 py-2">{formatStat(row.hp)}</td><td className="px-3 py-2">{formatStat(row.attack)}</td><td className="px-3 py-2">{formatStat(row.defense)}</td><td className="px-3 py-2">{row.specialized ? formatStat(row.specialized) : "—"}</td></tr>)}</tbody></table></div> : null}
    <UpgradeCostList title="Ресурсы для возвышения" stages={detail.ascensionCosts} onOpenImage={onOpenImage} />
  </section>;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return <div className="border border-[#2b3340] bg-[#111720] px-3 py-3"><div className="text-[9px] uppercase tracking-[.08em] text-[#68758a]">{label}</div><div className="mt-2 font-[var(--display)] text-lg font-semibold tabular-nums text-[#dce2eb]">{value}</div></div>;
}

function UpgradeCostList({ title, stages, onOpenImage }: { title: string; stages: UpgradeCostStage[]; onOpenImage: (preview: ImagePreview) => void }) {
  return <section aria-label={title}><div className="flex items-center justify-between border-b border-[#2b3340] pb-2"><h4 className="text-xs font-semibold text-[#dce2eb]">{title}</h4><span className="text-[10px] text-[#778297]">{stages.length} этапов</span></div>{stages.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{stages.map((stage) => <div key={stage.key} className="border border-[#2b3340] bg-[#0f151e] p-3"><div className="flex items-center justify-between text-[9px] uppercase tracking-[.08em] text-[#8e7540]"><span>Этап {stage.stage}</span>{stage.maxLevel ? <span>до {stage.maxLevel} ур.</span> : null}</div><div className="mt-3 space-y-2">{stage.items.map((item, index) => <div key={`${stage.key}-${item.id}-${index}`} className="flex items-center gap-2"><SmallMediaButton url={item.iconUrl ?? null} label={item.name} onOpenImage={onOpenImage} /><span className="min-w-0 flex-1 truncate text-[10px] text-[#aeb7c7]">{item.name || `Материал #${item.id}`}</span><span className="shrink-0 font-mono text-[10px] text-[#d5b35f]">×{item.count.toLocaleString("ru-RU")}</span></div>)}</div></div>)}</div> : <div className="mt-3 border border-dashed border-[#303847] p-4 text-center text-[10px] text-[#738095]">Ресурсы возвышения не указаны.</div>}</section>;
}

function CharacterTalentList({ talents, onOpenImage }: { talents: Talent[]; onOpenImage: (preview: ImagePreview) => void }) {
  return <section aria-labelledby="genshin-character-talents-title"><div className="flex items-end justify-between gap-3 border-b border-[#3a3425] pb-3"><div><div className="text-[9px] uppercase tracking-[.16em] text-[#8e7540]">Боевые навыки</div><h3 id="genshin-character-talents-title" className="mt-1 font-[var(--display)] text-lg font-semibold text-[#e3e7ee]">Таланты</h3></div><span className="text-[10px] tabular-nums text-[#7d899b]">{talents.length}</span></div><div className="mt-4 space-y-3">{talents.length ? talents.map((talent) => <div key={talent.id} className="border border-[#2b3340] bg-[#111720] p-3"><div className="flex gap-3"><SmallMediaButton url={talent.iconUrl} label={talent.name} onOpenImage={onOpenImage} /><div className="min-w-0"><div className="text-[9px] uppercase tracking-[.1em] text-[#8e7540]">{talentKindLabel(talent.kind)}</div><h4 className="mt-1 text-sm font-medium text-[#dce2eb]">{talent.name}</h4><p className="mt-2 whitespace-pre-line text-[11px] leading-5 text-[#8894a7]">{talent.description || "Описание отсутствует."}</p></div></div></div>) : <EmptyDetail text="Для этого персонажа таланты не найдены." />}</div></section>;
}

function CharacterConstellationList({ constellations, onOpenImage }: { constellations: Constellation[]; onOpenImage: (preview: ImagePreview) => void }) {
  return <section aria-labelledby="genshin-character-constellations-title"><div className="flex items-end justify-between gap-3 border-b border-[#3a3425] pb-3"><div><div className="text-[9px] uppercase tracking-[.16em] text-[#8e7540]">Созвездие</div><h3 id="genshin-character-constellations-title" className="mt-1 font-[var(--display)] text-lg font-semibold text-[#e3e7ee]">Созвездия</h3></div><span className="text-[10px] tabular-nums text-[#7d899b]">{constellations.length}/6</span></div><div className="mt-4 space-y-3">{constellations.length ? constellations.map((constellation) => <div key={constellation.id} className="border border-[#2b3340] bg-[#111720] p-3"><div className="flex gap-3"><SmallMediaButton url={constellation.iconUrl} label={constellation.name} onOpenImage={onOpenImage} /><div className="min-w-0"><div className="text-[9px] uppercase tracking-[.1em] text-[#8e7540]">C{constellation.position}</div><h4 className="mt-1 text-sm font-medium text-[#dce2eb]">{constellation.name}</h4><p className="mt-2 whitespace-pre-line text-[11px] leading-5 text-[#8894a7]">{constellation.description || "Описание отсутствует."}</p></div></div></div>) : <EmptyDetail text="Для этого персонажа созвездия не найдены." />}</div></section>;
}

function WeaponDialog({ weapon, detail, loading, error, onClose, onOpenImage }: {
  weapon: Weapon | null; detail: WeaponDetail | null; loading: boolean; error: string;
  onClose: () => void; onOpenImage: (preview: ImagePreview) => void;
}) {
  if (!weapon) return null;
  const profile = detail ?? weapon;
  return <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-[#05070b]/85 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-labelledby="genshin-weapon-dialog-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="my-auto flex max-h-[calc(100vh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden border border-[#4b4029] bg-[#0d1118] shadow-[0_28px_90px_rgba(0,0,0,.65)] sm:max-h-[calc(100vh-3rem)]">
      <DialogHeader eyebrow="Профиль оружия" title={profile.name} subtitle={weaponLabel(profile.weaponType)} onClose={onClose} titleID="genshin-weapon-dialog-title" />
      <div className="min-h-0 overflow-y-auto">
        <div className="grid gap-5 border-b border-[#2b313e] bg-[radial-gradient(circle_at_18%_18%,rgba(201,162,79,.1),transparent_35%),#0b0f16] p-4 sm:grid-cols-[220px_minmax(0,1fr)] sm:p-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="relative flex min-h-56 items-center justify-center overflow-hidden border border-[#343c4b] bg-[linear-gradient(145deg,#161d29,#090d13)] sm:min-h-64">{profile.iconUrl ? <button type="button" className="relative h-full min-h-56 w-full cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#e6c77a]" onClick={() => onOpenImage({ url: profile.iconUrl as string, label: profile.name })} aria-label={`Открыть изображение: ${profile.name}`}><img src={profile.iconUrl} alt={profile.name} className="h-full max-h-80 w-full object-contain p-6" /><span className="absolute bottom-3 right-3 grid size-8 place-items-center border border-[#5b4c2b] bg-[#0a0d13]/85 text-[#d9b65e]"><Maximize2 className="size-4" /></span></button> : <ImageIcon className="size-10 text-[#4c586b]" strokeWidth={1.2} />}</div>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Stars count={profile.rarity} /><span className="border border-[#343c4b] px-2 py-1 text-[9px] text-[#aeb7c7]">{weaponLabel(profile.weaponType)}</span></div><div className="mt-5 grid grid-cols-2 gap-px border border-[#2b3340] bg-[#2b3340] sm:grid-cols-4"><Fact label="Базовая атака" value={profile.baseAttack == null ? "—" : formatStat(profile.baseAttack)} /><Fact label="Доп. стат" value={profile.secondaryStat || "—"} /><Fact label="Значение" value={profile.secondaryStatValue == null ? "—" : formatStat(profile.secondaryStatValue)} /><Fact label="ID" value={String(profile.externalId)} mono /></div><p className="mt-5 whitespace-pre-line text-sm leading-6 text-[#b0bac9]">{detail?.description || "Описание оружия загружается вместе с профилем."}</p></div>
        </div>
        {loading ? <LoadingDetail /> : error ? <DetailError text={error} /> : <div className="space-y-8 p-4 sm:p-6"><WeaponProgression detail={detail} /><WeaponEffect detail={detail} /><WeaponRefinementList refinements={detail?.refinements ?? []} /><UpgradeCostList title="Ресурсы для возвышения" stages={detail?.ascensionCosts ?? []} onOpenImage={onOpenImage} /></div>}
      </div>
    </div>
  </div>;
}

function WeaponProgression({ detail }: { detail: WeaponDetail | null }) {
  if (!detail) return null;
  const stats = detail.stats;
  const maxLevel = stats?.promotion.at(-1)?.maxLevel ?? detail.ascensionCosts.at(-1)?.maxLevel;
  return <section className="space-y-6" aria-labelledby="genshin-weapon-progression-title">
    <div className="flex items-end justify-between gap-3 border-b border-[#3a3425] pb-3"><div><div className="text-[9px] uppercase tracking-[.16em] text-[#8e7540]">Развитие оружия</div><h3 id="genshin-weapon-progression-title" className="mt-1 font-[var(--display)] text-lg font-semibold text-[#e3e7ee]">Базовые характеристики и прокачка</h3></div><span className="text-[10px] text-[#7d899b]">{maxLevel ? `${maxLevel} ур.` : "—"}</span></div>
    {stats ? <>
      <div className="grid gap-3 sm:grid-cols-2"><StatTile label="Базовая атака" value={formatStat(stats.base.attack)} /><StatTile label={detail.secondaryStat || "Доп. характеристика"} value={formatWeaponSpecialized(stats.base.specialized)} /></div>
      {stats.promotion.length ? <div className="overflow-x-auto border border-[#2b3340] bg-[#0c1017]"><table className="min-w-[420px] w-full text-left text-[10px]"><caption className="border-b border-[#2b3340] px-3 py-2 text-left text-[9px] uppercase tracking-[.12em] text-[#8e7540]">Прирост атаки по возвышениям</caption><thead className="bg-[#111720] text-[#68758a]"><tr><th className="px-3 py-2 font-medium">Макс. уровень</th><th className="px-3 py-2 font-medium">Прирост атаки</th></tr></thead><tbody>{stats.promotion.map((row, index) => <tr key={`${row.maxLevel}-${index}`} className="border-t border-[#252d3a] text-[#aeb7c7]"><td className="px-3 py-2 font-semibold text-[#d5b35f]">{row.maxLevel}</td><td className="px-3 py-2">{row.attack ? formatStat(row.attack) : "—"}</td></tr>)}</tbody></table></div> : null}
    </> : <EmptyDetail text="Характеристики и уровни возвышения для этого оружия пока не опубликованы в источнике." />}
  </section>;
}

function WeaponEffect({ detail }: { detail: WeaponDetail | null }) {
  if (!detail?.passiveName && !detail?.passiveDescription) return <EmptyDetail text="Пассивный эффект для этого оружия не указан." />;
  const description = formatEffectDescription(detail.passiveDescription, detail.refinements[0]?.values);
  return <section aria-labelledby="genshin-weapon-effect-title"><div className="text-[9px] uppercase tracking-[.16em] text-[#8e7540]">Уникальный эффект · R1</div><h3 id="genshin-weapon-effect-title" className="mt-1 font-[var(--display)] text-lg font-semibold text-[#e3e7ee]">{detail.passiveName || "Пассивный эффект"}</h3><p className="mt-3 whitespace-pre-line text-sm leading-6 text-[#aeb7c7]">{description || "Описание отсутствует."}</p></section>;
}

function WeaponRefinementList({ refinements }: { refinements: WeaponRefinement[] }) {
  return <section aria-labelledby="genshin-weapon-refinement-title"><div className="flex items-end justify-between gap-3 border-b border-[#3a3425] pb-3"><div><div className="text-[9px] uppercase tracking-[.16em] text-[#8e7540]">Уровни пробуждения</div><h3 id="genshin-weapon-refinement-title" className="mt-1 font-[var(--display)] text-lg font-semibold text-[#e3e7ee]">Эффект по рангам</h3></div><span className="text-[10px] text-[#7d899b]">{refinements.length}/5</span></div>{refinements.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{refinements.map((refinement) => <div key={refinement.level} className="border border-[#2b3340] bg-[#111720] p-3"><div className="flex items-center justify-between"><span className="font-[var(--display)] text-base font-semibold text-[#d5b35f]">R{refinement.level}</span>{refinement.values.length ? <span className="text-[9px] text-[#778297]">{refinement.values.join(" · ")}</span> : null}</div><p className="mt-3 whitespace-pre-line text-[11px] leading-5 text-[#8894a7]">{refinement.description || "Описание отсутствует."}</p></div>)}</div> : <div className="mt-4"><EmptyDetail text="Данные об уровнях пробуждения не указаны." /></div>}</section>;
}

function ArtifactDialog({ artifact, detail, loading, error, onClose, onOpenImage }: {
  artifact: ArtifactSet | null; detail: ArtifactDetail | null; loading: boolean; error: string;
  onClose: () => void; onOpenImage: (preview: ImagePreview) => void;
}) {
  if (!artifact) return null;
  const profile = detail ?? artifact;
  return <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-[#05070b]/85 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-labelledby="genshin-artifact-dialog-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="my-auto flex max-h-[calc(100vh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden border border-[#4b4029] bg-[#0d1118] shadow-[0_28px_90px_rgba(0,0,0,.65)] sm:max-h-[calc(100vh-3rem)]">
      <DialogHeader eyebrow="Профиль набора артефактов" title={profile.name} subtitle={`${profile.minRarity}–${profile.maxRarity} ★`} onClose={onClose} titleID="genshin-artifact-dialog-title" />
      <div className="min-h-0 overflow-y-auto">
        <div className="grid gap-5 border-b border-[#2b313e] bg-[radial-gradient(circle_at_18%_18%,rgba(201,162,79,.1),transparent_35%),#0b0f16] p-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:p-6">
          <div className="relative flex min-h-44 items-center justify-center overflow-hidden border border-[#343c4b] bg-[linear-gradient(145deg,#161d29,#090d13)]">{profile.iconUrl ? <button type="button" className="relative h-full min-h-44 w-full cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#e6c77a]" onClick={() => onOpenImage({ url: profile.iconUrl as string, label: profile.name })} aria-label={`Открыть изображение: ${profile.name}`}><img src={profile.iconUrl} alt={profile.name} className="h-full max-h-60 w-full object-contain p-5" /><span className="absolute bottom-3 right-3 grid size-8 place-items-center border border-[#5b4c2b] bg-[#0a0d13]/85 text-[#d9b65e]"><Maximize2 className="size-4" /></span></button> : <ImageIcon className="size-10 text-[#4c586b]" strokeWidth={1.2} />}</div>
          <ArtifactEffects item={profile} />
        </div>
        {loading ? <LoadingDetail /> : error ? <DetailError text={error} /> : <div className="space-y-8 p-4 sm:p-6"><ArtifactSources sources={detail?.sources ?? []} /><ArtifactPieces pieces={detail?.pieces ?? []} onOpenImage={onOpenImage} /></div>}
      </div>
    </div>
  </div>;
}

function DialogHeader({ eyebrow, title, subtitle, titleID, onClose }: { eyebrow: string; title: string; subtitle: string; titleID: string; onClose: () => void }) {
  return <div className="flex items-start justify-between gap-4 border-b border-[#2b313e] bg-[#11151d] px-4 py-4 sm:px-6"><div className="min-w-0"><div className="text-[9px] uppercase tracking-[.18em] text-[#c9a24f]">{eyebrow}</div><h2 id={titleID} className="mt-1 truncate font-[var(--display)] text-xl font-semibold text-[#edf0f5] sm:text-2xl">{title}</h2><p className="mt-1 text-xs text-[#8290a4]">{subtitle}</p></div><button type="button" onClick={onClose} className="grid size-9 shrink-0 place-items-center border border-[#343b4a] text-[#9da7b7] transition-colors hover:border-[#8e7540] hover:text-[#e6c778]" aria-label="Закрыть профиль"><X className="size-4" /></button></div>;
}

function LoadingDetail() {
  return <div className="grid min-h-56 place-items-center p-6"><RefreshCw className="size-6 animate-spin text-[#c9a24f]" /><span className="sr-only">Загрузка профиля</span></div>;
}

function DetailError({ text }: { text: string }) {
  return <div className="m-4 border border-[#693b3e] bg-[#211215] p-4 text-sm text-[#eba0a3] sm:m-6">{text}</div>;
}

function ArtifactEffects({ item }: { item: ArtifactSet }) {
  return <div className="min-w-0"><div className="text-[9px] uppercase tracking-[.16em] text-[#8e7540]">Бонусы комплекта</div><div className="mt-4 space-y-4"><div><h3 className="text-sm font-semibold text-[#e3e7ee]">2 предмета</h3><p className="mt-1 whitespace-pre-line text-sm leading-6 text-[#aeb7c7]">{item.twoPieceBonus || "Бонус не указан."}</p></div><div><h3 className="text-sm font-semibold text-[#e3e7ee]">4 предмета</h3><p className="mt-1 whitespace-pre-line text-sm leading-6 text-[#aeb7c7]">{item.fourPieceBonus || "Бонус не указан."}</p></div></div></div>;
}

function ArtifactSources({ sources }: { sources: ArtifactSource[] }) {
  return <section aria-labelledby="genshin-artifact-sources-title"><div className="flex items-end justify-between gap-3 border-b border-[#3a3425] pb-3"><div><div className="text-[9px] uppercase tracking-[.16em] text-[#8e7540]">Получение</div><h3 id="genshin-artifact-sources-title" className="mt-1 font-[var(--display)] text-lg font-semibold text-[#e3e7ee]">Где получить</h3></div><span className="text-[10px] text-[#7d899b]">{sources.length} источников</span></div>{sources.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{sources.map((source) => <div key={`${source.slug}-${source.unlockRank}`} className="border border-[#2b3340] bg-[#111720] p-3"><h4 className="text-sm font-medium text-[#dce2eb]">{source.name}</h4><p className="mt-1 text-[10px] text-[#8995a8]">{source.entranceName || source.region || "Подземелье"}</p><div className="mt-3 flex flex-wrap gap-2 text-[9px] text-[#aeb7c7]">{source.region ? <span className="border border-[#343c4b] px-2 py-1">{source.region}</span> : null}{source.unlockRank ? <span className="border border-[#343c4b] px-2 py-1">Ранг {source.unlockRank}</span> : null}{source.recommendedLevel ? <span className="border border-[#343c4b] px-2 py-1">Рек. уровень {source.recommendedLevel}</span> : null}</div></div>)}</div> : <div className="mt-4"><EmptyDetail text="Способ получения не указан в опубликованном источнике." /></div>}</section>;
}

function ArtifactPieces({ pieces, onOpenImage }: { pieces: ArtifactPiece[]; onOpenImage: (preview: ImagePreview) => void }) {
  return <section aria-labelledby="genshin-artifact-pieces-title"><div className="flex items-end justify-between gap-3 border-b border-[#3a3425] pb-3"><div><div className="text-[9px] uppercase tracking-[.16em] text-[#8e7540]">Комплект</div><h3 id="genshin-artifact-pieces-title" className="mt-1 font-[var(--display)] text-lg font-semibold text-[#e3e7ee]">Пять предметов</h3></div><span className="text-[10px] text-[#7d899b]">{pieces.length}/5</span></div>{pieces.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{pieces.map((piece) => <div key={piece.id} className="border border-[#2b3340] bg-[#111720] p-3"><div className="flex gap-3"><SmallMediaButton url={piece.iconUrl} label={piece.name} onOpenImage={onOpenImage} /><div className="min-w-0"><div className="text-[9px] uppercase tracking-[.1em] text-[#8e7540]">{artifactSlotLabel(piece.slot)}</div><h4 className="mt-1 text-sm font-medium text-[#dce2eb]">{piece.name}</h4><p className="mt-2 whitespace-pre-line text-[10px] leading-4 text-[#8894a7]">{piece.description || "Описание отсутствует."}</p></div></div></div>)}</div> : <div className="mt-4"><EmptyDetail text="Предметы набора не найдены." /></div>}</section>;
}

function SmallMediaButton({ url, label, onOpenImage }: { url: string | null; label: string; onOpenImage: (preview: ImagePreview) => void }) {
  if (!url) return <div className="grid size-12 shrink-0 place-items-center border border-[#303847] bg-[#0a0e14]"><ImageIcon className="size-4 text-[#536075]" /></div>;
  return <button type="button" onClick={() => onOpenImage({ url, label })} className="relative size-12 shrink-0 cursor-zoom-in overflow-hidden border border-[#3b3d35] bg-[#0a0e14] p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e6c77a]" aria-label={`Открыть изображение: ${label}`}><img src={url} alt="" className="h-full w-full object-contain" /></button>;
}

function EmptyDetail({ text }: { text: string }) {
  return <div className="border border-dashed border-[#303847] bg-[#0c1017] p-5 text-center text-xs text-[#738095]">{text}</div>;
}

function ImageLightbox({ preview, onClose }: { preview: ImagePreview | null; onClose: () => void }) {
  if (!preview) return null;
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#030407]/95 p-3 backdrop-blur-md sm:p-8" role="dialog" aria-modal="true" aria-labelledby="genshin-image-preview-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="relative flex max-h-full max-w-6xl flex-col items-center gap-3"><button type="button" onClick={onClose} className="absolute -right-1 -top-1 z-10 grid size-9 place-items-center border border-[#51452e] bg-[#0b0e14]/95 text-[#e6c778] hover:bg-[#171a20]" aria-label="Закрыть изображение"><X className="size-4" /></button><img src={preview.url} alt={preview.label} className="max-h-[82vh] max-w-[94vw] object-contain sm:max-h-[86vh] sm:max-w-[88vw]" /><div id="genshin-image-preview-title" className="border border-[#343c4b] bg-[#0b0e14]/95 px-4 py-2 text-center text-xs text-[#cbd2de]">{preview.label}</div></div></div>;
}

function Stars({ count }: { count: number }) {
  return <span className="flex gap-0.5 text-[#d9b65e]" aria-label={`${count} звёзд`}>{Array.from({ length: count }, (_, index) => <span key={index} className="text-[10px]">★</span>)}</span>;
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

function artifactSlotLabel(value: string) {
  return ({ flower: "Цветок жизни", plume: "Перо смерти", sands: "Пески времени", goblet: "Кубок пространства", circlet: "Корона разума" } as Record<string, string>)[value] ?? value;
}

function formatStat(value: number) {
  return Number.isInteger(value) ? value.toLocaleString("ru-RU") : value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

function formatPercent(value: number) {
  return `${(value * 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 })}%`;
}

function formatWeaponSpecialized(value: number) {
  if (!value) return "—";
  return value <= 1 ? formatPercent(value) : formatStat(value);
}

function formatEffectDescription(description: string | undefined, values: string[] | undefined) {
  if (!description) return "";
  return description.replace(/\{(\d+)\}/g, (_, index: string) => values?.[Number(index)] ?? "…");
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
    events: "События и баннеры", quests: "Задания и диалоги", maps: "Карты", maplabels: "Категории карт", mappoints: "Точки карт",
    stats: "Статы и прогрессия", curves: "Кривые роста",
  };
  return labels[value] ?? value;
}
