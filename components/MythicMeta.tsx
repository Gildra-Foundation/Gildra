import { SpecSlot } from "./SpecSlot";
import {
  mythicSpotlight,
  mythicRunnersUp,
  mythicTierRows,
  liveStats,
} from "@/data/site";
import { p, t, type Lang } from "@/lib/i18n";

function Trend({ trend }: { trend: number }) {
  if (trend > 0) return <span className="up">▲ {trend}</span>;
  if (trend < 0) return <span className="down">▼ {-trend}</span>;
  return <span className="flat">—</span>;
}

/** Открытая мета-секция без рамки-карточки: spotlight → соседние спеки →
 *  компактный tier rail → подпись. */
export function MythicMeta({ lang = "en" }: { lang?: Lang }) {
  const s = mythicSpotlight;
  const tt = t(lang);
  return (
    <div className="metaopen">
      <div className="panel-head">
        <span className="t">{tt("Mythic+ Meta")}</span>
        <a className="view" href={p(lang, "/tier-lists")}>
          {tt("View All →")}
        </a>
      </div>
      <div className="panel-sub">{tt("All Keys · Overall · Last 7 Days")}</div>
      <div className="panel-rule" />

      <div className="mspot">
        <SpecSlot name={s.spec.name} cls={s.spec.cls} size="lg" />
        <div className="mspot-info">
          <div className="mspot-name">
            <span className="tpill s">S</span> {s.spec.name}{" "}
            <Trend trend={s.trend} />
          </div>
          <div className="mspot-sub">
            {s.klass} · {s.role} · {s.played} {tt("played")} · {s.avgKey} {tt("avg key")}
          </div>
        </div>
        <div className="mspot-score">
          <b>{s.score}</b>
          <span>{tt("score")}</span>
        </div>
      </div>

      <div className="mrows">
        {mythicRunnersUp.map((r) => (
          <div className="mrow" key={r.spec.name}>
            <SpecSlot name={r.spec.name} cls={r.spec.cls} size="sm" />
            <span className="mname">{r.spec.name}</span>
            <span className="tpill s sm">S</span>
            <span className="mval">{r.score}</span>
            <Trend trend={r.trend} />
          </div>
        ))}
      </div>

      <div className="tier-rows">
        {mythicTierRows.map((row) => (
          <div className="tier-row" key={row.tier}>
            <div className={`tbadge ${row.tier}`}>{row.tier.toUpperCase()}</div>
            <div className="specs">
              {row.specs.map((sp) => (
                <SpecSlot key={sp.name} name={sp.name} cls={sp.cls} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="panel-foot">
        {tt("Based on")} {liveStats.runs}+ {tt("runs")} · {tt("Updated")}{" "}
        {tt(liveStats.updated)}
      </div>
    </div>
  );
}
