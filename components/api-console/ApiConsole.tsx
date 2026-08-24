"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowLeft, BarChart3, BookOpen, Check, ChevronRight, CircleAlert, Clock3,
  Code2, Database, ExternalLink, Eye, EyeOff, FileJson2, Gauge, LogOut,
  Menu, RefreshCw, Search, Server, ShieldCheck, Swords, X,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { ArchonTierlistEntry, DashboardData, DatasetListItem, DatasetRun, IcyVeinsTierlistEntry, IcyVeinsTierlistResponse, PanelUser, TierlistEntry, WowClassListResponse, WowGGTierlistEntry, WowGGTierlistResponse, WowSpecializationResponse, WowSpecListResponse } from "./types";

type View = "overview" | "datasets" | "api" | "system";

const navItems = [
  { id: "overview" as const, label: "Обзор", icon: Gauge, href: "/" },
  { id: "datasets" as const, label: "Датасеты", icon: Database, href: "/datasets" },
  { id: "api" as const, label: "API", icon: Code2, href: "/api" },
  { id: "system" as const, label: "Система", icon: Server, href: "/system" },
];

async function requestJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "include", ...init });
  if (!response.ok) {
    let message = "Запрос не выполнен";
    try { message = (await response.json()).message ?? message; } catch { /* empty response */ }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export function ApiConsole({ consolePath }: { consolePath: string[] }) {
  const [user, setUser] = useState<PanelUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    requestJSON<{ user: PanelUser }>("/v1/auth/me")
      .then((result) => setUser(result.user))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  if (checking) return <LoadingScreen />;
  if (!user) return <LoginScreen onLogin={setUser} />;
  return <Dashboard user={user} consolePath={consolePath} onLogout={() => setUser(null)} />;
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3" aria-label="Gildra API">
      <div className="grid size-9 place-items-center border border-[#8b7138] bg-[#171716] text-[#e2c171] [clip-path:polygon(7px_0,100%_0,100%_calc(100%-7px),calc(100%-7px)_100%,0_100%,0_7px)]">
        <Swords className="size-[18px]" strokeWidth={1.5} />
      </div>
      {!compact && <div><div className="font-[var(--display)] text-[15px] font-bold tracking-[.18em] text-[#e7c878]">GILDRA</div><div className="text-[9px] uppercase tracking-[.28em] text-[#657087]">API Console</div></div>}
    </div>
  );
}

function LoadingScreen() {
  return <main className="grid min-h-screen place-items-center bg-[#090b10] text-[#c9a24f]"><RefreshCw className="size-6 animate-spin" aria-label="Загрузка" /></main>;
}

function LoginScreen({ onLogin }: { onLogin: (user: PanelUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => { fetch("/readyz").then((r) => setReady(r.ok)).catch(() => setReady(false)); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const submittedEmail = String(form.get("email") ?? "").trim();
    const submittedPassword = String(form.get("password") ?? "");
    setSubmitting(true); setError("");
    try {
      const result = await requestJSON<{ user: PanelUser }>("/v1/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: submittedEmail, password: submittedPassword }),
      });
      onLogin(result.user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось выполнить вход");
    } finally { setSubmitting(false); }
  }

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-[#090b10] text-[#e8ebf2]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(201,162,79,.12),transparent_34%),linear-gradient(rgba(255,255,255,.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.015)_1px,transparent_1px)] bg-[size:auto,42px_42px,42px_42px]" />
      <header className="relative flex h-20 items-center justify-between border-b border-[#222735] px-5 sm:px-10"><BrandMark /><div className="hidden items-center gap-2 text-[10px] uppercase tracking-[.16em] text-[#778198] sm:flex"><ShieldCheck className="size-4 text-[#9b8349]" />Защищённая зона</div></header>
      <section className="relative grid flex-1 place-items-center px-4 py-12">
        <div className="grid w-full max-w-[1060px] items-center gap-12 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-16">
          <div className="mx-auto w-full max-w-[540px]">
          <div className="mb-7 text-center lg:text-left"><p className="mb-2 text-[10px] uppercase tracking-[.24em] text-[#9c834b]">Управление данными и API</p><h1 className="font-[var(--display)] text-3xl font-semibold tracking-tight sm:text-4xl">Вход в панель</h1><p className="mt-2 text-sm text-[#7f899d]">Используйте аккаунт администратора Gildra</p></div>
          <Card className="border-[#32313a] bg-[#10131b]/95 shadow-[0_30px_90px_rgba(0,0,0,.55)] [clip-path:polygon(12px_0,100%_0,100%_calc(100%-12px),calc(100%-12px)_100%,0_100%,0_12px)]">
            <CardContent className="p-6 sm:p-8">
              {error && <Alert variant="destructive" className="mb-6 rounded-sm border-[#693b3e] bg-[#2a1518] text-[#ef9a9d]"><CircleAlert className="size-4" /><AlertTitle>Вход не выполнен</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
              <form onSubmit={submit}>
                <FieldGroup className="gap-5">
                  <Field><FieldLabel htmlFor="panel-email" className="text-[10px] uppercase tracking-[.14em] text-[#8c96a9]">Email</FieldLabel><Input id="panel-email" name="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className="h-11 rounded-sm border-[#303645] bg-[#0a0d13] px-3 text-sm placeholder:text-[#4f596b] focus-visible:border-[#b4954f]" /></Field>
                  <Field><FieldLabel htmlFor="panel-password" className="text-[10px] uppercase tracking-[.14em] text-[#8c96a9]">Пароль</FieldLabel><div className="relative"><Input id="panel-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Введите пароль" className="h-11 rounded-sm border-[#303645] bg-[#0a0d13] px-3 pr-11 text-sm placeholder:text-[#4f596b] focus-visible:border-[#b4954f]" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-0 top-0 grid size-11 place-items-center text-[#707b90] hover:text-[#d7bb73]" aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></Field>
                  <Field orientation="horizontal" className="items-center gap-2"><Checkbox id="remember" checked={remember} onCheckedChange={(value) => setRemember(value === true)} className="rounded-sm border-[#596275] data-[state=checked]:border-[#c9a24f] data-[state=checked]:bg-[#c9a24f]" /><FieldLabel htmlFor="remember" className="text-xs font-normal text-[#8b95a8]">Оставаться в системе</FieldLabel></Field>
                  <Button disabled={submitting} className="h-11 w-full rounded-sm bg-[#c8a14d] font-semibold text-[#171205] hover:bg-[#e0bd68]">{submitting ? <RefreshCw className="size-4 animate-spin" /> : <><span>Войти в панель</span><ChevronRight className="size-4" /></>}</Button>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>
          <div className="mt-6 grid grid-cols-2 gap-px border border-[#242a37] bg-[#242a37] sm:grid-cols-4 lg:hidden">
            {["API", "Postgres", "ClickHouse", "Redis"].map((name) => <div key={name} className="flex items-center justify-center gap-2 bg-[#0d1017] px-2 py-3 text-[10px] uppercase tracking-[.11em] text-[#778196]"><span className={cn("size-1.5 rounded-full", ready === false ? "bg-[#d95c55]" : ready === true ? "bg-[#58ad67] shadow-[0_0_8px_#58ad67]" : "bg-[#596275]")} />{name}</div>)}
          </div>
          <div className="mt-6 flex items-center justify-center gap-2 text-[10px] text-[#667086] lg:justify-start"><ShieldCheck className="size-3.5 text-[#9b8349]" />Сессия хранится только в защищённой cookie</div>
          </div>
          <Card className="hidden rounded-sm border-[#343a47] bg-[#0e121a]/90 shadow-[0_28px_80px_rgba(0,0,0,.45)] lg:block [clip-path:polygon(12px_0,calc(100%-12px)_0,100%_12px,100%_calc(100%-12px),calc(100%-12px)_100%,12px_100%,0_calc(100%-12px),0_12px)]">
            <CardHeader className="border-b border-[#303645] px-6 py-5"><CardTitle className="text-center font-[var(--display)] text-xs uppercase tracking-[.16em] text-[#d5b25d]">Состояние системы</CardTitle></CardHeader>
            <CardContent className="p-6">{[["API", Activity], ["PostgreSQL", Database], ["ClickHouse", BarChart3], ["Redis", Server]].map(([name, StatusIcon]) => { const IconComponent = StatusIcon as typeof Activity; return <div key={name as string} className="flex items-center gap-4 border-b border-[#2a303d] py-5 last:border-b-0"><IconComponent className="size-5 text-[#aa8c49]" strokeWidth={1.5} /><span className="flex-1 text-sm text-[#9da6b7]">{name as string}</span><span className={cn("size-2 rounded-full", ready === false ? "bg-[#d95c55]" : ready === true ? "bg-[#58ad67] shadow-[0_0_8px_#58ad67]" : "bg-[#596275]")} /></div>; })}</CardContent>
          </Card>
        </div>
      </section>
      <footer className="relative border-t border-[#1d222e] px-5 py-5 text-center text-[10px] uppercase tracking-[.15em] text-[#515b6e]">Gildra Foundation · API Console</footer>
    </main>
  );
}

function Dashboard({ user, consolePath, onLogout }: { user: PanelUser; consolePath: string[]; onLogout: () => void }) {
  const pathKey = consolePath.join("/");
  const view: View = consolePath[0] === "datasets" ? "datasets" : consolePath[0] === "api" ? "api" : consolePath[0] === "system" ? "system" : "overview";
  const datasetSlug = view === "datasets" ? consolePath[1] ?? "" : "";
  const classSlug = view === "datasets" && consolePath[2] === "classes" ? consolePath[3] ?? "" : "";
  const [mobileNav, setMobileNav] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [datasets, setDatasets] = useState<DatasetListItem[]>([]);
  const [entries, setEntries] = useState<TierlistEntry[]>([]);
  const [archonEntries, setArchonEntries] = useState<ArchonTierlistEntry[]>([]);
  const [wowGG, setWowGG] = useState<WowGGTierlistResponse>({ snapshotId: "", contexts: [], data: [], weeks: [], count: 0 });
  const [icyVeins, setIcyVeins] = useState<IcyVeinsTierlistResponse>({ snapshotId: "", pages: [], data: [], count: 0 });
  const [datasetRuns, setDatasetRuns] = useState<DatasetRun[]>([]);
  const [activityFilter, setActivityFilter] = useState("raid");
  const [roleFilter, setRoleFilter] = useState("dps");
  const [difficultyFilter, setDifficultyFilter] = useState("heroic");
  const [metricFilter, setMetricFilter] = useState("popularity");
  const [wowGGWeek, setWowGGWeek] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true); setError("");
    try {
      const needsTierlist = view === "overview" || (view === "datasets" && datasetSlug === "tierlist-wowhead");
      const needsArchon = view === "datasets" && datasetSlug === "tierlist-archon";
      const needsWowGG = view === "datasets" && datasetSlug === "tierlist-wowgg";
      const needsIcyVeins = view === "datasets" && datasetSlug === "tierlist-icyveins";
      const tierlistURL = classSlug
        ? "/v1/admin/tierlist-wowhead"
        : `/v1/admin/tierlist-wowhead?activity=${activityFilter}&role=${roleFilter}`;
      const archonURL = classSlug
        ? "/v1/admin/tierlist-archon"
        : `/v1/admin/tierlist-archon?activity=${activityFilter}&difficulty=${activityFilter === "mythic_plus" ? "10" : difficultyFilter}&role=${roleFilter}`;
      const icyVeinsURL = classSlug
        ? "/v1/admin/tierlist-icyveins"
        : `/v1/admin/tierlist-icyveins?activity=${activityFilter}&role=${roleFilter}`;
      const [dashboard, datasetList, tierlist, archon, wowgg, icyveins, runs] = await Promise.all([
        requestJSON<DashboardData>("/v1/admin/dashboard"),
        requestJSON<{ data: DatasetListItem[] }>("/v1/admin/datasets"),
        needsTierlist ? requestJSON<{ data: TierlistEntry[] }>(tierlistURL) : Promise.resolve({ data: [] }),
        needsArchon ? requestJSON<{ data: ArchonTierlistEntry[] }>(archonURL) : Promise.resolve({ data: [] }),
        needsWowGG ? requestJSON<WowGGTierlistResponse>(`/v1/admin/tierlist-wowgg${wowGGWeek ? `?week=${encodeURIComponent(wowGGWeek)}` : ""}`) : Promise.resolve({ snapshotId: "", contexts: [], data: [], weeks: [], count: 0 }),
        needsIcyVeins ? requestJSON<IcyVeinsTierlistResponse>(icyVeinsURL) : Promise.resolve({ snapshotId: "", pages: [], data: [], count: 0 }),
        view === "datasets" && datasetSlug
          ? requestJSON<{ data: DatasetRun[] }>(`/v1/admin/datasets/${datasetSlug}/runs`)
          : Promise.resolve({ data: [] }),
      ]);
      setData(dashboard); setDatasets(datasetList.data); setEntries(tierlist.data);
      setArchonEntries(archon.data); setWowGG(wowgg); setIcyVeins(icyveins); setDatasetRuns(runs.data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось загрузить панель"); }
    finally { setRefreshing(false); }
  }, [activityFilter, classSlug, datasetSlug, difficultyFilter, roleFilter, view, wowGGWeek]);

  useEffect(() => { void load(); }, [load]);

  const filteredEntries = useMemo(() => entries.filter((entry) => `${entry.specName} ${entry.className}`.toLowerCase().includes(query.toLowerCase())), [entries, query]);
  const filteredArchonEntries = useMemo(() => archonEntries.filter((entry) => `${entry.specName} ${entry.className}`.toLowerCase().includes(query.toLowerCase())), [archonEntries, query]);
  const filteredWowGGEntries = useMemo(() => wowGG.data.filter((entry) => entry.entityName.toLowerCase().includes(query.toLowerCase())), [wowGG.data, query]);
  const filteredIcyVeinsEntries = useMemo(() => icyVeins.data.filter((entry) => `${entry.specName} ${entry.className}`.toLowerCase().includes(query.toLowerCase())), [icyVeins.data, query]);

  async function logout() { try { await fetch("/v1/auth/logout", { method: "POST", credentials: "include" }); } finally { onLogout(); } }

  return (
    <main className="min-h-screen bg-[#090b10] text-[#e7eaf1] lg:grid lg:grid-cols-[230px_minmax(0,1fr)]">
      <aside className={cn("fixed inset-y-0 left-0 z-40 flex w-[230px] flex-col border-r border-[#252a37] bg-[#0c0f16] transition-transform lg:translate-x-0", mobileNav ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex h-[76px] items-center justify-between border-b border-[#252a37] px-5"><BrandMark /><button type="button" onClick={() => setMobileNav(false)} className="lg:hidden" aria-label="Закрыть меню"><X className="size-5" /></button></div>
        <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Разделы панели">
          <div className="px-3 pb-2 pt-3 text-[9px] uppercase tracking-[.18em] text-[#586276]">Панель управления</div>
          {navItems.map((item) => <a key={item.id} href={item.href} onClick={() => setMobileNav(false)} className={cn("flex h-10 items-center gap-3 border-l-2 px-3 text-left text-xs font-medium transition-colors", view === item.id ? "border-[#c9a24f] bg-[#1a1c20] text-[#e4c574]" : "border-transparent text-[#8791a5] hover:bg-[#141821] hover:text-[#d7dce6]")}><item.icon className="size-4" strokeWidth={1.6} />{item.label}</a>)}
        </nav>
        <div className="border-t border-[#252a37] p-3"><div className="mb-2 flex items-center gap-3 px-2 py-2"><div className="grid size-8 place-items-center border border-[#5b4e32] bg-[#1a1812] text-xs font-bold text-[#d8b867]">{(user.displayName || user.email).slice(0, 1).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{user.displayName || "Администратор"}</div><div className="truncate text-[10px] text-[#687286]">{user.email}</div></div></div><Button variant="ghost" onClick={logout} className="h-9 w-full justify-start rounded-sm text-xs text-[#8490a4] hover:bg-[#181c25] hover:text-[#e8a0a0]"><LogOut className="size-4" />Выйти</Button></div>
      </aside>
      {mobileNav && <button className="fixed inset-0 z-30 bg-black/70 lg:hidden" onClick={() => setMobileNav(false)} aria-label="Закрыть меню" />}

      <section className="min-w-0 lg:col-start-2">
        <header className="sticky top-0 z-20 flex h-[64px] items-center justify-between border-b border-[#252a37] bg-[#0b0e14]/95 px-4 backdrop-blur sm:px-6 lg:h-[76px] lg:px-8"><div className="flex items-center gap-3"><button type="button" onClick={() => setMobileNav(true)} className="grid size-9 place-items-center border border-[#303645] lg:hidden" aria-label="Открыть меню"><Menu className="size-5" /></button><div><p className="text-[9px] uppercase tracking-[.16em] text-[#687286]">Gildra API / {pathKey || "обзор"}</p><h1 className="font-[var(--display)] text-lg font-semibold sm:text-xl">{view === "overview" ? "Обзор API" : view === "datasets" ? classSlug ? "Информация о классе" : datasetSlug ? "Данные датасета" : "Датасеты" : view === "api" ? "Документация API" : "Состояние системы"}</h1></div></div><Button variant="outline" disabled={refreshing} onClick={() => void load()} className="h-9 rounded-sm border-[#3a404f] bg-[#11151d] text-xs text-[#abb3c2] hover:border-[#8d7540] hover:bg-[#181a1d] hover:text-[#e4c574]"><RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} /><span className="hidden sm:inline">Обновить</span></Button></header>

        <div className="mx-auto max-w-[1480px] p-4 sm:p-6 lg:p-8">
          {error && <Alert variant="destructive" className="mb-5 rounded-sm border-[#693b3e] bg-[#2a1518] text-[#ef9a9d]"><CircleAlert className="size-4" /><AlertTitle>Панель временно недоступна</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
          {!data ? <div className="grid min-h-[60vh] place-items-center"><RefreshCw className="size-6 animate-spin text-[#c9a24f]" /></div> : <>
            {view === "overview" && <Overview data={data} entries={filteredEntries} query={query} setQuery={setQuery} activity={activityFilter} setActivity={setActivityFilter} role={roleFilter} setRole={setRoleFilter} />}
            {view === "datasets" && <DatasetSection data={data} datasets={datasets} datasetSlug={datasetSlug} classSlug={classSlug} entries={classSlug ? entries : filteredEntries} archonEntries={classSlug ? archonEntries : filteredArchonEntries} wowGG={{ ...wowGG, data: classSlug ? wowGG.data : filteredWowGGEntries }} icyVeins={{ ...icyVeins, data: classSlug ? icyVeins.data : filteredIcyVeinsEntries }} wowGGWeek={wowGGWeek} setWowGGWeek={setWowGGWeek} datasetRuns={datasetRuns} query={query} setQuery={setQuery} activity={activityFilter} setActivity={setActivityFilter} role={roleFilter} setRole={setRoleFilter} difficulty={difficultyFilter} setDifficulty={setDifficultyFilter} metric={metricFilter} setMetric={setMetricFilter} />}
            {view === "api" && <APIView data={data} />}
            {view === "system" && <SystemView data={data} />}
          </>}
        </div>
      </section>
    </main>
  );
}

function Overview({ data, entries, query, setQuery, activity, setActivity, role, setRole }: { data: DashboardData; entries: TierlistEntry[]; query: string; setQuery: (v: string) => void; activity: string; setActivity: (v: string) => void; role: string; setRole: (v: string) => void }) {
  return <div className="flex flex-col gap-5">
    <StatusRail data={data} />
    <CatalogHealthPanel data={data} />
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.55fr)]"><ActivityChart data={data} /><RunHistory data={data} compact /></div>
    <TierlistTable entries={entries} query={query} setQuery={setQuery} activity={activity} setActivity={setActivity} role={role} setRole={setRole} limit={12} />
    <EndpointList data={data} />
  </div>;
}

function CatalogHealthPanel({ data }: { data: DashboardData }) {
  const catalog = data.catalog;
  const percent = (value: number) => catalog.entityCount ? `${(value / catalog.entityCount * 100).toFixed(1)}%` : "—";
  const activeImport = catalog.imports.find((item) => item.status === "RUNNING");
  return <Panel title="Полнота каталога" kicker={`Read-model #${catalog.generation} · ${catalog.readModelStatus}`} icon={Database}>
    <div className="grid gap-px border border-[#292f3c] bg-[#292f3c] sm:grid-cols-2 xl:grid-cols-6">
      <Metric label="Сущности" value={catalog.entityCount} />
      <CatalogCoverageMetric label="Локализация" value={catalog.localizedCount} percent={percent(catalog.localizedCount)} />
      <CatalogCoverageMetric label="Описание" value={catalog.describedCount} percent={percent(catalog.describedCount)} />
      <CatalogCoverageMetric label="Tooltip" value={catalog.tooltipCount} percent={percent(catalog.tooltipCount)} />
      <CatalogCoverageMetric label="Иконка" value={catalog.iconCount} percent={percent(catalog.iconCount)} />
      <Metric label="Связи" value={catalog.relationshipCount} />
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] text-[#707b90]">
      <span>Последнее атомарное обновление: {catalog.refreshedAt ? new Date(catalog.refreshedAt).toLocaleString("ru-RU") : "не выполнялось"}</span>
      <span>Pipeline: {catalog.lastPipelineRunId ? `#${catalog.lastPipelineRunId} · ${catalog.pipelineStatus} · ${catalog.pipelineStage || "complete"}` : "не запускался"}</span>
      <span className={catalog.publicationReady ? "text-[#7fc493]" : "text-[#d99a68]"}>Публикация: {catalog.publicationReady == null ? "не проверена" : catalog.publicationReady ? "разрешена" : "заблокирована политикой источников"}</span>
    </div>
    {activeImport ? <div className="mt-4 border border-[#4a402a] bg-[#17140d] p-4" role="status" aria-live="polite">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><div className="flex items-center gap-2 text-[9px] uppercase tracking-[.14em] text-[#d2ad57]"><span className="size-1.5 animate-pulse rounded-full bg-[#d2ad57]" />Идёт импорт</div><div className="mt-2 font-[var(--display)] text-lg font-semibold text-[#ece4cf]">{catalogImportLabel(activeImport.entityTypes)}</div><div className="mt-1 text-[10px] text-[#8f897a]">{activeImport.source} · API {activeImport.buildVersion} → сайт {catalog.activeBuildVersion} · {activeImport.locales.join(" + ") || "локаль источника"}</div></div>
        <div className="grid grid-cols-2 gap-px border border-[#393326] bg-[#393326] sm:min-w-72"><DatasetMetric label="Сохранено" value={activeImport.liveSourceRecords} /><div className="bg-[#11100c] px-3 py-3"><div className="text-[9px] uppercase tracking-[.12em] text-[#777062]">Последняя запись</div><div className="mt-1 text-xs font-semibold text-[#d8d0bd]">{activeImport.lastActivityAt ? relativeTime(activeImport.lastActivityAt) : "ожидание"}</div></div></div>
      </div>
      <div className="mt-3 text-[10px] text-[#777062]">Запущено {new Date(activeImport.startedAt).toLocaleString("ru-RU")} · данные станут публичными после атомарного завершения snapshot.</div>
    </div> : null}
    {catalog.imports.length ? <details className="mt-3 border border-[#292f3c] bg-[#0d1118]"><summary className="cursor-pointer px-4 py-3 text-[10px] font-medium text-[#949daf]">Последние импорты ({catalog.imports.length})</summary><div className="border-t border-[#292f3c]">
      {catalog.imports.map((item) => <div key={item.id} className="grid gap-2 border-b border-[#242a35] px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(140px,1fr)_110px_120px_minmax(160px,1fr)] sm:items-center"><div><div className="text-xs font-medium text-[#d8dde7]">{catalogImportLabel(item.entityTypes)}</div><div className="mt-0.5 font-mono text-[9px] text-[#5f697c]">{item.buildVersion} · {item.id.slice(0, 8)}</div></div><span className={cn("w-fit text-[9px] uppercase tracking-[.1em]", item.status === "SUCCEEDED" ? "text-[#72b97b]" : item.status === "FAILED" ? "text-[#e58b8f]" : "text-[#d2ad57]")}>{item.status === "SUCCEEDED" ? "Готово" : item.status === "FAILED" ? "Ошибка" : "В работе"}</span><span className="text-xs tabular-nums text-[#aeb6c5]">{Math.max(item.recordsWritten, item.liveSourceRecords).toLocaleString("ru-RU")}</span><span className="truncate text-[10px] text-[#697488]" title={item.errorSummary}>{item.errorSummary || (item.finishedAt ? new Date(item.finishedAt).toLocaleString("ru-RU") : item.lastActivityAt ? `Активность ${relativeTime(item.lastActivityAt)}` : "Ожидание данных")}</span></div>)}
    </div></details> : null}
  </Panel>;
}

function catalogImportLabel(entityTypes: string[]) {
  if (!entityTypes.length) return "Каталог World of Warcraft";
  const labels: Record<string, string> = { item: "Предметы", spell: "Заклинания", creature: "Существа и NPC", quest: "Квесты", talent: "Таланты", pvp_talent: "PvP-таланты", profession: "Профессии", mount: "Транспорт", battle_pet: "Боевые питомцы", class: "Классы", specialization: "Специализации", achievement: "Достижения", item_set: "Наборы предметов", instance: "Подземелья и рейды", encounter: "Сражения", faction: "Фракции" };
  return entityTypes.map((type) => labels[type] ?? type).join(", ");
}

function CatalogCoverageMetric({ label, value, percent }: { label: string; value: number; percent: string }) {
  return <div className="bg-[#0d1118] px-3 py-3"><div className="text-[9px] uppercase tracking-[.12em] text-[#687286]">{label}</div><div className="mt-1 flex items-baseline justify-between gap-2"><span className="font-[var(--display)] text-xl font-semibold">{value.toLocaleString("ru-RU")}</span><span className="text-[10px] text-[#d2ad57]">{percent}</span></div></div>;
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
  if (classSlug && specSlug) return detail ? <WowSpecializationDetail detail={detail} /> : <CatalogEmpty text="Специализация не найдена" />;
  if (classSlug) {
    const className = specs.data[0]?.className ?? classSlug;
    return <div className="flex flex-col gap-5">
      <Breadcrumb items={[{ label: "Классы", href: "/classes" }, { label: className }]} />
      <CatalogHeading kicker="Специализации класса" title={className} description={`${specs.pagination.total} специализаций. Выберите нужную, чтобы увидеть все гайды и позиции во всех тир-листах.`} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {specs.data.map((spec) => <a key={spec.specSlug} href={`/classes/${spec.classSlug}/${spec.specSlug}`} className="group flex min-h-52 flex-col border border-[#2d3341] bg-[#11151d] p-5 transition-colors hover:border-[#7d693d] hover:bg-[#151921]">
          <div className="flex items-start justify-between gap-4"><div><p className="text-[9px] uppercase tracking-[.15em] text-[#887442]">{spec.className}</p><h3 className="mt-2 font-[var(--display)] text-xl font-semibold text-[#e8eaf0]">{spec.specName}</h3></div><ChevronRight className="mt-1 size-5 text-[#697388] transition-transform group-hover:translate-x-1 group-hover:text-[#d2ad57]" /></div>
          <div className="mt-5 grid grid-cols-3 gap-px border border-[#292f3c] bg-[#292f3c]"><DatasetMetric label="Гайдов" value={spec.guideCount} /><DatasetMetric label="Сборок" value={spec.buildCount} /><DatasetMetric label="Позиций" value={spec.placementCount} /></div>
          <div className="mt-auto flex flex-wrap gap-1.5 pt-5">{spec.sources.map((source) => <Badge key={source} variant="outline" className="rounded-sm border-[#3b4250] bg-[#0d1118] px-2 text-[9px] font-normal text-[#909aae]">{source}</Badge>)}</div>
        </a>)}
      </div>
      {specs.data.length === 0 ? <CatalogEmpty text="Для этого класса пока нет специализаций" /> : null}
    </div>;
  }

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = classes.data.filter((item) => `${item.className} ${item.classSlug}`.toLowerCase().includes(normalizedQuery));
  return <div className="flex flex-col gap-5">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <CatalogHeading kicker="Единый каталог" title="Классы World of Warcraft" description="WoWHead, Archon, wow.gg и Icy Veins собраны в одном месте. Сразу видно, сколько материалов есть у каждого класса." />
      <div className="relative w-full shrink-0 sm:w-64"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#626d80]" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти класс" className="h-10 rounded-sm border-[#303645] bg-[#0b0e14] pl-9 text-xs" /></div>
    </div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {filtered.map((item) => <a key={item.classSlug} href={`/classes/${item.classSlug}`} className="group block border border-[#2d3341] bg-[#11151d] transition-colors hover:border-[#7d693d] hover:bg-[#151921]">
        <div className="flex flex-col gap-5 p-5">
          <div className="flex items-start gap-4"><div className="grid size-11 shrink-0 place-items-center border border-[#51452e] bg-[#1b1811] text-[#d2ad57]"><ShieldCheck className="size-5" strokeWidth={1.5} /></div><div className="min-w-0 flex-1"><h3 className="font-[var(--display)] text-lg font-semibold text-[#e7eaf1]">{item.className}</h3><p className="mt-1 text-[10px] text-[#748095]">Обновлено {relativeTime(item.updatedAt)}</p></div><ChevronRight className="mt-2 size-5 text-[#657087] transition-transform group-hover:translate-x-1 group-hover:text-[#d2ad57]" /></div>
          <div className="grid grid-cols-4 gap-px border border-[#292f3c] bg-[#292f3c]"><DatasetMetric label="Спеков" value={item.specCount} /><DatasetMetric label="Гайдов" value={item.guideCount} /><DatasetMetric label="Позиций" value={item.placementCount} /><DatasetMetric label="Источников" value={item.sourceCount} /></div>
        </div>
      </a>)}
    </div>
    {filtered.length === 0 ? <CatalogEmpty text="Классы по этому запросу не найдены" /> : null}
  </div>;
}

function WowSpecializationDetail({ detail }: { detail: WowSpecializationResponse }) {
  const [source, setSource] = useState("all");
  const [activity, setActivity] = useState("all");
  const spec = detail.specialization;
  const sources = Array.from(new Set(detail.placements.map((item) => item.sourceName))).sort();
  const activities = Array.from(new Set(detail.placements.map((item) => item.activity))).sort();
  const placements = detail.placements.filter((item) => (source === "all" || item.sourceName === source) && (activity === "all" || item.activity === activity));
  return <div className="flex flex-col gap-5">
    <Breadcrumb items={[{ label: "Классы", href: "/classes" }, { label: spec.className, href: `/classes/${spec.classSlug}` }, { label: spec.specName }]} />
    <div className="border border-[#2d3341] bg-[#11151d] p-5 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-[10px] uppercase tracking-[.16em] text-[#9a824a]">{spec.className} · специализация</p><h2 className="mt-2 font-[var(--display)] text-3xl font-semibold">{spec.specName}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#7f899d]">Все найденные гайды, сборки и позиции этой специализации в подключённых тир-листах.</p></div><div className="grid grid-cols-2 gap-px border border-[#292f3c] bg-[#292f3c] sm:grid-cols-4 lg:min-w-[520px]"><DatasetMetric label="Гайдов" value={spec.guideCount} /><DatasetMetric label="Сборок" value={spec.buildCount} /><DatasetMetric label="Позиций" value={spec.placementCount} /><DatasetMetric label="Источников" value={spec.sources.length} /></div></div>
    </div>
    <Panel title="Гайды" kicker={`${detail.guides.length} уникальных ссылок`} icon={BookOpen}>
      {detail.guides.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{detail.guides.map((guide) => <a key={`${guide.datasetSlug}-${guide.url}`} href={guide.url} target="_blank" rel="noreferrer" className="group flex items-center gap-3 border border-[#303645] bg-[#0d1118] p-4 hover:border-[#7d693d]"><div className="grid size-9 shrink-0 place-items-center border border-[#51452e] bg-[#1b1811] text-[#d2ad57]"><BookOpen className="size-4" /></div><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-[#dfe3eb]">{guide.title}</div><div className="mt-1 text-[9px] uppercase tracking-[.12em] text-[#737e92]">{guide.sourceName}</div></div><ExternalLink className="size-3.5 text-[#697388] group-hover:text-[#d2ad57]" /></a>)}</div> : <CatalogEmpty text="Прямые ссылки на гайды пока не найдены" />}
    </Panel>
    <Panel title="Позиции во всех тир-листах" kicker={`${placements.length} из ${detail.pagination.total} позиций`} icon={BarChart3} action={<div className="grid w-full grid-cols-2 gap-2 sm:w-auto"><CatalogSelect label="Источник" value={source} onChange={setSource} options={[["all", "Все источники"], ...sources.map((value) => [value, value])]} /><CatalogSelect label="Формат" value={activity} onChange={setActivity} options={[["all", "Все форматы"], ...activities.map((value) => [value, catalogActivityLabel(value)])]} /></div>}>
      <div className="overflow-x-auto border border-[#292f3c]"><Table><TableHeader><TableRow className="border-[#292f3c] bg-[#0c1017] hover:bg-[#0c1017]"><TableHead className="w-16 text-[9px] uppercase tracking-[.12em] text-[#6f798c]">Тир</TableHead><TableHead className="text-[9px] uppercase tracking-[.12em] text-[#6f798c]">Источник и формат</TableHead><TableHead className="hidden text-[9px] uppercase tracking-[.12em] text-[#6f798c] lg:table-cell">Контекст</TableHead><TableHead className="text-right text-[9px] uppercase tracking-[.12em] text-[#6f798c]">Метрика</TableHead><TableHead className="w-12"><span className="sr-only">Ссылка</span></TableHead></TableRow></TableHeader><TableBody>{placements.map((item, index) => <TableRow key={`${item.datasetSlug}-${item.contextKey}-${item.rank}-${index}`} className="border-[#252b38] bg-[#11151d] hover:bg-[#171b24]"><TableCell><span className={cn("grid size-8 place-items-center border font-[var(--display)] text-sm font-bold", tierStyle(item.tier))}>{item.tier || "—"}</span><div className="mt-1 text-center text-[9px] text-[#737e92]">#{item.rank}</div></TableCell><TableCell><div className="text-xs font-semibold text-[#dfe3eb]">{item.sourceName}</div><div className="mt-1 text-[10px] text-[#8791a5]">{catalogActivityLabel(item.activity)} · {roleLabel(item.role)}</div></TableCell><TableCell className="hidden max-w-[620px] lg:table-cell"><div className="text-xs text-[#a8b0bf]">{item.contextLabel}</div>{item.description ? <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-[#707b90]" title={item.description}>{item.description}</p> : null}<time className="mt-1 block text-[9px] text-[#596477]">{formatDate(item.sourceUpdatedAt)}</time></TableCell><TableCell className="text-right font-mono text-xs text-[#d8bd79]">{item.metricValue == null ? "—" : formatMetricNumber(item.metricValue)}{item.metricLabel ? <div className="mt-1 font-sans text-[9px] text-[#6d778b]">{item.metricLabel}</div> : null}</TableCell><TableCell><a href={item.guideUrl || item.sourceUrl} target="_blank" rel="noreferrer" className="grid size-8 place-items-center border border-[#323846] text-[#a88c4d] hover:border-[#8f7540] hover:text-[#e0bd68]" aria-label={`Открыть ${item.linkKind === "build" ? "сборку" : "источник"}`}><ExternalLink className="size-3.5" /></a></TableCell></TableRow>)}</TableBody></Table></div>
      {placements.length === 0 ? <CatalogEmpty text="Нет позиций с выбранными фильтрами" /> : null}
    </Panel>
  </div>;
}

function CatalogHeading({ kicker, title, description }: { kicker: string; title: string; description: string }) {
  return <div><p className="text-[10px] uppercase tracking-[.16em] text-[#9a824a]">{kicker}</p><h2 className="mt-2 font-[var(--display)] text-2xl font-semibold">{title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[#7f899d]">{description}</p></div>;
}

function CatalogEmpty({ text }: { text: string }) { return <div className="border border-[#2d3341] bg-[#11151d] py-12 text-center text-sm text-[#7f899d]">{text}</div>; }

function CatalogSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  return <label className="min-w-0"><span className="sr-only">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full min-w-32 border border-[#343b49] bg-[#0b0e14] px-3 text-[10px] text-[#cbd2de] outline-none focus:border-[#a68a49]">{options.map(([id, text]) => <option key={`${label}-${id}`} value={id}>{text}</option>)}</select></label>;
}

function catalogActivityLabel(activity: string) { return activity === "mythic_plus" ? "Mythic+" : activity === "pvp" ? "PvP" : "Рейд"; }

type DatasetSectionProps = Parameters<typeof Overview>[0] & {
  datasets: DatasetListItem[];
  datasetSlug: string;
  classSlug: string;
  archonEntries: ArchonTierlistEntry[];
  wowGG: WowGGTierlistResponse;
  icyVeins: IcyVeinsTierlistResponse;
  wowGGWeek: string;
  setWowGGWeek: (value: string) => void;
  datasetRuns: DatasetRun[];
  difficulty: string;
  setDifficulty: (value: string) => void;
  metric: string;
  setMetric: (value: string) => void;
};

function DatasetSection(props: DatasetSectionProps) {
  if (!props.datasetSlug) return <DatasetCatalog datasets={props.datasets} />;
  const dataset = props.datasets.find((item) => item.slug === props.datasetSlug);
  if (!dataset) return <EmptyDataset />;
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

function DatasetCatalog({ datasets }: { datasets: DatasetListItem[] }) {
  return <div className="flex flex-col gap-5">
    <div>
      <p className="text-[10px] uppercase tracking-[.16em] text-[#9a824a]">Хранилище данных</p>
      <h2 className="mt-2 font-[var(--display)] text-2xl font-semibold">Все датасеты</h2>
      <p className="mt-2 max-w-2xl text-sm text-[#7f899d]">Откройте датасет, чтобы посмотреть записи, историю обновлений, описания классов и исходные гайды.</p>
    </div>
    <div className="grid gap-4 xl:grid-cols-2">
      {datasets.map((dataset) => <a key={dataset.id} href={`/datasets/${dataset.slug}`} className="group block border border-[#2d3341] bg-[#11151d] transition-colors hover:border-[#76643b] hover:bg-[#151921]">
        <div className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="grid size-11 shrink-0 place-items-center border border-[#51452e] bg-[#1b1811] text-[#d2ad57]"><Database className="size-5" strokeWidth={1.5} /></div>
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-3"><h3 className="font-[var(--display)] text-lg font-semibold text-[#e7eaf1]">{dataset.name}</h3><FreshnessBadge dataset={dataset} /></div><p className="mt-1 text-xs text-[#748095]">Источник: {dataset.sourceName}</p></div>
            <ChevronRight className="mt-2 size-5 text-[#657087] transition-transform group-hover:translate-x-1 group-hover:text-[#d2ad57]" />
          </div>
          <div className="grid grid-cols-3 gap-px border border-[#292f3c] bg-[#292f3c]"><DatasetMetric label="Страниц" value={dataset.pageCount} /><DatasetMetric label="Записей" value={dataset.recordCount} /><DatasetMetric label="Специализаций" value={dataset.uniqueSpecCount} /></div>
          <div className="flex flex-col gap-2 border-t border-[#292f3c] pt-4 text-[11px] text-[#7f899d] sm:flex-row sm:items-center sm:justify-between"><span>Обновлено: <strong className="font-medium text-[#b4bdcc]">{formatDate(dataset.lastSuccessAt)}</strong></span><span>{freshnessHint(dataset)}</span></div>
        </div>
      </a>)}
    </div>
    {datasets.length === 0 ? <div className="border border-[#2d3341] bg-[#11151d] py-16 text-center text-sm text-[#7f899d]">Датасеты ещё не добавлены</div> : null}
  </div>;
}

function DatasetDetail(props: DatasetSectionProps & { dataset: DatasetListItem }) {
  return <div className="flex flex-col gap-5">
    <Breadcrumb items={[{ label: "Датасеты", href: "/datasets" }, { label: props.dataset.name }]} />
    <div className="flex flex-col gap-4 border border-[#2d3341] bg-[#11151d] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div><div className="flex flex-wrap items-center gap-3"><h2 className="font-[var(--display)] text-2xl font-semibold">{props.dataset.name}</h2><FreshnessBadge dataset={props.dataset} /></div><p className="mt-2 text-sm text-[#7f899d]">Источник: {props.dataset.sourceName} · обновление каждые {formatInterval(props.dataset.refreshIntervalSeconds)}</p></div>
      <div className="text-left text-xs text-[#7f899d] sm:text-right"><div>Последний успешный снимок</div><strong className="mt-1 block font-medium text-[#c5ccd7]">{formatDate(props.dataset.lastSuccessAt)}</strong></div>
    </div>
    <StatusRail data={props.data} />
    <TierlistTable {...props} />
    <DatasetRunHistory runs={props.datasetRuns} />
  </div>;
}

function ArchonDatasetDetail(props: DatasetSectionProps & { dataset: DatasetListItem }) {
  return <div className="flex flex-col gap-5">
    <Breadcrumb items={[{ label: "Датасеты", href: "/datasets" }, { label: props.dataset.name }]} />
    <div className="flex flex-col gap-4 border border-[#2d3341] bg-[#11151d] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div><div className="flex flex-wrap items-center gap-3"><h2 className="font-[var(--display)] text-2xl font-semibold">{props.dataset.name}</h2><FreshnessBadge dataset={props.dataset} /></div><p className="mt-2 max-w-3xl text-sm leading-6 text-[#7f899d]">12 срезов Archon: Mythic+ и рейды Normal, Heroic и Mythic для DPS, танков и лекарей. Сохраняются тиры, рейтинг, популярность, число разборов и показатели эффективности.</p></div>
      <div className="text-left text-xs text-[#7f899d] sm:text-right"><div>Последний успешный снимок</div><strong className="mt-1 block font-medium text-[#c5ccd7]">{formatDate(props.dataset.lastSuccessAt)}</strong></div>
    </div>
    <div className="grid grid-cols-3 gap-px border border-[#292f3c] bg-[#292f3c]"><DatasetMetric label="Страниц" value={props.dataset.pageCount} /><DatasetMetric label="Записей" value={props.dataset.recordCount} /><DatasetMetric label="Специализаций" value={props.dataset.uniqueSpecCount} /></div>
    <ArchonTierlistTable entries={props.archonEntries} query={props.query} setQuery={props.setQuery} activity={props.activity} setActivity={props.setActivity} role={props.role} setRole={props.setRole} difficulty={props.difficulty} setDifficulty={props.setDifficulty} metric={props.metric} setMetric={props.setMetric} />
    <DatasetRunHistory runs={props.datasetRuns} />
  </div>;
}

function IcyVeinsDatasetDetail(props: DatasetSectionProps & { dataset: DatasetListItem }) {
  const activePage = props.icyVeins.pages.find((page) => page.activity === props.activity && page.role === props.role);
  return <div className="flex flex-col gap-5">
    <Breadcrumb items={[{ label: "Датасеты", href: "/datasets" }, { label: props.dataset.name }]} />
    <div className="flex flex-col gap-4 border border-[#2d3341] bg-[#11151d] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div><div className="flex flex-wrap items-center gap-3"><h2 className="font-[var(--display)] text-2xl font-semibold">{props.dataset.name}</h2><FreshnessBadge dataset={props.dataset} /></div><p className="mt-2 max-w-3xl text-sm leading-6 text-[#7f899d]">Восемь тир-листов Icy Veins: Mythic+, рейды и PvP. Сохраняются только позиции, изменения, даты источников и ссылки на гайды — без текста гайдов.</p></div>
      <div className="text-left text-xs text-[#7f899d] sm:text-right"><div>Ежедневная проверка</div><strong className="mt-1 block font-medium text-[#c5ccd7]">{formatDate(props.dataset.lastSuccessAt)}</strong></div>
    </div>
    <div className="grid grid-cols-3 gap-px border border-[#292f3c] bg-[#292f3c]"><DatasetMetric label="Страниц" value={props.dataset.pageCount} /><DatasetMetric label="Записей" value={props.dataset.recordCount} /><DatasetMetric label="Специализаций" value={props.dataset.uniqueSpecCount} /></div>
    <Panel title="Выбор тир-листа" kicker={activePage ? `Источник обновлён ${formatDate(activePage.sourceUpdatedAt)}` : "Выберите доступный формат"} icon={Gauge}>
      <div className="flex flex-wrap gap-3">
        <Tabs value={props.activity} onValueChange={(value) => { props.setActivity(value); if (value === "pvp" && props.role === "tank") props.setRole("dps"); }}><TabsList className="h-9 rounded-sm border border-[#303645] bg-[#0b0e14] p-0">{[["mythic_plus", "Mythic+"], ["raid", "Рейд"], ["pvp", "PvP"]].map(([id, label]) => <TabsTrigger key={id} value={id} className="h-full rounded-sm px-4 text-[10px] data-[state=active]:bg-[#29271e] data-[state=active]:text-[#dfbe6c]">{label}</TabsTrigger>)}</TabsList></Tabs>
        <Tabs value={props.role} onValueChange={props.setRole}><TabsList className="h-9 rounded-sm border border-[#303645] bg-[#0b0e14] p-0">{[["dps", "DPS"], ["healer", "Лекарь"], ...(props.activity === "pvp" ? [] : [["tank", "Танк"]])].map(([id, label]) => <TabsTrigger key={id} value={id} className="h-full rounded-sm px-4 text-[10px] data-[state=active]:bg-[#29271e] data-[state=active]:text-[#dfbe6c]">{label}</TabsTrigger>)}</TabsList></Tabs>
      </div>
      {activePage ? <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[#292f3c] pt-4 text-[10px] text-[#7d879a]"><span>{activePage.recordCount} специализаций</span><span>·</span><span>Автор: {activePage.authorName || "Icy Veins"}</span><span>·</span><a href={activePage.sourceUrl} target="_blank" rel="noreferrer" className="text-[#c6a451] hover:text-[#e2c471]">Открыть источник</a></div> : null}
    </Panel>
    <IcyVeinsTierlistTable entries={props.icyVeins.data} query={props.query} setQuery={props.setQuery} />
    <DatasetRunHistory runs={props.datasetRuns} />
  </div>;
}

function IcyVeinsTierlistTable({ entries, query, setQuery }: { entries: IcyVeinsTierlistEntry[]; query: string; setQuery: (value: string) => void }) {
  return <Panel title="Tierlist — Icy Veins" kicker={`${entries.length} записей в выборке`} icon={Database} action={<div className="relative w-full sm:w-56"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#626d80]" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти класс или спек" className="h-9 rounded-sm border-[#303645] bg-[#0b0e14] pl-9 text-xs" /></div>}>
    <div className="overflow-x-auto border border-[#292f3c]"><Table><TableHeader><TableRow className="border-[#292f3c] bg-[#0c1017] hover:bg-[#0c1017]"><TableHead className="w-16 text-[9px] uppercase tracking-[.12em] text-[#6f798c]">Тир</TableHead><TableHead className="text-[9px] uppercase tracking-[.12em] text-[#6f798c]">Специализация</TableHead><TableHead className="hidden text-[9px] uppercase tracking-[.12em] text-[#6f798c] md:table-cell">Класс</TableHead><TableHead className="w-12"><span className="sr-only">Гайд</span></TableHead></TableRow></TableHeader><TableBody>{entries.map((entry) => <TableRow key={`${entry.contextKey}-${entry.classSlug}-${entry.specSlug}`} className="border-[#252b38] bg-[#11151d] hover:bg-[#171b24]"><TableCell><span className={cn("grid size-8 place-items-center border font-[var(--display)] text-sm font-bold", tierStyle(entry.tier))}>{entry.tier}</span></TableCell><TableCell><a href={`/datasets/tierlist-icyveins/classes/${entry.classSlug}`} className="font-semibold text-[#e0e4ec] hover:text-[#dfbd69]">{entry.specName}</a><div className="mt-0.5 text-[10px] text-[#768196]">#{entry.rankInTier} в тире</div></TableCell><TableCell className="hidden text-xs md:table-cell"><a href={`/datasets/tierlist-icyveins/classes/${entry.classSlug}`} className="inline-flex items-center gap-1.5 text-[#9ca6b8] hover:text-[#dfbd69]">{entry.className}<ChevronRight className="size-3" /></a></TableCell><TableCell><a href={entry.guideUrl} target="_blank" rel="noreferrer" className="grid size-8 place-items-center border border-[#323846] text-[#a88c4d] hover:border-[#8f7540] hover:text-[#e0bd68]" aria-label={`Открыть гайд ${entry.specName}`}><ExternalLink className="size-3.5" /></a></TableCell></TableRow>)}</TableBody></Table></div>
    {entries.length === 0 ? <div className="border-x border-b border-[#292f3c] py-10 text-center text-xs text-[#737e92]">Для этого формата данных нет. Последний успешный снимок сохранён.</div> : null}
  </Panel>;
}

function WowGGDatasetDetail(props: DatasetSectionProps & { dataset: DatasetListItem }) {
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
  const regions = uniqueOptions(addonContexts.filter((item) => !effectiveBracket || item.pvpBracket === effectiveBracket).map((item) => [item.pvpRegion, item.pvpRegion === "all" ? "Все регионы" : item.pvpRegion.toUpperCase()] as const));
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
    <Breadcrumb items={[{ label: "Датасеты", href: "/datasets" }, { label: props.dataset.name }]} />
    <div className="flex flex-col gap-4 border border-[#2d3341] bg-[#11151d] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div><div className="flex flex-wrap items-center gap-3"><h2 className="font-[var(--display)] text-2xl font-semibold">{props.dataset.name}</h2><FreshnessBadge dataset={props.dataset} /></div><p className="mt-2 max-w-3xl text-sm leading-6 text-[#7f899d]">Полная мета wow.gg: Mythic+, рейды и PvP, все роли, дополнения, ключи, подземелья, боссы, сложности, PvP-бракеты, регионы и доступные недели.</p></div>
      <div className="text-left text-xs text-[#7f899d] sm:text-right"><div>Обновляется каждые 8 часов</div><strong className="mt-1 block font-medium text-[#c5ccd7]">{formatDate(props.dataset.lastSuccessAt)}</strong></div>
    </div>
    <div className="grid grid-cols-3 gap-px border border-[#292f3c] bg-[#292f3c]"><DatasetMetric label="Срезов" value={props.dataset.pageCount} /><DatasetMetric label="Записей" value={props.dataset.recordCount} /><DatasetMetric label="Специализаций" value={props.dataset.uniqueSpecCount} /></div>
    <Panel title="Фильтры wow.gg" kicker={`${contexts.length} срезов в снимке`} icon={Gauge}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <WowGGSelect label="Режим" value={mode} onChange={(value) => { setMode(value); setRole("dps"); setMetric(value === "pvp" ? "players" : value === "raid" ? "avgDps" : "score"); }} options={[["mythic_plus", "Mythic+"], ["raid", "Рейд"], ["pvp", "PvP"]]} />
        <WowGGSelect label="Роль" value={effectiveRole} onChange={(value) => { setRole(value); setMetric(value === "healer" ? "avgHps" : mode === "pvp" ? "players" : "score"); }} options={roles} />
        <WowGGSelect label="Дополнение" value={effectiveAddon} onChange={setAddon} options={addons} />
        {mode === "mythic_plus" && effectiveRole !== "dungeon_ease" ? <WowGGSelect label="Ключи" value={effectiveKey} onChange={setKeyType} options={keys} /> : null}
        {mode === "raid" ? <WowGGSelect label="Сложность" value={effectiveDifficulty} onChange={setRaidDifficulty} options={difficulties} /> : null}
        {mode === "pvp" ? <WowGGSelect label="Бракет" value={effectiveBracket} onChange={setBracket} options={brackets} /> : null}
        {mode === "pvp" ? <WowGGSelect label="Регион" value={effectiveRegion} onChange={setRegion} options={regions} /> : null}
        {mode !== "pvp" ? <WowGGSelect label={mode === "raid" ? "Рейд / босс" : "Подземелье"} value={effectiveSelection} onChange={setSelection} options={selections} /> : null}
        <WowGGSelect label="Метрика" value={effectiveMetric} onChange={setMetric} options={metrics} />
        <WowGGSelect label="Неделя" value={props.wowGGWeek} onChange={props.setWowGGWeek} options={[["", "Текущий снимок"], ...props.wowGG.weeks.map((item) => [item.week, item.week] as const)]} />
      </div>
      {activeContext ? <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[#292f3c] pt-4 text-[10px] text-[#7d879a]"><span>{activeContext.recordCount} записей</span><span>·</span><span>{activeContext.sourceWeek}</span><span>·</span><span>Источник обновлён {formatDate(activeContext.sourceUpdatedAt)}</span><a href={activeContext.sourceUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-[#c5a454] hover:text-[#e2c16f]">wow.gg <ExternalLink className="size-3" /></a></div> : null}
    </Panel>
    <WowGGTierlistTable entries={entries} metric={effectiveMetric} query={props.query} setQuery={props.setQuery} datasetSlug={props.dataset.slug} />
    <DatasetRunHistory runs={props.datasetRuns} />
  </div>;
}

function WowGGClassDetail({ dataset, classSlug, entries }: { dataset: DatasetListItem; classSlug: string; entries: WowGGTierlistEntry[] }) {
  const classEntries = entries.filter((entry) => entry.classSlug === classSlug);
  const specs = Array.from(new Map(classEntries.map((entry) => [entry.specSlug, entry])).values());
  const className = classEntries[0]?.className ?? classSlug;
  return <div className="flex flex-col gap-5">
    <Breadcrumb items={[{ label: "Датасеты", href: "/datasets" }, { label: dataset.name, href: `/datasets/${dataset.slug}` }, { label: className }]} />
    <div className="flex flex-col gap-4 border border-[#2d3341] bg-[#11151d] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"><div><p className="text-[10px] uppercase tracking-[.16em] text-[#9a824a]">wow.gg · World of Warcraft</p><h2 className="mt-2 font-[var(--display)] text-3xl font-semibold">{className}</h2><p className="mt-2 text-sm text-[#7f899d]">{classEntries.length} позиций во всех режимах и фильтрах текущего снимка.</p></div><FreshnessBadge dataset={dataset} /></div>
    {specs.length === 0 ? <div className="border border-[#2d3341] bg-[#11151d] py-16 text-center text-sm text-[#8b95a8]">Информация об этом классе не найдена.</div> : <div className="grid gap-4 xl:grid-cols-2">{specs.map((entry) => <Card key={entry.specSlug} className="rounded-sm border-[#2d3341] bg-[#11151d] shadow-none"><CardHeader className="border-b border-[#292f3c] p-5"><div className="flex items-center gap-3"><span className={cn("grid size-10 place-items-center border font-[var(--display)] text-base font-bold", tierStyle(entry.tier))}>{entry.tier}</span><div><CardTitle className="text-lg">{entry.specName}</CardTitle><p className="mt-1 text-[10px] text-[#778196]">Найдено в {classEntries.filter((item) => item.specSlug === entry.specSlug).length} срезах</p></div></div></CardHeader><CardContent className="p-5"><div className="grid grid-cols-2 gap-px border border-[#292f3c] bg-[#292f3c]"><SmallMetric label="Лучший M+ рейтинг" value={formatMetricNumber(bestMetric(classEntries, entry.specSlug, "metaScore"))} /><SmallMetric label="Макс. ключ" value={formatMetricNumber(bestMetric(classEntries, entry.specSlug, "maxKey"))} /><SmallMetric label="Средний DPS" value={formatMetricNumber(bestMetric(classEntries, entry.specSlug, "averageDps"))} /><SmallMetric label="PvP рейтинг" value={formatMetricNumber(bestMetric(classEntries, entry.specSlug, "pvpMaxRating"))} /></div><a href={entry.guideUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex h-10 items-center gap-2 bg-[#c9a24f] px-4 text-xs font-semibold text-[#171205] hover:bg-[#dfbd69]">Открыть гайд wow.gg <ExternalLink className="size-3.5" /></a></CardContent></Card>)}</div>}
  </div>;
}

function IcyVeinsClassDetail({ dataset, classSlug, entries }: { dataset: DatasetListItem; classSlug: string; entries: IcyVeinsTierlistEntry[] }) {
  const classEntries = entries.filter((entry) => entry.classSlug === classSlug);
  const className = classEntries[0]?.className ?? classSlug.replaceAll("-", " ");
  return <div className="flex flex-col gap-5">
    <Breadcrumb items={[{ label: "Датасеты", href: "/datasets" }, { label: dataset.name, href: `/datasets/${dataset.slug}` }, { label: className }]} />
    <div className="border border-[#2d3341] bg-[#11151d] p-5 sm:p-6"><div className="flex flex-wrap items-center gap-3"><h2 className="font-[var(--display)] text-2xl font-semibold capitalize">{className}</h2><FreshnessBadge dataset={dataset} /></div><p className="mt-2 text-sm text-[#7f899d]">Позиции специализаций класса и прямые ссылки на гайды Icy Veins.</p></div>
    <div className="grid gap-4 xl:grid-cols-2">{classEntries.map((entry) => <article key={`${entry.contextKey}-${entry.specSlug}`} className="border border-[#2d3341] bg-[#11151d] p-5"><div className="flex items-start justify-between gap-4"><div><div className="text-[9px] uppercase tracking-[.13em] text-[#897546]">{icyVeinsActivityLabel(entry.activity)} · {roleLabel(entry.role)}</div><h3 className="mt-2 font-[var(--display)] text-lg font-semibold">{entry.specName}</h3></div><span className={cn("grid size-10 place-items-center border font-[var(--display)] text-base font-bold", tierStyle(entry.tier))}>{entry.tier}</span></div><div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#292f3c] pt-4"><span className="text-[10px] text-[#6f798c]">Источник: {formatDate(entry.sourceUpdatedAt)}</span><a href={entry.guideUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-xs text-[#c6a451] hover:text-[#e2c471]">Открыть гайд<ExternalLink className="size-3.5" /></a></div></article>)}</div>
    {classEntries.length === 0 ? <EmptyDataset /> : null}
  </div>;
}

function ArchonClassDetail({ dataset, classSlug, entries }: { dataset: DatasetListItem; classSlug: string; entries: ArchonTierlistEntry[] }) {
  const classEntries = entries.filter((entry) => entry.classSlug === classSlug);
  const className = classEntries[0]?.className ?? classSlug;
  return <div className="flex flex-col gap-5">
    <Breadcrumb items={[{ label: "Датасеты", href: "/datasets" }, { label: dataset.name, href: `/datasets/${dataset.slug}` }, { label: className }]} />
    <div className="flex flex-col gap-4 border border-[#2d3341] bg-[#11151d] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div><p className="text-[10px] uppercase tracking-[.16em] text-[#9a824a]">Archon · World of Warcraft</p><h2 className="mt-2 font-[var(--display)] text-3xl font-semibold">{className}</h2><p className="mt-2 text-sm text-[#7f899d]">Все специализации класса во всех 12 срезах: тиры, показатели, объём выборки и ссылки на билды.</p></div>
      <FreshnessBadge dataset={dataset} />
    </div>
    {classEntries.length === 0 ? <div className="border border-[#2d3341] bg-[#11151d] py-16 text-center"><p className="text-sm text-[#8b95a8]">Информация об этом классе не найдена.</p><a href={`/datasets/${dataset.slug}`} className="mt-4 inline-flex items-center gap-2 text-xs text-[#d2ad57]"><ArrowLeft className="size-4" />Вернуться к датасету</a></div> : <div className="grid gap-4 xl:grid-cols-2">{classEntries.map((entry) => <Card key={`${entry.activity}-${entry.difficulty}-${entry.role}-${entry.specSlug}`} className="rounded-sm border-[#2d3341] bg-[#11151d] shadow-none">
      <CardHeader className="border-b border-[#292f3c] p-5"><div className="flex items-start gap-3"><span className={cn("grid size-10 shrink-0 place-items-center border font-[var(--display)] text-base font-bold", tierStyle(entry.tier))}>{entry.tier || "—"}</span><div className="min-w-0 flex-1"><CardTitle className="text-lg">{entry.specName}</CardTitle><div className="mt-2 flex flex-wrap gap-2"><Badge variant="outline" className="rounded-sm border-[#3a4352] text-[9px] text-[#9ea8ba]">{activityLabel(entry.activity)}</Badge><Badge variant="outline" className="rounded-sm border-[#3a4352] text-[9px] text-[#9ea8ba]">{difficultyLabel(entry.difficulty)}</Badge><Badge variant="outline" className="rounded-sm border-[#3a4352] text-[9px] text-[#9ea8ba]">{roleLabel(entry.role)}</Badge></div></div></div></CardHeader>
      <CardContent className="p-5"><div className="grid grid-cols-2 gap-px border border-[#292f3c] bg-[#292f3c]"><SmallMetric label="Разборов" value={entry.parses.toLocaleString("ru-RU")} /><SmallMetric label="Популярность" value={entry.popularity == null ? "—" : `${(entry.popularity * 100).toFixed(1)}%`} /><SmallMetric label="DPS" value={formatMetricNumber(entry.dps)} /><SmallMetric label="HPS" value={formatMetricNumber(entry.hps)} /></div><div className="mt-5 flex flex-wrap gap-3"><a href={entry.buildUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 bg-[#c9a24f] px-4 text-xs font-semibold text-[#171205] hover:bg-[#dfbd69]">Открыть билд <ExternalLink className="size-3.5" /></a><a href={entry.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 border border-[#3a4352] px-4 text-xs text-[#a9b2c2] hover:border-[#806c3e] hover:text-[#dfbd69]">Источник <ExternalLink className="size-3.5" /></a></div></CardContent>
    </Card>)}</div>}
  </div>;
}

function ClassDetail({ dataset, classSlug, entries }: { dataset: DatasetListItem; classSlug: string; entries: TierlistEntry[] }) {
  const classEntries = entries.filter((entry) => entry.classSlug === classSlug);
  const className = classEntries[0]?.className ?? classSlug;
  return <div className="flex flex-col gap-5">
    <Breadcrumb items={[{ label: "Датасеты", href: "/datasets" }, { label: dataset.name, href: `/datasets/${dataset.slug}` }, { label: className }]} />
    <div className="flex flex-col gap-4 border border-[#2d3341] bg-[#11151d] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div><p className="text-[10px] uppercase tracking-[.16em] text-[#9a824a]">World of Warcraft · класс</p><h2 className="mt-2 font-[var(--display)] text-3xl font-semibold">{className}</h2><p className="mt-2 text-sm text-[#7f899d]">Все найденные специализации, тиры и прямые ссылки на гайды WoWHead.</p></div>
      <FreshnessBadge dataset={dataset} />
    </div>
    {classEntries.length === 0 ? <div className="border border-[#2d3341] bg-[#11151d] py-16 text-center"><p className="text-sm text-[#8b95a8]">Информация об этом классе не найдена.</p><a href={`/datasets/${dataset.slug}`} className="mt-4 inline-flex items-center gap-2 text-xs text-[#d2ad57]"><ArrowLeft className="size-4" />Вернуться к датасету</a></div> : <div className="grid gap-4 xl:grid-cols-2">{classEntries.map((entry) => <Card key={`${entry.activity}-${entry.role}-${entry.specSlug}`} className="rounded-sm border-[#2d3341] bg-[#11151d] shadow-none">
      <CardHeader className="border-b border-[#292f3c] p-5"><div className="flex items-start gap-3"><span className={cn("grid size-10 shrink-0 place-items-center border font-[var(--display)] text-base font-bold", tierStyle(entry.tier))}>{entry.tier}</span><div className="min-w-0 flex-1"><CardTitle className="text-lg">{entry.specName}</CardTitle><div className="mt-2 flex flex-wrap gap-2"><Badge variant="outline" className="rounded-sm border-[#3a4352] text-[9px] text-[#9ea8ba]">{activityLabel(entry.activity)}</Badge><Badge variant="outline" className="rounded-sm border-[#3a4352] text-[9px] text-[#9ea8ba]">{roleLabel(entry.role)}</Badge></div></div></div></CardHeader>
      <CardContent className="p-5"><div className="flex flex-wrap gap-3"><a href={entry.guideUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 bg-[#c9a24f] px-4 text-xs font-semibold text-[#171205] hover:bg-[#dfbd69]">Открыть гайд <ExternalLink className="size-3.5" /></a><a href={entry.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 border border-[#3a4352] px-4 text-xs text-[#a9b2c2] hover:border-[#806c3e] hover:text-[#dfbd69]">Исходная страница <ExternalLink className="size-3.5" /></a></div></CardContent>
    </Card>)}</div>}
  </div>;
}

function EmptyDataset() { return <div className="border border-[#2d3341] bg-[#11151d] py-16 text-center"><Database className="mx-auto size-8 text-[#6f798c]" /><h2 className="mt-4 text-lg font-semibold">Датасет не найден</h2><a href="/datasets" className="mt-4 inline-flex items-center gap-2 text-xs text-[#d2ad57]"><ArrowLeft className="size-4" />К списку датасетов</a></div>; }

function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) { return <nav aria-label="Хлебные крошки" className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[.12em] text-[#697387]">{items.map((item, index) => <span key={`${item.label}-${index}`} className="flex items-center gap-2">{index > 0 ? <ChevronRight className="size-3" /> : null}{item.href ? <a href={item.href} className="text-[#a98d4f] hover:text-[#ddba67]">{item.label}</a> : <span>{item.label}</span>}</span>)}</nav>; }

function FreshnessBadge({ dataset }: { dataset: DatasetListItem }) { const fresh = dataset.freshness === "fresh"; const never = dataset.freshness === "never"; return <Badge variant="outline" className={cn("rounded-sm px-2 py-1 text-[9px] uppercase tracking-[.1em]", fresh ? "border-[#31583a] bg-[#102017] text-[#6bc278]" : never ? "border-[#604047] bg-[#261619] text-[#df7c83]" : "border-[#66552e] bg-[#211c10] text-[#e0b85d]")}><span className={cn("mr-1.5 size-1.5 rounded-full", fresh ? "bg-[#58ad67]" : never ? "bg-[#d95c55]" : "bg-[#d2a846]")} />{fresh ? "Свежие данные" : never ? "Нет данных" : "Данные устарели"}</Badge>; }

function DatasetMetric({ label, value }: { label: string; value: number }) { return <div className="bg-[#0c1017] p-3"><div className="text-[9px] uppercase tracking-[.12em] text-[#687286]">{label}</div><div className="mt-1 font-[var(--display)] text-lg font-semibold text-[#e1e5ed]">{value.toLocaleString("ru-RU")}</div></div>; }

function StatusRail({ data }: { data: DashboardData }) {
  const success = data.systems.every((system) => system.status === "operational");
  const cards = [{ label: success ? "Все системы работают" : "Есть отклонения", value: success ? "Работает" : "Проверить", icon: Activity, ok: success }, { label: "Страниц собрано", value: data.dataset.pageCount, icon: FileJson2 }, { label: "Записей в датасете", value: data.dataset.recordCount, icon: Database }, { label: "Уникальных специализаций", value: data.dataset.uniqueSpecCount, icon: Swords }, { label: "Последнее обновление", value: relativeTime(data.dataset.lastSuccessAt), icon: Clock3 }];
  return <div className="grid border border-[#2b303e] bg-[#2b303e] sm:grid-cols-2 xl:grid-cols-5">{cards.map((card, index) => <div key={card.label} className="flex min-h-[92px] items-center gap-3 border-b border-r border-[#2b303e] bg-[#11151d] px-4 py-4 last:border-r-0 sm:px-5 xl:border-b-0"><div className={cn("grid size-9 shrink-0 place-items-center border bg-[#0b0e14]", index === 0 && card.ok ? "border-[#31583a] text-[#65ba72]" : "border-[#424652] text-[#c2a253]")}><card.icon className="size-4" strokeWidth={1.5} /></div><div className="min-w-0"><div className="truncate text-[9px] uppercase tracking-[.12em] text-[#737e92]">{card.label}</div><div className="mt-1 truncate font-[var(--display)] text-lg font-semibold text-[#e4e8ef]">{card.value}</div></div></div>)}</div>;
}

function ActivityChart({ data }: { data: DashboardData }) {
  const chart = (data.analytics.series ?? []).map((point) => ({ ...point, label: new Date(point.hour).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) }));
  return <Panel title="Активность API" kicker="Последние 24 часа" icon={BarChart3}><div className="mb-4 grid grid-cols-3 gap-px border border-[#292f3c] bg-[#292f3c]"><Metric label="События" value={data.analytics.events} /><Metric label="Пользователи" value={data.analytics.uniqueUsers} /><Metric label="Подписки" value={data.analytics.activeSubscriptions} /></div><div className="h-[245px] min-w-0"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chart} margin={{ top: 8, right: 4, bottom: 0, left: -24 }}><defs><linearGradient id="activityGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c9a24f" stopOpacity={0.35} /><stop offset="100%" stopColor="#c9a24f" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#232938" vertical={false} /><XAxis dataKey="label" stroke="#667086" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={30} /><YAxis stroke="#667086" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} /><Tooltip contentStyle={{ background: "#11151d", border: "1px solid #3a404f", borderRadius: 2, fontSize: 11 }} labelStyle={{ color: "#8791a5" }} /><Area type="monotone" dataKey="events" stroke="#d2ad57" fill="url(#activityGold)" strokeWidth={2} name="События" /></AreaChart></ResponsiveContainer></div></Panel>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="bg-[#0d1118] px-3 py-3"><div className="text-[9px] uppercase tracking-[.12em] text-[#687286]">{label}</div><div className="mt-1 font-[var(--display)] text-xl font-semibold">{value.toLocaleString("ru-RU")}</div></div>; }

function TierlistTable({ entries, query, setQuery, activity, setActivity, role, setRole, limit }: { entries: TierlistEntry[]; query: string; setQuery: (v: string) => void; activity: string; setActivity: (v: string) => void; role: string; setRole: (v: string) => void; limit?: number }) {
  const displayed = limit ? entries.slice(0, limit) : entries;
  return <Panel title="Tierlist WoWHead" kicker={`${entries.length} записей в выборке`} icon={Database} action={<div className="flex flex-wrap items-center gap-2"><Tabs value={activity} onValueChange={setActivity}><TabsList className="h-8 rounded-sm border border-[#303645] bg-[#0b0e14] p-0"><TabsTrigger value="raid" className="h-full rounded-sm px-3 text-[10px] data-[state=active]:bg-[#29271e] data-[state=active]:text-[#dfbe6c]">Рейд</TabsTrigger><TabsTrigger value="mythic_plus" className="h-full rounded-sm px-3 text-[10px] data-[state=active]:bg-[#29271e] data-[state=active]:text-[#dfbe6c]">Mythic+</TabsTrigger></TabsList></Tabs><Tabs value={role} onValueChange={setRole}><TabsList className="h-8 rounded-sm border border-[#303645] bg-[#0b0e14] p-0">{[["dps", "DPS"], ["healer", "Лекарь"], ["tank", "Танк"]].map(([id, label]) => <TabsTrigger key={id} value={id} className="h-full rounded-sm px-3 text-[10px] data-[state=active]:bg-[#29271e] data-[state=active]:text-[#dfbe6c]">{label}</TabsTrigger>)}</TabsList></Tabs></div>}>
    <div className="relative mb-4 max-w-xs"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#697387]" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти специализацию..." className="h-9 rounded-sm border-[#303645] bg-[#0b0e14] pl-9 text-xs" /></div>
    <div className="overflow-x-auto border border-[#292f3c]"><Table><TableHeader><TableRow className="border-[#292f3c] bg-[#0c1017] hover:bg-[#0c1017]"><TableHead className="w-16 text-[9px] uppercase tracking-[.12em] text-[#6f798c]">Тир</TableHead><TableHead className="text-[9px] uppercase tracking-[.12em] text-[#6f798c]">Специализация</TableHead><TableHead className="hidden text-[9px] uppercase tracking-[.12em] text-[#6f798c] md:table-cell">Класс</TableHead><TableHead className="w-12"><span className="sr-only">Гайд</span></TableHead></TableRow></TableHeader><TableBody>{displayed.map((entry) => <TableRow key={`${entry.activity}-${entry.role}-${entry.classSlug}-${entry.specSlug}`} className="border-[#252b38] bg-[#11151d] hover:bg-[#171b24]"><TableCell><span className={cn("grid size-8 place-items-center border font-[var(--display)] text-sm font-bold", tierStyle(entry.tier))}>{entry.tier}</span></TableCell><TableCell><a href={`/datasets/tierlist-wowhead/classes/${entry.classSlug}`} className="font-semibold text-[#e0e4ec] hover:text-[#dfbd69]">{entry.specName}</a><a href={`/datasets/tierlist-wowhead/classes/${entry.classSlug}`} className="mt-0.5 block text-[10px] text-[#8d9ab0] hover:text-[#dfbd69] md:hidden">{entry.className} · подробнее</a></TableCell><TableCell className="hidden text-xs md:table-cell"><a href={`/datasets/tierlist-wowhead/classes/${entry.classSlug}`} className="inline-flex items-center gap-1.5 text-[#9ca6b8] hover:text-[#dfbd69]">{entry.className}<ChevronRight className="size-3" /></a></TableCell><TableCell><a href={entry.guideUrl} target="_blank" rel="noreferrer" className="grid size-8 place-items-center border border-[#323846] text-[#a88c4d] hover:border-[#8f7540] hover:text-[#e0bd68]" aria-label={`Открыть гайд ${entry.specName}`}><ExternalLink className="size-3.5" /></a></TableCell></TableRow>)}</TableBody></Table></div>
    {displayed.length === 0 && <div className="border-x border-b border-[#292f3c] py-10 text-center text-xs text-[#737e92]">В этой выборке записей нет</div>}
  </Panel>;
}

function ArchonTierlistTable({ entries, query, setQuery, activity, setActivity, role, setRole, difficulty, setDifficulty, metric, setMetric }: { entries: ArchonTierlistEntry[]; query: string; setQuery: (value: string) => void; activity: string; setActivity: (value: string) => void; role: string; setRole: (value: string) => void; difficulty: string; setDifficulty: (value: string) => void; metric: string; setMetric: (value: string) => void }) {
  const availableMetrics = activity === "mythic_plus" ? [["score", "M+ рейтинг"]] : [["popularity", "Популярность"], ["throughput", "Эффективность"], ["survivability", "Выживаемость"]];
  const activeMetric = availableMetrics.some(([id]) => id === metric) ? metric : availableMetrics[0][0];
  const displayed = useMemo(() => [...entries].sort((left, right) => {
    const leftTier = left.tierAssignments[activeMetric];
    const rightTier = right.tierAssignments[activeMetric];
    const tierOrder = (tier: string | undefined) => ({ S: 0, A: 1, B: 2, C: 3, D: 4 }[tier ?? ""] ?? 5);
    return tierOrder(leftTier?.tier) - tierOrder(rightTier?.tier) || (leftTier?.rank ?? left.rank) - (rightTier?.rank ?? right.rank);
  }), [activeMetric, entries]);
  const metricValue = (entry: ArchonTierlistEntry) => {
    if (activeMetric === "score") return entry.score == null ? "—" : Math.round(entry.score).toLocaleString("ru-RU");
    if (activeMetric === "popularity") return entry.popularity == null ? "—" : `${(entry.popularity * 100).toFixed(1)}%`;
    if (activeMetric === "survivability") return entry.survivability == null ? "—" : `${entry.survivability.toFixed(1)}%`;
    return formatMetricNumber(role === "healer" ? entry.hps : entry.dps);
  };
  return <Panel title="Tierlist Archon" kicker={`${entries.length} записей в выборке`} icon={Database} action={<div className="flex flex-wrap items-center gap-2"><Tabs value={activity} onValueChange={(value) => { setActivity(value); if (value === "mythic_plus") setMetric("score"); else if (metric === "score") setMetric("popularity"); }}><TabsList className="h-8 rounded-sm border border-[#303645] bg-[#0b0e14] p-0"><TabsTrigger value="raid" className="h-full rounded-sm px-3 text-[10px] data-[state=active]:bg-[#29271e] data-[state=active]:text-[#dfbe6c]">Рейд</TabsTrigger><TabsTrigger value="mythic_plus" className="h-full rounded-sm px-3 text-[10px] data-[state=active]:bg-[#29271e] data-[state=active]:text-[#dfbe6c]">Mythic+</TabsTrigger></TabsList></Tabs><Tabs value={role} onValueChange={setRole}><TabsList className="h-8 rounded-sm border border-[#303645] bg-[#0b0e14] p-0">{[["dps", "DPS"], ["healer", "Лекарь"], ["tank", "Танк"]].map(([id, label]) => <TabsTrigger key={id} value={id} className="h-full rounded-sm px-3 text-[10px] data-[state=active]:bg-[#29271e] data-[state=active]:text-[#dfbe6c]">{label}</TabsTrigger>)}</TabsList></Tabs></div>}>
    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="relative max-w-xs flex-1"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#697387]" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти специализацию..." className="h-9 rounded-sm border-[#303645] bg-[#0b0e14] pl-9 text-xs" /></div><div className="flex flex-wrap gap-2">{activity === "raid" ? <Tabs value={difficulty} onValueChange={setDifficulty}><TabsList className="h-8 rounded-sm border border-[#303645] bg-[#0b0e14] p-0">{[["normal", "Normal"], ["heroic", "Heroic"], ["mythic", "Mythic"]].map(([id, label]) => <TabsTrigger key={id} value={id} className="h-full rounded-sm px-3 text-[10px] data-[state=active]:bg-[#29271e] data-[state=active]:text-[#dfbe6c]">{label}</TabsTrigger>)}</TabsList></Tabs> : null}<Tabs value={activeMetric} onValueChange={setMetric}><TabsList className="h-8 rounded-sm border border-[#303645] bg-[#0b0e14] p-0">{availableMetrics.map(([id, label]) => <TabsTrigger key={id} value={id} className="h-full rounded-sm px-3 text-[10px] data-[state=active]:bg-[#29271e] data-[state=active]:text-[#dfbe6c]">{label}</TabsTrigger>)}</TabsList></Tabs></div></div>
    <div className="overflow-x-auto border border-[#292f3c]"><Table><TableHeader><TableRow className="border-[#292f3c] bg-[#0c1017] hover:bg-[#0c1017]"><TableHead className="w-16 text-[9px] uppercase tracking-[.12em] text-[#6f798c]">Тир</TableHead><TableHead className="text-[9px] uppercase tracking-[.12em] text-[#6f798c]">Специализация</TableHead><TableHead className="hidden text-[9px] uppercase tracking-[.12em] text-[#6f798c] md:table-cell">Класс</TableHead><TableHead className="text-right text-[9px] uppercase tracking-[.12em] text-[#6f798c]">{metricLabel(activeMetric, role)}</TableHead><TableHead className="hidden text-right text-[9px] uppercase tracking-[.12em] text-[#6f798c] sm:table-cell">Разборов</TableHead><TableHead className="w-12"><span className="sr-only">Билд</span></TableHead></TableRow></TableHeader><TableBody>{displayed.map((entry) => { const assignment = entry.tierAssignments[activeMetric]; return <TableRow key={`${entry.activity}-${entry.difficulty}-${entry.role}-${entry.classSlug}-${entry.specSlug}`} className="border-[#252b38] bg-[#11151d] hover:bg-[#171b24]"><TableCell><span className={cn("grid size-8 place-items-center border font-[var(--display)] text-sm font-bold", tierStyle(assignment?.tier ?? ""))}>{assignment?.tier ?? "—"}</span></TableCell><TableCell><a href={`/datasets/tierlist-archon/classes/${entry.classSlug}`} className="font-semibold text-[#e0e4ec] hover:text-[#dfbd69]">{entry.specName}</a></TableCell><TableCell className="hidden text-xs md:table-cell"><a href={`/datasets/tierlist-archon/classes/${entry.classSlug}`} className="inline-flex items-center gap-1.5 text-[#9ca6b8] hover:text-[#dfbd69]">{entry.className}<ChevronRight className="size-3" /></a></TableCell><TableCell className="text-right font-mono text-xs text-[#d8bd79]">{metricValue(entry)}</TableCell><TableCell className="hidden text-right font-mono text-xs text-[#8792a5] sm:table-cell">{entry.parses.toLocaleString("ru-RU")}</TableCell><TableCell><a href={entry.buildUrl} target="_blank" rel="noreferrer" className="grid size-8 place-items-center border border-[#323846] text-[#a88c4d] hover:border-[#8f7540] hover:text-[#e0bd68]" aria-label={`Открыть билд ${entry.specName}`}><ExternalLink className="size-3.5" /></a></TableCell></TableRow>; })}</TableBody></Table></div>
    {displayed.length === 0 ? <div className="border-x border-b border-[#292f3c] py-10 text-center text-xs text-[#737e92]">В этой выборке записей нет. Последний успешный снимок сохранён.</div> : null}
  </Panel>;
}

type WowGGOption = readonly [string, string];

function uniqueOptions(options: WowGGOption[]): WowGGOption[] {
  return Array.from(new Map(options.map((option) => [option[0], option])).values());
}

function WowGGSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: WowGGOption[] }) {
  return <label className="flex min-w-0 flex-col gap-1.5"><span className="text-[9px] uppercase tracking-[.12em] text-[#6f798c]">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full border border-[#343b49] bg-[#0b0e14] px-3 text-xs text-[#cbd2de] outline-none transition-colors hover:border-[#6d5c38] focus:border-[#a68a49]">{options.map(([id, text]) => <option key={`${label}-${id}`} value={id}>{text}</option>)}</select></label>;
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
  const displayed = [...entries].sort((left, right) => (left.tierAssignments[metric]?.rank ?? 32_767) - (right.tierAssignments[metric]?.rank ?? 32_767));
  return <Panel title="Tierlist — wow.gg" kicker={`${displayed.length} записей в выбранном срезе`} icon={Database} action={<div className="relative w-full sm:w-56"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#626d80]" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти класс или спек" className="h-9 rounded-sm border-[#303645] bg-[#0b0e14] pl-9 text-xs" /></div>}>
    <div className="overflow-x-auto border border-[#292f3c]"><Table><TableHeader><TableRow className="border-[#292f3c] bg-[#0c1017] hover:bg-[#0c1017]"><TableHead className="w-14 text-[9px] uppercase tracking-[.12em] text-[#6f798c]">Тир</TableHead><TableHead className="text-[9px] uppercase tracking-[.12em] text-[#6f798c]">Специализация / подземелье</TableHead><TableHead className="hidden text-[9px] uppercase tracking-[.12em] text-[#6f798c] md:table-cell">Класс</TableHead><TableHead className="text-right text-[9px] uppercase tracking-[.12em] text-[#6f798c]">Значение</TableHead><TableHead className="w-12"><span className="sr-only">Источник</span></TableHead></TableRow></TableHeader><TableBody>{displayed.map((entry) => { const assignment = entry.tierAssignments[metric]; const value = wowGGMetricValue(entry, metric); const classHref = entry.classSlug ? `/datasets/${datasetSlug}/classes/${entry.classSlug}` : ""; return <TableRow key={`${entry.contextKey}-${entry.entityType}-${entry.entitySlug}`} className="border-[#252b38] bg-[#11151d] hover:bg-[#171b24]"><TableCell><span className={cn("grid size-8 place-items-center border font-[var(--display)] text-sm font-bold", tierStyle(assignment?.tier ?? entry.tier))}>{assignment?.tier ?? entry.tier}</span></TableCell><TableCell>{classHref ? <a href={classHref} className="font-semibold text-[#e0e4ec] hover:text-[#dfbd69]">{entry.specName}</a> : <span className="font-semibold text-[#e0e4ec]">{entry.entityName}</span>}<div className="mt-0.5 text-[10px] text-[#768196]">#{assignment?.rank ?? entry.rank}</div></TableCell><TableCell className="hidden text-xs md:table-cell">{classHref ? <a href={classHref} className="inline-flex items-center gap-1.5 text-[#9ca6b8] hover:text-[#dfbd69]">{entry.className}<ChevronRight className="size-3" /></a> : <span className="text-[#697387]">Mythic+</span>}</TableCell><TableCell className="text-right font-mono text-xs text-[#d8bd79]">{metric === "popularity" && value != null ? `${value.toFixed(1)}%` : metric === "maxKey" && value != null ? `+${Math.round(value)}` : formatMetricNumber(value)}</TableCell><TableCell><a href={entry.guideUrl || entry.sourceUrl} target="_blank" rel="noreferrer" className="grid size-8 place-items-center border border-[#323846] text-[#a88c4d] hover:border-[#8f7540] hover:text-[#e0bd68]" aria-label={`Открыть источник ${entry.entityName}`}><ExternalLink className="size-3.5" /></a></TableCell></TableRow>; })}</TableBody></Table></div>
    {displayed.length === 0 ? <div className="border-x border-b border-[#292f3c] py-10 text-center text-xs text-[#737e92]">Для этой комбинации фильтров данных пока нет. Последний успешный снимок сохранён.</div> : null}
  </Panel>;
}

function bestMetric(entries: WowGGTierlistEntry[], specSlug: string | null, field: "metaScore" | "maxKey" | "averageDps" | "pvpMaxRating") {
  const values = entries.filter((entry) => entry.specSlug === specSlug).map((entry) => entry[field]).filter((value): value is number => value != null);
  return values.length ? Math.max(...values) : null;
}

function DatasetRunHistory({ runs }: { runs: DatasetRun[] }) {
  return <Panel title="История обновлений" kicker="Снимки сохраняются при сбоях" icon={Clock3}>{runs.length === 0 ? <div className="py-10 text-center text-xs text-[#737e92]">Запуски ещё не зарегистрированы</div> : <div className="flex flex-col">{runs.map((run) => <div key={run.id} className="flex items-center gap-3 border-b border-[#252b38] py-3 last:border-b-0"><span className={cn("grid size-7 shrink-0 place-items-center border", run.status === "succeeded" ? "border-[#31583a] bg-[#122018] text-[#65ba72]" : run.status === "failed" ? "border-[#653a3d] bg-[#251416] text-[#e47d82]" : "border-[#5c4e2c] bg-[#211b0f] text-[#d2ad57]")}>{run.status === "succeeded" ? <Check className="size-3.5" /> : run.status === "failed" ? <X className="size-3.5" /> : <RefreshCw className="size-3.5" />}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><div className="truncate text-xs font-medium">{run.status === "succeeded" ? "Обновление выполнено" : run.status === "failed" ? "Ошибка обновления — сохранён прошлый снимок" : "Обновление данных"}</div><time className="shrink-0 text-[9px] text-[#667086]">{formatDate(run.finishedAt || run.startedAt)}</time></div><div className="mt-1 text-[10px] text-[#737e92]">{run.recordCount} записей · {run.pageCount} страниц · {run.trigger}</div>{run.errorSummary ? <div className="mt-1 text-[10px] text-[#bd7479]">{run.errorSummary}</div> : null}</div></div>)}</div>}</Panel>;
}

function RunHistory({ data, compact = false }: { data: DashboardData; compact?: boolean }) {
  const runs = compact ? data.runs.slice(0, 5) : data.runs;
  return <Panel title="История обновлений" kicker="Снимки сохраняются при сбоях" icon={Clock3}>{runs.length === 0 ? <div className="py-10 text-center text-xs text-[#737e92]">Запуски ещё не зарегистрированы</div> : <div className="flex flex-col">{runs.map((run) => <div key={run.id} className="flex items-center gap-3 border-b border-[#252b38] py-3 last:border-b-0"><span className={cn("grid size-7 shrink-0 place-items-center border", run.status === "succeeded" ? "border-[#31583a] bg-[#122018] text-[#65ba72]" : run.status === "failed" ? "border-[#653a3d] bg-[#251416] text-[#e47d82]" : "border-[#5c4e2c] bg-[#211b0f] text-[#d2ad57]")}>{run.status === "succeeded" ? <Check className="size-3.5" /> : run.status === "failed" ? <X className="size-3.5" /> : <RefreshCw className="size-3.5" />}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><div className="truncate text-xs font-medium">{run.status === "succeeded" ? "Обновление выполнено" : run.status === "failed" ? "Ошибка обновления" : "Обновление данных"}</div><time className="shrink-0 text-[9px] text-[#667086]">{formatDate(run.finishedAt || run.startedAt)}</time></div><div className="mt-1 text-[10px] text-[#737e92]">{run.recordCount} записей · {run.pageCount} страниц · {run.trigger}</div></div></div>)}</div>}</Panel>;
}

function EndpointList({ data }: { data: DashboardData }) { return <Panel title="Доступные методы API" kicker="REST v1 и GraphQL" icon={Code2}><div className="grid gap-px border border-[#292f3c] bg-[#292f3c] md:grid-cols-2">{data.endpoints.map((endpoint) => <div key={`${endpoint.method}-${endpoint.path}`} className="flex items-center gap-3 bg-[#11151d] p-4"><Badge variant="outline" className={cn("w-12 justify-center rounded-sm font-mono text-[9px]", endpoint.method === "GET" ? "border-[#31583a] text-[#6bc278]" : "border-[#5b4c2c] text-[#d4ae58]")}>{endpoint.method}</Badge><div className="min-w-0"><code className="text-xs text-[#dce1eb]">{endpoint.path}</code><div className="mt-0.5 truncate text-[10px] text-[#737e92]">{endpoint.description}</div></div></div>)}</div></Panel>; }

function APIView({ data }: { data: DashboardData }) { return <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]"><EndpointList data={data} /><Panel title="Как работает API" kicker="Быстрый старт" icon={BookOpen}><ol className="flex flex-col gap-4">{[{ title: "Выберите метод", text: "Используйте стабильные REST-методы /v1 или GraphQL." }, { title: "Отправьте запрос", text: "Ответы возвращаются в JSON, ошибки — с машинным кодом и сообщением." }, { title: "Проверьте состояние", text: "Эндпоинты /livez и /readyz показывают готовность сервиса." }].map((step, index) => <li key={step.title} className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center border border-[#65542e] bg-[#201b10] font-[var(--display)] text-xs text-[#d8b45e]">{index + 1}</span><div><div className="text-xs font-semibold">{step.title}</div><p className="mt-1 text-xs leading-5 text-[#7f899d]">{step.text}</p></div></li>)}</ol><div className="mt-6 border border-[#2f3543] bg-[#090c12] p-4 font-mono text-[11px] leading-6 text-[#9da7b9]"><span className="text-[#6bc278]">curl</span> https://api.gildra.net/v1/game/products</div></Panel></div>; }

function SystemView({ data }: { data: DashboardData }) { return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{data.systems.map((system) => <Card key={system.name} className="rounded-sm border-[#2d3341] bg-[#11151d] shadow-none"><CardHeader className="flex-row items-center justify-between p-5"><div className="grid size-9 place-items-center border border-[#354438] bg-[#101a14] text-[#63b970]"><Server className="size-4" /></div><span className="flex items-center gap-2 text-[9px] uppercase tracking-[.12em] text-[#72b97b]"><span className="size-1.5 rounded-full bg-[#58ad67] shadow-[0_0_8px_#58ad67]" />{system.status === "operational" ? "Работает" : "Отклонение"}</span></CardHeader><CardContent className="px-5 pb-5"><CardTitle className="text-base">{system.name}</CardTitle><div className="mt-2 text-xs text-[#778196]">Ответ за {system.latencyMs} мс</div></CardContent></Card>)}</div>; }

function Panel({ title, kicker, icon: Icon, action, children }: { title: string; kicker: string; icon: typeof Activity; action?: React.ReactNode; children: React.ReactNode }) { return <Card className="min-w-0 rounded-sm border-[#2d3341] bg-[#11151d] shadow-none"><CardHeader className="flex flex-col gap-4 border-b border-[#292f3c] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"><div className="flex items-center gap-3"><div className="grid size-8 place-items-center border border-[#4b4230] bg-[#1b1811] text-[#c9a24f]"><Icon className="size-3.5" /></div><div><CardTitle className="font-[var(--display)] text-sm tracking-wide">{title}</CardTitle><p className="mt-1 text-[9px] uppercase tracking-[.12em] text-[#667086]">{kicker}</p></div></div>{action}</CardHeader><CardContent className="p-4 sm:p-5">{children}</CardContent></Card>; }

function SmallMetric({ label, value }: { label: string; value: string }) { return <div className="bg-[#0c1017] p-3"><div className="text-[9px] uppercase tracking-[.12em] text-[#687286]">{label}</div><div className="mt-1 font-mono text-xs font-semibold text-[#d8dde7]">{value}</div></div>; }
function tierStyle(tier: string) { if (!tier) return "border-[#3a414f] bg-[#151923] text-[#737e92]"; if (tier.startsWith("S")) return "border-[#7b532a] bg-[#321c0c] text-[#f09337]"; if (tier.startsWith("A")) return "border-[#613c7f] bg-[#251331] text-[#b467ed]"; if (tier.startsWith("B")) return "border-[#2b5691] bg-[#101f38] text-[#5b9bf4]"; return "border-[#3e6133] bg-[#142411] text-[#76c25e]"; }
function formatMetricNumber(value: number | null) { return value == null ? "—" : Math.round(value).toLocaleString("ru-RU"); }
function metricLabel(metric: string, role: string) { if (metric === "score") return "M+ рейтинг"; if (metric === "popularity") return "Популярность"; if (metric === "survivability") return "Выживаемость"; return role === "healer" ? "HPS" : "DPS"; }
function difficultyLabel(difficulty: string) { if (difficulty === "10") return "+10"; return difficulty.slice(0, 1).toUpperCase() + difficulty.slice(1); }
function formatDate(value: string | null) { return value ? new Date(value).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"; }
function relativeTime(value: string | null) { if (!value) return "Нет данных"; const diff = Date.now() - new Date(value).getTime(); const hours = Math.floor(diff / 3_600_000); if (hours < 1) return "Недавно"; if (hours < 24) return `${hours} ч назад`; return `${Math.floor(hours / 24)} дн назад`; }
function freshnessHint(dataset: DatasetListItem) { if (dataset.freshness === "fresh") return `Свежие до ${formatDate(dataset.freshUntil)}`; if (dataset.freshness === "stale") return `Просрочены с ${formatDate(dataset.freshUntil)}`; return "Успешных обновлений ещё не было"; }
function formatInterval(seconds: number) { if (seconds % 86_400 === 0) return `${seconds / 86_400} дн.`; if (seconds % 3_600 === 0) return `${seconds / 3_600} ч.`; return `${Math.max(1, Math.round(seconds / 60))} мин.`; }
function activityLabel(activity: string) { return activity === "mythic_plus" ? "Mythic+" : "Рейд"; }
function icyVeinsActivityLabel(activity: string) { return activity === "mythic_plus" ? "Mythic+" : activity === "pvp" ? "PvP" : "Рейд"; }
function roleLabel(role: string) { return role === "healer" ? "Лекарь" : role === "tank" ? "Танк" : "DPS"; }
