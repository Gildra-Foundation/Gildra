import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";
import { TopNav } from "@/components/TopNav";
import { Footer } from "@/components/Footer";
import { getAnalyticsOverview } from "@/lib/api/client";
import styles from "@/components/analytics/analyticsPage.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Azeroth live analytics — Gildra", description: "Live usage and realm telemetry for the Gildra Warcraft command center." };

export default async function AnalyticsPage() {
  const t = await getTranslations("Analytics");
  const data = await getAnalyticsOverview(24);
  return (
    <>
      <link rel="preload" as="image" href="/assets/wow/mythic/ruby-depth-v3-light-fast.webp" media="(min-width: 721px)" />
      <link rel="preload" as="image" href="/assets/wow/mythic/ruby-depth-v3-mobile-optimized.webp" media="(max-width: 720px)" />
      <TopNav />
      <main className={styles.page}>
        <header className={styles.hero}>
          <picture className={styles.heroImage} aria-hidden="true">
            <source media="(max-width: 720px)" srcSet="/assets/wow/mythic/ruby-depth-v3-mobile-optimized.webp" />
            <img src="/assets/wow/mythic/ruby-depth-v3-light-fast.webp" width="1500" height="844" fetchPriority="high" decoding="async" alt="" />
          </picture>
          <p className={styles.eyebrow}>Azeroth intelligence · Gildra pulse</p>
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.subtitle}>{t("subtitle")}</p>
          <span className={styles.ribbon}><i />Live realm telemetry</span>
        </header>
        <AnalyticsDashboard
          data={data}
          locale="en"
          copy={{
            activity: t("activity"), empty: t("empty"), events: t("events"),
            hours: t("hours", { hours: data.hours }), subscriptions: t("subscriptions"), users: t("users"),
          }}
        />
      </main>
      <Footer />
    </>
  );
}
