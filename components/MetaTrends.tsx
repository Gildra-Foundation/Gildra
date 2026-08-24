import { SpecSlot } from "./SpecSlot";
import { trends } from "@/data/site";
import { p, t, type Lang } from "@/lib/i18n";

const DIR = { up: "▲", down: "▼", flat: "—" } as const;

export function MetaTrends({ lang = "en" }: { lang?: Lang }) {
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
        {trends.map((t) => (
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
