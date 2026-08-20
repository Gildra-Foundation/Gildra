import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
          </div>
          <div className="sp-stat">
            <b>{row.pop}</b>
            <span>Popularity</span>
          </div>
          <div className="sp-stat">
            <b>{row.key}</b>
            <span>Avg key timed</span>
          </div>
          <div className="sp-stat">
            <b>{row.top1}</b>
            <span>Top 1% key</span>
          </div>
          <div className="sp-stat">
            <b className={t.dir}>
              {DIR[t.dir]}
              {t.val ? ` ${t.val}` : ""}
            </b>
            <span>7-day trend</span>
          </div>
        </div>

        <p className="sp-note">
          {season.season} · demo data — based on {liveStats.runs}+ runs, updated{" "}
          {liveStats.updated}.
        </p>

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
