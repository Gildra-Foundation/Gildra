import type { Metadata } from "next";
import { hiddenForMvp } from "@/lib/mvp";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";
import { getAnalyticsOverview } from "@/lib/api/client";
import { analyticsCopy } from "@/components/analytics/analyticsCopy";
import styles from "@/components/analytics/analyticsPage.module.css";
import "@/app/styles/tailwind-app.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Живая аналитика Азерота — Gildra", description: "Живая телеметрия и активность командного центра World of Warcraft." };

export default async function AnalyticsPageRu() {
  hiddenForMvp();
  const copy = analyticsCopy.ru;
  const data = await getAnalyticsOverview(24);
  return (
    <>
      <link rel="preload" as="image" href="/assets/wow/mythic/ruby-depth-v3-light-fast.webp" media="(min-width: 721px)" />
      <link rel="preload" as="image" href="/assets/wow/mythic/ruby-depth-v3-mobile-optimized.webp" media="(max-width: 720px)" />
      <main className={styles.page}>
        <header className={styles.hero}>
          <picture className={styles.heroImage}>
            <source media="(max-width: 720px)" srcSet="/assets/wow/mythic/ruby-depth-v3-mobile-optimized.webp" />
            <img src="/assets/wow/mythic/ruby-depth-v3-light-fast.webp" width="1500" height="844" fetchPriority="high" decoding="async" alt="" />
          </picture>
          <p className={styles.eyebrow}>Аналитика Азерота · Активность Gildra</p>
          <h1 className={styles.title}>{copy.title}</h1>
          <p className={styles.subtitle}>{copy.subtitle}</p>
          <span className={styles.ribbon}><i />Данные игрового мира в реальном времени</span>
        </header>
        <AnalyticsDashboard
          data={data}
          locale="ru"
          copy={{
            activity: copy.activity, empty: copy.empty, events: copy.events,
            hours: copy.hours(data.hours), subscriptions: copy.subscriptions, users: copy.users,
          }}
        />
      </main>
    </>
  );
}
