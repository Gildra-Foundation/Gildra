"use client";

import { useConsoleText } from "../consoleLocale";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Check, ChevronRight, Clock3, Database, ExternalLink, Gauge, RefreshCw, Search,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AtlasSegmented } from "@gildra/atlas-ui/AtlasSegmented";
import { cn } from "@/lib/utils";
import { useConsoleRequest, type ConsoleRequestState } from "../client";
import { datasetClassPath, datasetPath } from "../paths";
import type {
  ArchonTierlistEntry, DatasetDetailResponse, DatasetFreshness, DatasetListItem,
  DatasetRun, IcyVeinsTierlistEntry, IcyVeinsTierlistResponse, TierlistEntry,
  WowGGTierlistEntry, WowGGTierlistResponse,
} from "../types";
import {
  uniqueOptions, wowGGRoleLabel, wowGGKeyLabel, wowGGRaidLabel, wowGGPVPLabel,
  wowGGMetrics, wowGGMetricValue, bestMetric, tierStyle, formatMetricNumber, metricLabel,
  difficultyLabel, formatDate, freshnessHint, formatInterval, activityLabel,
  icyVeinsActivityLabel, roleLabel,
} from "./format";
import {
  Loadable, SectionSkeleton, SectionError, EmptyDataset, Breadcrumb, FreshnessBadge,
  DatasetMetric, StatusRail, WowGGSelect, Panel, SmallMetric,
} from "./primitives";

export function DatasetsView({ datasetSlug, classSlug, refreshKey }: { datasetSlug: string; classSlug: string; refreshKey: number }) {
  if (!datasetSlug) return <DatasetListView refreshKey={refreshKey} />;
  return <DatasetDetailView slug={datasetSlug} classSlug={classSlug} refreshKey={refreshKey} />;
}

function DatasetListView({ refreshKey }: { refreshKey: number }) {
  const ct = useConsoleText();
  const list = useConsoleRequest<{ data: DatasetListItem[] }>("/v1/admin/datasets", { refreshKey, fallback: ct("Не удалось загрузить список датасетов") });
  return <Loadable state={list} title={ct("Датасеты")}>{(value) => <DatasetCatalog datasets={value.data} />}</Loadable>;
}

const EMPTY_WOWGG: WowGGTierlistResponse = { snapshotId: "", contexts: [], data: [], weeks: [], count: 0 };
const EMPTY_ICYVEINS: IcyVeinsTierlistResponse = { snapshotId: "", pages: [], data: [], count: 0 };

// The dataset page loads its card, its freshness, its run history and the
// dataset records as four independent requests.
function DatasetDetailView({ slug, classSlug, refreshKey }: { slug: string; classSlug: string; refreshKey: number }) {
  const ct = useConsoleText();
  const detail = useConsoleRequest<DatasetDetailResponse>(`/v1/admin/datasets/${encodeURIComponent(slug)}`, { refreshKey, fallback: ct("Не удалось загрузить датасет") });
  const freshness = useConsoleRequest<DatasetFreshness>(`/v1/admin/datasets/${encodeURIComponent(slug)}/freshness`, { refreshKey, fallback: ct("Не удалось проверить свежесть") });
  const runs = useConsoleRequest<{ data: DatasetRun[] }>(`/v1/admin/datasets/${encodeURIComponent(slug)}/runs`, { refreshKey, enabled: !classSlug, fallback: ct("Не удалось загрузить историю обновлений") });
  const [activity, setActivity] = useState("raid");
  const [role, setRole] = useState("dps");
  const [difficulty, setDifficulty] = useState("heroic");
  const [metric, setMetric] = useState("popularity");
  const [wowGGWeek, setWowGGWeek] = useState("");
  const [query, setQuery] = useState("");
  const wowheadURL = slug === "tierlist-wowhead" ? (classSlug ? "/v1/admin/tierlist-wowhead" : `/v1/admin/tierlist-wowhead?activity=${activity}&role=${role}`) : null;
  const archonURL = slug === "tierlist-archon" ? (classSlug ? "/v1/admin/tierlist-archon" : `/v1/admin/tierlist-archon?activity=${activity}&difficulty=${activity === "mythic_plus" ? "10" : difficulty}&role=${role}`) : null;
  const wowGGURL = slug === "tierlist-wowgg" ? `/v1/admin/tierlist-wowgg${wowGGWeek ? `?week=${encodeURIComponent(wowGGWeek)}` : ""}` : null;
  const icyVeinsURL = slug === "tierlist-icyveins" ? (classSlug ? "/v1/admin/tierlist-icyveins" : `/v1/admin/tierlist-icyveins?activity=${activity}&role=${role}`) : null;
  const wowhead = useConsoleRequest<{ data: TierlistEntry[] }>(wowheadURL, { refreshKey, fallback: ct("Не удалось загрузить записи датасета") });
  const archon = useConsoleRequest<{ data: ArchonTierlistEntry[] }>(archonURL, { refreshKey, fallback: ct("Не удалось загрузить записи датасета") });
  const wowGG = useConsoleRequest<WowGGTierlistResponse>(wowGGURL, { refreshKey, fallback: ct("Не удалось загрузить записи датасета") });
  const icyVeins = useConsoleRequest<IcyVeinsTierlistResponse>(icyVeinsURL, { refreshKey, fallback: ct("Не удалось загрузить записи датасета") });
  const records = slug === "tierlist-wowhead" ? wowhead : slug === "tierlist-archon" ? archon : slug === "tierlist-wowgg" ? wowGG : slug === "tierlist-icyveins" ? icyVeins : null;
  const matches = (name: string) => name.toLowerCase().includes(query.toLowerCase());
  const entries = useMemo(() => (wowhead.data?.data ?? []).filter((entry) => classSlug || matches(`${entry.specName} ${entry.className}`)), [wowhead.data, query, classSlug]); // eslint-disable-line react-hooks/exhaustive-deps
  const archonEntries = useMemo(() => (archon.data?.data ?? []).filter((entry) => classSlug || matches(`${entry.specName} ${entry.className}`)), [archon.data, query, classSlug]); // eslint-disable-line react-hooks/exhaustive-deps
  const wowGGData = useMemo(() => { const value = wowGG.data ?? EMPTY_WOWGG; return { ...value, data: value.data.filter((entry) => classSlug || matches(entry.entityName)) }; }, [wowGG.data, query, classSlug]); // eslint-disable-line react-hooks/exhaustive-deps
  const icyVeinsData = useMemo(() => { const value = icyVeins.data ?? EMPTY_ICYVEINS; return { ...value, data: value.data.filter((entry) => classSlug || matches(`${entry.specName} ${entry.className}`)) }; }, [icyVeins.data, query, classSlug]); // eslint-disable-line react-hooks/exhaustive-deps
  const dataset = detail.data ? { ...detail.data.dataset, ...(freshness.data ? { freshness: freshness.data.freshness, freshUntil: freshness.data.freshUntil } : {}) } : null;
  return <div className="flex flex-col gap-5">
    <Loadable state={detail} title={ct("Датасет")}>{() => dataset ? <DatasetSection dataset={dataset} classSlug={classSlug} entries={entries} archonEntries={archonEntries} wowGG={wowGGData} icyVeins={icyVeinsData} wowGGWeek={wowGGWeek} setWowGGWeek={setWowGGWeek} datasetRuns={runs.data?.data ?? []} runsState={runs} recordsState={records} query={query} setQuery={setQuery} activity={activity} setActivity={setActivity} role={role} setRole={setRole} difficulty={difficulty} setDifficulty={setDifficulty} metric={metric} setMetric={setMetric} /> : <EmptyDataset />}</Loadable>
    {freshness.error ? <SectionError title={ct("Свежесть датасета")} message={ct(freshness.error)} onRetry={freshness.reload} /> : null}
  </div>;
}

type DatasetSectionProps = {
  dataset: DatasetListItem;
  classSlug: string;
  entries: TierlistEntry[];
  archonEntries: ArchonTierlistEntry[];
  wowGG: WowGGTierlistResponse;
  icyVeins: IcyVeinsTierlistResponse;
  wowGGWeek: string;
  setWowGGWeek: (value: string) => void;
  datasetRuns: DatasetRun[];
  runsState: ConsoleRequestState<{ data: DatasetRun[] }>;
  recordsState: ConsoleRequestState<unknown> | null;
  query: string;
  setQuery: (value: string) => void;
  activity: string;
  setActivity: (value: string) => void;
  role: string;
  setRole: (value: string) => void;
  difficulty: string;
  setDifficulty: (value: string) => void;
  metric: string;
  setMetric: (value: string) => void;
};

function DatasetSection(props: DatasetSectionProps) {
  const dataset = props.dataset;
  if (props.classSlug && dataset.slug === "tierlist-wowhead") return <ClassDetail dataset={dataset} classSlug={props.classSlug} entries={props.entries} />;
  if (props.classSlug && dataset.slug === "tierlist-archon") return <ArchonClassDetail dataset={dataset} classSlug={props.classSlug} entries={props.archonEntries} />;
  if (props.classSlug && dataset.slug === "tierlist-wowgg") return <WowGGClassDetail dataset={dataset} classSlug={props.classSlug} entries={props.wowGG.data} />;
  if (props.classSlug && dataset.slug === "tierlist-icyveins") return <IcyVeinsClassDetail dataset={dataset} classSlug={props.classSlug} entries={props.icyVeins.data} />;
  if (dataset.slug === "tierlist-wowhead") return <DatasetDetail {...props} dataset={dataset} />;
  if (dataset.slug === "tierlist-archon") return <ArchonDatasetDetail {...props} dataset={dataset} />;
  if (dataset.slug === "tierlist-wowgg") return <WowGGDatasetDetail {...props} dataset={dataset} />;
  if (dataset.slug === "tierlist-icyveins") return <IcyVeinsDatasetDetail {...props} dataset={dataset} />;
  return <EmptyDataset />;
}

// RecordsNotice surfaces a failed or pending records request above a table
// that would otherwise just look empty.
function RecordsNotice({ state }: { state: ConsoleRequestState<unknown> | null }) {
  const ct = useConsoleText();
  if (!state) return null;
  if (state.error && !state.data) return <SectionError title={ct("Записи датасета")} message={ct(state.error)} onRetry={state.reload} />;
  if (state.loading && !state.data) return <SectionSkeleton title={ct("Записи датасета")} />;
  return null;
}

function DatasetCatalog({ datasets }: { datasets: DatasetListItem[] }) {
  const ct = useConsoleText();
  return <div className="flex flex-col gap-5">
    <div>
      <p className="text-[10px] uppercase tracking-[.16em] text-[#9a824a]">{ct("Хранилище данных")}</p>
      <h2 className="mt-2 font-[family-name:var(--display)] text-2xl font-semibold">{ct("Все датасеты")}</h2>
      <p className="mt-2 max-w-2xl text-sm text-[#7f899d]">{ct("Откройте датасет, чтобы посмотреть записи, историю обновлений, описания классов и исходные гайды.")}</p>
    </div>
    <div className="grid gap-4 xl:grid-cols-2">
      {datasets.map((dataset) => <a key={dataset.id} href={datasetPath(dataset.slug)} className="group block border border-[#2d3341] bg-[#11151d] transition-colors hover:border-[#76643b] hover:bg-[#151921]">
        <div className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="grid size-11 shrink-0 place-items-center border border-[#51452e] bg-[#1b1811] text-[#d2ad57]"><Database className="size-5" strokeWidth={1.5} /></div>
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-3"><h3 className="font-[family-name:var(--display)] text-lg font-semibold text-[#e7eaf1]">{dataset.name}</h3><FreshnessBadge dataset={dataset} /></div><p className="mt-1 text-xs text-[#748095]">{ct("Источник: ")}{dataset.sourceName}</p></div>
            <ChevronRight className="mt-2 size-5 text-[#657087] transition-transform group-hover:translate-x-1 group-hover:text-[#d2ad57]" />
          </div>
          <div className="grid grid-cols-3 gap-px border border-[#292f3c] bg-[#292f3c]"><DatasetMetric label={ct("Страниц")} value={dataset.pageCount} /><DatasetMetric label={ct("Записей")} value={dataset.recordCount} /><DatasetMetric label={ct("Специализаций")} value={dataset.uniqueSpecCount} /></div>
          <div className="flex flex-col gap-2 border-t border-[#292f3c] pt-4 text-[11px] text-[#7f899d] sm:flex-row sm:items-center sm:justify-between"><span>{ct("Обновлено: ")}<strong className="font-medium text-[#b4bdcc]">{formatDate(dataset.lastSuccessAt)}</strong></span><span>{freshnessHint(dataset)}</span></div>
        </div>
      </a>)}
    </div>
    {datasets.length === 0 ? <div className="border border-[#2d3341] bg-[#11151d] py-16 text-center text-sm text-[#7f899d]">{ct("Датасеты ещё не добавлены")}</div> : null}
  </div>;
}

function DatasetDetail(props: DatasetSectionProps & { dataset: DatasetListItem }) {
  const ct = useConsoleText();
  return <div className="flex flex-col gap-5">
    <Breadcrumb items={[{ label: ct("Датасеты"), href: datasetPath() }, { label: props.dataset.name }]} />
    <div className="flex flex-col gap-4 border border-[#2d3341] bg-[#11151d] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div><div className="flex flex-wrap items-center gap-3"><h2 className="font-[family-name:var(--display)] text-2xl font-semibold">{props.dataset.name}</h2><FreshnessBadge dataset={props.dataset} /></div><p className="mt-2 text-sm text-[#7f899d]">{ct("Источник: ")}{props.dataset.sourceName} {ct(" · обновление каждые ")}{ct(formatInterval(props.dataset.refreshIntervalSeconds))}</p></div>
      <div className="text-left text-xs text-[#7f899d] sm:text-right"><div>{ct("Последний успешный снимок")}</div><strong className="mt-1 block font-medium text-[#c5ccd7]">{formatDate(props.dataset.lastSuccessAt)}</strong></div>
    </div>
    <StatusRail systems={null} dataset={props.dataset} />
    <RecordsNotice state={props.recordsState} />
    <TierlistTable {...props} />
    <DatasetRunHistory runs={props.datasetRuns} state={props.runsState} />
  </div>;
}

function ArchonDatasetDetail(props: DatasetSectionProps & { dataset: DatasetListItem }) {
  const ct = useConsoleText();
  return <div className="flex flex-col gap-5">
    <Breadcrumb items={[{ label: ct("Датасеты"), href: datasetPath() }, { label: props.dataset.name }]} />
    <div className="flex flex-col gap-4 border border-[#2d3341] bg-[#11151d] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div><div className="flex flex-wrap items-center gap-3"><h2 className="font-[family-name:var(--display)] text-2xl font-semibold">{props.dataset.name}</h2><FreshnessBadge dataset={props.dataset} /></div><p className="mt-2 max-w-3xl text-sm leading-6 text-[#7f899d]">{ct("12 срезов Archon: Mythic+ и рейды Normal, Heroic и Mythic для DPS, танков и лекарей. Сохраняются тиры, рейтинг, популярность, число разборов и показатели эффективности.")}</p></div>
      <div className="text-left text-xs text-[#7f899d] sm:text-right"><div>{ct("Последний успешный снимок")}</div><strong className="mt-1 block font-medium text-[#c5ccd7]">{formatDate(props.dataset.lastSuccessAt)}</strong></div>
    </div>
    <div className="grid grid-cols-3 gap-px border border-[#292f3c] bg-[#292f3c]"><DatasetMetric label={ct("Страниц")} value={props.dataset.pageCount} /><DatasetMetric label={ct("Записей")} value={props.dataset.recordCount} /><DatasetMetric label={ct("Специализаций")} value={props.dataset.uniqueSpecCount} /></div>
    <RecordsNotice state={props.recordsState} />
    <ArchonTierlistTable entries={props.archonEntries} query={props.query} setQuery={props.setQuery} activity={props.activity} setActivity={props.setActivity} role={props.role} setRole={props.setRole} difficulty={props.difficulty} setDifficulty={props.setDifficulty} metric={props.metric} setMetric={props.setMetric} />
    <DatasetRunHistory runs={props.datasetRuns} state={props.runsState} />
  </div>;
}

function IcyVeinsDatasetDetail(props: DatasetSectionProps & { dataset: DatasetListItem }) {
  const ct = useConsoleText();
  const activePage = props.icyVeins.pages.find((page) => page.activity === props.activity && page.role === props.role);
  return <div className="flex flex-col gap-5">
    <Breadcrumb items={[{ label: ct("Датасеты"), href: datasetPath() }, { label: props.dataset.name }]} />
    <div className="flex flex-col gap-4 border border-[#2d3341] bg-[#11151d] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div><div className="flex flex-wrap items-center gap-3"><h2 className="font-[family-name:var(--display)] text-2xl font-semibold">{props.dataset.name}</h2><FreshnessBadge dataset={props.dataset} /></div><p className="mt-2 max-w-3xl text-sm leading-6 text-[#7f899d]">{ct("Восемь тир-листов Icy Veins: Mythic+, рейды и PvP. Сохраняются только позиции, изменения, даты источников и ссылки на гайды — без текста гайдов.")}</p></div>
      <div className="text-left text-xs text-[#7f899d] sm:text-right"><div>{ct("Ежедневная проверка")}</div><strong className="mt-1 block font-medium text-[#c5ccd7]">{formatDate(props.dataset.lastSuccessAt)}</strong></div>
    </div>
    <div className="grid grid-cols-3 gap-px border border-[#292f3c] bg-[#292f3c]"><DatasetMetric label={ct("Страниц")} value={props.dataset.pageCount} /><DatasetMetric label={ct("Записей")} value={props.dataset.recordCount} /><DatasetMetric label={ct("Специализаций")} value={props.dataset.uniqueSpecCount} /></div>
    <Panel title={ct("Выбор тир-листа")} kicker={activePage ? [ct("Источник обновлён "), formatDate(activePage.sourceUpdatedAt), ""].join("") : ct("Выберите доступный формат")} icon={Gauge}>
      <div className="flex flex-wrap gap-3">
        <AtlasSegmented size="sm" aria-label={ct("Формат")} value={props.activity} onValueChange={(value) => { props.setActivity(value); if (value === "pvp" && props.role === "tank") props.setRole("dps"); }} options={[{ value: "mythic_plus", label: "Mythic+" }, { value: "raid", label: ct("Рейд") }, { value: "pvp", label: "PvP" }]} />
        <AtlasSegmented size="sm" aria-label={ct("Роль")} value={props.role} onValueChange={props.setRole} options={[{ value: "dps", label: "DPS" }, { value: "healer", label: ct("Лекарь") }, ...(props.activity === "pvp" ? [] : [{ value: "tank", label: ct("Танк") }])]} />
      </div>
      {activePage ? <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[#292f3c] pt-4 text-[10px] text-[#7d879a]"><span>{activePage.recordCount} {ct(" специализаций")}</span><span>·</span><span>{ct("Автор: ")}{activePage.authorName || "Icy Veins"}</span><span>·</span><a href={activePage.sourceUrl} target="_blank" rel="noreferrer" className="text-[#c6a451] hover:text-[#e2c471]">{ct("Открыть источник")}</a></div> : null}
    </Panel>
    <RecordsNotice state={props.recordsState} />
    <IcyVeinsTierlistTable entries={props.icyVeins.data} query={props.query} setQuery={props.setQuery} />
    <DatasetRunHistory runs={props.datasetRuns} state={props.runsState} />
  </div>;
}

function IcyVeinsTierlistTable({ entries, query, setQuery }: { entries: IcyVeinsTierlistEntry[]; query: string; setQuery: (value: string) => void }) {
  const ct = useConsoleText();
  return <Panel title="Tierlist — Icy Veins" kicker={["", entries.length, ct(" записей в выборке")].join("")} icon={Database} action={<div className="relative w-full sm:w-56"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#626d80]" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ct("Найти класс или спек")} className="h-9 rounded-sm border-[#303645] bg-[#0b0e14] pl-9 text-xs" /></div>}>
    <div className="overflow-x-auto border border-[#292f3c]"><Table><TableHeader><TableRow className="border-[#292f3c] bg-[#0c1017] hover:bg-[#0c1017]"><TableHead className="w-16 text-[10px] uppercase tracking-[.12em] text-[#6f798c]">{ct("Тир")}</TableHead><TableHead className="text-[10px] uppercase tracking-[.12em] text-[#6f798c]">{ct("Специализация")}</TableHead><TableHead className="hidden text-[10px] uppercase tracking-[.12em] text-[#6f798c] md:table-cell">{ct("Класс")}</TableHead><TableHead className="w-12"><span className="sr-only">{ct("Гайд")}</span></TableHead></TableRow></TableHeader><TableBody>{entries.map((entry) => <TableRow key={`${entry.contextKey}-${entry.classSlug}-${entry.specSlug}`} className="border-[#252b38] bg-[#11151d] hover:bg-[#171b24]"><TableCell><span className={cn("grid size-8 place-items-center border font-[family-name:var(--display)] text-sm font-bold", tierStyle(entry.tier))}>{entry.tier}</span></TableCell><TableCell><Link href={datasetClassPath("tierlist-icyveins", entry.classSlug)} className="font-semibold text-[#e0e4ec] hover:text-[#dfbd69]">{entry.specName}</Link><div className="mt-0.5 text-[10px] text-[#768196]">#{entry.rankInTier} {ct(" в тире")}</div></TableCell><TableCell className="hidden text-xs md:table-cell"><Link href={datasetClassPath("tierlist-icyveins", entry.classSlug)} className="inline-flex items-center gap-1.5 text-[#9ca6b8] hover:text-[#dfbd69]">{entry.className}<ChevronRight className="size-3" /></Link></TableCell><TableCell><a href={entry.guideUrl} target="_blank" rel="noreferrer" className="grid size-8 place-items-center border border-[#323846] text-[#a88c4d] hover:border-[#8f7540] hover:text-[#e0bd68]" aria-label={[ct("Открыть гайд "), entry.specName, ""].join("")}><ExternalLink className="size-3.5" /></a></TableCell></TableRow>)}</TableBody></Table></div>
    {entries.length === 0 ? <div className="border-x border-b border-[#292f3c] py-10 text-center text-xs text-[#737e92]">{ct("Для этого формата данных нет. Последний успешный снимок сохранён.")}</div> : null}
  </Panel>;
}

function WowGGDatasetDetail(props: DatasetSectionProps & { dataset: DatasetListItem }) {
  const ct = useConsoleText();
  const [mode, setMode] = useState("mythic_plus");
  const [role, setRole] = useState("dps");
  const [addon, setAddon] = useState("midnight");
  const [selection, setSelection] = useState("all");
  const [keyType, setKeyType] = useState("all");
  const [raidDifficulty, setRaidDifficulty] = useState("raid_myth");
  const [bracket, setBracket] = useState("2v2");
  const [region, setRegion] = useState("all");
  const [metric, setMetric] = useState("score");
  const contexts = props.wowGG.contexts;
  const base = contexts.filter((item) => item.mode === mode);
  const roles = uniqueOptions(base.map((item) => [item.role, wowGGRoleLabel(item.role)] as const));
  const effectiveRole = roles.some(([id]) => id === role) ? role : roles[0]?.[0] ?? "dps";
  const roleContexts = base.filter((item) => item.role === effectiveRole);
  const addons = uniqueOptions(roleContexts.map((item) => [item.addonKey, item.addonName] as const));
  const effectiveAddon = addons.some(([id]) => id === addon) ? addon : addons[0]?.[0] ?? "";
  const addonContexts = roleContexts.filter((item) => item.addonKey === effectiveAddon);
  const keys = uniqueOptions(addonContexts.map((item) => [item.keyType, wowGGKeyLabel(item.keyType)] as const).filter(([id]) => Boolean(id)));
  const effectiveKey = keys.some(([id]) => id === keyType) ? keyType : keys[0]?.[0] ?? "";
  const difficulties = uniqueOptions(addonContexts.map((item) => [item.raidDifficulty, wowGGRaidLabel(item.raidDifficulty)] as const).filter(([id]) => Boolean(id)));
  const effectiveDifficulty = difficulties.some(([id]) => id === raidDifficulty) ? raidDifficulty : difficulties[0]?.[0] ?? "";
  const brackets = uniqueOptions(addonContexts.map((item) => [item.pvpBracket, wowGGPVPLabel(item.pvpBracket)] as const).filter(([id]) => Boolean(id)));
  const effectiveBracket = brackets.some(([id]) => id === bracket) ? bracket : brackets[0]?.[0] ?? "";
  const regions = uniqueOptions(addonContexts.filter((item) => !effectiveBracket || item.pvpBracket === effectiveBracket).map((item) => [item.pvpRegion, item.pvpRegion === "all" ? ct("Все регионы") : item.pvpRegion.toUpperCase()] as const));
  const effectiveRegion = regions.some(([id]) => id === region) ? region : regions[0]?.[0] ?? "";
  const selectionContexts = addonContexts.filter((item) =>
    (mode !== "mythic_plus" || item.keyType === effectiveKey) &&
    (mode !== "raid" || item.raidDifficulty === effectiveDifficulty) &&
    (mode !== "pvp" || (item.pvpBracket === effectiveBracket && item.pvpRegion === effectiveRegion))
  );
  const selections = uniqueOptions(selectionContexts.map((item) => [item.selectionId, item.selectionName] as const));
  const effectiveSelection = selections.some(([id]) => id === selection) ? selection : selections[0]?.[0] ?? "";
  const activeContext = selectionContexts.find((item) => item.selectionId === effectiveSelection) ?? selectionContexts[0];
  const metrics = wowGGMetrics(mode, effectiveRole);
  const effectiveMetric = metrics.some(([id]) => id === metric) ? metric : metrics[0]?.[0] ?? "score";
  const entries = activeContext ? props.wowGG.data.filter((entry) => entry.contextKey === activeContext.contextKey) : [];

  return <div className="flex flex-col gap-5">
    <Breadcrumb items={[{ label: ct("Датасеты"), href: datasetPath() }, { label: props.dataset.name }]} />
    <div className="flex flex-col gap-4 border border-[#2d3341] bg-[#11151d] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div><div className="flex flex-wrap items-center gap-3"><h2 className="font-[family-name:var(--display)] text-2xl font-semibold">{props.dataset.name}</h2><FreshnessBadge dataset={props.dataset} /></div><p className="mt-2 max-w-3xl text-sm leading-6 text-[#7f899d]">{ct("Полная мета wow.gg: Mythic+, рейды и PvP, все роли, дополнения, ключи, подземелья, боссы, сложности, PvP-бракеты, регионы и доступные недели.")}</p></div>
      <div className="text-left text-xs text-[#7f899d] sm:text-right"><div>{ct("Обновляется каждые 8 часов")}</div><strong className="mt-1 block font-medium text-[#c5ccd7]">{formatDate(props.dataset.lastSuccessAt)}</strong></div>
    </div>
    <div className="grid grid-cols-3 gap-px border border-[#292f3c] bg-[#292f3c]"><DatasetMetric label={ct("Срезов")} value={props.dataset.pageCount} /><DatasetMetric label={ct("Записей")} value={props.dataset.recordCount} /><DatasetMetric label={ct("Специализаций")} value={props.dataset.uniqueSpecCount} /></div>
    <Panel title={ct("Фильтры wow.gg")} kicker={["", contexts.length, ct(" срезов в снимке")].join("")} icon={Gauge}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <WowGGSelect label={ct("Режим")} value={mode} onChange={(value) => { setMode(value); setRole("dps"); setMetric(value === "pvp" ? "players" : value === "raid" ? "avgDps" : "score"); }} options={[["mythic_plus", "Mythic+"], ["raid", ct("Рейд")], ["pvp", "PvP"]]} />
        <WowGGSelect label={ct("Роль")} value={effectiveRole} onChange={(value) => { setRole(value); setMetric(value === "healer" ? "avgHps" : mode === "pvp" ? "players" : "score"); }} options={roles} />
        <WowGGSelect label={ct("Дополнение")} value={effectiveAddon} onChange={setAddon} options={addons} />
        {mode === "mythic_plus" && effectiveRole !== "dungeon_ease" ? <WowGGSelect label={ct("Ключи")} value={effectiveKey} onChange={setKeyType} options={keys} /> : null}
        {mode === "raid" ? <WowGGSelect label={ct("Сложность")} value={effectiveDifficulty} onChange={setRaidDifficulty} options={difficulties} /> : null}
        {mode === "pvp" ? <WowGGSelect label={ct("Бракет")} value={effectiveBracket} onChange={setBracket} options={brackets} /> : null}
        {mode === "pvp" ? <WowGGSelect label={ct("Регион")} value={effectiveRegion} onChange={setRegion} options={regions} /> : null}
        {mode !== "pvp" ? <WowGGSelect label={mode === "raid" ? ct("Рейд / босс") : ct("Подземелье")} value={effectiveSelection} onChange={setSelection} options={selections} /> : null}
        <WowGGSelect label={ct("Метрика")} value={effectiveMetric} onChange={setMetric} options={metrics} />
        <WowGGSelect label={ct("Неделя")} value={props.wowGGWeek} onChange={props.setWowGGWeek} options={[["", ct("Текущий снимок")], ...props.wowGG.weeks.map((item) => [item.week, item.week] as const)]} />
      </div>
      {activeContext ? <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[#292f3c] pt-4 text-[10px] text-[#7d879a]"><span>{activeContext.recordCount} {ct(" записей")}</span><span>·</span><span>{activeContext.sourceWeek}</span><span>·</span><span>{ct("Источник обновлён ")}{formatDate(activeContext.sourceUpdatedAt)}</span><a href={activeContext.sourceUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-[#c5a454] hover:text-[#e2c16f]">wow.gg <ExternalLink className="size-3" /></a></div> : null}
    </Panel>
    <WowGGTierlistTable entries={entries} metric={effectiveMetric} query={props.query} setQuery={props.setQuery} datasetSlug={props.dataset.slug} />
    <DatasetRunHistory runs={props.datasetRuns} state={props.runsState} />
  </div>;
}

function WowGGClassDetail({ dataset, classSlug, entries }: { dataset: DatasetListItem; classSlug: string; entries: WowGGTierlistEntry[] }) {
  const ct = useConsoleText();
  const classEntries = entries.filter((entry) => entry.classSlug === classSlug);
  const specs = Array.from(new Map(classEntries.map((entry) => [entry.specSlug, entry])).values());
  const className = classEntries[0]?.className ?? classSlug;
  return <div className="flex flex-col gap-5">
    <Breadcrumb items={[{ label: ct("Датасеты"), href: datasetPath() }, { label: dataset.name, href: datasetPath(dataset.slug) }, { label: className }]} />
    <div className="flex flex-col gap-4 border border-[#2d3341] bg-[#11151d] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"><div><p className="text-[10px] uppercase tracking-[.16em] text-[#9a824a]">wow.gg · World of Warcraft</p><h2 className="mt-2 font-[family-name:var(--display)] text-3xl font-semibold">{className}</h2><p className="mt-2 text-sm text-[#7f899d]">{classEntries.length} {ct(" позиций во всех режимах и фильтрах текущего снимка.")}</p></div><FreshnessBadge dataset={dataset} /></div>
    {specs.length === 0 ? <div className="border border-[#2d3341] bg-[#11151d] py-16 text-center text-sm text-[#8b95a8]">{ct("Информация об этом классе не найдена.")}</div> : <div className="grid gap-4 xl:grid-cols-2">{specs.map((entry) => <Card key={entry.specSlug} className="rounded-sm border-[#2d3341] bg-[#11151d] shadow-none"><CardHeader className="border-b border-[#292f3c] p-5"><div className="flex items-center gap-3"><span className={cn("grid size-10 place-items-center border font-[family-name:var(--display)] text-base font-bold", tierStyle(entry.tier))}>{entry.tier}</span><div><CardTitle className="text-lg">{entry.specName}</CardTitle><p className="mt-1 text-[10px] text-[#778196]">{ct("Найдено в ")}{classEntries.filter((item) => item.specSlug === entry.specSlug).length} {ct(" срезах")}</p></div></div></CardHeader><CardContent className="p-5"><div className="grid grid-cols-2 gap-px border border-[#292f3c] bg-[#292f3c]"><SmallMetric label={ct("Лучший M+ рейтинг")} value={formatMetricNumber(bestMetric(classEntries, entry.specSlug, "metaScore"))} /><SmallMetric label={ct("Макс. ключ")} value={formatMetricNumber(bestMetric(classEntries, entry.specSlug, "maxKey"))} /><SmallMetric label={ct("Средний DPS")} value={formatMetricNumber(bestMetric(classEntries, entry.specSlug, "averageDps"))} /><SmallMetric label={ct("PvP рейтинг")} value={formatMetricNumber(bestMetric(classEntries, entry.specSlug, "pvpMaxRating"))} /></div><a href={entry.guideUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex h-10 items-center gap-2 bg-[#c9a24f] px-4 text-xs font-semibold text-[#171205] hover:bg-[#dfbd69]">{ct("Открыть гайд wow.gg ")}<ExternalLink className="size-3.5" /></a></CardContent></Card>)}</div>}
  </div>;
}

function IcyVeinsClassDetail({ dataset, classSlug, entries }: { dataset: DatasetListItem; classSlug: string; entries: IcyVeinsTierlistEntry[] }) {
  const ct = useConsoleText();
  const classEntries = entries.filter((entry) => entry.classSlug === classSlug);
  const className = classEntries[0]?.className ?? classSlug.replaceAll("-", " ");
  return <div className="flex flex-col gap-5">
    <Breadcrumb items={[{ label: ct("Датасеты"), href: datasetPath() }, { label: dataset.name, href: datasetPath(dataset.slug) }, { label: className }]} />
    <div className="border border-[#2d3341] bg-[#11151d] p-5 sm:p-6"><div className="flex flex-wrap items-center gap-3"><h2 className="font-[family-name:var(--display)] text-2xl font-semibold capitalize">{className}</h2><FreshnessBadge dataset={dataset} /></div><p className="mt-2 text-sm text-[#7f899d]">{ct("Позиции специализаций класса и прямые ссылки на гайды Icy Veins.")}</p></div>
    <div className="grid gap-4 xl:grid-cols-2">{classEntries.map((entry) => <article key={`${entry.contextKey}-${entry.specSlug}`} className="border border-[#2d3341] bg-[#11151d] p-5"><div className="flex items-start justify-between gap-4"><div><div className="text-[10px] uppercase tracking-[.13em] text-[#897546]">{icyVeinsActivityLabel(entry.activity)} · {roleLabel(entry.role)}</div><h3 className="mt-2 font-[family-name:var(--display)] text-lg font-semibold">{entry.specName}</h3></div><span className={cn("grid size-10 place-items-center border font-[family-name:var(--display)] text-base font-bold", tierStyle(entry.tier))}>{entry.tier}</span></div><div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#292f3c] pt-4"><span className="text-[10px] text-[#6f798c]">{ct("Источник: ")}{formatDate(entry.sourceUpdatedAt)}</span><a href={entry.guideUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-xs text-[#c6a451] hover:text-[#e2c471]">{ct("Открыть гайд")}<ExternalLink className="size-3.5" /></a></div></article>)}</div>
    {classEntries.length === 0 ? <EmptyDataset /> : null}
  </div>;
}

function ArchonClassDetail({ dataset, classSlug, entries }: { dataset: DatasetListItem; classSlug: string; entries: ArchonTierlistEntry[] }) {
  const ct = useConsoleText();
  const classEntries = entries.filter((entry) => entry.classSlug === classSlug);
  const className = classEntries[0]?.className ?? classSlug;
  return <div className="flex flex-col gap-5">
    <Breadcrumb items={[{ label: ct("Датасеты"), href: datasetPath() }, { label: dataset.name, href: datasetPath(dataset.slug) }, { label: className }]} />
    <div className="flex flex-col gap-4 border border-[#2d3341] bg-[#11151d] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div><p className="text-[10px] uppercase tracking-[.16em] text-[#9a824a]">Archon · World of Warcraft</p><h2 className="mt-2 font-[family-name:var(--display)] text-3xl font-semibold">{className}</h2><p className="mt-2 text-sm text-[#7f899d]">{ct("Все специализации класса во всех 12 срезах: тиры, показатели, объём выборки и ссылки на билды.")}</p></div>
      <FreshnessBadge dataset={dataset} />
    </div>
    {classEntries.length === 0 ? <div className="border border-[#2d3341] bg-[#11151d] py-16 text-center"><p className="text-sm text-[#8b95a8]">{ct("Информация об этом классе не найдена.")}</p><Link href={datasetPath(dataset.slug)} className="mt-4 inline-flex items-center gap-2 text-xs text-[#d2ad57]"><ArrowLeft className="size-4" />{ct("Вернуться к датасету")}</Link></div> : <div className="grid gap-4 xl:grid-cols-2">{classEntries.map((entry) => <Card key={`${entry.activity}-${entry.difficulty}-${entry.role}-${entry.specSlug}`} className="rounded-sm border-[#2d3341] bg-[#11151d] shadow-none">
      <CardHeader className="border-b border-[#292f3c] p-5"><div className="flex items-start gap-3"><span className={cn("grid size-10 shrink-0 place-items-center border font-[family-name:var(--display)] text-base font-bold", tierStyle(entry.tier))}>{entry.tier || "—"}</span><div className="min-w-0 flex-1"><CardTitle className="text-lg">{entry.specName}</CardTitle><div className="mt-2 flex flex-wrap gap-2"><Badge variant="outline" className="rounded-sm border-[#3a4352] text-[10px] text-[#9ea8ba]">{activityLabel(entry.activity)}</Badge><Badge variant="outline" className="rounded-sm border-[#3a4352] text-[10px] text-[#9ea8ba]">{difficultyLabel(entry.difficulty)}</Badge><Badge variant="outline" className="rounded-sm border-[#3a4352] text-[10px] text-[#9ea8ba]">{roleLabel(entry.role)}</Badge></div></div></div></CardHeader>
      <CardContent className="p-5"><div className="grid grid-cols-2 gap-px border border-[#292f3c] bg-[#292f3c]"><SmallMetric label={ct("Разборов")} value={entry.parses.toLocaleString("en-US")} /><SmallMetric label={ct("Популярность")} value={entry.popularity == null ? "—" : `${(entry.popularity * 100).toFixed(1)}%`} /><SmallMetric label="DPS" value={formatMetricNumber(entry.dps)} /><SmallMetric label="HPS" value={formatMetricNumber(entry.hps)} /></div><div className="mt-5 flex flex-wrap gap-3"><a href={entry.buildUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 bg-[#c9a24f] px-4 text-xs font-semibold text-[#171205] hover:bg-[#dfbd69]">{ct("Открыть билд ")}<ExternalLink className="size-3.5" /></a><a href={entry.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 border border-[#3a4352] px-4 text-xs text-[#a9b2c2] hover:border-[#806c3e] hover:text-[#dfbd69]">{ct("Источник ")}<ExternalLink className="size-3.5" /></a></div></CardContent>
    </Card>)}</div>}
  </div>;
}

function ClassDetail({ dataset, classSlug, entries }: { dataset: DatasetListItem; classSlug: string; entries: TierlistEntry[] }) {
  const ct = useConsoleText();
  const classEntries = entries.filter((entry) => entry.classSlug === classSlug);
  const className = classEntries[0]?.className ?? classSlug;
  return <div className="flex flex-col gap-5">
    <Breadcrumb items={[{ label: ct("Датасеты"), href: datasetPath() }, { label: dataset.name, href: datasetPath(dataset.slug) }, { label: className }]} />
    <div className="flex flex-col gap-4 border border-[#2d3341] bg-[#11151d] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div><p className="text-[10px] uppercase tracking-[.16em] text-[#9a824a]">{ct("World of Warcraft · класс")}</p><h2 className="mt-2 font-[family-name:var(--display)] text-3xl font-semibold">{className}</h2><p className="mt-2 text-sm text-[#7f899d]">{ct("Все найденные специализации, тиры и прямые ссылки на гайды WoWHead.")}</p></div>
      <FreshnessBadge dataset={dataset} />
    </div>
    {classEntries.length === 0 ? <div className="border border-[#2d3341] bg-[#11151d] py-16 text-center"><p className="text-sm text-[#8b95a8]">{ct("Информация об этом классе не найдена.")}</p><Link href={datasetPath(dataset.slug)} className="mt-4 inline-flex items-center gap-2 text-xs text-[#d2ad57]"><ArrowLeft className="size-4" />{ct("Вернуться к датасету")}</Link></div> : <div className="grid gap-4 xl:grid-cols-2">{classEntries.map((entry) => <Card key={`${entry.activity}-${entry.role}-${entry.specSlug}`} className="rounded-sm border-[#2d3341] bg-[#11151d] shadow-none">
      <CardHeader className="border-b border-[#292f3c] p-5"><div className="flex items-start gap-3"><span className={cn("grid size-10 shrink-0 place-items-center border font-[family-name:var(--display)] text-base font-bold", tierStyle(entry.tier))}>{entry.tier}</span><div className="min-w-0 flex-1"><CardTitle className="text-lg">{entry.specName}</CardTitle><div className="mt-2 flex flex-wrap gap-2"><Badge variant="outline" className="rounded-sm border-[#3a4352] text-[10px] text-[#9ea8ba]">{activityLabel(entry.activity)}</Badge><Badge variant="outline" className="rounded-sm border-[#3a4352] text-[10px] text-[#9ea8ba]">{roleLabel(entry.role)}</Badge></div></div></div></CardHeader>
      <CardContent className="p-5"><div className="flex flex-wrap gap-3"><a href={entry.guideUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 bg-[#c9a24f] px-4 text-xs font-semibold text-[#171205] hover:bg-[#dfbd69]">{ct("Открыть гайд ")}<ExternalLink className="size-3.5" /></a><a href={entry.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 border border-[#3a4352] px-4 text-xs text-[#a9b2c2] hover:border-[#806c3e] hover:text-[#dfbd69]">{ct("Исходная страница ")}<ExternalLink className="size-3.5" /></a></div></CardContent>
    </Card>)}</div>}
  </div>;
}

export function TierlistTable({ entries, query, setQuery, activity, setActivity, role, setRole, limit }: { entries: TierlistEntry[]; query: string; setQuery: (v: string) => void; activity: string; setActivity: (v: string) => void; role: string; setRole: (v: string) => void; limit?: number }) {
  const ct = useConsoleText();
  const displayed = limit ? entries.slice(0, limit) : entries;
  return <Panel title="Tierlist WoWHead" kicker={["", entries.length, ct(" записей в выборке")].join("")} icon={Database} action={<div className="flex flex-wrap items-center gap-2"><AtlasSegmented size="sm" aria-label={ct("Формат")} value={activity} onValueChange={setActivity} options={[{ value: "raid", label: ct("Рейд") }, { value: "mythic_plus", label: "Mythic+" }]} /><AtlasSegmented size="sm" aria-label={ct("Роль")} value={role} onValueChange={setRole} options={[["dps", "DPS"], ["healer", ct("Лекарь")], ["tank", ct("Танк")]].map(([id, label]) => ({ value: id, label }))} /></div>}>
    <div className="relative mb-4 max-w-xs"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#697387]" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ct("Найти специализацию...")} className="h-9 rounded-sm border-[#303645] bg-[#0b0e14] pl-9 text-xs" /></div>
    <div className="overflow-x-auto border border-[#292f3c]"><Table><TableHeader><TableRow className="border-[#292f3c] bg-[#0c1017] hover:bg-[#0c1017]"><TableHead className="w-16 text-[10px] uppercase tracking-[.12em] text-[#6f798c]">{ct("Тир")}</TableHead><TableHead className="text-[10px] uppercase tracking-[.12em] text-[#6f798c]">{ct("Специализация")}</TableHead><TableHead className="hidden text-[10px] uppercase tracking-[.12em] text-[#6f798c] md:table-cell">{ct("Класс")}</TableHead><TableHead className="w-12"><span className="sr-only">{ct("Гайд")}</span></TableHead></TableRow></TableHeader><TableBody>{displayed.map((entry) => <TableRow key={`${entry.activity}-${entry.role}-${entry.classSlug}-${entry.specSlug}`} className="border-[#252b38] bg-[#11151d] hover:bg-[#171b24]"><TableCell><span className={cn("grid size-8 place-items-center border font-[family-name:var(--display)] text-sm font-bold", tierStyle(entry.tier))}>{entry.tier}</span></TableCell><TableCell><Link href={datasetClassPath("tierlist-wowhead", entry.classSlug)} className="font-semibold text-[#e0e4ec] hover:text-[#dfbd69]">{entry.specName}</Link><Link href={datasetClassPath("tierlist-wowhead", entry.classSlug)} className="mt-0.5 block text-[10px] text-[#8d9ab0] hover:text-[#dfbd69] md:hidden">{entry.className} {ct(" · подробнее")}</Link></TableCell><TableCell className="hidden text-xs md:table-cell"><Link href={datasetClassPath("tierlist-wowhead", entry.classSlug)} className="inline-flex items-center gap-1.5 text-[#9ca6b8] hover:text-[#dfbd69]">{entry.className}<ChevronRight className="size-3" /></Link></TableCell><TableCell><a href={entry.guideUrl} target="_blank" rel="noreferrer" className="grid size-8 place-items-center border border-[#323846] text-[#a88c4d] hover:border-[#8f7540] hover:text-[#e0bd68]" aria-label={[ct("Открыть гайд "), entry.specName, ""].join("")}><ExternalLink className="size-3.5" /></a></TableCell></TableRow>)}</TableBody></Table></div>
    {displayed.length === 0 && <div className="border-x border-b border-[#292f3c] py-10 text-center text-xs text-[#737e92]">{ct("В этой выборке записей нет")}</div>}
  </Panel>;
}

function ArchonTierlistTable({ entries, query, setQuery, activity, setActivity, role, setRole, difficulty, setDifficulty, metric, setMetric }: { entries: ArchonTierlistEntry[]; query: string; setQuery: (value: string) => void; activity: string; setActivity: (value: string) => void; role: string; setRole: (value: string) => void; difficulty: string; setDifficulty: (value: string) => void; metric: string; setMetric: (value: string) => void }) {
  const ct = useConsoleText();
  const availableMetrics = activity === "mythic_plus" ? [["score", ct("M+ рейтинг")]] : [["popularity", ct("Популярность")], ["throughput", ct("Эффективность")], ["survivability", ct("Выживаемость")]];
  const activeMetric = availableMetrics.some(([id]) => id === metric) ? metric : availableMetrics[0][0];
  const displayed = useMemo(() => [...entries].sort((left, right) => {
    const leftTier = left.tierAssignments[activeMetric];
    const rightTier = right.tierAssignments[activeMetric];
    const tierOrder = (tier: string | undefined) => ({ S: 0, A: 1, B: 2, C: 3, D: 4 }[tier ?? ""] ?? 5);
    return tierOrder(leftTier?.tier) - tierOrder(rightTier?.tier) || (leftTier?.rank ?? left.rank) - (rightTier?.rank ?? right.rank);
  }), [activeMetric, entries]);
  const metricValue = (entry: ArchonTierlistEntry) => {
    if (activeMetric === "score") return entry.score == null ? "—" : Math.round(entry.score).toLocaleString("en-US");
    if (activeMetric === "popularity") return entry.popularity == null ? "—" : `${(entry.popularity * 100).toFixed(1)}%`;
    if (activeMetric === "survivability") return entry.survivability == null ? "—" : `${entry.survivability.toFixed(1)}%`;
    return formatMetricNumber(role === "healer" ? entry.hps : entry.dps);
  };
  return <Panel title="Tierlist Archon" kicker={["", entries.length, ct(" записей в выборке")].join("")} icon={Database} action={<div className="flex flex-wrap items-center gap-2"><AtlasSegmented size="sm" aria-label={ct("Формат")} value={activity} onValueChange={(value) => { setActivity(value); if (value === "mythic_plus") setMetric("score"); else if (metric === "score") setMetric("popularity"); }} options={[{ value: "raid", label: ct("Рейд") }, { value: "mythic_plus", label: "Mythic+" }]} /><AtlasSegmented size="sm" aria-label={ct("Роль")} value={role} onValueChange={setRole} options={[["dps", "DPS"], ["healer", ct("Лекарь")], ["tank", ct("Танк")]].map(([id, label]) => ({ value: id, label }))} /></div>}>
    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="relative max-w-xs flex-1"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#697387]" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ct("Найти специализацию...")} className="h-9 rounded-sm border-[#303645] bg-[#0b0e14] pl-9 text-xs" /></div><div className="flex flex-wrap gap-2">{activity === "raid" ? <AtlasSegmented size="sm" aria-label={ct("Сложность")} value={difficulty} onValueChange={setDifficulty} options={[["normal", "Normal"], ["heroic", "Heroic"], ["mythic", "Mythic"]].map(([id, label]) => ({ value: id, label }))} /> : null}<AtlasSegmented size="sm" aria-label={ct("Метрика")} value={activeMetric} onValueChange={setMetric} options={availableMetrics.map(([id, label]) => ({ value: id, label }))} /></div></div>
    <div className="overflow-x-auto border border-[#292f3c]"><Table><TableHeader><TableRow className="border-[#292f3c] bg-[#0c1017] hover:bg-[#0c1017]"><TableHead className="w-16 text-[10px] uppercase tracking-[.12em] text-[#6f798c]">{ct("Тир")}</TableHead><TableHead className="text-[10px] uppercase tracking-[.12em] text-[#6f798c]">{ct("Специализация")}</TableHead><TableHead className="hidden text-[10px] uppercase tracking-[.12em] text-[#6f798c] md:table-cell">{ct("Класс")}</TableHead><TableHead className="text-right text-[10px] uppercase tracking-[.12em] text-[#6f798c]">{ct(metricLabel(activeMetric, role))}</TableHead><TableHead className="hidden text-right text-[10px] uppercase tracking-[.12em] text-[#6f798c] sm:table-cell">{ct("Разборов")}</TableHead><TableHead className="w-12"><span className="sr-only">{ct("Билд")}</span></TableHead></TableRow></TableHeader><TableBody>{displayed.map((entry) => { const assignment = entry.tierAssignments[activeMetric]; return <TableRow key={`${entry.activity}-${entry.difficulty}-${entry.role}-${entry.classSlug}-${entry.specSlug}`} className="border-[#252b38] bg-[#11151d] hover:bg-[#171b24]"><TableCell><span className={cn("grid size-8 place-items-center border font-[family-name:var(--display)] text-sm font-bold", tierStyle(assignment?.tier ?? ""))}>{assignment?.tier ?? "—"}</span></TableCell><TableCell><Link href={datasetClassPath("tierlist-archon", entry.classSlug)} className="font-semibold text-[#e0e4ec] hover:text-[#dfbd69]">{entry.specName}</Link></TableCell><TableCell className="hidden text-xs md:table-cell"><Link href={datasetClassPath("tierlist-archon", entry.classSlug)} className="inline-flex items-center gap-1.5 text-[#9ca6b8] hover:text-[#dfbd69]">{entry.className}<ChevronRight className="size-3" /></Link></TableCell><TableCell className="text-right font-mono text-xs text-[#d8bd79]">{metricValue(entry)}</TableCell><TableCell className="hidden text-right font-mono text-xs text-[#8792a5] sm:table-cell">{entry.parses.toLocaleString("en-US")}</TableCell><TableCell><a href={entry.buildUrl} target="_blank" rel="noreferrer" className="grid size-8 place-items-center border border-[#323846] text-[#a88c4d] hover:border-[#8f7540] hover:text-[#e0bd68]" aria-label={[ct("Открыть билд "), entry.specName, ""].join("")}><ExternalLink className="size-3.5" /></a></TableCell></TableRow>; })}</TableBody></Table></div>
    {displayed.length === 0 ? <div className="border-x border-b border-[#292f3c] py-10 text-center text-xs text-[#737e92]">{ct("В этой выборке записей нет. Последний успешный снимок сохранён.")}</div> : null}
  </Panel>;
}

function WowGGTierlistTable({ entries, metric, query, setQuery, datasetSlug }: { entries: WowGGTierlistEntry[]; metric: string; query: string; setQuery: (value: string) => void; datasetSlug: string }) {
  const ct = useConsoleText();
  const displayed = [...entries].sort((left, right) => (left.tierAssignments[metric]?.rank ?? 32_767) - (right.tierAssignments[metric]?.rank ?? 32_767));
  return <Panel title="Tierlist — wow.gg" kicker={["", displayed.length, ct(" записей в выбранном срезе")].join("")} icon={Database} action={<div className="relative w-full sm:w-56"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#626d80]" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ct("Найти класс или спек")} className="h-9 rounded-sm border-[#303645] bg-[#0b0e14] pl-9 text-xs" /></div>}>
    <div className="overflow-x-auto border border-[#292f3c]"><Table><TableHeader><TableRow className="border-[#292f3c] bg-[#0c1017] hover:bg-[#0c1017]"><TableHead className="w-14 text-[10px] uppercase tracking-[.12em] text-[#6f798c]">{ct("Тир")}</TableHead><TableHead className="text-[10px] uppercase tracking-[.12em] text-[#6f798c]">{ct("Специализация / подземелье")}</TableHead><TableHead className="hidden text-[10px] uppercase tracking-[.12em] text-[#6f798c] md:table-cell">{ct("Класс")}</TableHead><TableHead className="text-right text-[10px] uppercase tracking-[.12em] text-[#6f798c]">{ct("Значение")}</TableHead><TableHead className="w-12"><span className="sr-only">{ct("Источник")}</span></TableHead></TableRow></TableHeader><TableBody>{displayed.map((entry) => { const assignment = entry.tierAssignments[metric]; const value = wowGGMetricValue(entry, metric); const classHref = entry.classSlug ? datasetClassPath(datasetSlug, entry.classSlug) : ""; return <TableRow key={`${entry.contextKey}-${entry.entityType}-${entry.entitySlug}`} className="border-[#252b38] bg-[#11151d] hover:bg-[#171b24]"><TableCell><span className={cn("grid size-8 place-items-center border font-[family-name:var(--display)] text-sm font-bold", tierStyle(assignment?.tier ?? entry.tier))}>{assignment?.tier ?? entry.tier}</span></TableCell><TableCell>{classHref ? <Link href={classHref} className="font-semibold text-[#e0e4ec] hover:text-[#dfbd69]">{entry.specName}</Link> : <span className="font-semibold text-[#e0e4ec]">{entry.entityName}</span>}<div className="mt-0.5 text-[10px] text-[#768196]">#{assignment?.rank ?? entry.rank}</div></TableCell><TableCell className="hidden text-xs md:table-cell">{classHref ? <Link href={classHref} className="inline-flex items-center gap-1.5 text-[#9ca6b8] hover:text-[#dfbd69]">{entry.className}<ChevronRight className="size-3" /></Link> : <span className="text-[#697387]">Mythic+</span>}</TableCell><TableCell className="text-right font-mono text-xs text-[#d8bd79]">{metric === "popularity" && value != null ? `${value.toFixed(1)}%` : metric === "maxKey" && value != null ? `+${Math.round(value)}` : formatMetricNumber(value)}</TableCell><TableCell><a href={entry.guideUrl || entry.sourceUrl} target="_blank" rel="noreferrer" className="grid size-8 place-items-center border border-[#323846] text-[#a88c4d] hover:border-[#8f7540] hover:text-[#e0bd68]" aria-label={[ct("Открыть источник "), entry.entityName, ""].join("")}><ExternalLink className="size-3.5" /></a></TableCell></TableRow>; })}</TableBody></Table></div>
    {displayed.length === 0 ? <div className="border-x border-b border-[#292f3c] py-10 text-center text-xs text-[#737e92]">{ct("Для этой комбинации фильтров данных пока нет. Последний успешный снимок сохранён.")}</div> : null}
  </Panel>;
}

function DatasetRunHistory({ runs, state }: { runs: DatasetRun[]; state?: ConsoleRequestState<{ data: DatasetRun[] }> }) {
  const ct = useConsoleText();
  return <Panel title={ct("История обновлений")} kicker={ct("Снимки сохраняются при сбоях")} icon={Clock3}>{state?.error && !state.data ? <SectionError title={ct("История обновлений")} message={ct(state.error)} onRetry={state.reload} /> : state?.loading && !state.data ? <SectionSkeleton title={ct("История обновлений")} /> : runs.length === 0 ? <div className="py-10 text-center text-xs text-[#737e92]">{ct("Запуски ещё не зарегистрированы")}</div> : <div className="flex flex-col">{runs.map((run) => <div key={run.id} className="flex items-center gap-3 border-b border-[#252b38] py-3 last:border-b-0"><span className={cn("grid size-7 shrink-0 place-items-center border", run.status === "succeeded" ? "border-[#31583a] bg-[#122018] text-[#65ba72]" : run.status === "failed" ? "border-[#653a3d] bg-[#251416] text-[#e47d82]" : "border-[#5c4e2c] bg-[#211b0f] text-[#d2ad57]")}>{run.status === "succeeded" ? <Check className="size-3.5" /> : run.status === "failed" ? <X className="size-3.5" /> : <RefreshCw className="size-3.5" />}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><div className="truncate text-xs font-medium">{run.status === "succeeded" ? ct("Обновление выполнено") : run.status === "failed" ? ct("Ошибка обновления — сохранён прошлый снимок") : ct("Обновление данных")}</div><time className="shrink-0 text-[10px] text-[#667086]">{formatDate(run.finishedAt || run.startedAt)}</time></div><div className="mt-1 text-[10px] text-[#737e92]">{run.recordCount} {ct(" записей · ")}{run.pageCount} {ct(" страниц · ")}{run.trigger}</div>{run.errorSummary ? <div className="mt-1 text-[10px] text-[#bd7479]">{run.errorSummary}</div> : null}</div></div>)}</div>}</Panel>;
}

export function RunHistory({ runs: allRuns, compact = false }: { runs: DatasetRun[]; compact?: boolean }) {
  const ct = useConsoleText();
  const runs = compact ? allRuns.slice(0, 5) : allRuns;
  return <Panel title={ct("История обновлений")} kicker={ct("Снимки сохраняются при сбоях")} icon={Clock3}>{runs.length === 0 ? <div className="py-10 text-center text-xs text-[#737e92]">{ct("Запуски ещё не зарегистрированы")}</div> : <div className="flex flex-col">{runs.map((run) => <div key={run.id} className="flex items-center gap-3 border-b border-[#252b38] py-3 last:border-b-0"><span className={cn("grid size-7 shrink-0 place-items-center border", run.status === "succeeded" ? "border-[#31583a] bg-[#122018] text-[#65ba72]" : run.status === "failed" ? "border-[#653a3d] bg-[#251416] text-[#e47d82]" : "border-[#5c4e2c] bg-[#211b0f] text-[#d2ad57]")}>{run.status === "succeeded" ? <Check className="size-3.5" /> : run.status === "failed" ? <X className="size-3.5" /> : <RefreshCw className="size-3.5" />}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><div className="truncate text-xs font-medium">{run.status === "succeeded" ? ct("Обновление выполнено") : run.status === "failed" ? ct("Ошибка обновления") : ct("Обновление данных")}</div><time className="shrink-0 text-[10px] text-[#667086]">{formatDate(run.finishedAt || run.startedAt)}</time></div><div className="mt-1 text-[10px] text-[#737e92]">{run.recordCount} {ct(" записей · ")}{run.pageCount} {ct(" страниц · ")}{run.trigger}</div></div></div>)}</div>}</Panel>;
}
