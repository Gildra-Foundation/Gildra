"use client";

import { useConsoleText } from "../consoleLocale";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CircleAlert, Database, ExternalLink, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { requestJSON } from "../client";
import type { CatalogHealth, CatalogReadiness } from "../types";
import { catalogImportLabel, relativeTime } from "./format";
import { PanelLoadError, DatasetMetric, Metric, Panel } from "./primitives";

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

export function LeagueConsolePanel() {
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

export function CatalogHealthPanel({ catalog, readiness }: { catalog: CatalogHealth & { warnings?: string[] }; readiness: CatalogReadiness }) {
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

function CatalogCoverageMetric({ label, value, percent }: { label: string; value: number; percent: string }) {
  return <div className="bg-[#0d1118] px-3 py-3"><div className="text-[10px] uppercase tracking-[.12em] text-[#687286]">{label}</div><div className="mt-1 flex items-baseline justify-between gap-2"><span className="font-[family-name:var(--display)] text-xl font-semibold">{value.toLocaleString("en-US")}</span><span className="text-[10px] text-[#d2ad57]">{percent}</span></div></div>;
}


