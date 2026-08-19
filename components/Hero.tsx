import Image from "next/image";
import { liveStats, season, patchHighlights } from "@/data/site";

export function Hero() {
  return (
    <section className="hero">
      <div className="hero-art" aria-hidden="true">
        <Image
          src="/bg.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          style={{ objectFit: "cover", objectPosition: "63% 22%" }}
        />
      </div>
      <div className="ticker">
        <span className="pulse" /> Live
        <span className="tsep">◆</span> <b>{liveStats.runs}</b> runs analyzed
        <span className="tsep">◆</span> <b>{liveStats.specs}</b> specs tracked
        <span className="tsep">◆</span> <b>{liveStats.regions}</b> regions
        <span className="tsep">◆</span> data updated {liveStats.updated}
      </div>
      <div className="hero-inner">
        <div>
          <div className="hero-eyebrow">
            <span className="rule" />
            <span className="cap gold">
              {season.expansion} · {season.season} · Patch {season.patch}
            </span>
          </div>
          <h1>
            Master the <em>Meta</em>
          </h1>
          <p className="sub">
            Builds, rankings and live data from high-level Mythic+ and Raid
            content.
          </p>
          <div className="hero-actions">
            <button className="btn btn-primary">Explore Mythic+</button>
            <button className="btn btn-ghost">Raid Rankings</button>
          </div>
        </div>
        <div className="hero-side">
          <div className="patch">
            <h3>PATCH {season.patch} HIGHLIGHTS</h3>
            <ul>
              {patchHighlights.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
            <a className="more" href="#">
              View full patch notes →
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
