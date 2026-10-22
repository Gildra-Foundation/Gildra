"use client";

import { useTenantSelection } from "@payloadcms/plugin-multi-tenant/client";
import React, { useEffect, useMemo, useState } from "react";

import { useId } from "react";
import type { AdminLang } from "../admin/text";
import { AdminSurface } from "./AdminSurface";
import { StatsCard } from "./valyro-ui/data-display/StatsCard";
import { BarChart } from "./valyro-ui/charts/BarChart";
import { AnalyticsFilterBar } from "./valyro-ui/charts/AnalyticsFilterBar";
import { DataTable } from "./valyro-ui/data-display/DataTable";
import { EmptyState } from "./valyro-ui/data-display/EmptyState";
import { Select } from "./valyro-ui/forms/Select";
import { tableLabels } from "./tableLabels";

type SiteOption = { id: number | string; name: string; configured: boolean };

type Report = {
  aggregate: { visitors: number; pageviews: number; bounceRate: number | null; visitDuration: number | null };
  topPages: { page: string; visitors: number; pageviews: number }[];
  sources: { source: string; visitors: number }[];
  timeseries: { date: string; visitors: number; pageviews: number }[];
};

type Response =
  | { status: "ok"; report: Report; fetchedAt: string; cached: boolean }
  | { status: "not-configured"; missing: string[] }
  | { status: "error"; error: string; httpStatus?: number }
  | { status: "forbidden" | "invalid" | "not-found" };

const TEXT = {
  en: {
    periods: [
      ["7d", "Last 7 days"],
      ["30d", "Last 30 days"],
      ["month", "This month"],
      ["6mo", "Last 6 months"],
      ["12mo", "Last 12 months"],
    ] as [string, string][],
    noDaily: "No daily data for this period.",
    perDay: "Pageviews per day",
    perDayActive: (date: string, pv: string, v: string) => ` — ${date}: ${pv} pageviews, ${v} visitors`,
    barTitle: (date: string, pv: string) => `${date}: ${pv} pageviews`,
    noData: "No data.",
    notConfigured: (missing: string) => `Analytics is not configured (missing: ${missing}). No numbers are shown.`,
    timeout: "Plausible did not answer in time",
    unauthorized: "Plausible rejected the API key",
    invalid: "Plausible returned an unexpected response",
    unreachable: "Plausible is unreachable or returned an error",
    tryLater: (reason: string) => `${reason}. No numbers are shown; try again later.`,
    forbidden: "You do not have analytics access to this site.",
    badRequest: "The request was invalid.",
    site: "Site",
    period: "Period",
    notConfiguredOption: " (not configured)",
    loading: (site: string, period: string) => `Loading ${site} · ${period}…`,
    visitors: (site: string) => `Unique visitors · ${site}`,
    pageviews: "Pageviews",
    bounce: "Bounce rate",
    duration: "Visit duration",
    seconds: "s",
    topPages: "Top pages",
    page: "Page",
    visitorsCol: "Visitors",
    sources: "Sources",
    source: "Source",
    footer: "Visitors are unique per site only; they are never added up across sites. Data from Plausible",
    fetched: (when: string, cached: boolean) => `, fetched ${when}${cached ? " (cached)" : ""}`,
  },
  ru: {
    periods: [
      ["7d", "Последние 7 дней"],
      ["30d", "Последние 30 дней"],
      ["month", "Этот месяц"],
      ["6mo", "Последние 6 месяцев"],
      ["12mo", "Последние 12 месяцев"],
    ] as [string, string][],
    noDaily: "Нет данных по дням за этот период.",
    perDay: "Просмотры по дням",
    perDayActive: (date: string, pv: string, v: string) => ` — ${date}: просмотров ${pv}, посетителей ${v}`,
    barTitle: (date: string, pv: string) => `${date}: просмотров ${pv}`,
    noData: "Нет данных.",
    notConfigured: (missing: string) => `Статистика не настроена (не хватает: ${missing}). Цифры не показываются.`,
    timeout: "Plausible не ответил вовремя",
    unauthorized: "Plausible отклонил API-ключ",
    invalid: "Plausible вернул неожиданный ответ",
    unreachable: "Plausible недоступен или вернул ошибку",
    tryLater: (reason: string) => `${reason}. Цифры не показываются; попробуйте позже.`,
    forbidden: "У вас нет доступа к статистике этого сайта.",
    badRequest: "Некорректный запрос.",
    site: "Сайт",
    period: "Период",
    notConfiguredOption: " (не подключён)",
    loading: (site: string, period: string) => `Загружаю ${site} · ${period}…`,
    visitors: (site: string) => `Уникальные посетители · ${site}`,
    pageviews: "Просмотры",
    bounce: "Отказы",
    duration: "Время визита",
    seconds: "с",
    topPages: "Популярные страницы",
    page: "Страница",
    visitorsCol: "Посетители",
    sources: "Источники",
    source: "Источник",
    footer: "Посетители считаются отдельно для каждого сайта и не суммируются между сайтами. Данные Plausible",
    fetched: (when: string, cached: boolean) => `, получены ${when}${cached ? " (из кэша)" : ""}`,
  },
} satisfies Record<AdminLang, unknown>;

type Text = (typeof TEXT)["en"];
function describeError(result: Response, t: Text): string {
  if (result.status === "not-configured") return t.notConfigured(result.missing.join(", "));
  if (result.status === "error") {
    const reason =
      result.error === "timeout"
        ? t.timeout
        : result.error === "unauthorized-upstream"
          ? t.unauthorized
          : result.error === "invalid-response"
            ? t.invalid
            : t.unreachable;
    return t.tryLater(reason);
  }
  if (result.status === "forbidden") return t.forbidden;
  return t.badRequest;
}

function AnalyticsPanelContent({
  sites,
  initialSiteID,
  lang = "en",
}: {
  sites: SiteOption[];
  initialSiteID: number | string | null;
  lang?: AdminLang;
}) {
  const t: Text = TEXT[lang];
  const siteLabelID = useId();
  const fmt = useMemo(() => new Intl.NumberFormat(lang === "ru" ? "ru-RU" : "en"), [lang]);
  const PERIODS = t.periods;
  const { selectedTenantID } = useTenantSelection();
  const initial =
    sites.find((s) => String(s.id) === String(selectedTenantID)) ?? sites.find((s) => String(s.id) === String(initialSiteID)) ?? sites[0];
  const [siteID, setSiteID] = useState(String(initial.id));
  const [period, setPeriod] = useState("30d");
  // Every response is stored with the exact (site, period) it was requested for and is
  // rendered only while that is still the selection — never under a newer one, not even
  // on the first render after a switch. "Loading" is derived from the same binding, so a
  // slow or aborted older request can neither show its numbers nor end the loading state.
  const [entry, setEntry] = useState<{ siteID: string; period: string; response: Response } | null>(null);

  // Follow the global site selector when it points at a site we can analyse.
  useEffect(() => {
    if (selectedTenantID !== undefined && sites.some((s) => String(s.id) === String(selectedTenantID))) {
      setSiteID(String(selectedTenantID));
    }
  }, [selectedTenantID, sites]);

  useEffect(() => {
    const controller = new AbortController();
    const settle = (response: Response) => {
      if (!controller.signal.aborted) setEntry({ siteID, period, response });
    };
    fetch(`/api/analytics/report?site=${encodeURIComponent(siteID)}&period=${encodeURIComponent(period)}`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then((r) => r.json() as Promise<Response>)
      .then(settle)
      .catch(() => settle({ status: "error", error: "network" }));
    return () => controller.abort();
  }, [siteID, period]);

  const current = entry && entry.siteID === siteID && entry.period === period ? entry : null;
  const result = current?.response ?? null;
  const loading = current === null;
  const report = result?.status === "ok" ? result.report : null;
  const site = useMemo(() => sites.find((s) => String(s.id) === current?.siteID), [sites, current]);
  const pending = sites.find((s) => String(s.id) === siteID);

  return (
    <AdminSurface lang={lang}>
      <div className="gd-analytics">
        <div className="gd-analytics__filters">
          <div className="gd-analytics__site">
            <span id={siteLabelID}>{t.site}</span>
            <Select aria-labelledby={siteLabelID} value={siteID} onValueChange={setSiteID}
              options={sites.map((s) => ({ value: String(s.id), label: s.name + (s.configured ? "" : t.notConfiguredOption) }))} />
          </div>
          <AnalyticsFilterBar
            value={{ range: period, filters: [], compare: false, granularity: "day" }}
            onValueChange={(value) => { if (PERIODS.some(([key]) => key === value.range)) setPeriod(value.range); }}
            ranges={PERIODS.map(([value, label]) => ({ value, label }))}
            showCompare={false} showGranularity={false}
            labels={{ group: t.period, dateRange: t.period }}
          />
          <p className="gd-analytics__status" role="status" aria-live="polite">
            {loading ? t.loading(pending?.name ?? "", PERIODS.find(([v]) => v === period)?.[1] ?? period) : ""}
          </p>
        </div>

        {result && !report ? <EmptyState title={describeError(result, t)} role="status" bordered /> : null}

        {loading ? <div className="gd-analytics__stats" aria-busy="true">
          {[t.visitors(pending?.name ?? ""), t.pageviews, t.bounce, t.duration].map((label) => <StatsCard key={label} label={label} value="" loading />)}
        </div> : null}

        {report ? <>
          <div data-analytics-site={current?.siteID} data-analytics-period={current?.period} className="gd-analytics__stats">
            <StatsCard label={t.visitors(site?.name ?? "")} value={report.aggregate.visitors} locale={lang} />
            <StatsCard label={t.pageviews} value={report.aggregate.pageviews} locale={lang} />
            <StatsCard label={t.bounce} value={report.aggregate.bounceRate === null ? "—" : `${fmt.format(report.aggregate.bounceRate)}%`} />
            <StatsCard label={t.duration} value={report.aggregate.visitDuration === null ? "—" : `${fmt.format(Math.round(report.aggregate.visitDuration))} ${t.seconds}`} />
          </div>
          {report.timeseries.length === 0 ? <EmptyState size="sm" title={t.noDaily} /> :
            <BarChart data={report.timeseries} x="date" series={[{ key: "pageviews", label: t.pageviews, color: "var(--gd-amber)" }]}
              ariaLabel={t.perDay} xLabel={lang === "ru" ? "Дата" : "Date"} locale={lang} valueFormatter={(value) => fmt.format(value)}
              labels={{ empty: t.noData, total: lang === "ru" ? "Всего" : "Total" }} />}
          <div className="gd-analytics__tables">
            <section aria-label={t.topPages}>
              <h2>{t.topPages}</h2>
              <DataTable data={report.topPages} label={t.topPages} locale={lang} density="compact" labels={tableLabels(lang)}
                getRowId={(row) => row.page} empty={<EmptyState size="sm" title={t.noData} />}
                columns={[
                  { key: "page", header: t.page, sortable: true },
                  { key: "visitors", header: t.visitorsCol, sortable: true, align: "right" },
                  { key: "pageviews", header: t.pageviews, sortable: true, align: "right" },
                ]} />
            </section>
            <section aria-label={t.sources}>
              <h2>{t.sources}</h2>
              <DataTable data={report.sources} label={t.sources} locale={lang} density="compact" labels={tableLabels(lang)}
                getRowId={(row) => row.source} empty={<EmptyState size="sm" title={t.noData} />}
                columns={[
                  { key: "source", header: t.source, sortable: true },
                  { key: "visitors", header: t.visitorsCol, sortable: true, align: "right" },
                ]} />
            </section>
          </div>
          <p className="gd-analytics__footer">{t.footer}
            {result?.status === "ok" ? t.fetched(new Date(result.fetchedAt).toLocaleString(lang === "ru" ? "ru-RU" : "en-GB"), result.cached) : ""}.
          </p>
        </> : null}
      </div>
    </AdminSurface>
  );
}

export function AnalyticsPanel(props: { sites: SiteOption[]; initialSiteID: number | string | null; lang?: AdminLang }) {
  const lang = props.lang ?? "en";
  if (props.sites.length === 0) return <AdminSurface lang={lang}><EmptyState title={TEXT[lang].forbidden} role="status" /></AdminSurface>;
  return <AnalyticsPanelContent {...props} />;
}
