import { getTranslations } from "next-intl/server";

import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";
import { TopNav } from "@/components/TopNav";
import { Footer } from "@/components/Footer";
import { getAnalyticsOverview } from "@/lib/api/client";

export const dynamic = "force-dynamic";

export default async function AnalyticsPageRu() {
  const t = await getTranslations("Analytics");
  const data = await getAnalyticsOverview(24);
  return (
    <>
      <TopNav />
      <main className="mx-auto min-h-[75vh] max-w-[1240px] px-6 py-28">
        <p className="mb-3 font-mono text-xs uppercase tracking-[.24em] text-primary">Gildra pulse</p>
        <h1 className="font-display text-4xl font-bold text-white md:text-6xl">{t("title")}</h1>
        <p className="mt-3 mb-10 max-w-2xl text-muted-foreground">{t("subtitle")}</p>
        <AnalyticsDashboard
          data={data}
          locale="ru"
          copy={{
            activity: t("activity"), empty: t("empty"), events: t("events"),
            hours: t("hours", { hours: data.hours }), subscriptions: t("subscriptions"), users: t("users"),
          }}
        />
      </main>
      <Footer lang="ru" />
    </>
  );
}
