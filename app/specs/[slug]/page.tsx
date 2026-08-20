import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdSlot } from "@/components/AdSlot";
import { Icons } from "@/components/Icons";
import { SpecSlot } from "@/components/SpecSlot";
import { TopNav } from "@/components/TopNav";
import { Footer } from "@/components/Footer";
import { builds, guidesList, season, liveStats } from "@/data/site";
import { findSpecPage, specPages } from "@/lib/specs";

const DIR = { up: "▲", down: "▼", flat: "—" } as const;

export function generateStaticParams() {
  return specPages.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = findSpecPage(slug);
  if (!p) return {};
  const name = p.row.spec.name;
  return {
    title: `${name} — Mythic+ ${p.tier.toUpperCase()}-Tier | Gildra`,
    description: `${name} in ${season.expansion} ${season.season}: score ${p.row.score}, ${p.row.pop} popularity, avg key ${p.row.key}. Builds and guides on Gildra.`,
  };
}

export default async function SpecPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const p = findSpecPage(slug);
  if (!p) notFound();

  const { row, tier, rank, role, className } = p;
  const name = row.spec.name;
  const specBuilds = builds.filter((b) => b.spec.name === name);
  const specGuides = guidesList.filter((g) =>
    `${g.cat} ${g.title}`.includes(name.split(" ")[0]) &&
    `${g.cat} ${g.title}`.includes(className),
  );
  const t = row.trend;

  /* Шкалы метрик — честные относительные значения: доля от лучшего
   *  показателя среди спеков таблицы. */
  const num = (v: string) => parseFloat(v.replace(/[^\d.]/g, ""));
  const max = (pick: (r: typeof row) => string) =>
    Math.max(...specPages.map((s) => num(pick(s.row))));
  const rel = (v: string, m: number) => `${Math.round((num(v) / m) * 100)}%`;
  const maxPop = max((r) => r.pop);
  const maxKey = max((r) => r.key);
  const maxTop1 = max((r) => r.top1);

  return (
    <>
      <Icons />
      <TopNav />
      <div className="app">
        <main className="main">
          <div className="section route-section specpage">
        <nav className="sp-crumb" aria-label="Breadcrumb">
          <Link href="/tier-lists">Mythic+ Tier List</Link>
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
              {className} · {role} · {season.expansion} {season.season} · Patch{" "}
              {season.patch}
            </p>
          </div>
          <span className={`tpill ${tier}`}>{tier.toUpperCase()}</span>
          <div className="sp-score">
            <b>{row.score}</b>
            <span>Score</span>
            <span className="sbar">
              <i style={{ width: `${row.bar}%` }} />
            </span>
          </div>
        </header>

        <div className="sp-stats">
          <div className="sp-stat">
            <b>#{rank}</b>
            <span>Overall rank</span>
            <span className="sbar">
              <i
                style={{
                  width: `${Math.round(((specPages.length - rank + 1) / specPages.length) * 100)}%`,
                }}
              />
            </span>
          </div>
          <div className="sp-stat">
            <b>{row.pop}</b>
            <span>Popularity</span>
            <span className="sbar">
              <i style={{ width: rel(row.pop, maxPop) }} />
            </span>
          </div>
          <div className="sp-stat">
            <b>{row.key}</b>
            <span>Avg key timed</span>
            <span className="sbar">
              <i style={{ width: rel(row.key, maxKey) }} />
            </span>
          </div>
          <div className="sp-stat">
            <b>{row.top1}</b>
            <span>Top 1% key</span>
            <span className="sbar">
              <i style={{ width: rel(row.top1, maxTop1) }} />
            </span>
          </div>
          <div className="sp-stat">
            <b className={t.dir}>
              {DIR[t.dir]}
              {t.val ? ` ${t.val}` : ""}
            </b>
            <span>7-day trend</span>
          </div>
          <span className="sp-emboss" aria-hidden="true">
            {tier.toUpperCase()}
          </span>
        </div>

        <p className="sp-note">
          {season.season} · demo data — based on {liveStats.runs}+ runs, updated{" "}
          {liveStats.updated}.
        </p>

        <AdSlot />

        {specBuilds.length > 0 && (
          <>
            <div className="bhead">
              <span className="t">BUILDS</span>
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
              <span className="t">GUIDES</span>
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
          <Link className="btn-line" href="/tier-lists">
            ← Full Mythic+ tier list
          </Link>
        </div>
          </div>
        </main>
        <Footer />
      </div>
    </>
  );
}
