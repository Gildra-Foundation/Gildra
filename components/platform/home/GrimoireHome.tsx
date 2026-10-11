import Link from "next/link";
import { preload } from "react-dom";
import { cookies } from "next/headers";
import type { CSSProperties } from "react";
import type { Lang } from "@/lib/i18n";
import { HomeBookCover, HomeBookStage } from "./HomeBook";
import { HomeNavigation } from "./HomeNavigation";
import { GildraMark } from "./GildraMark";
import { HomeTheme } from "./HomeTheme";
import { HomeEpigraph } from "./HomeEpigraph";
import { HomeMusic } from "./HomeMusic";
import { HomeScene } from "./HomeScene";
import { HomeEntry } from "./HomeEntry";
import { ThemePicker } from "./ThemePicker";
import { homeThemeCookie, isHomeTheme } from "./homeThemes";
import styles from "./grimoireHome.module.css";

const coverSizes = "(max-width: 400px) 70vw, (max-width: 760px) 280px, (min-width: 1600px) 470px, 440px";
const coverAvifSrcSet = "/assets/wow/character-book/intro/chronicle-cover-v2-320.avif 320w, /assets/wow/character-book/intro/chronicle-cover-v2-640.avif 640w, /assets/wow/character-book/intro/chronicle-cover-v2-1024.avif 1024w";
const coverWebpSrcSet = "/assets/wow/character-book/intro/chronicle-cover-v2-320.webp 320w, /assets/wow/character-book/intro/chronicle-cover-v2-640.webp 640w, /assets/wow/character-book/intro/chronicle-cover-v2-1024.webp 1024w";

export async function GrimoireHome({ lang }: { lang: Lang }) {
  preload("/assets/wow/fonts/preciosa/preciosa-regular.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  preload("/assets/wow/character-book/intro/chronicle-cover-v2-640.avif", {
    as: "image",
    type: "image/avif",
    imageSrcSet: coverAvifSrcSet,
    imageSizes: coverSizes,
    fetchPriority: "high",
  });
  const savedTheme = (await cookies()).get(homeThemeCookie)?.value;
  const initialTheme = isHomeTheme(savedTheme) ? savedTheme : "arthas";
  const ru = lang === "ru";
  const prefix = ru ? "/ru" : "";
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
  return <HomeTheme initialTheme={initialTheme}><HomeScene lang={lang}>
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
    <header className={styles.header}>
      <Link href={prefix || "/"} className={styles.brand} aria-label="Gildra">
        <GildraMark />
        <span className={styles.brandWordmark}><span>GILDRA</span><small>WORLD OF WARCRAFT</small></span>
      </Link>
      <HomeNavigation lang={lang} />
      <div className={styles.headerRight}>
        <ThemePicker lang={lang} />
        <nav className={styles.language} aria-label={ru ? "Язык" : "Language"}>
          <Link href="/ru" aria-current={ru ? "page" : undefined}>RU</Link><span aria-hidden="true">/</span>
          <Link href="/" aria-current={!ru ? "page" : undefined}>EN</Link>
        </nav>
      </div>
    </header>
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
        <HomeMusic lang={lang} />
      </div>
    </HomeBookStage>
    <footer className={styles.footer}>
      <span className={styles.footerMark} aria-hidden="true">✧</span>
      <span>{ru ? "ВАШЕ ПРИКЛЮЧЕНИЕ. ВАША КНИГА." : "YOUR ADVENTURE. YOUR BOOK."}</span>
      <HomeEntry lang={lang} />
    </footer>
  </HomeScene></HomeTheme>;
}
