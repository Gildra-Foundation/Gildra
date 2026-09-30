import Link from "next/link";
import { Bell, ChartNoAxesColumnIncreasing, FileText, ListFilter, Scale, Users } from "lucide-react";
import type { PlatformHomeData, QuickAction } from "@/lib/platform/home/types";
import type { Lang } from "@/lib/i18n";
import { platformHref } from "@/lib/platform/home/links";
import { Panel, PanelTitle } from "./primitives";
import styles from "./platformHome.module.css";

const icons: Record<QuickAction["icon"], typeof Scale> = {
  compare: Scale,
  chart: ChartNoAxesColumnIncreasing,
  list: ListFilter,
  team: Users,
  notes: FileText,
  alerts: Bell,
};

export function QuickActions({ data, lang }: { data: PlatformHomeData; lang: Lang }) {
  return (
    <Panel className={styles.quickActions}>
      <PanelTitle>{data.labels.quickActions}</PanelTitle>
      <div className={styles.actionGrid}>
        {data.quickActions.map((action) => {
          const Icon = icons[action.icon];
          return <Link href={platformHref(action.href, lang)} prefetch={false} key={action.id} data-reveal-item><Icon aria-hidden="true" /><span>{action.label}</span></Link>;
        })}
      </div>
    </Panel>
  );
}
