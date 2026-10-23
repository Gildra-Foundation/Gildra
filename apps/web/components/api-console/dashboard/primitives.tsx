"use client";

import { useConsoleText } from "../consoleLocale";
import Link from "next/link";
import {
  Activity, ArrowLeft, ChevronRight, CircleAlert, Clock3, Database, FileJson2, RefreshCw,
  Swords,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { type ConsoleRequestState } from "../client";
import { datasetPath } from "../paths";
import type { DatasetListItem, DatasetSummary, SystemStatus } from "../types";
import { type WowGGOption, relativeTime } from "./format";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3" aria-label="Gildra API">
      <div className="grid size-9 place-items-center border border-[#8b7138] bg-[#171716] text-[#e2c171] [clip-path:polygon(7px_0,100%_0,100%_calc(100%-7px),calc(100%-7px)_100%,0_100%,0_7px)]">
        <Swords className="size-[18px]" strokeWidth={1.5} />
      </div>
      {!compact && <div><div className="font-[family-name:var(--display)] text-[15px] font-bold tracking-[.18em] text-[#e7c878]">GILDRA</div><div className="text-[10px] uppercase tracking-[.28em] text-[#657087]">API Console</div></div>}
    </div>
  );
}

export // Loadable renders a section from its own request state: content when data
// is present, an inline error with retry, or a skeleton — never a page-wide
// spinner that waits for unrelated requests.
function Loadable<T>({ state, title, children }: { state: ConsoleRequestState<T>; title: string; children: (value: T) => React.ReactNode }) {
  const ct = useConsoleText();
  if (state.data) return <>{children(state.data)}</>;
  if (state.error) return <SectionError title={title} message={ct(state.error)} onRetry={state.reload} />;
  return <SectionSkeleton title={title} />;
}

export function SectionSkeleton({ title }: { title: string }) {
  const ct = useConsoleText();
  return <div role="status" aria-busy="true" aria-label={["", title, ct(": загрузка")].join("")} className="border border-[#2d3341] bg-[#11151d] p-5"><div className="flex items-center gap-3 text-[10px] uppercase tracking-[.14em] text-[#687286]"><RefreshCw className="size-3.5 animate-spin text-[#c9a24f]" />{title}</div><div className="mt-4 space-y-2"><div className="h-3 w-2/5 animate-pulse bg-[#1c2230]" /><div className="h-3 w-3/5 animate-pulse bg-[#1c2230]" /><div className="h-3 w-1/3 animate-pulse bg-[#1c2230]" /></div></div>;
}

export function SectionError({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  const ct = useConsoleText();
  return <div role="alert" className="border border-[#693b3e] bg-[#1b1114] p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><CircleAlert className="mt-0.5 size-4 shrink-0 text-[#e88787]" /><div><div className="text-xs font-semibold text-[#f0b0b0]">{title}{ct(": не удалось загрузить")}</div><p className="mt-1 text-xs text-[#a8909a]">{message}</p></div></div><Button variant="outline" onClick={onRetry} className="h-9 rounded-sm border-[#5c3a3f] bg-transparent text-xs text-[#f0b0b0] hover:bg-[#2a1518]"><RefreshCw className="size-3.5" />{ct("Повторить")}</Button></div></div>;
}

export function PanelLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
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

export function CatalogHeading({ kicker, title, description }: { kicker: string; title: string; description: string }) {
  return <div><p className="text-[10px] uppercase tracking-[.16em] text-[#9a824a]">{kicker}</p><h2 className="mt-2 font-[family-name:var(--display)] text-2xl font-semibold">{title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[#7f899d]">{description}</p></div>;
}

export function CatalogEmpty({ text }: { text: string }) { return <div className="border border-[#2d3341] bg-[#11151d] py-12 text-center text-sm text-[#7f899d]">{text}</div>; }


export function EmptyDataset() {
  const ct = useConsoleText(); return <div className="border border-[#2d3341] bg-[#11151d] py-16 text-center"><Database className="mx-auto size-8 text-[#6f798c]" /><h2 className="mt-4 text-lg font-semibold">{ct("Датасет не найден")}</h2><Link href={datasetPath()} className="mt-4 inline-flex items-center gap-2 text-xs text-[#d2ad57]"><ArrowLeft className="size-4" />{ct("К списку датасетов")}</Link></div>; }

export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  const ct = useConsoleText(); return <nav aria-label={ct("Хлебные крошки")} className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[.12em] text-[#697387]">{items.map((item, index) => <span key={`${item.label}-${index}`} className="flex items-center gap-2">{index > 0 ? <ChevronRight className="size-3" /> : null}{item.href ? <Link href={item.href} className="text-[#a98d4f] hover:text-[#ddba67]">{ct(item.label)}</Link> : <span>{ct(item.label)}</span>}</span>)}</nav>; }

export function FreshnessBadge({ dataset }: { dataset: DatasetListItem }) {
  const ct = useConsoleText(); const fresh = dataset.freshness === "fresh"; const never = dataset.freshness === "never"; return <Badge variant="outline" className={cn("rounded-sm px-2 py-1 text-[10px] uppercase tracking-[.1em]", fresh ? "border-[#31583a] bg-[#102017] text-[#6bc278]" : never ? "border-[#604047] bg-[#261619] text-[#df7c83]" : "border-[#66552e] bg-[#211c10] text-[#e0b85d]")}><span className={cn("mr-1.5 size-1.5 rounded-full", fresh ? "bg-[#58ad67]" : never ? "bg-[#d95c55]" : "bg-[#d2a846]")} />{fresh ? ct("Свежие данные") : never ? ct("Нет данных") : ct("Данные устарели")}</Badge>; }

export function DatasetMetric({ label, value }: { label: string; value: number }) { return <div className="bg-[#0c1017] p-3"><div className="text-[10px] uppercase tracking-[.12em] text-[#687286]">{label}</div><div className="mt-1 font-[family-name:var(--display)] text-lg font-semibold text-[#e1e5ed]">{value.toLocaleString("en-US")}</div></div>; }

export function StatusRail({ systems, dataset, error, onRetry }: { systems: SystemStatus[] | null; dataset: DatasetListItem | DatasetSummary | null; error?: string; onRetry?: () => void }) {
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

export function Metric({ label, value }: { label: string; value: number }) { return <div className="bg-[#0d1118] px-3 py-3"><div className="text-[10px] uppercase tracking-[.12em] text-[#687286]">{label}</div><div className="mt-1 font-[family-name:var(--display)] text-xl font-semibold">{value.toLocaleString("en-US")}</div></div>; }

export function WowGGSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: WowGGOption[] }) {
  return <label className="flex min-w-0 flex-col gap-1.5"><span className="text-[10px] uppercase tracking-[.12em] text-[#6f798c]">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full border border-[#343b49] bg-[#0b0e14] px-3 text-xs text-[#cbd2de] outline-none transition-colors hover:border-[#6d5c38] focus:border-[#a68a49]">{options.map(([id, text]) => <option key={`${label}-${id}`} value={id}>{text}</option>)}</select></label>;
}

export function Panel({ title, kicker, icon: Icon, action, children }: { title: string; kicker: string; icon: typeof Activity; action?: React.ReactNode; children: React.ReactNode }) { return <Card className="min-w-0 rounded-sm border-[#2d3341] bg-[#11151d] shadow-none"><CardHeader className="flex flex-col gap-4 border-b border-[#292f3c] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"><div className="flex items-center gap-3"><div className="grid size-8 place-items-center border border-[#4b4230] bg-[#1b1811] text-[#c9a24f]"><Icon className="size-3.5" /></div><div><CardTitle className="font-[family-name:var(--display)] text-sm tracking-wide">{title}</CardTitle><p className="mt-1 text-[10px] uppercase tracking-[.12em] text-[#667086]">{kicker}</p></div></div>{action}</CardHeader><CardContent className="p-4 sm:p-5">{children}</CardContent></Card>; }

export function SmallMetric({ label, value }: { label: string; value: string }) { return <div className="bg-[#0c1017] p-3"><div className="text-[10px] uppercase tracking-[.12em] text-[#687286]">{label}</div><div className="mt-1 font-mono text-xs font-semibold text-[#d8dde7]">{value}</div></div>; }
