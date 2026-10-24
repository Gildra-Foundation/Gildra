"use client";

import { useReportWebVitals } from "next/web-vitals";
import { isTrackedPage } from "@/lib/cms/tracking";

type Plausible = (event: string, options?: { props?: Record<string, string> }) => void;

/** Rounded values keep the event properties few and readable. */
const bucket = (name: string, value: number) =>
  name === "CLS" ? (Math.round(value * 100) / 100).toFixed(2) : String(Math.round(value / (name === "INP" ? 25 : 100)) * (name === "INP" ? 25 : 100));

/**
 * Real-user Web Vitals (roadmap item 69): LCP, INP, CLS, FCP and TTFB of every
 * page view go to Plausible as the custom event "Web Vitals" with the metric,
 * its rating, a rounded value and the page path (language prefix removed).
 * Cookieless like the pageviews; mounted only when Plausible is configured.
 */
export function WebVitals() {
  useReportWebVitals((metric) => {
    if (!["LCP", "INP", "CLS", "FCP", "TTFB"].includes(metric.name)) return;
    const domain = document.getElementById("plausible")?.getAttribute("data-domain");
    if (!domain || !isTrackedPage(window.location.hostname, domain, window.location.pathname)) return;
    const plausible = (window as Window & { plausible?: Plausible }).plausible;
    if (typeof plausible !== "function") return;
    plausible("Web Vitals", {
      props: {
        metric: metric.name,
        rating: metric.rating,
        value: bucket(metric.name, metric.value),
        page: window.location.pathname.replace(/^\/ru(?=\/|$)/, "") || "/",
        lang: /^\/ru(?:\/|$)/.test(window.location.pathname) ? "ru" : "en",
      },
    });
  });
  return null;
}
