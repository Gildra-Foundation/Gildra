import Link from "next/link";
import { SpecSlot } from "@/components/SpecSlot";
import type { Build, LiveStats, TableRow, TierGroup } from "@/data/site";
import { specHref } from "@/lib/specs";
import { p, t } from "@/lib/i18n";
import { ANCHORS, anchorHref } from "@/lib/anchors";
import type { BlockComponentProps } from "@/lib/blocks/types";

export type TierPreviewProps = {
  /** Rows shown in the open list (design.md: 7 on desktop). */
  rows?: number;
  /** Featured builds shown under the list. */
  builds?: number;
};

export type PreviewRow = TableRow & { tier: TierGroup["tier"] };

export type TierPreviewData = {
  rows: readonly PreviewRow[];
  builds: readonly Build[];
  liveStats: LiveStats;
};

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
export function TierPreview({ data, lang }: BlockComponentProps<TierPreviewProps, TierPreviewData>) {
  const tt = t(lang);
  const { rows, builds, liveStats } = data;

  return (
    <section id={ANCHORS.tierPreview} className="tpv">
      <div className="tpv-head">
        <div>
          <h2>{tt("Mythic+ Tier List")}</h2>
          <p className="tpv-sub">
            {tt(
              "Top specs by weighted score · All Keys · Last 7 Days · based on",
            )}{" "}
            {liveStats.runs}+ {tt("runs")}
          </p>
        </div>
        <Link className="btn btn-primary tpv-cta" href={p(lang, "/tier-lists")}>
          {tt("View full tier list")}
        </Link>
      </div>

      <div className="tpv-rows">
        {rows.map((r, i) => (
          <div className="tpv-row" key={r.spec.name}>
            <span className="tpv-rank">{i + 1}</span>
            <span className={`tpill ${r.tier} sm`}>{r.tier.toUpperCase()}</span>
            <SpecSlot name={r.spec.name} cls={r.spec.cls} size="sm" />
            <Link className="tpv-name" href={p(lang, specHref(r.spec.name))}>
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
        <span className="t">{tt("FEATURED BUILDS")}</span>
        <span className="dia">◆</span>
        <span className="rule" />
        <Link className="view" href={p(lang, anchorHref(ANCHORS.builds, "/tier-lists"))}>
          {tt("All Builds →")}
        </Link>
      </div>
      <div className="builds tpv-builds">
        {builds.map((b) => (
          <Link
            key={b.title}
            className="bcard"
            href={p(lang, anchorHref(ANCHORS.builds, "/tier-lists"))}
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
    </section>
  );
}
