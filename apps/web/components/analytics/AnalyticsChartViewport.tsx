"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { AnalyticsOverview } from "@/lib/api/client";

const AnalyticsChart = dynamic(
  () => import("@/components/analytics/AnalyticsChart").then((module) => module.AnalyticsChart),
  {
    ssr: false,
    loading: () => <div className="min-h-[260px] w-full" aria-hidden="true" />,
  },
);

export function AnalyticsChartViewport({
  data,
  copy,
  locale,
}: {
  data: AnalyticsOverview;
  copy: { events: string; users: string };
  locale: string;
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartNearViewport, setChartNearViewport] = useState(false);

  useEffect(() => {
    const target = chartRef.current;
    if (!target) return;
    if (typeof IntersectionObserver === "undefined") {
      setChartNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setChartNearViewport(true);
        observer.disconnect();
      }
    }, { rootMargin: "400px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={chartRef} className="min-h-[260px] w-full">
      {chartNearViewport && <AnalyticsChart data={data} locale={locale} copy={copy} />}
    </div>
  );
}
