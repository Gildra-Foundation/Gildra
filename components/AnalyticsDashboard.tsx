import type { AnalyticsOverview } from "@/lib/api/client";
import { AnalyticsChartViewport } from "@/components/analytics/AnalyticsChartViewport";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Activity, Radio, ShieldCheck, Users } from "lucide-react";
import styles from "@/components/analytics/analyticsDashboard.module.css";

type Copy = {
  activity: string;
  empty: string;
  events: string;
  hours: string;
  subscriptions: string;
  users: string;
};

export function AnalyticsDashboard({ data, copy, locale }: { data: AnalyticsOverview; copy: Copy; locale: string }) {
  const number = new Intl.NumberFormat(locale);
  const metrics = [
    { label: copy.events, value: data.events, icon: Activity },
    { label: copy.users, value: data.uniqueUsers, icon: Users },
    { label: copy.subscriptions, value: data.activeSubscriptions, icon: ShieldCheck },
  ];

  return (
    <div className={styles.dashboard}>
      <div className={styles.stats}>
        {metrics.map(({ label, value, icon: Icon }) => (
          <Card key={label} className={`${styles.card} ${styles.statCard}`}>
            <CardHeader className={styles.statHeader}>
              <span className={styles.statIcon}><Icon aria-hidden="true" /></span>
              <CardDescription className={styles.label}>{label}</CardDescription>
              <CardTitle className={styles.value}>{number.format(value)}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card className={`${styles.card} ${styles.chartCard}`}>
        <CardHeader className={styles.chartHeader}>
          <CardTitle className={styles.chartTitle}><Radio className="mr-2 inline size-4 text-[#d99a3f]" />{copy.activity}</CardTitle>
          <CardDescription className={styles.chartDescription}>{copy.hours}</CardDescription>
        </CardHeader>
        <CardContent className={styles.chartContent}>
          {data.series.length === 0 ? (
            <p className={styles.empty}>{copy.empty}</p>
          ) : (
            <AnalyticsChartViewport data={data} locale={locale} copy={copy} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
