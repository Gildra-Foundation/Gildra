"use client";

import { useConsoleText } from "./consoleLocale";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Activity, ArrowLeft, BarChart3, BookOpen, Check, ChevronRight, CircleAlert, Clock3,
  Code2, Database, ExternalLink, Eye, EyeOff, FileJson2, Gamepad2, Gauge, Gem, LogOut,
  Menu, RefreshCw, Search, Server, ShieldCheck, Swords, X,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AtlasSegmented } from "@gildra/atlas-ui/AtlasSegmented";
import { cn } from "@/lib/utils";
import { requestJSON, useConsoleRequest, type ConsoleRequestState } from "./client";
import { CONSOLE_ENDPOINTS, EDITION_BASES } from "./endpoints";
import { datasetClassPath, datasetPath } from "./paths";
import type { AnalyticsOverview, AnalyticsOverviewResponse, ArchonTierlistEntry, CatalogHealth, CatalogHealthResponse, CatalogReadiness, DatasetDetailResponse, DatasetFreshness, DatasetListItem, DatasetRun, DatasetSummary, IcyVeinsTierlistEntry, IcyVeinsTierlistResponse, PanelUser, SystemReport, SystemStatus, TierlistEntry, WowClassListResponse, WowGGTierlistEntry, WowGGTierlistResponse, WowSpecializationResponse, WowSpecListResponse } from "./types";


type View = "overview" | "catalog" | "genshin-impact" | "league-of-legends" | "datasets" | "api" | "system";

const ApiConsoleActivityGraph = dynamic(
  () => import("./ApiConsoleActivityGraph").then((module) => module.ApiConsoleActivityGraph),
  {
    ssr: false,
    loading: () => <div className="h-[245px] min-w-0" aria-hidden="true" />,
  },
);

const GenshinImpactCatalog = dynamic(
  () => import("./GenshinImpactCatalog").then((module) => module.GenshinImpactCatalog),
);

const WarcraftCatalog = dynamic(
  () => import("./WarcraftCatalog").then((module) => module.WarcraftCatalog),
);

const navItems = [
  { id: "overview" as const, label: "Обзор", icon: Gauge, href: "/api-console" },
  { id: "catalog" as const, label: "База Warcraft", icon: BookOpen, href: "/api-console/catalog" },
  { id: "genshin-impact" as const, label: "Genshin Impact", icon: Gem, href: "/api-console/genshin-impact" },
  { id: "league-of-legends" as const, label: "League of Legends", icon: Gamepad2, href: "/api-console/league-of-legends" },
  { id: "datasets" as const, label: "Датасеты", icon: Database, href: "/api-console/datasets" },
  { id: "api" as const, label: "API", icon: Code2, href: "/api-console/api" },
  { id: "system" as const, label: "Система", icon: Server, href: "/api-console/system" },
];

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3" aria-label="Gildra API">
      <div className="grid size-9 place-items-center border border-[#8b7138] bg-[#171716] text-[#e2c171] [clip-path:polygon(7px_0,100%_0,100%_calc(100%-7px),calc(100%-7px)_100%,0_100%,0_7px)]">
        <Swords className="size-[18px]" strokeWidth={1.5} />
      </div>
      {!compact && <div><div className="font-[family-name:var(--display)] text-[15px] font-bold tracking-[.18em] text-[#e7c878]">GILDRA</div><div className="text-[10px] uppercase tracking-[.28em] text-[#657087]">API Console</div></div>}
    </div>
  );
}

export function ApiConsoleDashboard({ user, consolePath: segments, onLogout }: { user: PanelUser; consolePath: string[]; onLogout: () => void }) {
  const ct = useConsoleText();
  const pathKey = segments.join("/");
  const view: View = segments[0] === "catalog" ? "catalog" : segments[0] === "genshin-impact" ? "genshin-impact" : segments[0] === "league-of-legends" ? "league-of-legends" : segments[0] === "datasets" ? "datasets" : segments[0] === "api" ? "api" : segments[0] === "system" ? "system" : "overview";
  const datasetSlug = view === "datasets" ? segments[1] ?? "" : "";
  const classSlug = view === "datasets" && segments[2] === "classes" ? segments[3] ?? "" : "";
  const [mobileNav, setMobileNav] = useState(false);
  // Every view loads its own sections; the header button only bumps a key
  // that the section hooks watch, so a refresh never blocks on one request.
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((value) => value + 1);

  async function logout() { try { await fetch("/v1/auth/logout", { method: "POST", credentials: "include" }); } finally { onLogout(); } }

  return (
    <main data-api-console className="min-h-screen bg-[#090b10] text-[#e7eaf1] lg:grid lg:grid-cols-[230px_minmax(0,1fr)]">
      <aside className={cn("fixed inset-y-0 left-0 z-40 flex w-[230px] flex-col border-r border-[#252a37] bg-[#0c0f16] transition-transform lg:translate-x-0", mobileNav ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex h-[76px] items-center justify-between border-b border-[#252a37] px-5"><BrandMark /><button type="button" onClick={() => setMobileNav(false)} className="lg:hidden" aria-label={ct("Закрыть меню")}><X className="size-5" /></button></div>
        <nav className="flex flex-1 flex-col gap-1 p-3" aria-label={ct("Разделы панели")}>
          <div className="px-3 pb-2 pt-3 text-[10px] uppercase tracking-[.18em] text-[#586276]">{ct("Панель управления")}</div>
          {navItems.map((item) => <Link key={item.id} href={item.href} onClick={() => setMobileNav(false)} className={cn("flex h-10 items-center gap-3 border-l-2 px-3 text-left text-xs font-medium transition-colors", view === item.id ? "border-[#c9a24f] bg-[#1a1c20] text-[#e4c574]" : "border-transparent text-[#8791a5] hover:bg-[#141821] hover:text-[#d7dce6]")}><item.icon className="size-4" strokeWidth={1.6} />{ct(item.label)}</Link>)}
        </nav>
        <div className="border-t border-[#252a37] p-3"><div className="mb-2 flex items-center gap-3 px-2 py-2"><div className="grid size-8 place-items-center border border-[#5b4e32] bg-[#1a1812] text-xs font-bold text-[#d8b867]">{(user.displayName || user.email).slice(0, 1).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{user.displayName || ct("Администратор")}</div><div className="truncate text-[10px] text-[#687286]">{user.email}</div></div></div><Button variant="ghost" onClick={logout} className="h-9 w-full justify-start rounded-sm text-xs text-[#8490a4] hover:bg-[#181c25] hover:text-[#e8a0a0]"><LogOut className="size-4" />{ct("Выйти")}</Button></div>
      </aside>
      {mobileNav && <button className="fixed inset-0 z-30 bg-black/70 lg:hidden" onClick={() => setMobileNav(false)} aria-label={ct("Закрыть меню")} />}

      <section className="min-w-0 lg:col-start-2">
        <header className="sticky top-0 z-20 flex h-[64px] items-center justify-between border-b border-[#252a37] bg-[#0b0e14]/95 px-4 backdrop-blur sm:px-6 lg:h-[76px] lg:px-8"><div className="flex items-center gap-3"><button type="button" onClick={() => setMobileNav(true)} className="grid size-9 place-items-center border border-[#303645] lg:hidden" aria-label={ct("Открыть меню")}><Menu className="size-5" /></button><div><p className="text-[10px] uppercase tracking-[.16em] text-[#687286]">Gildra API / {pathKey || ct("обзор")}</p><h1 className="font-[family-name:var(--display)] text-lg font-semibold sm:text-xl">{view === "overview" ? ct("Обзор API") : view === "catalog" ? ct("База Warcraft") : view === "genshin-impact" ? ct("База Genshin Impact") : view === "league-of-legends" ? ct("База League of Legends") : view === "datasets" ? classSlug ? ct("Информация о классе") : datasetSlug ? ct("Данные датасета") : ct("Датасеты") : view === "api" ? ct("Документация API") : ct("Состояние системы")}</h1></div></div>{view !== "genshin-impact" && view !== "league-of-legends" ? <Button variant="outline" onClick={refresh} className="h-9 rounded-sm border-[#3a404f] bg-[#11151d] text-xs text-[#abb3c2] hover:border-[#8d7540] hover:bg-[#181a1d] hover:text-[#e4c574]"><RefreshCw className="size-3.5" /><span className="hidden sm:inline">{ct("Обновить")}</span></Button> : null}</header>

        <div className="mx-auto max-w-[1480px] p-4 sm:p-6 lg:p-8">
          {view === "catalog" ? <CatalogView refreshKey={refreshKey} /> : view === "genshin-impact" ? <GenshinImpactCatalog /> : view === "league-of-legends" ? <LeagueConsolePanel /> : view === "datasets" ? <DatasetsView datasetSlug={datasetSlug} classSlug={classSlug} refreshKey={refreshKey} /> : view === "api" ? <APIView /> : view === "system" ? <SystemView refreshKey={refreshKey} /> : <OverviewView refreshKey={refreshKey} />}
        </div>
      </section>
    </main>
  );
}

// Loadable renders a section from its own request state: content when data
// is present, an inline error with retry, or a skeleton — never a page-wide
// spinner that waits for unrelated requests.
function Loadable<T>({ state, title, children }: { state: ConsoleRequestState<T>; title: string; children: (value: T) => React.ReactNode }) {
  const ct = useConsoleText();
  if (state.data) return <>{children(state.data)}</>;
  if (state.error) return <SectionError title={title} message={ct(state.error)} onRetry={state.reload} />;
  return <SectionSkeleton title={title} />;
}

function SectionSkeleton({ title }: { title: string }) {
  const ct = useConsoleText();
  return <div role="status" aria-busy="true" aria-label={["", title, ct(": загрузка")].join("")} className="border border-[#2d3341] bg-[#11151d] p-5"><div className="flex items-center gap-3 text-[10px] uppercase tracking-[.14em] text-[#687286]"><RefreshCw className="size-3.5 animate-spin text-[#c9a24f]" />{title}</div><div className="mt-4 space-y-2"><div className="h-3 w-2/5 animate-pulse bg-[#1c2230]" /><div className="h-3 w-3/5 animate-pulse bg-[#1c2230]" /><div className="h-3 w-1/3 animate-pulse bg-[#1c2230]" /></div></div>;
}

function SectionError({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  const ct = useConsoleText();
  return <div role="alert" className="border border-[#693b3e] bg-[#1b1114] p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><CircleAlert className="mt-0.5 size-4 shrink-0 text-[#e88787]" /><div><div className="text-xs font-semibold text-[#f0b0b0]">{title}{ct(": не удалось загрузить")}</div><p className="mt-1 text-xs text-[#a8909a]">{message}</p></div></div><Button variant="outline" onClick={onRetry} className="h-9 rounded-sm border-[#5c3a3f] bg-transparent text-xs text-[#f0b0b0] hover:bg-[#2a1518]"><RefreshCw className="size-3.5" />{ct("Повторить")}</Button></div></div>;
}

function CatalogView({ refreshKey }: { refreshKey: number }) {
  const ct = useConsoleText();
  const health = useConsoleRequest<CatalogHealthResponse>("/v1/admin/catalog-health", { refreshKey, fallback: ct("Не удалось загрузить состояние каталога") });
  return <WarcraftCatalog buildVersion={health.data?.catalog.activeBuildVersion ?? ""} />;
}

function OverviewView({ refreshKey }: { refreshKey: number }) {
  const ct = useConsoleText();
  const system = useConsoleRequest<SystemReport>("/v1/admin/system", { refreshKey, fallback: ct("Не удалось проверить состояние систем") });
  const health = useConsoleRequest<CatalogHealthResponse>("/v1/admin/catalog-health", { refreshKey, fallback: ct("Не удалось загрузить состояние каталога") });
  const summary = useConsoleRequest<DatasetDetailResponse>("/v1/admin/datasets/tierlist-wowhead", { refreshKey, fallback: ct("Не удалось загрузить сводку датасета") });
  const runs = useConsoleRequest<{ data: DatasetRun[] }>("/v1/admin/datasets/tierlist-wowhead/runs", { refreshKey, fallback: ct("Не удалось загрузить историю обновлений") });
  const analytics = useConsoleRequest<AnalyticsOverviewResponse>("/v1/admin/analytics-overview?hours=24", { refreshKey, fallback: ct("Аналитика временно недоступна") });
  const [activity, setActivity] = useState("raid");
  const [role, setRole] = useState("dps");
  const [query, setQuery] = useState("");
  const tierlist = useConsoleRequest<{ data: TierlistEntry[] }>(`/v1/admin/tierlist-wowhead?activity=${activity}&role=${role}`, { refreshKey, fallback: ct("Не удалось загрузить тир-лист") });
  const entries = useMemo(() => (tierlist.data?.data ?? []).filter((entry) => `${entry.specName} ${entry.className}`.toLowerCase().includes(query.toLowerCase())), [tierlist.data, query]);
  return <div className="flex flex-col gap-5">
    <StatusRail systems={system.data?.systems ?? null} dataset={summary.data?.dataset ?? null} error={ct(system.error || summary.error)} onRetry={() => { system.reload(); summary.reload(); }} />
    <Loadable state={health} title={ct("Полнота каталога")}>{(value) => <CatalogHealthPanel catalog={value.catalog} readiness={value.catalogReadiness} />}</Loadable>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.55fr)]"><Loadable state={analytics} title={ct("Активность API")}>{(value) => <ActivityChart analytics={value.analytics} />}</Loadable><Loadable state={runs} title={ct("История обновлений")}>{(value) => <RunHistory runs={value.data} compact />}</Loadable></div>
    <Loadable state={tierlist} title="Tierlist WoWHead">{() => <TierlistTable entries={entries} query={query} setQuery={setQuery} activity={activity} setActivity={setActivity} role={role} setRole={setRole} limit={12} />}</Loadable>
    <EndpointList />
  </div>;
}

function DatasetsView({ datasetSlug, classSlug, refreshKey }: { datasetSlug: string; classSlug: string; refreshKey: number }) {
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

type LeaguePanelStatus = {
  ready: boolean;
  ddragonVersion?: string;
  publishedAt?: string;
  champions: number;
  abilities: number;
  skins: number;
  contentEntries: number;
  mediaAssets: number;
  contentByCategory: Record<string, number>;
};

type LeaguePanelChampion = {
  id: number;
  slug: string;
  name: string;
  title: string;
  tags: string[];
  assets: { icon: string | null; tile: string | null; splash: string | null };
};

function LeagueConsolePanel() {
  const ct = useConsoleText();
  const [status, setStatus] = useState<LeaguePanelStatus | null>(null);
  const [champions, setChampions] = useState<LeaguePanelChampion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const [nextStatus, page] = await Promise.all([
        requestJSON<LeaguePanelStatus>("/league-of-legends/v1/status", { signal }),
        requestJSON<{ data: LeaguePanelChampion[] }>("/league-of-legends/v1/champions?locale=en_US&limit=12", { signal }),
      ]);
      setStatus(nextStatus);
      setChampions(page.data);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : ct("Не удалось загрузить League of Legends"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (loading && !status) return <div className="grid min-h-[60vh] place-items-center"><RefreshCw className="size-6 animate-spin text-[#c9a24f]" /></div>;
  if (error && !status) return <PanelLoadError message={error} onRetry={() => void load()} />;

  return <div className="space-y-6">
    {error && <Alert variant="destructive" className="rounded-sm border-[#693b3e] bg-[#2a1518] text-[#ef9a9d]"><CircleAlert className="size-4" /><AlertTitle>{ct("League API временно недоступен")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    <Card className="rounded-sm border-[#2b3240] bg-[#11151d]"><CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle className="font-[family-name:var(--display)] text-xl text-[#e7eaf1]">League of Legends</CardTitle><p className="mt-1 text-sm text-[#8791a5]">{ct("Каталог чемпионов, умений, обликов и игровых справочников.")}</p></div><Badge className={cn("rounded-sm", status?.ready ? "bg-[#173e31] text-[#80d9ae]" : "bg-[#3d2e17] text-[#e5bd70]")}>{status?.ready ? ct("Данные опубликованы") : ct("Ожидается импорт")}</Badge></CardHeader><CardContent className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[
        [ct("Чемпионы"), status?.champions ?? 0], [ct("Умения"), status?.abilities ?? 0], [ct("Облики"), status?.skins ?? 0], [ct("Контент"), status?.contentEntries ?? 0], [ct("Медиа"), status?.mediaAssets ?? 0],
      ].map(([label, value]) => <div key={label} className="border border-[#293040] bg-[#0d1118] p-4"><p className="text-[10px] uppercase tracking-[.12em] text-[#687286]">{label}</p><p className="mt-2 text-2xl font-semibold text-[#e7c878]">{value}</p></div>)}</div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-[#8791a5]"><span>Data Dragon {status?.ddragonVersion ?? "—"}</span><span>·</span><span>{status?.publishedAt ? [ct("Опубликовано "), new Date(status.publishedAt).toLocaleString("en-US"), ""].join("") : ct("Релиз ещё не опубликован")}</span><Link href="/league-of-legends" className="ml-auto inline-flex items-center gap-2 text-[#e4c574] hover:underline">{ct("Открыть библиотеку ")}<ExternalLink className="size-3.5" /></Link></div>
    </CardContent></Card>
    <Card className="rounded-sm border-[#2b3240] bg-[#11151d]"><CardHeader><CardTitle className="font-[family-name:var(--display)] text-lg">{ct("Последние чемпионы")}</CardTitle></CardHeader><CardContent>{champions.length > 0 ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{champions.map((champion) => <Link key={champion.id} href={`/league-of-legends/champions/${champion.slug}`} className="flex items-center gap-3 border border-[#293040] bg-[#0d1118] p-3 transition-colors hover:border-[#8d7540]"><div className="size-12 shrink-0 overflow-hidden bg-[#1a202c]">{champion.assets.icon ? <img src={champion.assets.icon} alt="" className="size-full object-cover" loading="lazy" /> : null}</div><div className="min-w-0"><p className="truncate font-medium text-[#e7eaf1]">{champion.name}</p><p className="truncate text-xs text-[#8791a5]">{ct(champion.title)}</p><p className="mt-1 text-[10px] uppercase tracking-[.1em] text-[#687286]">{champion.tags.join(" · ") || "Champion"}</p></div></Link>)}</div> : <p className="text-sm text-[#8791a5]">{ct("Данные чемпионов появятся после первого подтверждённого импорта.")}</p>}</CardContent></Card>
  </div>;
}

function PanelLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const ct = useConsoleText();
  return <div className="grid min-h-[60vh] place-items-center">
    <Card className="w-full max-w-xl rounded-sm border-[#693b3e] bg-[#171116]">
      <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
        <CircleAlert className="size-8 text-[#e88787]" />
        <div><h2 className="font-[family-name:var(--display)] text-lg font-semibold text-[#f0b0b0]">{ct("Не удалось загрузить данные")}</h2><p className="mt-2 text-sm text-[#9e8790]">{message}</p></div>
        <Button onClick={onRetry} className="rounded-sm bg-[#c8a14d] text-[#171205] hover:bg-[#e0bd68]"><RefreshCw className="size-4" />{ct("Повторить")}</Button>
      </CardContent>
    </Card>
  </div>;
}

function CatalogHealthPanel({ catalog, readiness }: { catalog: CatalogHealth & { warnings?: string[] }; readiness: CatalogReadiness }) {
  const ct = useConsoleText();
  const actionableChecks = readiness.checks.filter((check) => check.status !== "pass");
  const percent = (value: number) => catalog.entityCount ? `${(value / catalog.entityCount * 100).toFixed(1)}%` : "—";
  const activeImport = catalog.imports.find((item) => item.status === "RUNNING");
  return <Panel title={ct("Полнота каталога")} kicker={`Read-model #${catalog.generation} · ${catalog.readModelStatus}`} icon={Database}>
    <div className="grid gap-px border border-[#292f3c] bg-[#292f3c] sm:grid-cols-2 xl:grid-cols-6">
      <Metric label={ct("Сущности")} value={catalog.entityCount} />
      <CatalogCoverageMetric label={ct("Локализация")} value={catalog.localizedCount} percent={percent(catalog.localizedCount)} />
      <CatalogCoverageMetric label={ct("Описание")} value={catalog.describedCount} percent={percent(catalog.describedCount)} />
      <CatalogCoverageMetric label="Tooltip" value={catalog.tooltipCount} percent={percent(catalog.tooltipCount)} />
      <CatalogCoverageMetric label={ct("Иконка")} value={catalog.iconCount} percent={percent(catalog.iconCount)} />
      <Metric label={ct("Связи")} value={catalog.relationshipCount} />
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] text-[#707b90]">
      <span>{ct("Последнее атомарное обновление: ")}{catalog.refreshedAt ? new Date(catalog.refreshedAt).toLocaleString("en-US") : ct("не выполнялось")}</span>
      <span>Pipeline: {catalog.lastPipelineRunId ? `#${catalog.lastPipelineRunId} · ${catalog.pipelineStatus} · ${catalog.pipelineStage || "complete"}` : ct("не запускался")}</span>
      <span className={catalog.publicationReady ? "text-[#7fc493]" : "text-[#d99a68]"}>{ct("Публикация: ")}{catalog.publicationReady == null ? ct("не проверена") : catalog.publicationReady ? ct("разрешена") : ct("заблокирована")}</span>
      {catalog.warnings?.includes("import_activity_skipped") ? <span className="text-[#d9ad57]">{ct("Живые счётчики импорта пропущены: запрос превысил лимит времени")}</span> : null}
    </div>
    <div className="mt-4 border border-[#292f3c] bg-[#0d1118] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><div className="text-[10px] uppercase tracking-[.14em] text-[#687286]">Production readiness · {readiness.buildVersion}</div><div className="mt-1 text-sm font-semibold text-[#dce1eb]">{ct("Автоматические проверки фундамента WoW")}</div></div>
        <div className="flex gap-2 text-[10px] uppercase tracking-[.1em]"><span className={cn("border px-2 py-1", readiness.dataReady ? "border-[#355b42] text-[#7fc493]" : "border-[#673b3f] text-[#e58b8f]")}>{ct("Данные: ")}{readiness.dataReady ? ct("готовы") : ct("блок")}</span><span className={cn("border px-2 py-1", readiness.productionReady ? "border-[#355b42] text-[#7fc493]" : "border-[#6a5730] text-[#d9ad57]")}>Production: {readiness.productionReady ? ct("готов") : ct("блок")}</span></div>
      </div>
      {actionableChecks.length ? <div className="mt-3 grid gap-2 lg:grid-cols-2">{actionableChecks.map((check) => <div key={check.key} className={cn("border px-3 py-2 text-[10px]", check.status === "fail" ? "border-[#5f3539] bg-[#1b1013]" : "border-[#51452b] bg-[#17140d]")}><div className="flex items-center justify-between gap-3"><span className={check.status === "fail" ? "text-[#e58b8f]" : "text-[#d9ad57]"}>{check.status === "fail" ? ct("Блокирует") : ct("Предупреждение")} · {check.scope}</span><span className="font-mono text-[#a9b1c0]">{check.count.toLocaleString("en-US")}</span></div><div className="mt-1 text-[#858fa2]">{check.message}</div></div>)}</div> : <div className="mt-3 text-xs text-[#7fc493]">{ct("Все проверки пройдены.")}</div>}
    </div>
    {activeImport ? <div className="mt-4 border border-[#4a402a] bg-[#17140d] p-4" role="status" aria-live="polite">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><div className="flex items-center gap-2 text-[10px] uppercase tracking-[.14em] text-[#d2ad57]"><span className="size-1.5 animate-pulse rounded-full bg-[#d2ad57]" />{ct("Идёт импорт")}</div><div className="mt-2 font-[family-name:var(--display)] text-lg font-semibold text-[#ece4cf]">{catalogImportLabel(activeImport.entityTypes)}</div><div className="mt-1 text-[10px] text-[#8f897a]">{activeImport.source} · API {activeImport.buildVersion} {ct(" → сайт ")}{catalog.activeBuildVersion} · {activeImport.locales.join(" + ") || ct("локаль источника")}</div></div>
        <div className="grid grid-cols-2 gap-px border border-[#393326] bg-[#393326] sm:min-w-72"><DatasetMetric label={ct("Сохранено")} value={activeImport.liveSourceRecords} /><div className="bg-[#11100c] px-3 py-3"><div className="text-[10px] uppercase tracking-[.12em] text-[#777062]">{ct("Последняя запись")}</div><div className="mt-1 text-xs font-semibold text-[#d8d0bd]">{activeImport.lastActivityAt ? relativeTime(activeImport.lastActivityAt) : ct("ожидание")}</div></div></div>
      </div>
      <div className="mt-3 text-[10px] text-[#777062]">{ct("Запущено ")}{new Date(activeImport.startedAt).toLocaleString("en-US")} {ct(" · данные станут публичными после атомарного завершения snapshot.")}</div>
    </div> : null}
    {catalog.imports.length ? <details className="mt-3 border border-[#292f3c] bg-[#0d1118]"><summary className="cursor-pointer px-4 py-3 text-[10px] font-medium text-[#949daf]">{ct("Последние импорты (")}{catalog.imports.length})</summary><div className="border-t border-[#292f3c]">
      {catalog.imports.map((item) => <div key={item.id} className="grid gap-2 border-b border-[#242a35] px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(140px,1fr)_110px_120px_minmax(160px,1fr)] sm:items-center"><div><div className="text-xs font-medium text-[#d8dde7]">{catalogImportLabel(item.entityTypes)}</div><div className="mt-0.5 font-mono text-[10px] text-[#5f697c]">{item.buildVersion} · {item.id.slice(0, 8)}</div></div><span className={cn("w-fit text-[10px] uppercase tracking-[.1em]", item.status === "SUCCEEDED" ? "text-[#72b97b]" : item.status === "FAILED" ? "text-[#e58b8f]" : "text-[#d2ad57]")}>{item.status === "SUCCEEDED" ? ct("Готово") : item.status === "FAILED" ? ct("Ошибка") : ct("В работе")}</span><span className="text-xs tabular-nums text-[#aeb6c5]">{Math.max(item.recordsWritten, item.liveSourceRecords).toLocaleString("en-US")}</span><span className="truncate text-[10px] text-[#697488]" title={item.errorSummary}>{item.errorSummary || (item.finishedAt ? new Date(item.finishedAt).toLocaleString("en-US") : item.lastActivityAt ? [ct("Активность "), relativeTime(item.lastActivityAt), ""].join("") : ct("Ожидание данных"))}</span></div>)}
    </div></details> : null}
  </Panel>;
}

function catalogImportLabel(entityTypes: string[]) {
  if (!entityTypes.length) return "Каталог World of Warcraft";
  const labels: Record<string, string> = { item: "Предметы", spell: "Заклинания", creature: "Существа и NPC", quest: "Квесты", talent: "Таланты", pvp_talent: "PvP-таланты", profession: "Профессии", mount: "Транспорт", battle_pet: "Боевые питомцы", class: "Классы", specialization: "Специализации", achievement: "Достижения", item_set: "Наборы предметов", instance: "Подземелья и рейды", encounter: "Сражения", faction: "Фракции" };
  return entityTypes.map((type) => labels[type] ?? type).join(", ");
}

function CatalogCoverageMetric({ label, value, percent }: { label: string; value: number; percent: string }) {
  return <div className="bg-[#0d1118] px-3 py-3"><div className="text-[10px] uppercase tracking-[.12em] text-[#687286]">{label}</div><div className="mt-1 flex items-baseline justify-between gap-2"><span className="font-[family-name:var(--display)] text-xl font-semibold">{value.toLocaleString("en-US")}</span><span className="text-[10px] text-[#d2ad57]">{percent}</span></div></div>;
}

function WowClassesSection({ classes, specs, detail, classSlug, specSlug, query, setQuery }: {
  classes: WowClassListResponse;
  specs: WowSpecListResponse;
  detail: WowSpecializationResponse | null;
  classSlug: string;
  specSlug: string;
  query: string;
  setQuery: (value: string) => void;
}) {
  const ct = useConsoleText();
  if (classSlug && specSlug) return detail ? <WowSpecializationDetail detail={detail} /> : <CatalogEmpty text={ct("Специализация не найдена")} />;
  if (classSlug) {
    const className = specs.data[0]?.className ?? classSlug;
    return <div className="flex flex-col gap-5">
      <Breadcrumb items={[{ label: ct("Классы"), href: "/classes" }, { label: className }]} />
      <CatalogHeading kicker={ct("Специализации класса")} title={className} description={["", specs.pagination.total, ct(" специализаций. Выберите нужную, чтобы увидеть все гайды и позиции во всех тир-листах.")].join("")} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {specs.data.map((spec) => <a key={spec.specSlug} href={`/classes/${spec.classSlug}/${spec.specSlug}`} className="group flex min-h-52 flex-col border border-[#2d3341] bg-[#11151d] p-5 transition-colors hover:border-[#7d693d] hover:bg-[#151921]">
          <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] uppercase tracking-[.15em] text-[#887442]">{spec.className}</p><h3 className="mt-2 font-[family-name:var(--display)] text-xl font-semibold text-[#e8eaf0]">{spec.specName}</h3></div><ChevronRight className="mt-1 size-5 text-[#697388] transition-transform group-hover:translate-x-1 group-hover:text-[#d2ad57]" /></div>
          <div className="mt-5 grid grid-cols-3 gap-px border border-[#292f3c] bg-[#292f3c]"><DatasetMetric label={ct("Гайдов")} value={spec.guideCount} /><DatasetMetric label={ct("Сборок")} value={spec.buildCount} /><DatasetMetric label={ct("Позиций")} value={spec.placementCount} /></div>
          <div className="mt-auto flex flex-wrap gap-1.5 pt-5">{spec.sources.map((source) => <Badge key={source} variant="outline" className="rounded-sm border-[#3b4250] bg-[#0d1118] px-2 text-[10px] font-normal text-[#909aae]">{source}</Badge>)}</div>
        </a>)}
      </div>
      {specs.data.length === 0 ? <CatalogEmpty text={ct("Для этого класса пока нет специализаций")} /> : null}
    </div>;
  }

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = classes.data.filter((item) => `${item.className} ${item.classSlug}`.toLowerCase().includes(normalizedQuery));
  return <div className="flex flex-col gap-5">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <CatalogHeading kicker={ct("Единый каталог")} title={ct("Классы World of Warcraft")} description={ct("WoWHead, Archon, wow.gg и Icy Veins собраны в одном месте. Сразу видно, сколько материалов есть у каждого класса.")} />
      <div className="relative w-full shrink-0 sm:w-64"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#626d80]" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ct("Найти класс")} className="h-10 rounded-sm border-[#303645] bg-[#0b0e14] pl-9 text-xs" /></div>
    </div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {filtered.map((item) => <a key={item.classSlug} href={`/classes/${item.classSlug}`} className="group block border border-[#2d3341] bg-[#11151d] transition-colors hover:border-[#7d693d] hover:bg-[#151921]">
        <div className="flex flex-col gap-5 p-5">
          <div className="flex items-start gap-4"><div className="grid size-11 shrink-0 place-items-center border border-[#51452e] bg-[#1b1811] text-[#d2ad57]"><ShieldCheck className="size-5" strokeWidth={1.5} /></div><div className="min-w-0 flex-1"><h3 className="font-[family-name:var(--display)] text-lg font-semibold text-[#e7eaf1]">{item.className}</h3><p className="mt-1 text-[10px] text-[#748095]">{ct("Обновлено ")}{ct(relativeTime(item.updatedAt))}</p></div><ChevronRight className="mt-2 size-5 text-[#657087] transition-transform group-hover:translate-x-1 group-hover:text-[#d2ad57]" /></div>
          <div className="grid grid-cols-4 gap-px border border-[#292f3c] bg-[#292f3c]"><DatasetMetric label={ct("Спеков")} value={item.specCount} /><DatasetMetric label={ct("Гайдов")} value={item.guideCount} /><DatasetMetric label={ct("Позиций")} value={item.placementCount} /><DatasetMetric label={ct("Источников")} value={item.sourceCount} /></div>
        </div>
      </a>)}
    </div>
    {filtered.length === 0 ? <CatalogEmpty text={ct("Классы по этому запросу не найдены")} /> : null}
  </div>;
}

function WowSpecializationDetail({ detail }: { detail: WowSpecializationResponse }) {
  const ct = useConsoleText();
  const [source, setSource] = useState("all");
  const [activity, setActivity] = useState("all");
  const spec = detail.specialization;
  const sources = Array.from(new Set(detail.placements.map((item) => item.sourceName))).sort();
  const activities = Array.from(new Set(detail.placements.map((item) => item.activity))).sort();
  const placements = detail.placements.filter((item) => (source === "all" || item.sourceName === source) && (activity === "all" || item.activity === activity));
  return <div className="flex flex-col gap-5">
    <Breadcrumb items={[{ label: ct("Классы"), href: "/classes" }, { label: spec.className, href: `/classes/${spec.classSlug}` }, { label: spec.specName }]} />
    <div className="border border-[#2d3341] bg-[#11151d] p-5 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-[10px] uppercase tracking-[.16em] text-[#9a824a]">{spec.className} {ct(" · специализация")}</p><h2 className="mt-2 font-[family-name:var(--display)] text-3xl font-semibold">{spec.specName}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#7f899d]">{ct("Все найденные гайды, сборки и позиции этой специализации в подключённых тир-листах.")}</p></div><div className="grid grid-cols-2 gap-px border border-[#292f3c] bg-[#292f3c] sm:grid-cols-4 lg:min-w-[520px]"><DatasetMetric label={ct("Гайдов")} value={spec.guideCount} /><DatasetMetric label={ct("Сборок")} value={spec.buildCount} /><DatasetMetric label={ct("Позиций")} value={spec.placementCount} /><DatasetMetric label={ct("Источников")} value={spec.sources.length} /></div></div>
    </div>
    <Panel title={ct("Гайды")} kicker={["", detail.guides.length, ct(" уникальных ссылок")].join("")} icon={BookOpen}>
      {detail.guides.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{detail.guides.map((guide) => <a key={`${guide.datasetSlug}-${guide.url}`} href={guide.url} target="_blank" rel="noreferrer" className="group flex items-center gap-3 border border-[#303645] bg-[#0d1118] p-4 hover:border-[#7d693d]"><div className="grid size-9 shrink-0 place-items-center border border-[#51452e] bg-[#1b1811] text-[#d2ad57]"><BookOpen className="size-4" /></div><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-[#dfe3eb]">{ct(guide.title)}</div><div className="mt-1 text-[10px] uppercase tracking-[.12em] text-[#737e92]">{guide.sourceName}</div></div><ExternalLink className="size-3.5 text-[#697388] group-hover:text-[#d2ad57]" /></a>)}</div> : <CatalogEmpty text={ct("Прямые ссылки на гайды пока не найдены")} />}
    </Panel>
    <Panel title={ct("Позиции во всех тир-листах")} kicker={["", placements.length, ct(" из "), detail.pagination.total, ct(" позиций")].join("")} icon={BarChart3} action={<div className="grid w-full grid-cols-2 gap-2 sm:w-auto"><CatalogSelect label={ct("Источник")} value={source} onChange={setSource} options={[["all", ct("Все источники")], ...sources.map((value) => [value, value])]} /><CatalogSelect label={ct("Формат")} value={activity} onChange={setActivity} options={[["all", ct("Все форматы")], ...activities.map((value) => [value, catalogActivityLabel(value)])]} /></div>}>
      <div className="overflow-x-auto border border-[#292f3c]"><Table><TableHeader><TableRow className="border-[#292f3c] bg-[#0c1017] hover:bg-[#0c1017]"><TableHead className="w-16 text-[10px] uppercase tracking-[.12em] text-[#6f798c]">{ct("Тир")}</TableHead><TableHead className="text-[10px] uppercase tracking-[.12em] text-[#6f798c]">{ct("Источник и формат")}</TableHead><TableHead className="hidden text-[10px] uppercase tracking-[.12em] text-[#6f798c] lg:table-cell">{ct("Контекст")}</TableHead><TableHead className="text-right text-[10px] uppercase tracking-[.12em] text-[#6f798c]">{ct("Метрика")}</TableHead><TableHead className="w-12"><span className="sr-only">{ct("Ссылка")}</span></TableHead></TableRow></TableHeader><TableBody>{placements.map((item, index) => <TableRow key={`${item.datasetSlug}-${item.contextKey}-${item.rank}-${index}`} className="border-[#252b38] bg-[#11151d] hover:bg-[#171b24]"><TableCell><span className={cn("grid size-8 place-items-center border font-[family-name:var(--display)] text-sm font-bold", tierStyle(item.tier))}>{item.tier || "—"}</span><div className="mt-1 text-center text-[10px] text-[#737e92]">#{item.rank}</div></TableCell><TableCell><div className="text-xs font-semibold text-[#dfe3eb]">{item.sourceName}</div><div className="mt-1 text-[10px] text-[#8791a5]">{catalogActivityLabel(item.activity)} · {roleLabel(item.role)}</div></TableCell><TableCell className="hidden max-w-[620px] lg:table-cell"><div className="text-xs text-[#a8b0bf]">{item.contextLabel}</div>{item.description ? <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-[#707b90]" title={item.description}>{item.description}</p> : null}<time className="mt-1 block text-[10px] text-[#596477]">{formatDate(item.sourceUpdatedAt)}</time></TableCell><TableCell className="text-right font-mono text-xs text-[#d8bd79]">{item.metricValue == null ? "—" : formatMetricNumber(item.metricValue)}{item.metricLabel ? <div className="mt-1 font-sans text-[10px] text-[#6d778b]">{item.metricLabel}</div> : null}</TableCell><TableCell><a href={item.guideUrl || item.sourceUrl} target="_blank" rel="noreferrer" className="grid size-8 place-items-center border border-[#323846] text-[#a88c4d] hover:border-[#8f7540] hover:text-[#e0bd68]" aria-label={[ct("Открыть "), item.linkKind === "build" ? "сборку" : "источник", ""].join("")}><ExternalLink className="size-3.5" /></a></TableCell></TableRow>)}</TableBody></Table></div>
      {placements.length === 0 ? <CatalogEmpty text={ct("Нет позиций с выбранными фильтрами")} /> : null}
    </Panel>
  </div>;
}

function CatalogHeading({ kicker, title, description }: { kicker: string; title: string; description: string }) {
  return <div><p className="text-[10px] uppercase tracking-[.16em] text-[#9a824a]">{kicker}</p><h2 className="mt-2 font-[family-name:var(--display)] text-2xl font-semibold">{title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[#7f899d]">{description}</p></div>;
}

function CatalogEmpty({ text }: { text: string }) { return <div className="border border-[#2d3341] bg-[#11151d] py-12 text-center text-sm text-[#7f899d]">{text}</div>; }

function CatalogSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  return <label className="min-w-0"><span className="sr-only">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full min-w-32 border border-[#343b49] bg-[#0b0e14] px-3 text-[10px] text-[#cbd2de] outline-none focus:border-[#a68a49]">{options.map(([id, text]) => <option key={`${label}-${id}`} value={id}>{text}</option>)}</select></label>;
}

function catalogActivityLabel(activity: string) { return activity === "mythic_plus" ? "Mythic+" : activity === "pvp" ? "PvP" : "Рейд"; }

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

function EmptyDataset() {
  const ct = useConsoleText(); return <div className="border border-[#2d3341] bg-[#11151d] py-16 text-center"><Database className="mx-auto size-8 text-[#6f798c]" /><h2 className="mt-4 text-lg font-semibold">{ct("Датасет не найден")}</h2><Link href={datasetPath()} className="mt-4 inline-flex items-center gap-2 text-xs text-[#d2ad57]"><ArrowLeft className="size-4" />{ct("К списку датасетов")}</Link></div>; }

function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  const ct = useConsoleText(); return <nav aria-label={ct("Хлебные крошки")} className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[.12em] text-[#697387]">{items.map((item, index) => <span key={`${item.label}-${index}`} className="flex items-center gap-2">{index > 0 ? <ChevronRight className="size-3" /> : null}{item.href ? <Link href={item.href} className="text-[#a98d4f] hover:text-[#ddba67]">{ct(item.label)}</Link> : <span>{ct(item.label)}</span>}</span>)}</nav>; }

function FreshnessBadge({ dataset }: { dataset: DatasetListItem }) {
  const ct = useConsoleText(); const fresh = dataset.freshness === "fresh"; const never = dataset.freshness === "never"; return <Badge variant="outline" className={cn("rounded-sm px-2 py-1 text-[10px] uppercase tracking-[.1em]", fresh ? "border-[#31583a] bg-[#102017] text-[#6bc278]" : never ? "border-[#604047] bg-[#261619] text-[#df7c83]" : "border-[#66552e] bg-[#211c10] text-[#e0b85d]")}><span className={cn("mr-1.5 size-1.5 rounded-full", fresh ? "bg-[#58ad67]" : never ? "bg-[#d95c55]" : "bg-[#d2a846]")} />{fresh ? ct("Свежие данные") : never ? ct("Нет данных") : ct("Данные устарели")}</Badge>; }

function DatasetMetric({ label, value }: { label: string; value: number }) { return <div className="bg-[#0c1017] p-3"><div className="text-[10px] uppercase tracking-[.12em] text-[#687286]">{label}</div><div className="mt-1 font-[family-name:var(--display)] text-lg font-semibold text-[#e1e5ed]">{value.toLocaleString("en-US")}</div></div>; }

function StatusRail({ systems, dataset, error, onRetry }: { systems: SystemStatus[] | null; dataset: DatasetListItem | DatasetSummary | null; error?: string; onRetry?: () => void }) {
  const ct = useConsoleText();
  if (error && !systems && !dataset && onRetry) return <SectionError title={ct("Состояние систем")} message={error} onRetry={onRetry} />;
  const success = systems ? systems.every((system) => system.status === "operational") : null;
  const cards = [
    { label: success == null ? ct("Проверка систем") : success ? ct("Все системы работают") : ct("Есть отклонения"), value: success == null ? (systems ? "—" : ct("Проверяем…")) : success ? ct("Работает") : ct("Проверить"), icon: Activity, ok: success === true },
    { label: ct("Страниц собрано"), value: dataset ? dataset.pageCount : "—", icon: FileJson2 },
    { label: ct("Записей в датасете"), value: dataset ? dataset.recordCount : "—", icon: Database },
    { label: ct("Уникальных специализаций"), value: dataset ? dataset.uniqueSpecCount : "—", icon: Swords },
    { label: ct("Последнее обновление"), value: dataset ? relativeTime(dataset.lastSuccessAt) : "—", icon: Clock3 },
  ];
  return <div className="grid border border-[#2b303e] bg-[#2b303e] sm:grid-cols-2 xl:grid-cols-5">{cards.map((card, index) => <div key={ct(card.label)} className="flex min-h-[92px] items-center gap-3 border-b border-r border-[#2b303e] bg-[#11151d] px-4 py-4 last:border-r-0 sm:px-5 xl:border-b-0"><div className={cn("grid size-9 shrink-0 place-items-center border bg-[#0b0e14]", index === 0 && card.ok ? "border-[#31583a] text-[#65ba72]" : "border-[#424652] text-[#c2a253]")}><card.icon className="size-4" strokeWidth={1.5} /></div><div className="min-w-0"><div className="truncate text-[10px] uppercase tracking-[.12em] text-[#737e92]">{ct(card.label)}</div><div className="mt-1 truncate font-[family-name:var(--display)] text-lg font-semibold text-[#e4e8ef]">{card.value}</div></div></div>)}</div>;
}

function ActivityChart({ analytics }: { analytics: AnalyticsOverview }) {
  const ct = useConsoleText();
  const timeFormatter = useMemo(
    () => new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" }),
    [],
  );
  const chart = useMemo(
    () => (analytics.series ?? []).map((point) => ({
      ...point,
      label: timeFormatter.format(new Date(point.hour)),
    })),
    [analytics.series, timeFormatter],
  );
  return <Panel title={ct("Активность API")} kicker={ct("Последние 24 часа")} icon={BarChart3}><div className="mb-4 grid grid-cols-3 gap-px border border-[#292f3c] bg-[#292f3c]"><Metric label={ct("События")} value={analytics.events} /><Metric label={ct("Пользователи")} value={analytics.uniqueUsers} /><Metric label={ct("Подписки")} value={analytics.activeSubscriptions} /></div><ApiConsoleActivityGraph data={chart} /></Panel>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="bg-[#0d1118] px-3 py-3"><div className="text-[10px] uppercase tracking-[.12em] text-[#687286]">{label}</div><div className="mt-1 font-[family-name:var(--display)] text-xl font-semibold">{value.toLocaleString("en-US")}</div></div>; }

function TierlistTable({ entries, query, setQuery, activity, setActivity, role, setRole, limit }: { entries: TierlistEntry[]; query: string; setQuery: (v: string) => void; activity: string; setActivity: (v: string) => void; role: string; setRole: (v: string) => void; limit?: number }) {
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

type WowGGOption = readonly [string, string];

function uniqueOptions(options: WowGGOption[]): WowGGOption[] {
  return Array.from(new Map(options.map((option) => [option[0], option])).values());
}

function WowGGSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: WowGGOption[] }) {
  return <label className="flex min-w-0 flex-col gap-1.5"><span className="text-[10px] uppercase tracking-[.12em] text-[#6f798c]">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full border border-[#343b49] bg-[#0b0e14] px-3 text-xs text-[#cbd2de] outline-none transition-colors hover:border-[#6d5c38] focus:border-[#a68a49]">{options.map(([id, text]) => <option key={`${label}-${id}`} value={id}>{text}</option>)}</select></label>;
}

function wowGGRoleLabel(role: string) { return role === "healer" ? "Лекарь" : role === "tank" ? "Танк" : role === "dungeon_ease" ? "Простота подземелий" : "DPS"; }
function wowGGKeyLabel(value: string) { return value === "high" ? "16+" : value === "middle" ? "13–16" : value === "low" ? "2–12" : "Все ключи"; }
function wowGGRaidLabel(value: string) { const labels: Record<string, string> = { raid_myth: "Эпохальный", raid_hero: "Героический", raid_normal: "Обычный", raid_n10: "Обычный 10", raid_n25: "Обычный 25", raid_h10: "Героический 10", raid_h25: "Героический 25" }; return labels[value] ?? value; }
function wowGGPVPLabel(value: string) { const labels: Record<string, string> = { "2v2": "2x2", "3v3": "3x3", "5v5": "5x5", rbg: "Рейтинговые поля боя", shuffle: "Соло-суматоха", blitz: "Блиц" }; return labels[value] ?? value; }
function wowGGMetrics(mode: string, role: string): WowGGOption[] {
  if (role === "dungeon_ease") return [["maxKey", "Максимальный ключ"]];
  if (mode === "pvp") return [["players", "Популярность"], ["avgRating", "Средний рейтинг"], ["maxRating", "Максимальный рейтинг"]];
  const metrics: WowGGOption[] = mode === "mythic_plus" ? [["score", "Рейтинг"]] : [];
  metrics.push(["popularity", "Популярность"], ["avgDps", "Средний урон"]);
  if (role === "healer") metrics.push(["avgHps", "Средний HPS"], ["maxHps", "Максимальный HPS"]);
  else metrics.push(["maxDps", "Максимальный урон"]);
  return metrics;
}

function wowGGMetricValue(entry: WowGGTierlistEntry, metric: string): number | null {
  if (metric === "score") return entry.metaScore;
  if (metric === "avgDps") return entry.averageDps;
  if (metric === "avgHps") return entry.averageHps;
  if (metric === "maxDps" || metric === "maxHps") return entry.topValue;
  if (metric === "popularity") return entry.popularity;
  if (metric === "players") return entry.pvpPlayers;
  if (metric === "avgRating") return entry.pvpAverageRating;
  if (metric === "maxRating") return entry.pvpMaxRating;
  if (metric === "maxKey") return entry.maxKey;
  return entry.metricValues[metric] ?? null;
}

function WowGGTierlistTable({ entries, metric, query, setQuery, datasetSlug }: { entries: WowGGTierlistEntry[]; metric: string; query: string; setQuery: (value: string) => void; datasetSlug: string }) {
  const ct = useConsoleText();
  const displayed = [...entries].sort((left, right) => (left.tierAssignments[metric]?.rank ?? 32_767) - (right.tierAssignments[metric]?.rank ?? 32_767));
  return <Panel title="Tierlist — wow.gg" kicker={["", displayed.length, ct(" записей в выбранном срезе")].join("")} icon={Database} action={<div className="relative w-full sm:w-56"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#626d80]" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ct("Найти класс или спек")} className="h-9 rounded-sm border-[#303645] bg-[#0b0e14] pl-9 text-xs" /></div>}>
    <div className="overflow-x-auto border border-[#292f3c]"><Table><TableHeader><TableRow className="border-[#292f3c] bg-[#0c1017] hover:bg-[#0c1017]"><TableHead className="w-14 text-[10px] uppercase tracking-[.12em] text-[#6f798c]">{ct("Тир")}</TableHead><TableHead className="text-[10px] uppercase tracking-[.12em] text-[#6f798c]">{ct("Специализация / подземелье")}</TableHead><TableHead className="hidden text-[10px] uppercase tracking-[.12em] text-[#6f798c] md:table-cell">{ct("Класс")}</TableHead><TableHead className="text-right text-[10px] uppercase tracking-[.12em] text-[#6f798c]">{ct("Значение")}</TableHead><TableHead className="w-12"><span className="sr-only">{ct("Источник")}</span></TableHead></TableRow></TableHeader><TableBody>{displayed.map((entry) => { const assignment = entry.tierAssignments[metric]; const value = wowGGMetricValue(entry, metric); const classHref = entry.classSlug ? datasetClassPath(datasetSlug, entry.classSlug) : ""; return <TableRow key={`${entry.contextKey}-${entry.entityType}-${entry.entitySlug}`} className="border-[#252b38] bg-[#11151d] hover:bg-[#171b24]"><TableCell><span className={cn("grid size-8 place-items-center border font-[family-name:var(--display)] text-sm font-bold", tierStyle(assignment?.tier ?? entry.tier))}>{assignment?.tier ?? entry.tier}</span></TableCell><TableCell>{classHref ? <Link href={classHref} className="font-semibold text-[#e0e4ec] hover:text-[#dfbd69]">{entry.specName}</Link> : <span className="font-semibold text-[#e0e4ec]">{entry.entityName}</span>}<div className="mt-0.5 text-[10px] text-[#768196]">#{assignment?.rank ?? entry.rank}</div></TableCell><TableCell className="hidden text-xs md:table-cell">{classHref ? <Link href={classHref} className="inline-flex items-center gap-1.5 text-[#9ca6b8] hover:text-[#dfbd69]">{entry.className}<ChevronRight className="size-3" /></Link> : <span className="text-[#697387]">Mythic+</span>}</TableCell><TableCell className="text-right font-mono text-xs text-[#d8bd79]">{metric === "popularity" && value != null ? `${value.toFixed(1)}%` : metric === "maxKey" && value != null ? `+${Math.round(value)}` : formatMetricNumber(value)}</TableCell><TableCell><a href={entry.guideUrl || entry.sourceUrl} target="_blank" rel="noreferrer" className="grid size-8 place-items-center border border-[#323846] text-[#a88c4d] hover:border-[#8f7540] hover:text-[#e0bd68]" aria-label={[ct("Открыть источник "), entry.entityName, ""].join("")}><ExternalLink className="size-3.5" /></a></TableCell></TableRow>; })}</TableBody></Table></div>
    {displayed.length === 0 ? <div className="border-x border-b border-[#292f3c] py-10 text-center text-xs text-[#737e92]">{ct("Для этой комбинации фильтров данных пока нет. Последний успешный снимок сохранён.")}</div> : null}
  </Panel>;
}

function bestMetric(entries: WowGGTierlistEntry[], specSlug: string | null, field: "metaScore" | "maxKey" | "averageDps" | "pvpMaxRating") {
  const values = entries.filter((entry) => entry.specSlug === specSlug).map((entry) => entry[field]).filter((value): value is number => value != null);
  return values.length ? Math.max(...values) : null;
}

function DatasetRunHistory({ runs, state }: { runs: DatasetRun[]; state?: ConsoleRequestState<{ data: DatasetRun[] }> }) {
  const ct = useConsoleText();
  return <Panel title={ct("История обновлений")} kicker={ct("Снимки сохраняются при сбоях")} icon={Clock3}>{state?.error && !state.data ? <SectionError title={ct("История обновлений")} message={ct(state.error)} onRetry={state.reload} /> : state?.loading && !state.data ? <SectionSkeleton title={ct("История обновлений")} /> : runs.length === 0 ? <div className="py-10 text-center text-xs text-[#737e92]">{ct("Запуски ещё не зарегистрированы")}</div> : <div className="flex flex-col">{runs.map((run) => <div key={run.id} className="flex items-center gap-3 border-b border-[#252b38] py-3 last:border-b-0"><span className={cn("grid size-7 shrink-0 place-items-center border", run.status === "succeeded" ? "border-[#31583a] bg-[#122018] text-[#65ba72]" : run.status === "failed" ? "border-[#653a3d] bg-[#251416] text-[#e47d82]" : "border-[#5c4e2c] bg-[#211b0f] text-[#d2ad57]")}>{run.status === "succeeded" ? <Check className="size-3.5" /> : run.status === "failed" ? <X className="size-3.5" /> : <RefreshCw className="size-3.5" />}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><div className="truncate text-xs font-medium">{run.status === "succeeded" ? ct("Обновление выполнено") : run.status === "failed" ? ct("Ошибка обновления — сохранён прошлый снимок") : ct("Обновление данных")}</div><time className="shrink-0 text-[10px] text-[#667086]">{formatDate(run.finishedAt || run.startedAt)}</time></div><div className="mt-1 text-[10px] text-[#737e92]">{run.recordCount} {ct(" записей · ")}{run.pageCount} {ct(" страниц · ")}{run.trigger}</div>{run.errorSummary ? <div className="mt-1 text-[10px] text-[#bd7479]">{run.errorSummary}</div> : null}</div></div>)}</div>}</Panel>;
}

function RunHistory({ runs: allRuns, compact = false }: { runs: DatasetRun[]; compact?: boolean }) {
  const ct = useConsoleText();
  const runs = compact ? allRuns.slice(0, 5) : allRuns;
  return <Panel title={ct("История обновлений")} kicker={ct("Снимки сохраняются при сбоях")} icon={Clock3}>{runs.length === 0 ? <div className="py-10 text-center text-xs text-[#737e92]">{ct("Запуски ещё не зарегистрированы")}</div> : <div className="flex flex-col">{runs.map((run) => <div key={run.id} className="flex items-center gap-3 border-b border-[#252b38] py-3 last:border-b-0"><span className={cn("grid size-7 shrink-0 place-items-center border", run.status === "succeeded" ? "border-[#31583a] bg-[#122018] text-[#65ba72]" : run.status === "failed" ? "border-[#653a3d] bg-[#251416] text-[#e47d82]" : "border-[#5c4e2c] bg-[#211b0f] text-[#d2ad57]")}>{run.status === "succeeded" ? <Check className="size-3.5" /> : run.status === "failed" ? <X className="size-3.5" /> : <RefreshCw className="size-3.5" />}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><div className="truncate text-xs font-medium">{run.status === "succeeded" ? ct("Обновление выполнено") : run.status === "failed" ? ct("Ошибка обновления") : ct("Обновление данных")}</div><time className="shrink-0 text-[10px] text-[#667086]">{formatDate(run.finishedAt || run.startedAt)}</time></div><div className="mt-1 text-[10px] text-[#737e92]">{run.recordCount} {ct(" записей · ")}{run.pageCount} {ct(" страниц · ")}{run.trigger}</div></div></div>)}</div>}</Panel>;
}

function EndpointList() {
  const ct = useConsoleText(); return <Panel title={ct("Доступные методы API")} kicker={ct("REST v1, базы по изданиям и GraphQL")} icon={Code2}><div className="grid gap-px border border-[#292f3c] bg-[#292f3c] md:grid-cols-2">{CONSOLE_ENDPOINTS.map((endpoint) => <div key={`${endpoint.method}-${endpoint.path}`} className="flex items-center gap-3 bg-[#11151d] p-4"><Badge variant="outline" className={cn("w-12 justify-center rounded-sm font-mono text-[10px]", endpoint.method === "GET" ? "border-[#31583a] text-[#6bc278]" : "border-[#5b4c2c] text-[#d4ae58]")}>{endpoint.method}</Badge><div className="min-w-0"><code className="text-xs text-[#dce1eb]">{endpoint.path}</code><div className="mt-0.5 truncate text-[10px] text-[#737e92]">{ct(endpoint.description)}</div></div></div>)}</div></Panel>; }

// The API page is static: it documents the public methods and the
// edition-scoped bases without touching the network.
function APIView() {
  const ct = useConsoleText(); return <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]"><div className="flex flex-col gap-5"><EndpointList /><Panel title={ct("Базы API по изданиям")} kicker={ct("Тот же /v1 с закреплённым продуктом")} icon={Gamepad2}><div className="grid gap-px border border-[#292f3c] bg-[#292f3c] sm:grid-cols-2">{EDITION_BASES.map((item) => <div key={item.edition} className="bg-[#11151d] p-4"><div className="text-[10px] uppercase tracking-[.12em] text-[#687286]">{item.edition} · {item.product}</div><code className="mt-1 block text-xs text-[#dce1eb]">https://api.gildra.net{item.base}</code></div>)}</div></Panel></div><Panel title={ct("Как работает API")} kicker={ct("Быстрый старт")} icon={BookOpen}><ol className="flex flex-col gap-4">{[{ title: ct("Выберите метод"), text: ct("Используйте стабильные REST-методы /v1, базы по изданиям или GraphQL.") }, { title: ct("Отправьте запрос"), text: ct("Ответы возвращаются в JSON, ошибки — с машинным кодом и сообщением.") }, { title: ct("Проверьте состояние"), text: ct("Эндпоинты /livez и /readyz показывают готовность сервиса, /v1/admin/system — быстрые проверки хранилищ.") }].map((step, index) => <li key={ct(step.title)} className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center border border-[#65542e] bg-[#201b10] font-[family-name:var(--display)] text-xs text-[#d8b45e]">{index + 1}</span><div><div className="text-xs font-semibold">{ct(step.title)}</div><p className="mt-1 text-xs leading-5 text-[#7f899d]">{step.text}</p></div></li>)}</ol><div className="mt-6 border border-[#2f3543] bg-[#090c12] p-4 font-mono text-[11px] leading-6 text-[#9da7b9]"><span className="text-[#6bc278]">curl</span> https://api.gildra.net/world-of-warcraft/retail/v1/library/datasets?locale=en_US</div><p className="mt-2 text-[10px] leading-5 text-[#697488]">{ct("Каталог и библиотека публичны; методы /v1/admin/* требуют cookie сессии администратора.")}</p></Panel></div>; }

function SystemView({ refreshKey }: { refreshKey: number }) {
  const ct = useConsoleText();
  const system = useConsoleRequest<SystemReport>("/v1/admin/system", { refreshKey, fallback: ct("Не удалось проверить состояние систем") });
  return <Loadable state={system} title={ct("Состояние системы")}>{(report) => <div className="flex flex-col gap-5">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{report.systems.map((system) => { const ok = system.status === "operational"; return <Card key={system.name} className="rounded-sm border-[#2d3341] bg-[#11151d] shadow-none"><CardHeader className="flex-row items-center justify-between p-5"><div className={cn("grid size-9 place-items-center border", ok ? "border-[#354438] bg-[#101a14] text-[#63b970]" : "border-[#5f3539] bg-[#1b1013] text-[#e58b8f]")}><Server className="size-4" /></div><span className={cn("flex items-center gap-2 text-[10px] uppercase tracking-[.12em]", ok ? "text-[#72b97b]" : "text-[#e58b8f]")}><span className={cn("size-1.5 rounded-full", ok ? "bg-[#58ad67] shadow-[0_0_8px_#58ad67]" : "bg-[#d95c55]")} />{ok ? ct("Работает") : ct("Отклонение")}</span></CardHeader><CardContent className="px-5 pb-5"><CardTitle className="text-base">{system.name}</CardTitle><div className="mt-2 text-xs text-[#778196]">{ct("Ответ за ")}{system.latencyMs} {ct(" мс")}</div></CardContent></Card>; })}</div>
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] text-[#707b90]"><span>{ct("Схема БД: версия ")}{report.schemaVersion}</span><span>{ct("Политика восстановления: ")}{report.recoveryPolicy || "—"}</span><span>{ct("Проверено ")}{new Date(report.generatedAt).toLocaleString("en-US")}</span></div>
  </div>}</Loadable>;
}

function Panel({ title, kicker, icon: Icon, action, children }: { title: string; kicker: string; icon: typeof Activity; action?: React.ReactNode; children: React.ReactNode }) { return <Card className="min-w-0 rounded-sm border-[#2d3341] bg-[#11151d] shadow-none"><CardHeader className="flex flex-col gap-4 border-b border-[#292f3c] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"><div className="flex items-center gap-3"><div className="grid size-8 place-items-center border border-[#4b4230] bg-[#1b1811] text-[#c9a24f]"><Icon className="size-3.5" /></div><div><CardTitle className="font-[family-name:var(--display)] text-sm tracking-wide">{title}</CardTitle><p className="mt-1 text-[10px] uppercase tracking-[.12em] text-[#667086]">{kicker}</p></div></div>{action}</CardHeader><CardContent className="p-4 sm:p-5">{children}</CardContent></Card>; }

function SmallMetric({ label, value }: { label: string; value: string }) { return <div className="bg-[#0c1017] p-3"><div className="text-[10px] uppercase tracking-[.12em] text-[#687286]">{label}</div><div className="mt-1 font-mono text-xs font-semibold text-[#d8dde7]">{value}</div></div>; }
function tierStyle(tier: string) { if (!tier) return "border-[#3a414f] bg-[#151923] text-[#737e92]"; if (tier.startsWith("S")) return "border-[#7b532a] bg-[#321c0c] text-[#f09337]"; if (tier.startsWith("A")) return "border-[#613c7f] bg-[#251331] text-[#b467ed]"; if (tier.startsWith("B")) return "border-[#2b5691] bg-[#101f38] text-[#5b9bf4]"; return "border-[#3e6133] bg-[#142411] text-[#76c25e]"; }
function formatMetricNumber(value: number | null) { return value == null ? "—" : Math.round(value).toLocaleString("en-US"); }
function metricLabel(metric: string, role: string) { if (metric === "score") return "M+ рейтинг"; if (metric === "popularity") return "Популярность"; if (metric === "survivability") return "Выживаемость"; return role === "healer" ? "HPS" : "DPS"; }
function difficultyLabel(difficulty: string) { if (difficulty === "10") return "+10"; return difficulty.slice(0, 1).toUpperCase() + difficulty.slice(1); }
function formatDate(value: string | null) { return value ? new Date(value).toLocaleString("en-US", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"; }
function relativeTime(value: string | null) { if (!value) return "No data"; const diff = Date.now() - new Date(value).getTime(); const hours = Math.floor(diff / 3_600_000); if (hours < 1) return "Recently"; if (hours < 24) return `${hours} hours ago`; return `${Math.floor(hours / 24)} days ago`; }
function freshnessHint(dataset: DatasetListItem) { if (dataset.freshness === "fresh") return `Свежие до ${formatDate(dataset.freshUntil)}`; if (dataset.freshness === "stale") return `Просрочены с ${formatDate(dataset.freshUntil)}`; return "Успешных обновлений ещё не было"; }
function formatInterval(seconds: number) { if (seconds % 86_400 === 0) return `${seconds / 86_400} days`; if (seconds % 3_600 === 0) return `${seconds / 3_600} hours`; return `${Math.max(1, Math.round(seconds / 60))} min.`; }
function activityLabel(activity: string) { return activity === "mythic_plus" ? "Mythic+" : "Рейд"; }
function icyVeinsActivityLabel(activity: string) { return activity === "mythic_plus" ? "Mythic+" : activity === "pvp" ? "PvP" : "Рейд"; }
function roleLabel(role: string) { return role === "healer" ? "Лекарь" : role === "tank" ? "Танк" : "DPS"; }
