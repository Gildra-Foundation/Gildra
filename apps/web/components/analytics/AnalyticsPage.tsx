import { getTranslations } from "next-intl/server";
import { RefreshCw } from "lucide-react";
import { AtlasFrame } from "@/components/atlas/AtlasFrame";
import { AtlasHero } from "@gildra/atlas-ui/AtlasHero";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";
import { getAnalyticsOverview } from "@/lib/api/client";
import "@/app/styles/tailwind-app.css";

/** One server-rendered summary for both locales; no polling or invented live state. */
export async function AnalyticsPage({ locale }: { locale: "ru" | "en" }) {
  const [t, data] = await Promise.all([
    getTranslations({ locale, namespace: "Analytics" }),
    getAnalyticsOverview(24),
  ]);
  const path = `${locale === "ru" ? "/ru" : ""}/analytics`;
  return (
    <AtlasFrame lang={locale} art="/assets/wow/mythic/ruby-depth-v3-light-fast.webp" artPosition="center 40%" still>
      <AtlasHero
        align="chapter"
        breadcrumbs={[{ href: locale === "ru" ? "/ru" : "/", label: "Gildra" }, { label: t("title") }]}
        breadcrumbsLabel={t("navigation")}
        eyebrow={t("hours", { hours: data?.hours ?? 24 })}
        title={t("title")}
        lede={t("subtitle")}
        statsLabel={t("metrics")}
        stats={data ? [
          { label: t("events"), value: data.events },
          { label: t("users"), value: data.uniqueUsers },
          { label: t("subscriptions"), value: data.activeSubscriptions },
        ] : undefined}
        actions={
          <form action={path} method="get">
            <AtlasButton type="submit" variant="secondary" icon={<RefreshCw aria-hidden="true" />}>{t("refresh")}</AtlasButton>
          </form>
        }
      />
      <AnalyticsDashboard data={data} locale={locale} copy={{
        activity: t("activity"), empty: t("empty"), emptyTitle: t("emptyTitle"),
        error: t("error"), errorTitle: t("errorTitle"), events: t("events"), users: t("users"),
      }} />
    </AtlasFrame>
  );
}
