import Link from "next/link";
import { preload } from "react-dom";
import { cookies } from "next/headers";
import type { CSSProperties } from "react";
import type { Lang } from "@/lib/i18n";
import { HomeBookCover, HomeBookStage } from "./HomeBook";
import { HomeTheme } from "./HomeTheme";
import { HomeEpigraph } from "./HomeEpigraph";
import { ThemePicker } from "./ThemePicker";
import { homeThemeCookie, homeThemes, isHomeTheme } from "./homeThemes";
import styles from "./grimoireHome.module.css";

const coverSizes = "(max-width: 400px) 70vw, (max-width: 760px) 280px, (min-width: 1600px) 470px, 440px";
const coverAvifSrcSet = "/assets/wow/character-book/intro/chronicle-cover-v2-320.avif 320w, /assets/wow/character-book/intro/chronicle-cover-v2-640.avif 640w, /assets/wow/character-book/intro/chronicle-cover-v2-1024.avif 1024w";
const coverWebpSrcSet = "/assets/wow/character-book/intro/chronicle-cover-v2-320.webp 320w, /assets/wow/character-book/intro/chronicle-cover-v2-640.webp 640w, /assets/wow/character-book/intro/chronicle-cover-v2-1024.webp 1024w";

// Kurale (headings, nav) and PT Serif (body) subsets the first screen renders
// in. Discovered only through CSS they land ~1 s after the first paint on a
// phone and re-wrap the quote and nav (CLS 0.23 / 0.55 on /, /ru).
const firstScreenFonts = {
  en: ["grimoire/kurale-latin", "atlas/pt-serif-regular-latin"],
  ru: ["grimoire/kurale-cyrillic", "grimoire/kurale-latin", "atlas/pt-serif-regular-cyrillic", "atlas/pt-serif-regular-latin"],
} as const;

export async function GrimoireHome({ lang }: { lang: Lang }) {
  preload("/assets/wow/fonts/preciosa/preciosa-regular.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  for (const font of firstScreenFonts[lang === "ru" ? "ru" : "en"]) {
    preload(`/assets/wow/fonts/${font}.woff2`, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  }
  preload("/assets/wow/character-book/intro/chronicle-cover-v2-640.avif", {
    as: "image",
    type: "image/avif",
    imageSrcSet: coverAvifSrcSet,
    imageSizes: coverSizes,
    fetchPriority: "high",
  });
  const savedTheme = (await cookies()).get(homeThemeCookie)?.value;
  const initialTheme = isHomeTheme(savedTheme) ? savedTheme : "arthas";
  // The scene background is the largest paint on phones; as a CSS background
  // it would otherwise be found late and fetched at low priority.
  const sceneArt = homeThemes.find((theme) => theme.id === initialTheme)?.art;
  if (sceneArt) preload(`/assets/wow/character-book/intro/${sceneArt}`, { as: "image", type: "image/webp", fetchPriority: "high" });
  const ru = lang === "ru";
  // The same cover art is the closed book and the leaf that swings open.
  const coverFace = <>
    <picture>
      <source type="image/avif" srcSet={coverAvifSrcSet} sizes={coverSizes} />
      <source type="image/webp" srcSet={coverWebpSrcSet} sizes={coverSizes} />
      <img className={styles.coverImage} src="/assets/wow/character-book/intro/chronicle-cover-v2-640.webp" srcSet={coverWebpSrcSet} sizes={coverSizes} width={1024} height={1536} fetchPriority="high" loading="eager" decoding="async" alt="" draggable={false} />
    </picture>
    <span className={styles.coverLight} aria-hidden="true" />
    <span className={styles.coverGems} aria-hidden="true"><i /><i /></span>
    <span className={styles.coverTitle} aria-hidden="true"><small>WORLD OF WARCRAFT</small><strong>GILDRA</strong><i /></span>
    <span className={styles.coverSubtitle} aria-hidden="true"><span>{ru ? <>Хроники<br />Азерота</> : <>Chronicles<br />of Azeroth</>}</span><small>{ru ? "ПУТЕВОДИТЕЛЬ ГЕРОЯ" : "A HERO’S COMPANION"}</small></span>
  </>;
  return <HomeTheme initialTheme={initialTheme}>
    <div className={styles.snow} aria-hidden="true">
      {Array.from({ length: 28 }, (_, index) => <span key={index} style={{
        "--snow-x": `${(index * 37 + 7) % 100}%`,
        "--snow-size": `${index % 7 === 0 ? 5 : 2 + index % 3}px`,
        "--snow-duration": `${16 + index % 13}s`,
        "--snow-delay": `${-((index * 7) % 29)}s`,
        "--snow-drift": `${(index % 2 ? 1 : -1) * (18 + index % 5 * 9)}px`,
        "--snow-rest": `${(index * 23 + 11) % 96}svh`,
      } as CSSProperties} />)}
    </div>
    <div className={styles.appearance}><ThemePicker lang={lang} /></div>
    <HomeBookStage lang={lang} className={styles.hero} coverFace={coverFace}>
      <div className={styles.copy}>
        <HomeEpigraph lang={lang} />
      </div>
      <div className={styles.bookScene}>
        <div className={styles.halo} aria-hidden="true" />
        <HomeBookCover className={styles.cover} ariaLabel={ru ? "Открыть книгу — оглавление Gildra" : "Open the book — Gildra contents"}>
          {coverFace}
        </HomeBookCover>
        <p className={styles.bookHint}><span aria-hidden="true">✧</span>{ru ? "Коснитесь обложки, чтобы открыть" : "Touch the cover to turn the first page"}</p>
      </div>
    </HomeBookStage>
    <footer className={styles.footer}>
      <span className={styles.footerMark} aria-hidden="true">✧</span>
      <span>{ru ? "ВАШЕ ПРИКЛЮЧЕНИЕ. ВАША КНИГА." : "YOUR ADVENTURE. YOUR BOOK."}</span>
      <Link href={ru ? "/ru/privacy" : "/privacy"}>{ru ? "Политика конфиденциальности" : "Privacy policy"}</Link>
    </footer>
  </HomeTheme>;
}
