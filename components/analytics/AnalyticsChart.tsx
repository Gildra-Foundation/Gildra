"use client";

import { useEffect, useState } from "react";
import { LightAreaChart } from "@/components/charts/LightAreaChart";
import type { AnalyticsOverview } from "@/lib/api/client";

type ChartPoint = { label: string; value: number };
type FormattedChartPoints = { data: AnalyticsOverview; locale: string; points: ChartPoint[] };
const hourFormatters = new Map<string, Intl.DateTimeFormat>();

function getHourFormatter(locale: string) {
  let formatter = hourFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
    hourFormatters.set(locale, formatter);
  }
  return formatter;
}

export function AnalyticsChart({
  data,
  copy,
  locale,
}: {
  data: AnalyticsOverview;
  copy: { events: string; users: string };
  locale: string;
}) {
  const [formatted, setFormatted] = useState<FormattedChartPoints | null>(null);
  useEffect(() => {
    let cancelled = false;
    const formatPoints = () => {
      const hourFormatter = getHourFormatter(locale);
      const points = data.series.map((point) => ({
        label: hourFormatter.format(new Date(point.hour)),
        value: point.events,
      }));
      if (!cancelled) setFormatted({ data, locale, points });
    };
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(formatPoints, { timeout: 300 });
      return () => {
        cancelled = true;
        idleWindow.cancelIdleCallback?.(handle);
      };
    }
    const handle = window.setTimeout(formatPoints, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [data, locale]);

  const points = formatted?.data === data && formatted.locale === locale ? formatted.points : null;
  if (!points) return <div className="min-h-[260px] w-full" aria-hidden="true" />;

  return (
    <LightAreaChart
      data={points}
      locale={locale}
      seriesLabel={copy.events}
      ariaLabel={`${copy.events} by hour`}
      color="var(--gold)"
      axisColor="rgba(215,198,169,.72)"
      gridColor="rgba(255,255,255,.08)"
      height={260}
    />
  );
}
