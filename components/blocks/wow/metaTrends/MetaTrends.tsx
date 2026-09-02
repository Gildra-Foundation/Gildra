import { SpecSlot } from "@/components/SpecSlot";
import { p, t } from "@/lib/i18n";
import type { BlockComponentProps, EmptyProps } from "@/lib/blocks/types";
import type { Trend } from "@/data/site";

export type MetaTrendsProps = EmptyProps;
export type MetaTrendsData = { trends: readonly Trend[] };

const DIR = { up: "▲", down: "▼", flat: "—" } as const;

export function MetaTrends({ data, lang }: BlockComponentProps<MetaTrendsProps, MetaTrendsData>) {
  const tt = t(lang);
  return (
    <div className="trendside">
      <div className="panel-head">
        <span className="t">{tt("Meta Trends")}</span>
        <a className="view" href={p(lang, "/tier-lists")}>
          {tt("View All →")}
        </a>
      </div>
      <div className="panel-sub">{tt("Specs popularity · Last 7 Days")}</div>
      <div className="panel-rule" />
      <div className="trend-list">
        {data.trends.map((t) => (
          <div className="trend" key={t.spec.name}>
            <span className="rank">{t.rank}</span>
            <SpecSlot name={t.spec.name} cls={t.spec.cls} size="sm" />
            <span className="name">{t.spec.name}</span>
            <span className="pct">{t.pct}</span>
            <span className={`dir ${t.dir}`}>{DIR[t.dir]}</span>
          </div>
        ))}
      </div>
      <button className="btn-line">{tt("View Full Meta Trends")}</button>
    </div>
  );
}
