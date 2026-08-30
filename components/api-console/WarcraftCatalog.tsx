"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, Database, ExternalLink, ImageIcon, RefreshCw, Search } from "lucide-react";
import type { CatalogEntityType, CatalogPage, CatalogProduct, GameEntity } from "@/lib/api/client";

type StructuredBlock = Record<string, unknown>;

const blockTitles: Record<string, string> = {
  creature_info: "NPC и существо",
  description: "Описание",
  item_effect_metadata: "Эффекты предмета",
  item_requirements: "Требования предмета",
  item_registry: "Реестр игрового клиента",
  profession_info: "Профессия и рецепты",
  provenance: "Источник данных",
  quest_info: "Задание",
  recipe_info: "Рецепт",
  spell_info: "Параметры заклинания",
  spell_effects: "Эффекты заклинания",
  talent_spells: "Связанные заклинания",
};

const fieldTitles: Record<string, string> = {
  amount: "Количество", attack_power_coefficient: "Коэффициент силы атаки", base_points: "Базовое значение",
  build: "Версия игры", build_number: "Номер сборки", category_count: "Категорий", charges: "Заряды",
  cast_time: "Время применения", cast_time_ms: "Время применения, мс", chain_targets: "Целей в цепочке",
  class_mask: "Классы", coefficient: "Коэффициент", cooldown_ms: "Перезарядка, мс", difficulty_count: "Сложностей",
  class_id: "Класс предмета", effect_type: "Тип эффекта", entries: "Записи", external_id: "ID", faction_id: "Фракция", icon_file_data_id: "FileDataID", inventory_type: "Тип экипировки", locations: "Места",
  map_id: "Карта", max_range: "Максимальная дальность", min_range: "Минимальная дальность", name: "Название", outputs: "Результаты", poi_count: "Точек на карте", professions: "Профессии",
  quest_lines: "Цепочки заданий", reagents: "Реагенты", recipe_count: "Рецептов", recipes: "Примеры рецептов",
  required_ability_id: "Требуемая способность", rewards: "Награды", roles: "Роли NPC", source: "Источник",
  registry_only: "Только реестр", school: "Школа магии", school_mask: "Маска школы", source_url: "Исходный документ", spell_id: "Заклинание", status: "Статус", subclass_id: "Подкласс", text: "Текст", type: "Тип",
  ui_map_id: "Игровая карта", updated_at: "Обновлено", x: "X", y: "Y", z: "Z",
};

async function catalogRequest<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { credentials: "include", signal });
  if (!response.ok) throw new Error(`Каталог недоступен (${response.status})`);
  return response.json() as Promise<T>;
}

export function WarcraftCatalog({ buildVersion }: { buildVersion: string }) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [types, setTypes] = useState<CatalogEntityType[]>([]);
  const [page, setPage] = useState<CatalogPage>({ data: [], pagination: { hasMore: false, total: 0 } });
  const [product, setProduct] = useState("wow");
  const [type, setType] = useState("");
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [selected, setSelected] = useState<GameEntity | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    const params = new URLSearchParams({ product, locale: "ru_RU", limit: "24", includeTotal: "true" });
    if (type) params.set("type", type);
    if (query) params.set("q", query);
    if (cursor) params.set("cursor", cursor);
    try {
      const [productPage, typePage, records] = await Promise.all([
        catalogRequest<{ data: CatalogProduct[] }>("/v1/game/products", signal),
        catalogRequest<{ data: CatalogEntityType[] }>(`/v1/game/entity-types?${new URLSearchParams({ product, locale: "ru_RU" })}`, signal),
        catalogRequest<CatalogPage>(`/v1/game/entity-summaries?${params}`, signal),
      ]);
      setProducts(productPage.data); setTypes(typePage.data); setPage(records);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить каталог");
    } finally { setLoading(false); }
  }, [cursor, product, query, type]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setSelected(null); setHistory([]); setCursor(""); setQuery(draft.trim());
  }

  async function openEntity(id: string) {
    setDetailLoading(true); setError("");
    try { setSelected(await catalogRequest<GameEntity>(`/v1/game/entities/${encodeURIComponent(id)}?locale=ru_RU`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось открыть запись"); }
    finally { setDetailLoading(false); }
  }

  if (selected) return <CatalogEntityDetail entity={selected} onBack={() => setSelected(null)} />;

  return <div className="flex flex-col gap-5">
    <section className="border border-[#2d3341] bg-[#11151d] p-5 sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div><p className="text-[9px] uppercase tracking-[.16em] text-[#9a824a]">World of Warcraft · {buildVersion || "сборка не определена"}</p><h2 className="mt-2 font-[var(--display)] text-2xl font-semibold">Структурированная база Warcraft</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[#7f899d]">Предметы, заклинания, задания, NPC, рецепты, маунты и другие сущности. В интерфейс попадают только опубликованные версии данных.</p></div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-[9px] uppercase tracking-[.12em] text-[#6f798c]">Версия игры<select value={product} onChange={(event) => { setProduct(event.target.value); setType(""); setCursor(""); setHistory([]); }} className="mt-1 block h-10 min-w-52 border border-[#343b4a] bg-[#0b0f16] px-3 text-xs normal-case tracking-normal text-[#d8dde7] outline-none focus:border-[#9c8044]">{products.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label>
          <div className="border border-[#343b4a] bg-[#0b0f16] px-4 py-2"><span className="block text-[9px] uppercase tracking-[.12em] text-[#6f798c]">Найдено</span><strong className="mt-1 block font-mono text-sm text-[#d8bd79]">{(page.pagination.total ?? 0).toLocaleString("ru-RU")}</strong></div>
        </div>
      </div>
      <form onSubmit={submit} className="mt-5 flex gap-2"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#697488]" /><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Поиск по названию" className="h-11 w-full border border-[#343b4a] bg-[#0b0f16] pl-10 pr-3 text-sm text-[#e2e6ee] outline-none placeholder:text-[#576174] focus:border-[#9c8044]" /></div><button className="h-11 border border-[#8f7540] bg-[#1b1811] px-5 text-xs font-semibold text-[#dfbd69] hover:bg-[#252016]">Найти</button></form>
    </section>

    <section className="border border-[#2d3341] bg-[#0d1118] p-4">
      <div className="flex gap-2 overflow-x-auto pb-1"><button type="button" onClick={() => { setType(""); setCursor(""); setHistory([]); }} className={`flex-none border px-3 py-2 text-[10px] ${!type ? "border-[#9c8044] bg-[#201b12] text-[#e0bd68]" : "border-[#303745] text-[#8994a8]"}`}>Все</button>{types.map((item) => <button type="button" key={item.type} onClick={() => { setType(item.type); setCursor(""); setHistory([]); }} className={`flex-none border px-3 py-2 text-[10px] ${type === item.type ? "border-[#9c8044] bg-[#201b12] text-[#e0bd68]" : "border-[#303745] text-[#8994a8]"}`}>{item.label} <b className="ml-1 font-mono">{item.count.toLocaleString("ru-RU")}</b></button>)}</div>
    </section>

    {error ? <div className="border border-[#693b3e] bg-[#2a1518] p-4 text-sm text-[#ef9a9d]">{error}</div> : null}
    {loading ? <div className="grid min-h-64 place-items-center border border-[#2d3341] bg-[#11151d]"><RefreshCw className="size-6 animate-spin text-[#c9a24f]" /></div> : page.data.length > 0 ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{page.data.map((entity) => <button type="button" key={entity.id} onClick={() => void openEntity(entity.id)} className="group flex min-h-28 items-center gap-4 border border-[#2d3341] bg-[#11151d] p-4 text-left hover:border-[#78663c] hover:bg-[#151a23]">
      <span className="grid size-14 shrink-0 place-items-center overflow-hidden border border-[#343b49] bg-[#090d13]">{entity.iconUrl ? <img src={entity.iconUrl} alt="" className="size-full object-cover" loading="lazy" /> : <Database className="size-5 text-[#5f697c]" />}</span><span className="min-w-0 flex-1"><span className="block truncate font-[var(--display)] text-base font-semibold text-[#e2e6ee] group-hover:text-[#dfbd69]">{entity.name || `${entity.type} #${entity.externalId}`}</span><span className="mt-1 block text-[9px] uppercase tracking-[.12em] text-[#707b90]">{entity.type} · ID {entity.externalId}</span>{entity.description ? <span className="mt-2 line-clamp-2 block text-xs leading-5 text-[#828da1]">{entity.description}</span> : null}</span><ChevronRight className="size-4 shrink-0 text-[#5f697c] group-hover:text-[#d2ad57]" />
    </button>)}</div> : <div className="grid min-h-64 place-items-center border border-[#2d3341] bg-[#11151d] text-center"><div><Database className="mx-auto size-7 text-[#606b7e]" /><p className="mt-3 text-sm text-[#8c96a8]">Для выбранного раздела данных пока нет.</p></div></div>}

    <div className="flex items-center justify-between border border-[#2d3341] bg-[#11151d] p-3"><button type="button" disabled={history.length === 0} onClick={() => { const previous = history.at(-1) ?? ""; setHistory((items) => items.slice(0, -1)); setCursor(previous); }} className="inline-flex h-9 items-center gap-2 border border-[#343b49] px-3 text-xs text-[#9ca6b8] disabled:opacity-35"><ArrowLeft className="size-3.5" />Назад</button><span className="text-[10px] text-[#687286]">{page.data.length} записей на странице</span><button type="button" disabled={!page.pagination.hasMore || !page.pagination.nextCursor} onClick={() => { setHistory((items) => [...items, cursor]); setCursor(page.pagination.nextCursor ?? ""); }} className="inline-flex h-9 items-center gap-2 border border-[#8f7540] px-3 text-xs text-[#dfbd69] disabled:opacity-35">Дальше<ChevronRight className="size-3.5" /></button></div>
    {detailLoading ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/50"><RefreshCw className="size-7 animate-spin text-[#d2ad57]" /></div> : null}
  </div>;
}

function CatalogEntityDetail({ entity, onBack }: { entity: GameEntity; onBack: () => void }) {
  const media = entity.media ?? [];
  const structuredBlocks = (entity.tooltip?.blocks ?? []) as StructuredBlock[];
  const localizations = entity.localizations ?? {};
  return <div className="flex flex-col gap-5">
    <button type="button" onClick={onBack} className="inline-flex w-fit items-center gap-2 text-xs text-[#b69a59] hover:text-[#e0bd68]"><ArrowLeft className="size-4" />Вернуться к каталогу</button>
    <section className="border border-[#2d3341] bg-[#11151d] p-5 sm:p-6"><div className="flex flex-col gap-5 sm:flex-row sm:items-start"><span className="grid size-20 shrink-0 place-items-center overflow-hidden border border-[#3a4252] bg-[#090d13]">{entity.iconUrl ? <img src={entity.iconUrl} alt="" className="size-full object-cover" /> : <Database className="size-7 text-[#667185]" />}</span><div className="min-w-0 flex-1"><p className="text-[9px] uppercase tracking-[.14em] text-[#9a824a]">{entity.type} · ID {entity.externalId}</p><h2 className="mt-2 font-[var(--display)] text-3xl font-semibold text-[#eceff5]">{entity.name || `${entity.type} #${entity.externalId}`}</h2>{entity.description ? <p className="mt-3 max-w-4xl text-sm leading-6 text-[#929bad]">{entity.description}</p> : null}<div className="mt-4 flex flex-wrap gap-2 text-[9px] uppercase tracking-[.1em] text-[#788397]"><span className="border border-[#343b49] px-2 py-1">{entity.product}</span><span className="border border-[#343b49] px-2 py-1">build #{entity.buildId ?? "—"}</span><span className="border border-[#343b49] px-2 py-1">локаль {entity.resolvedLocale}</span></div></div></div></section>
    <section className="border border-[#2d3341] bg-[#11151d] p-5"><div className="mb-4 flex items-baseline gap-3"><h3 className="font-[var(--display)] text-lg font-semibold">Названия и описания</h3><span className="text-[10px] uppercase tracking-[.12em] text-[#788397]">EN / RU · из источника</span></div><div className="grid gap-3 md:grid-cols-2">{["en_US", "ru_RU"].map((locale) => { const value = localizations[locale]; return <article key={locale} className="border border-[#303745] bg-[#0a0e15] p-4"><div className="flex items-baseline justify-between"><strong className="text-sm text-[#d8dde7]">{locale === "ru_RU" ? "Русский" : "English"}</strong><span className="font-mono text-[10px] text-[#788397]">{locale}</span></div><dl className="mt-3 grid gap-3 text-xs"><div><dt className="text-[9px] uppercase tracking-[.1em] text-[#69758a]">Название</dt><dd className="mt-1 text-[#b7bfcd]">{value?.name || "Нет значения в источнике"}</dd></div><div><dt className="text-[9px] uppercase tracking-[.1em] text-[#69758a]">Исходное описание</dt><dd className="mt-1 whitespace-pre-wrap text-[#b7bfcd]">{value?.description || "Нет значения в источнике"}</dd></div><div><dt className="text-[9px] uppercase tracking-[.1em] text-[#69758a]">Разрешённое описание</dt><dd className="mt-1 whitespace-pre-wrap text-[#b7bfcd]">{value?.resolvedDescription || value?.description || "Нет значения в источнике"}</dd></div></dl></article>; })}</div></section>
    <section className="border border-[#2d3341] bg-[#11151d] p-5"><div className="mb-4 flex items-center gap-2"><ImageIcon className="size-4 text-[#c9a24f]" /><h3 className="font-[var(--display)] text-lg font-semibold">Подтверждённые изображения</h3><span className="ml-auto font-mono text-xs text-[#788397]">{media.length}</span></div>{media.length > 0 ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{media.map((asset) => <a key={`${asset.assetKey}-${asset.url}`} href={asset.url} target="_blank" rel="noreferrer" className="group border border-[#303745] bg-[#0a0e15] hover:border-[#78663c]"><span className="grid min-h-48 place-items-center overflow-hidden p-3"><img src={asset.url} alt={`${entity.name} — ${asset.kind}`} className="max-h-80 max-w-full object-contain" loading="lazy" /></span><span className="flex items-center gap-2 border-t border-[#303745] px-3 py-2 text-[10px] text-[#8590a4]"><strong className="mr-auto capitalize text-[#d8dde7]">{asset.kind.replaceAll("_", " ")}</strong>{asset.source === "blizzard_api" ? "Battle.net" : asset.source}<ExternalLink className="size-3" /></span></a>)}</div> : <p className="border border-[#303745] bg-[#0a0e15] p-4 text-sm leading-6 text-[#8590a4]">Изображения отсутствуют: источник или FileDataID может быть известен, но проверенный файл ещё не сохранён.</p>}</section>
    {entity.tooltip?.plainText ? <section className="border border-[#2d3341] bg-[#11151d] p-5"><h3 className="font-[var(--display)] text-lg font-semibold">Игровая информация</h3><p className="mt-3 whitespace-pre-line text-sm leading-6 text-[#a0a8b7]">{entity.tooltip.plainText}</p></section> : null}
    {structuredBlocks.length > 0 ? <section className="border border-[#2d3341] bg-[#11151d] p-5"><h3 className="font-[var(--display)] text-lg font-semibold">Структурированные данные</h3><div className="mt-4 grid gap-4">{structuredBlocks.map((block, index) => <StructuredDataBlock key={`${String(block.type ?? "data")}-${index}`} block={block} />)}</div></section> : null}
    <details className="border border-[#2d3341] bg-[#11151d] p-5"><summary className="cursor-pointer font-[var(--display)] text-lg font-semibold">Полный исходный payload</summary><pre className="mt-4 max-h-[620px] overflow-auto border border-[#303745] bg-[#0a0e15] p-4 text-[11px] leading-5 text-[#b7bfcd]">{JSON.stringify(entity.payload ?? {}, null, 2)}</pre></details>
  </div>;
}

function StructuredDataBlock({ block }: { block: StructuredBlock }) {
  const type = typeof block.type === "string" ? block.type : "data";
  const fields = Object.entries(block).filter(([key, value]) => key !== "type" && value !== null && value !== "" && (!Array.isArray(value) || value.length > 0));
  if (fields.length === 0) return null;
  return <article className="border border-[#303745] bg-[#0a0e15] p-4 [content-visibility:auto]">
    <h4 className="text-xs font-semibold uppercase tracking-[.1em] text-[#d8bd79]">{blockTitles[type] ?? type.replaceAll("_", " ")}</h4>
    <dl className="mt-3 grid gap-3 sm:grid-cols-2">{fields.map(([key, value]) => <div key={key} className={Array.isArray(value) || (typeof value === "object" && value !== null) ? "sm:col-span-2" : ""}><dt className="text-[9px] uppercase tracking-[.1em] text-[#69758a]">{fieldTitles[key] ?? key.replaceAll("_", " ")}</dt><dd className="mt-1 text-xs leading-5 text-[#b7bfcd]"><StructuredValue value={value} /></dd></div>)}</dl>
  </article>;
}

function StructuredValue({ value }: { value: unknown }) {
  if (typeof value === "boolean") return <span>{value ? "Да" : "Нет"}</span>;
  if (typeof value === "string") {
    if (/^https:\/\//.test(value)) return <a href={value} target="_blank" rel="noreferrer" className="break-all text-[#c9a95f] hover:underline">{value}</a>;
    return <span className="break-words">{value}</span>;
  }
  if (typeof value === "number" || typeof value === "bigint") return <span className="font-mono text-[#dce1ea]">{String(value)}</span>;
  if (Array.isArray(value)) return <div className="grid gap-2 md:grid-cols-2">{value.map((entry, index) => <div key={index} className="border border-[#252c38] bg-[#0d121a] p-3"><StructuredValue value={entry} /></div>)}</div>;
  if (typeof value === "object" && value !== null) return <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">{Object.entries(value).filter(([, nested]) => nested !== null && nested !== "").map(([key, nested]) => <div key={key}><dt className="text-[9px] uppercase tracking-[.08em] text-[#667185]">{fieldTitles[key] ?? key.replaceAll("_", " ")}</dt><dd className="mt-0.5"><StructuredValue value={nested} /></dd></div>)}</dl>;
  return <span>—</span>;
}
