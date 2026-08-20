import { SpecSlot } from "./SpecSlot";
import { trends } from "@/data/site";

const DIR = { up: "▲", down: "▼", flat: "—" } as const;

export function MetaTrends() {
  return (
    <div className="trendside">
      <div className="panel-head">
        <span className="t">Meta Trends</span>
        <a className="view" href="#">
          View All →
        </a>
      </div>
      <div className="panel-sub">Specs popularity · Last 7 Days</div>
      <div className="panel-rule" />
      <div className="trend-list">
        {trends.map((t) => (
          <div className="trend" key={t.spec.name}>
            <span className="rank">{t.rank}</span>
            <SpecSlot name={t.spec.name} cls={t.spec.cls} size="sm" />
            <a className="name" href="#">
              {t.spec.name}
            </a>
            <span className="pct">{t.pct}</span>
            <span className={`dir ${t.dir}`}>{DIR[t.dir]}</span>
          </div>
        ))}
      </div>
      <button className="btn-line">View Full Meta Trends</button>
    </div>
  );
}
