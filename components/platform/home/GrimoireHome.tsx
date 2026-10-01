import Link from "next/link";
import { preload } from "react-dom";
import { ArrowRight, BookOpen } from "lucide-react";
import { t, type Lang } from "@/lib/i18n";
import { GAMES, gameHref } from "@/lib/games/registry";
import { BookOpener } from "./BookOpener";
import styles from "./grimoireHome.module.css";

const coverSizes = "(max-width: 400px) 70vw, (max-width: 760px) 280px, (max-width: 1200px) 40vw, 460px";
const coverAvifSrcSet = "/assets/wow/character-book/intro/chronicle-cover-v1-320-q45.avif 320w, /assets/wow/character-book/intro/chronicle-cover-v1-640-q45.avif 640w";
const coverWebpSrcSet = "/assets/wow/character-book/intro/chronicle-cover-v1-320-q60.webp 320w, /assets/wow/character-book/intro/chronicle-cover-v1-640-q60.webp 640w";

export function GrimoireHome({ lang }: { lang: Lang }) {
  preload("/assets/wow/character-book/intro/chronicle-cover-v1-640-q45.avif", {
    as: "image",
    type: "image/avif",
    imageSrcSet: coverAvifSrcSet,
    imageSizes: coverSizes,
    fetchPriority: "high",
  });
  const ru = lang === "ru";
  const prefix = ru ? "/ru" : "";
  const tt = t(lang);
  const sections = GAMES.wow.nav.sections ?? [];
  return <div className={styles.page} data-grimoire-home>
    <header className={styles.header}>
      <Link href={prefix || "/"} className={styles.brand} aria-label="Gildra">
        <span className={styles.brandSeal} aria-hidden="true">G</span>
        <span>GILDRA<small>WORLD OF WARCRAFT</small></span>
      </Link>
      <div className={styles.headerRight}>
        <span className={styles.edition}>{ru ? "ХРОНИКИ АЗЕРОТА" : "CHRONICLES OF AZEROTH"}</span>
        <nav className={styles.language} aria-label={ru ? "Язык" : "Language"}>
          <Link href="/ru" aria-current={ru ? "page" : undefined}>RU</Link><span aria-hidden="true">/</span>
          <Link href="/" aria-current={!ru ? "page" : undefined}>EN</Link>
        </nav>
      </div>
    </header>
    <main className={styles.hero}>
      <div className={styles.copy}>
        <p className={styles.eyebrow}><span aria-hidden="true" />{ru ? "ДЛЯ ТЕХ, КТО ВОЗВРАЩАЕТСЯ В АЗЕРОТ" : "FOR THOSE WHO RETURN TO AZEROTH"}</p>
        <h1>{ru ? <>У каждого героя<br />есть своя<br /><em>хроника.</em></> : <>Every hero<br />has a story<br /><em>worth keeping.</em></>}</h1>
        <p className={styles.intro}>{ru
          ? "За этой обложкой — дороги в подземелья, тайны рейдов и история вашего героя. Всё, что стоит знать перед следующим приключением."
          : "Behind this cover lie paths through dungeons, the secrets of raids, and your hero’s story. A companion for the adventure ahead."}</p>
        <BookOpener className={styles.openButton} lang={lang} ariaLabel={ru ? "Открыть книгу" : "Open the book"}>
          <BookOpen size={18} aria-hidden="true" />{ru ? "Открыть книгу" : "Open the book"}<ArrowRight size={18} aria-hidden="true" />
        </BookOpener>
        <p className={styles.invitation}>{ru ? "Новая глава начинается с первой страницы." : "Every new chapter begins with the first page."}</p>
      </div>
      <div className={styles.bookScene}>
        <div className={styles.halo} aria-hidden="true" />
        <BookOpener className={styles.cover} lang={lang} ariaLabel={ru ? "Открыть книгу — оглавление Gildra" : "Open the book — Gildra contents"}>
          <picture>
            <source type="image/avif" srcSet={coverAvifSrcSet} sizes={coverSizes} />
            <source type="image/webp" srcSet={coverWebpSrcSet} sizes={coverSizes} />
            <img className={styles.coverImage} src="/assets/wow/character-book/intro/chronicle-cover-v1-640-q60.webp" srcSet={coverWebpSrcSet} sizes={coverSizes} width={720} height={1080} fetchPriority="high" loading="eager" decoding="async" alt="" draggable={false} />
          </picture>
          <span className={styles.coverTitle} aria-hidden="true"><small>WORLD OF WARCRAFT</small><strong>GILDRA</strong><i /></span>
          <span className={styles.coverSubtitle} aria-hidden="true">{ru ? <>Хроники<br />Азерота</> : <>Chronicles<br />of Azeroth</>}<small>{ru ? "ПУТЕВОДИТЕЛЬ ГЕРОЯ" : "A HERO’S COMPANION"}</small></span>
        </BookOpener>
        <p className={styles.bookHint}><span aria-hidden="true">✧</span>{ru ? "Коснитесь обложки, чтобы открыть" : "Touch the cover to turn the first page"}</p>
      </div>
    </main>
    <footer className={styles.footer}>
      {/* The cover has no sections of its own: these plain links (the former
          "Characters · Dungeons · Raids" line, extended) are the crawlable way in. */}
      <nav className={styles.footerNav} aria-label={tt("Sections")}>
        <ul>
          {sections.map((link) => <li key={link.path}>
            <Link href={gameHref(GAMES.wow, lang, link.path)} prefetch={false}>{tt(link.label)}</Link>
          </li>)}
        </ul>
      </nav>
      <span className={styles.footerMark} aria-hidden="true">✧</span>
      <span>{ru ? "ВАШЕ ПРИКЛЮЧЕНИЕ. ВАША КНИГА." : "YOUR ADVENTURE. YOUR BOOK."}</span>
    </footer>
  </div>;
}
