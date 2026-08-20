import Image from "next/image";
import Link from "next/link";
import { liveStats, season } from "@/data/site";
import { PatchHighlights } from "./PatchHighlights";
import { p, t, type Lang } from "@/lib/i18n";

export function Hero({ lang = "en" }: { lang?: Lang }) {
  const tt = t(lang);
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
              {season.expansion} · {tt(season.season)} · {tt("Patch")} {season.patch}
            </span>
          </div>
          <h1>
            {tt("Master the")} <em>{tt("Meta")}</em>
          </h1>
          <p className="sub">
            {tt(
              "Builds, rankings and live data from high-level Mythic+ and Raid content.",
            )}
          </p>
          <div className="hero-actions">
            <Link className="btn btn-primary" href={p(lang, "/tier-lists")}>
              {tt("Explore Mythic+")}
            </Link>
            <a className="btn-text" href={p(lang, "/#raid")}>
              {tt("Raid rankings →")}
            </a>
          </div>
          <div className="hero-live">
            <span className="hl-badge">
              <span className="pulse" /> {tt("Live")}
            </span>
            <span className="hl-item">
              <b>{liveStats.runs}</b> {tt("runs")}
            </span>
            <span className="hl-item">
              <b>{liveStats.specs}</b> {tt("specs")}
            </span>
            <span className="hl-item">
              <b>{liveStats.regions}</b> {tt("regions")}
            </span>
            <span className="hl-upd">{tt("updated")} {tt(liveStats.updated)}</span>
          </div>
        </div>
        <div className="hero-side">
          <PatchHighlights />
        </div>
      </div>
    </section>
  );
}
