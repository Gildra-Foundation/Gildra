import { preload } from "react-dom";
import type { CSSProperties } from "react";
import { type Lang } from "@/lib/i18n";
import { AtlasLegalFooter } from "@/components/atlas/AtlasFrame";
import { GildraCrest } from "@/components/brand/GildraCrest";
import { HomeBookCover, HomeBookStage } from "./HomeBook";
import { HomeTheme } from "./HomeTheme";
import { HomeEpigraph } from "./HomeEpigraph";
import styles from "./grimoireHome.module.css";

const coverSizes = "(max-width: 400px) 70vw, (max-width: 760px) 280px, (min-width: 1600px) 470px, 440px";
const coverAvifSrcSet = "/assets/wow/character-book/intro/icecrown-cover-320.avif 320w, /assets/wow/character-book/intro/icecrown-cover-640.avif 640w, /assets/wow/character-book/intro/icecrown-cover-1024.avif 1024w";
const coverWebpSrcSet = "/assets/wow/character-book/intro/icecrown-cover-320.webp 320w, /assets/wow/character-book/intro/icecrown-cover-640.webp 640w, /assets/wow/character-book/intro/icecrown-cover-1024.webp 1024w";

// Kurale (headings, nav) and PT Serif (body) subsets the first screen renders
// in. Discovered only through CSS they land ~1 s after the first paint on a
// phone and re-wrap the quote and nav (CLS 0.23 / 0.55 on /, /ru).
// Preciosa writes the epigraph: Russian quotes take its Latin face too (« »).
// <link> elements, which React hoists into the HTML <head>: ReactDOM.preload()
// from this async server component only reached the RSC payload at the end of
// the document, so the fonts were still found late.
const firstScreenFonts = {
  en: ["preciosa/preciosa-latin", "grimoire/kurale-latin", "atlas/pt-serif-regular-latin"],
  ru: ["preciosa/preciosa-cyrillic", "preciosa/preciosa-latin", "grimoire/kurale-cyrillic", "grimoire/kurale-latin", "atlas/pt-serif-regular-cyrillic", "atlas/pt-serif-regular-latin"],
} as const;

// The scene paints its own page colour and reserves the cookie notice's space inside
// its painting (app/styles/atlas-pages.css). Same specificity as the former :has() rules.
const homeShellCss = 'html[data-route-theme="wow"][data-route-theme] body{background-color:#0d0e0d;background-image:none}'
  + ".workspace-content.gildra-atlas[id=atlas-content]{padding-bottom:0}";

export async function GrimoireHome({ lang }: { lang: Lang }) {
  preload("/assets/wow/character-book/intro/icecrown-cover-640.avif", {
    as: "image",
    type: "image/avif",
    imageSrcSet: coverAvifSrcSet,
    imageSizes: coverSizes,
    fetchPriority: "high",
  });
  preload("/assets/wow/character-book/intro/icecrown-home-background-v1.webp", { as: "image", type: "image/webp", fetchPriority: "high" });
  const ru = lang === "ru";
  // The same cover art is the closed book and the leaf that swings open.
  const coverFace = <>
    <picture>
      <source type="image/avif" srcSet={coverAvifSrcSet} sizes={coverSizes} />
      <source type="image/webp" srcSet={coverWebpSrcSet} sizes={coverSizes} />
      <img className={styles.coverImage} src="/assets/wow/character-book/intro/icecrown-cover-640.webp" srcSet={coverWebpSrcSet} sizes={coverSizes} width={1024} height={1365} fetchPriority="high" loading="eager" decoding="async" alt="" draggable={false} />
    </picture>
    <span className={styles.coverLight} aria-hidden="true" />
    <span className={styles.coverTitle} aria-hidden="true"><GildraCrest height={64} className={styles.coverBrand} eager /><i /></span>
    <span className={styles.coverSubtitle} aria-hidden="true"><span>{ru ? <>Хроники<br />Азерота</> : <>Chronicles<br />of Azeroth</>}</span></span>
  </>;
  return <HomeTheme>
    {/* Mounted with the landing page only: as `:has([data-grimoire-home])` rules on
        <html>/<body> they made every DOM insertion on every page restyle the root. */}
    <style>{homeShellCss}</style>
    {firstScreenFonts[ru ? "ru" : "en"].map((font) => <link key={font} rel="preload" href={`/assets/wow/fonts/${font}.woff2`} as="font" type="font/woff2" crossOrigin="anonymous" />)}
    <div className={styles.snow} aria-hidden="true">
      {Array.from({ length: 28 }, (_, index) => <span key={index} style={{
        "--snow-x": `${(index * 37 + 7) % 100}%`,
        "--snow-size": `${index % 7 === 0 ? 5 : 2 + index % 3}px`,
        "--snow-duration": `${16 + index % 13}s`,
        "--snow-delay": `${-((index * 7) % 29)}s`,
        "--snow-rest": `${(index * 23 + 11) % 96}svh`,
      } as CSSProperties} />)}
    </div>
    <HomeBookStage lang={lang} className={styles.hero} coverFace={coverFace}>
      <div className={styles.copy}>
        <h1 className={styles.srOnly}>{ru ? "Gildra — хроники Азерота: путеводитель героя World of Warcraft" : "Gildra — Chronicles of Azeroth: a World of Warcraft hero’s companion"}</h1>
        <HomeEpigraph lang={lang} />
      </div>
      <div className={styles.bookScene}>
        <div className={styles.halo} aria-hidden="true" />
        <HomeBookCover className={styles.cover} ariaLabel={ru ? "Открыть книгу — оглавление WowArcana" : "Open the book — WowArcana contents"}>
          {coverFace}
        </HomeBookCover>
      </div>
    </HomeBookStage>
    <AtlasLegalFooter lang={lang} />
  </HomeTheme>;
}
