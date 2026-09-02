import Link from "next/link";
import { AdSlot } from "@/components/blocks/shared/adSlot/AdSlot";
import { SpecSlot } from "@/components/SpecSlot";
import { p as lp, t as tr } from "@/lib/i18n";
import type { BlockComponentProps } from "@/lib/blocks/types";
import type { SpecBodyData, SpecBodyProps } from "./schema";
import { num } from "./data";

const DIR = { up: "▲", down: "▼", flat: "—" } as const;

/** Страница спека: crumb → class-edge hero → 5-cell stat strip → builds/guides → back link. */
export function SpecBody({ data, lang, game }: BlockComponentProps<SpecBodyProps, SpecBodyData>) {
  const tt = tr(lang);
  const { page, season, liveStats, builds: specBuilds, guides: specGuides, total, maxima } = data;
  const { row, tier, rank, role, className } = page;
  const name = row.spec.name;
  const t = row.trend;
  const rel = (v: string, m: number) => `${Math.round((num(v) / m) * 100)}%`;

  return (
    <>
      <nav className="sp-crumb" aria-label="Breadcrumb">
        <Link href={lp(lang, "/tier-lists")}>{tt("Mythic+ Tier List")}</Link>
        <span className="dia" aria-hidden="true">◆</span>
        <span aria-current="page">{name}</span>
      </nav>

      <header
        className="sp-hero"
        style={{ "--cc": `var(--c-${row.spec.cls})` } as React.CSSProperties}
      >
        <svg className="sp-oct" viewBox="0 0 100 100" aria-hidden="true">
          <polygon
            points="30,2 70,2 98,30 98,70 70,98 30,98 2,70 2,30"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
          />
          <polygon
            points="36,12 64,12 88,36 88,64 64,88 36,88 12,64 12,36"
            fill="none"
            stroke="currentColor"
            strokeWidth=".6"
          />
          <polygon
            points="42,24 58,24 76,42 76,58 58,76 42,76 24,58 24,42"
            fill="none"
            stroke="currentColor"
            strokeWidth=".4"
          />
        </svg>
        <SpecSlot name={name} cls={row.spec.cls} size="lg" />
        <div className="sp-id">
          <h1>{name}</h1>
          <p className="sp-sub">
            {className} · {role} · {season.expansion} {tt(season.season)} ·{" "}
            {tt("Patch")} {season.patch}
          </p>
        </div>
        <span className={`tpill ${tier}`}>{tier.toUpperCase()}</span>
        <div className="sp-score">
          <b>{row.score}</b>
          <span>{tt("Score")}</span>
          <span className="sbar">
            <i style={{ width: `${row.bar}%` }} />
          </span>
        </div>
      </header>

      <div className="sp-stats">
        <div className="sp-stat">
          <b>#{rank}</b>
          <span>{tt("Overall rank")}</span>
          <span className="sbar">
            <i
              style={{
                width: `${Math.round(((total - rank + 1) / total) * 100)}%`,
              }}
            />
          </span>
        </div>
        <div className="sp-stat">
          <b>{row.pop}</b>
          <span>{tt("Popularity")}</span>
          <span className="sbar">
            <i style={{ width: rel(row.pop, maxima.pop) }} />
          </span>
        </div>
        <div className="sp-stat">
          <b>{row.key}</b>
          <span>{tt("Avg key timed")}</span>
          <span className="sbar">
            <i style={{ width: rel(row.key, maxima.key) }} />
          </span>
        </div>
        <div className="sp-stat">
          <b>{row.top1}</b>
          <span>{tt("Top 1% key")}</span>
          <span className="sbar">
            <i style={{ width: rel(row.top1, maxima.top1) }} />
          </span>
        </div>
        <div className="sp-stat">
          <b className={t.dir}>
            {DIR[t.dir]}
            {t.val ? ` ${t.val}` : ""}
          </b>
          <span>{tt("7-day trend")}</span>
        </div>
        <span className="sp-emboss" aria-hidden="true">
          {tier.toUpperCase()}
        </span>
      </div>

      <p className="sp-note">
        {tt(season.season)} · {tt("demo data — based on")} {liveStats.runs}+{" "}
        {tt("runs, updated")} {tt(liveStats.updated)}.
      </p>

      <AdSlot variant="billboard" lang={lang} game={game} data={undefined} />

      {specBuilds.length > 0 && (
        <>
          <div className="bhead">
            <span className="t">{tt("BUILDS")}</span>
            <span className="dia">◆</span>
            <span className="rule" />
          </div>
          <div className="builds sp-builds">
            {specBuilds.map((b) => (
              <div key={b.title} className="bcard bcard-static">
                <SpecSlot name={b.spec.name} cls={b.spec.cls} />
                <span className="binfo">
                  <span className="bname">{b.title}</span>
                  <span className="bauthor">{b.meta}</span>
                </span>
                <span className={`bpill ${b.tier}`}>
                  {b.tier.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {specGuides.length > 0 && (
        <>
          <div className="bhead">
            <span className="t">{tt("GUIDES")}</span>
            <span className="dia">◆</span>
            <span className="rule" />
          </div>
          <div className="sp-guides">
            {specGuides.map((g) => (
              <div key={g.title} className="sp-guide">
                <span className="sp-guide-cat">{g.cat}</span>
                <span className="sp-guide-title">{g.title}</span>
                <span className="sp-guide-meta">{g.meta}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="sp-back">
        <Link className="btn-line" href={lp(lang, "/tier-lists")}>
          {tt("← Full Mythic+ tier list")}
        </Link>
      </div>
    </>
  );
}
