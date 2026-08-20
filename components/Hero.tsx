import Image from "next/image";
import Link from "next/link";
import { liveStats, season } from "@/data/site";
import { PatchHighlights } from "./PatchHighlights";

export function Hero() {
  return (
    <section className="hero" id="overview">
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
            <Link className="btn btn-primary" href="/tier-lists">
              Explore Mythic+
            </Link>
            <a className="btn-text" href="/#raid">
              Raid rankings →
            </a>
          </div>
          <div className="hero-live">
            <span className="hl-badge">
              <span className="pulse" /> Live
            </span>
            <span className="hl-item">
              <b>{liveStats.runs}</b> runs
            </span>
            <span className="hl-item">
              <b>{liveStats.specs}</b> specs
            </span>
            <span className="hl-item">
              <b>{liveStats.regions}</b> regions
            </span>
            <span className="hl-upd">updated {liveStats.updated}</span>
          </div>
        </div>
        <div className="hero-side">
          <PatchHighlights />
        </div>
      </div>
    </section>
  );
}
