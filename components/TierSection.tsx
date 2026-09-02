"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { SpecSlot } from "./SpecSlot";
import { classIcon } from "@/lib/gameAssets";
import { specHref } from "@/lib/specs";
import { AdSlot } from "./AdSlot";
import { tierTable, classChips, builds, liveStats } from "@/data/site";
import { usePathname } from "next/navigation";
import { langOf, p, t as tr } from "@/lib/i18n";
import type { TableRow } from "@/data/site";
import { ANCHORS, anchorHref } from "@/lib/anchors";

const DIR = { up: "▲", down: "▼", flat: "—" } as const;

function TrendCell({ t }: { t: TableRow["trend"] }) {
  if (t.dir === "flat") return <span className="flat">—</span>;
  return (
    <span className={t.dir}>
      {DIR[t.dir]} {t.val}
    </span>
  );
}

const FILTER_DEFAULTS = {
  season: "Season 1",
  patch: "12.0.5",
  range: "All Keys",
  region: "All Regions",
  size: "All",
} as const;

type Filters = { [K in keyof typeof FILTER_DEFAULTS]: string };

const FILTER_OPTIONS: Record<keyof Filters, string[]> = {
  season: ["Season 1", "Season 2"],
  patch: ["12.0.5", "12.0"],
  range: ["All Keys", "+2 – +11", "+12 – +16", "+17+"],
  region: ["All Regions", "EU", "US", "Asia"],
  size: ["All", "Solo", "2–5"],
};

const FILTER_LABELS: Record<keyof Filters, string> = {
  season: "Season",
  patch: "Patch",
  range: "Level Range",
  region: "Region",
  size: "Group Size",
};

function Radar() {
  return (
    <svg
      width="330"
      height="248"
      viewBox="0 0 330 248"
      role="img"
      aria-label="Radar: Performance 9.6, Survivability 9.1, Utility 7.3, Representation 9.4, Consistency 9.4"
    >
      <defs>
        <linearGradient id="rfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6f9ceb" stopOpacity=".42" />
          <stop offset="1" stopColor="#3a5fae" stopOpacity=".16" />
        </linearGradient>
      </defs>
      <g stroke="#252c3d" fill="none">
        <polygon points="165,36 254.4,101 220.3,206 109.7,206 75.6,101" />
        <polygon
          points="165,59.5 231.4,107.8 206,185.8 124,185.8 98.6,107.8"
          strokeDasharray="3 3"
          opacity=".8"
        />
        <polygon
          points="165,83 208.5,114.6 191.9,165.7 138.1,165.7 121.5,114.6"
          strokeDasharray="3 3"
          opacity=".6"
        />
        <polygon
          points="165,106.5 185.5,121.4 177.7,145.5 152.3,145.5 144.5,121.4"
          opacity=".45"
        />
        <line x1="165" y1="130" x2="165" y2="36" />
        <line x1="165" y1="130" x2="254.4" y2="101" />
        <line x1="165" y1="130" x2="220.3" y2="206" />
        <line x1="165" y1="130" x2="109.7" y2="206" />
        <line x1="165" y1="130" x2="75.6" y2="101" />
      </g>
      <polygon
        points="165,39.8 247.3,103.9 205.4,191.5 115.5,201.5 80.9,102.7"
        fill="url(#rfill)"
        stroke="#7ba6ee"
        strokeWidth="1.6"
      />
      <g fill="#a8c6f5">
        <circle cx="165" cy="39.8" r="2.8" />
        <circle cx="247.3" cy="103.9" r="2.8" />
        <circle cx="205.4" cy="191.5" r="2.8" />
        <circle cx="115.5" cy="201.5" r="2.8" />
        <circle cx="80.9" cy="102.7" r="2.8" />
      </g>
      <g fontFamily="var(--ui)" fontSize="9.5" letterSpacing=".07em" fill="#7a86a0">
        <text x="165" y="20" textAnchor="middle">PERFORMANCE</text>
        <text x="165" y="31" textAnchor="middle" fill="#e9ecf3" fontWeight="700" fontSize="11">9.6</text>
        <text x="252" y="92" textAnchor="start">SURVIVABILITY</text>
        <text x="252" y="103" textAnchor="start" fill="#e9ecf3" fontWeight="700" fontSize="11">9.1</text>
        <text x="224" y="223" textAnchor="middle">UTILITY</text>
        <text x="224" y="234" textAnchor="middle" fill="#e9ecf3" fontWeight="700" fontSize="11">7.3</text>
        <text x="105" y="223" textAnchor="middle">REPRESENTATION</text>
        <text x="105" y="234" textAnchor="middle" fill="#e9ecf3" fontWeight="700" fontSize="11">9.4</text>
        <text x="71" y="92" textAnchor="end">CONSISTENCY</text>
        <text x="71" y="103" textAnchor="end" fill="#e9ecf3" fontWeight="700" fontSize="11">9.4</text>
      </g>
    </svg>
  );
}

export function TierSection() {
  const lang = langOf(usePathname());
  const tt = tr(lang);
  const [cls, setCls] = useState("all");
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Filters>({ ...FILTER_DEFAULTS });
  const [mobFilters, setMobFilters] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const query = q.trim().toLowerCase();
  const matches = (name: string, rowCls: string) =>
    (cls === "all" || rowCls === cls) &&
    (!query || name.toLowerCase().includes(query));

  const activeFilters = (
    Object.keys(FILTER_DEFAULTS) as (keyof Filters)[]
  ).filter((k) => filters[k] !== FILTER_DEFAULTS[k]);

  const setFilter = (k: keyof Filters, v: string) =>
    setFilters((f) => ({ ...f, [k]: v }));

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard недоступен — молча пропускаем */
    }
  };

  const filtersPanel = (
    <div className="filters-panel">
      {(Object.keys(FILTER_OPTIONS) as (keyof Filters)[]).map((k) =>
        k === "size" ? (
          <div className="fgroup" key={k}>
            <label>{tt(FILTER_LABELS[k])}</label>
            <div className="seg">
              {FILTER_OPTIONS.size.map((v) => (
                <button
                  key={v}
                  className={filters.size === v ? "on" : undefined}
                  onClick={() => setFilter("size", v)}
                >
                  {tt(v)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="fgroup" key={k}>
            <label htmlFor={`f-${k}`}>{tt(FILTER_LABELS[k])}</label>
            <select
              id={`f-${k}`}
              value={filters[k]}
              onChange={(e) => setFilter(k, e.target.value)}
            >
              {FILTER_OPTIONS[k].map((o) => (
                <option key={o} value={o}>
                  {tt(o)}
                </option>
              ))}
            </select>
          </div>
        ),
      )}
      <div className="soon-note">
        {tt("Demo dataset — filters are not wired to data yet.")}
      </div>
    </div>
  );

  return (
    <div className="tierpage" id="tierlist">
      <aside className="tp-side">
        <div className="tp-brand">
          <Image
            className="logo-mark"
            src="/brand/helmet.png"
            alt=""
            width={24}
            height={24}
          />
          <span className="t">{tt("TIER LISTS")}</span>
        </div>
        <div className="tp-nav">
          <a className="active" href={p(lang, "/tier-lists")} aria-current="page">
            <svg className="i" aria-hidden="true">
              <use href="#ic-sword" />
            </svg>{" "}
            Mythic+
          </a>
          <span className="tp-nav-soon">
            <svg className="i" aria-hidden="true">
              <use href="#ic-shield" />
            </svg>{" "}
            {tt("Raid")} <span className="soon">{tt("soon")}</span>
          </span>
        </div>
        <div>
          <div className="cap" style={{ marginBottom: 12 }}>
            {tt("Filters")}
          </div>
          {filtersPanel}
        </div>
        <div className="about">
          <b>
            <svg className="i" style={{ width: 13, height: 13 }} aria-hidden="true">
              <use href="#ic-info" />
            </svg>{" "}
            {tt("About Tier Lists")}
          </b>
          {tt("Learn how we calculate our tier lists.")}
        </div>
        <AdSlot variant="rect" lang={lang} />
        <div className="side-live">
          <span className="pulse" /> {tt("Data refreshed")} {tt(liveStats.updated)}
        </div>
      </aside>

      <div className="tp-center">
        <div className="crumbs">
          <Link href={p(lang, "/")}>{tt("Home")}</Link>
          <span className="sep">›</span>
          <span style={{ color: "var(--ink-2)" }}>
            {tt("Tier Lists · Mythic+ · Overall")}
          </span>
        </div>
        <div className="tp-title">
          <h1>{tt("MYTHIC+ TIER LIST")}</h1>
          <span className="dia">◆</span>
          <span className="rule" />
        </div>
        <div className="tp-sub">
          {tt(
            "Ranked by weighted score across timed runs, popularity and consistency.",
          )}
        </div>
        <div className="tp-toolbar">
          <div className="tabs">
            <button className="on" aria-current="true">
              {tt("Overall")}
            </button>
            <button aria-disabled="true" title={tt("Available with live data")}>
              DPS
            </button>
            <button aria-disabled="true" title={tt("Available with live data")}>
              {tt("Healers")}
            </button>
            <button aria-disabled="true" title={tt("Available with live data")}>
              {tt("Tanks")}
            </button>
          </div>
          <span className="tool tool-static" title="Demo dataset period">
            {tt("Last 7 Days")}
          </span>
          <button className="tool" onClick={share}>
            <svg className="i" style={{ width: 12, height: 12 }} aria-hidden="true">
              <use href="#ic-share" />
            </svg>{" "}
            {copied ? tt("Copied ✓") : tt("Share")}
          </button>
        </div>

        <div className="mfil">
          <button
            className="tool"
            aria-expanded={mobFilters}
            aria-controls="mobile-filters"
            onClick={() => setMobFilters((v) => !v)}
          >
            {tt("Filters")}
            {activeFilters.length > 0 && ` · ${activeFilters.length}`}
            <svg className="i" style={{ width: 11, height: 11 }} aria-hidden="true">
              <use href="#ic-chev" />
            </svg>
          </button>
          {activeFilters.map((k) => (
            <button
              key={k}
              className="fchip"
              onClick={() => setFilter(k, FILTER_DEFAULTS[k])}
              aria-label={`Reset ${FILTER_LABELS[k]}`}
            >
              {tt(filters[k])} ✕
            </button>
          ))}
        </div>
        {mobFilters && (
          <div className="mfil-panel" id="mobile-filters">
            {filtersPanel}
          </div>
        )}

        <div className="filterbar">
          <label className="fsearch">
            <svg className="i" style={{ width: 13, height: 13 }} aria-hidden="true">
              <use href="#ic-search" />
            </svg>
            <input
              type="text"
              placeholder={tt("Search spec...")}
              aria-label="Search spec"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <div className="chips">
            {classChips.map((c) => {
              const icon = c.key === "all" ? null : classIcon(c.key);
              return (
                <button
                  key={c.key}
                  className={`chip${cls === c.key ? " on" : ""}`}
                  onClick={() => setCls(c.key)}
                >
                  {icon && (
                    <span className={`coct ${c.key}`}>
                      <Image src={icon} alt="" width={56} height={56} />
                    </span>
                  )}
                  {tt(c.label)}
                </button>
              );
            })}
          </div>
        </div>

        <table className="tt">
          <thead>
            <tr>
              <th>{tt("Tier")}</th>
              <th>{tt("Spec")}</th>
              <th className="num">{tt("Score")}</th>
              <th className="num">{tt("Pop.")}</th>
              <th className="num col-key">{tt("Avg Key")}</th>
              <th className="num col-top">{tt("Top 1%")}</th>
              <th className="num">{tt("Trend")}</th>
            </tr>
          </thead>
          <tbody>
            {tierTable.map((group) =>
              group.rows.map((row, i) => (
                <tr
                  key={row.spec.name}
                  className={[
                    row.hl ? "hl" : "",
                    matches(row.spec.name, row.spec.cls) ? "" : "dim",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {i === 0 && (
                    <td className="tcell" rowSpan={group.rows.length}>
                      <div className={`in tc-${group.tier}`}>
                        <span className="big">{group.tier.toUpperCase()}</span>
                        <span className="lbl">{tt("Tier").toUpperCase()}</span>
                      </div>
                    </td>
                  )}
                  <td>
                    <div className="scell">
                      <SpecSlot name={row.spec.name} cls={row.spec.cls} size="sm" />
                      <Link className="scell-name" href={p(lang, specHref(row.spec.name))}>
                        {row.spec.name}
                      </Link>
                    </div>
                  </td>
                  <td className="num score">
                    {row.score}
                    <span className="sbar">
                      <i style={{ width: `${row.bar}%` }} />
                    </span>
                  </td>
                  <td className="num">{row.pop}</td>
                  <td className="num col-key">{row.key}</td>
                  <td className="num col-top">
                    {row.top1}
                    {row.star && <span className="star">◆</span>}
                  </td>
                  <td className="num">
                    <TrendCell t={row.trend} />
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
        <div className="tfoot">
          {tt("Based on")} {liveStats.runs}+ {tt("Mythic+ runs · Updated 2 hours ago")}
        </div>
        <div className="faq-note">
          <b>{tt("How are scores calculated?")}</b>{" "}
          {tt(
            "Timed-run performance (50%), consistency (30%) and popularity (20%), weighted over the selected period.",
          )}
        </div>

        <button
          className="dtoggle tool"
          aria-expanded={detailOpen}
          aria-controls="spec-detail"
          onClick={() => setDetailOpen((v) => !v)}
        >
          {detailOpen ? tt("Hide") : tt("View")} {tt("Frost Death Knight details")}
          <svg className="i" style={{ width: 11, height: 11 }} aria-hidden="true">
            <use href="#ic-chev" />
          </svg>
        </button>

        <AdSlot lang={lang} />

        <div className="bhead" id="builds">
          <span className="t">{tt("FEATURED BUILDS")}</span>
          <span className="dia">◆</span>
          <span className="rule" />
        </div>
        <div className="builds">
          {builds.map((b) => (
            <div
              key={b.title}
              className={`bcard bcard-static${matches(b.spec.name, b.spec.cls) ? "" : " dim"}`}
            >
              <SpecSlot name={b.spec.name} cls={b.spec.cls} />
              <div className="binfo">
                <div className="bname">{b.title}</div>
                <div className="bauthor">{b.meta}</div>
              </div>
              <span className={`bpill ${b.tier}`}>{b.tier.toUpperCase()}</span>
            </div>
          ))}
        </div>
      </div>

      <aside
        className={`tp-detail${detailOpen ? " open" : ""}`}
        id="spec-detail"
      >
        <div className="dhero">
          <div className="dhead">
            <div className="dicon">
              <b>
                <Image
                  src="/assets/specs/frost-dk.jpg"
                  alt="Frost Death Knight"
                  width={56}
                  height={56}
                />
              </b>
            </div>
            <div className="name">
              <h2>Frost Death Knight</h2>
              <div className="tier-line">{tt("S TIER · 94.2 SCORE")}</div>
            </div>
            <button className="fav" aria-label="Favorite">
              <svg className="i" style={{ width: 16, height: 16 }} aria-hidden="true">
                <use href="#ic-star" />
              </svg>
            </button>
          </div>
          <div className="dtabs">
            <button className="on" aria-current="true">
              {tt("Overview")}
            </button>
            <button aria-disabled="true" title={tt("Coming soon")}>
              {tt("Stats")}
            </button>
            <button aria-disabled="true" title={tt("Coming soon")}>
              {tt("Talents")}
            </button>
            <button aria-disabled="true" title={tt("Coming soon")}>
              {tt("Trends")}
            </button>
          </div>
        </div>
        <div className="dbody">
          <div className="radar-wrap">
            <Radar />
          </div>
          <div className="dgrid">
            <div className="dcard">
              <h4>{tt("Score Breakdown")}</h4>
              <div className="dline"><span>{tt("Performance")}</span><b>9.6 <span className="max">/ 10</span></b></div>
              <div className="dline"><span>{tt("Survivability")}</span><b>9.1 <span className="max">/ 10</span></b></div>
              <div className="dline"><span>{tt("Utility")}</span><b>7.3 <span className="max">/ 10</span></b></div>
              <div className="dline"><span>{tt("Representation")}</span><b>9.4 <span className="max">/ 10</span></b></div>
              <div className="dline"><span>{tt("Consistency")}</span><b>9.4 <span className="max">/ 10</span></b></div>
            </div>
            <div className="dcard">
              <h4>{tt("Quick Stats")}</h4>
              <div className="dline"><span>{tt("Popularity")}</span><b>16.4%</b></div>
              <div className="dline"><span>{tt("Avg Key")}</span><b>+14.7</b></div>
              <div className="dline"><span>{tt("Top 1%")}</span><b>+18</b></div>
              <div className="dline"><span>{tt("Weekly Change")}</span><b className="pos">▲ 2</b></div>
              <div className="dline"><span>{tt("Data Sample")}</span><b>42,841</b></div>
            </div>
          </div>
          <div className="dactions">
            <Link className="btn btn-primary" href={p(lang, anchorHref(ANCHORS.guides))}>
              {tt("View Guides")}
            </Link>
            <a className="btn btn-dim" href={`#${ANCHORS.builds}`}>
              {tt("View Builds")}
            </a>
          </div>
        </div>
      </aside>
    </div>
  );
}
