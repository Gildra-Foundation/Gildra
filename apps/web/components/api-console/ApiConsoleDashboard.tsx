"use client";

import { useConsoleText } from "./consoleLocale";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  BarChart3, BookOpen, Code2, Database, Gamepad2, Gauge, Gem, LogOut, Menu, RefreshCw,
  Server, X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useConsoleRequest } from "./client";
import { CONSOLE_ENDPOINTS, EDITION_BASES } from "./endpoints";
import type {
  AnalyticsOverview, AnalyticsOverviewResponse, CatalogHealthResponse,
  DatasetDetailResponse, DatasetRun, PanelUser, SystemReport, TierlistEntry,
} from "./types";
import { BrandMark, Loadable, StatusRail, Metric, Panel } from "./dashboard/primitives";
import { DatasetsView, TierlistTable, RunHistory } from "./dashboard/datasets";
import { LeagueConsolePanel, CatalogHealthPanel } from "./dashboard/catalog";

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
