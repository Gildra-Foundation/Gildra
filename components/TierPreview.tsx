import Link from "next/link";
import { SpecSlot } from "./SpecSlot";
import { tierTable, builds, liveStats } from "@/data/site";
import type { TableRow } from "@/data/site";

const DIR = { up: "▲", down: "▼", flat: "—" } as const;

function Trend({ t }: { t: TableRow["trend"] }) {
  if (t.dir === "flat") return <span className="flat">—</span>;
  return (
    <span className={t.dir}>
      {DIR[t.dir]} {t.val}
    </span>
  );
}

/** Компактный preview тир-листа для homepage: топ-7 строк открытым
 *  списком + 4 избранных билда. Полный интерфейс живёт на /tier-lists. */
export function TierPreview() {
  const rows = tierTable
    .flatMap((g) => g.rows.map((r) => ({ ...r, tier: g.tier })))
    .slice(0, 7);

  return (
    <>
      <div className="tpv-head">
        <div>
          <h2>Mythic+ Tier List</h2>
          <p className="tpv-sub">
            Top specs by weighted score · All Keys · Last 7 Days · based on{" "}
            {liveStats.runs}+ runs
          </p>
        </div>
        <Link className="btn btn-primary tpv-cta" href="/tier-lists">
          View full tier list
        </Link>
      </div>

      <div className="tpv-rows">
        {rows.map((r, i) => (
          <div className="tpv-row" key={r.spec.name}>
            <span className="tpv-rank">{i + 1}</span>
            <span className={`tpill ${r.tier} sm`}>{r.tier.toUpperCase()}</span>
            <SpecSlot name={r.spec.name} cls={r.spec.cls} size="sm" />
            <Link className="tpv-name" href="/tier-lists">
              {r.spec.name}
            </Link>
            <span className="tpv-score">
              {r.score}
              <span className="sbar">
                <i style={{ width: `${r.bar}%` }} />
              </span>
            </span>
            <span className="tpv-pop">{r.pop}</span>
            <span className="tpv-trend">
              <Trend t={r.trend} />
            </span>
          </div>
        ))}
      </div>

      <div className="bhead">
        <span className="t">FEATURED BUILDS</span>
        <span className="dia">◆</span>
        <span className="rule" />
        <Link className="view" href="/tier-lists#builds">
          All Builds →
        </Link>
      </div>
      <div className="builds tpv-builds">
        {builds.slice(0, 4).map((b) => (
          <Link
            key={b.title}
            className="bcard"
            href="/tier-lists#builds"
          >
            <SpecSlot name={b.spec.name} cls={b.spec.cls} />
            <span className="binfo">
              <span className="bname">{b.title}</span>
              <span className="bauthor">{b.meta}</span>
            </span>
            <span className={`bpill ${b.tier}`}>{b.tier.toUpperCase()}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
