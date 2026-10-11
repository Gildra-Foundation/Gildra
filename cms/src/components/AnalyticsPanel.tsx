"use client";

import { useTenantSelection } from "@payloadcms/plugin-multi-tenant/client";
import React, { useEffect, useMemo, useState } from "react";

import type { AdminLang } from "../admin/text";

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
const ink = { muted: "var(--theme-elevation-500)", line: "var(--theme-elevation-150)" };

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: 12, border: `1px solid ${ink.line}`, borderRadius: 4, minWidth: 150 }}>
      <div style={{ color: ink.muted, fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

/** Single-series daily pageviews: one hue, 2px gaps, rounded data ends, native hover titles. */
function DailyBars({ series, t, fmt }: { series: Report["timeseries"]; t: Text; fmt: Intl.NumberFormat }) {
  const [hover, setHover] = useState<number | null>(null);
  if (series.length === 0) return <p style={{ color: ink.muted }}>{t.noDaily}</p>;
  const width = 720;
  const height = 140;
  const max = Math.max(1, ...series.map((d) => d.pageviews));
  const step = width / series.length;
  const bar = Math.max(1, step - 2);
  const active = hover === null ? null : series[hover];
  return (
    <figure style={{ margin: 0 }}>
      <figcaption style={{ color: ink.muted, fontSize: 13, marginBottom: 4 }}>
        {t.perDay}
        {active ? t.perDayActive(active.date, fmt.format(active.pageviews), fmt.format(active.visitors)) : ""}
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label={t.perDay} onMouseLeave={() => setHover(null)}>
        <line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} stroke="var(--theme-elevation-200)" strokeWidth={1} />
        {series.map((d, i) => {
          const h = Math.max(d.pageviews > 0 ? 2 : 0, (d.pageviews / max) * (height - 8));
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)}>
              <rect x={i * step} y={0} width={step} height={height} fill="transparent" />
              <rect
                x={i * step + 1}
                y={height - h}
                width={bar}
                height={h}
                rx={Math.min(4, bar / 2)}
                fill="#2a78d6"
                opacity={hover === null || hover === i ? 1 : 0.55}
              >
                <title>{t.barTitle(d.date, fmt.format(d.pageviews))}</title>
              </rect>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

function Table<T>({
  caption,
  rows,
  columns,
  empty,
}: {
  caption: string;
  rows: T[];
  columns: [string, (row: T) => React.ReactNode, boolean?][];
  empty: string;
}) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <caption style={{ textAlign: "left", fontWeight: 600, padding: "8px 0" }}>{caption}</caption>
      <thead>
        <tr>
          {columns.map(([title, , numeric]) => (
            <th key={title} style={{ textAlign: numeric ? "right" : "left", padding: "4px 8px", borderBottom: `1px solid ${ink.line}` }}>
              {title}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={columns.length} style={{ padding: 8, color: ink.muted }}>
              {empty}
            </td>
          </tr>
        ) : (
          rows.map((row, i) => (
            <tr key={i}>
              {columns.map(([title, render, numeric]) => (
                <td key={title} style={{ padding: "4px 8px", textAlign: numeric ? "right" : "left", fontVariantNumeric: "tabular-nums" }}>
                  {render(row)}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

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

export function AnalyticsPanel({
  sites,
  initialSiteID,
  lang = "en",
}: {
  sites: SiteOption[];
  initialSiteID: number | string | null;
  lang?: AdminLang;
}) {
  const t: Text = TEXT[lang];
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
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0 16px" }}>
        <label>
          {t.site}{" "}
          <select value={siteID} onChange={(e) => setSiteID(e.target.value)}>
            {sites.map((s) => (
              <option key={String(s.id)} value={String(s.id)}>
                {s.name}
                {s.configured ? "" : t.notConfiguredOption}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.period}{" "}
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            {PERIODS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <span aria-live="polite" style={{ color: ink.muted }}>
          {loading ? t.loading(pending?.name ?? "", PERIODS.find(([v]) => v === period)?.[1] ?? period) : ""}
        </span>
      </div>

      {result && !report ? (
        <p role="status" style={{ padding: 12, border: `1px solid ${ink.line}`, borderRadius: 4 }}>
          {describeError(result, t)}
        </p>
      ) : null}

      {report ? (
        <>
          <div
            data-analytics-site={current?.siteID}
            data-analytics-period={current?.period}
            style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}
          >
            <Tile label={t.visitors(site?.name ?? "")} value={fmt.format(report.aggregate.visitors)} />
            <Tile label={t.pageviews} value={fmt.format(report.aggregate.pageviews)} />
            <Tile label={t.bounce} value={report.aggregate.bounceRate === null ? "—" : `${report.aggregate.bounceRate}%`} />
            <Tile
              label={t.duration}
              value={report.aggregate.visitDuration === null ? "—" : `${Math.round(report.aggregate.visitDuration)} ${t.seconds}`}
            />
          </div>
          <DailyBars series={report.timeseries} t={t} fmt={fmt} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24, marginTop: 16 }}>
            <Table
              caption={t.topPages}
              rows={report.topPages}
              empty={t.noData}
              columns={[
                [t.page, (r) => r.page],
                [t.visitorsCol, (r) => fmt.format(r.visitors), true],
                [t.pageviews, (r) => fmt.format(r.pageviews), true],
              ]}
            />
            <Table
              caption={t.sources}
              rows={report.sources}
              empty={t.noData}
              columns={[
                [t.source, (r) => r.source],
                [t.visitorsCol, (r) => fmt.format(r.visitors), true],
              ]}
            />
          </div>
          <p style={{ color: ink.muted, marginTop: 12 }}>
            {t.footer}
            {result?.status === "ok" ? t.fetched(new Date(result.fetchedAt).toLocaleString(lang === "ru" ? "ru-RU" : undefined), result.cached) : ""}.
          </p>
        </>
      ) : null}
    </div>
  );
}
