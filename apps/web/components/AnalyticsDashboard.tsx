import type { AnalyticsOverview } from "@/lib/api/client";
import { AnalyticsChartViewport } from "@/components/analytics/AnalyticsChartViewport";
import { AtlasSection } from "@gildra/atlas-ui/AtlasSection";
import { AtlasEmpty, AtlasError } from "@gildra/atlas-ui/AtlasState";
import styles from "@/components/analytics/analyticsDashboard.module.css";

type Copy = {
  activity: string;
  empty: string;
  emptyTitle: string;
  error: string;
  errorTitle: string;
  events: string;
  users: string;
};

export function AnalyticsDashboard({ data, copy, locale }: { data: AnalyticsOverview | null; copy: Copy; locale: string }) {
  return (
    <AtlasSection id="activity" title={copy.activity}>
      {!data ? (
        <AtlasError title={copy.errorTitle}>{copy.error}</AtlasError>
      ) : data.series.length === 0 ? (
        <AtlasEmpty title={copy.emptyTitle}>{copy.empty}</AtlasEmpty>
      ) : (
        <div className={styles.chart}>
          <AnalyticsChartViewport data={data} locale={locale} copy={copy} />
        </div>
      )}
    </AtlasSection>
  );
}
