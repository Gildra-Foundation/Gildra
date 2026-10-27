"use client";
import Link from "next/link";
import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Lang } from "@/lib/i18n";
import { PhysicalBookFrame, physicalBookMaterials } from "@/components/wow/audit/PhysicalBookFrame";
import { bookArtworkSrc } from "./bookArtwork";
import styles from "./bookNavigation.module.css";

type NavigationItem = { href: string; ru: string; en: string; detailRu: string; detailEn: string };

// Same destinations, labels and grouping as the former WorkspaceNavigator.
const primaryItems: NavigationItem[] = [
  { href: "/", ru: "Игровой портал", en: "Game portal", detailRu: "Начало ваших приключений", detailEn: "Where your adventures begin" },
  { href: "/wow/characters", ru: "Персонажи", en: "Characters", detailRu: "Герои, экипировка и прогресс", detailEn: "Heroes, equipment and progress" },
  { href: "/tier-lists", ru: "Тир-листы", en: "Tier lists", detailRu: "Рейтинги специализаций для Mythic+ и рейдов", detailEn: "Specialization rankings for Mythic+ and raids" },
  { href: "/wow/mythic-plus", ru: "Mythic+", en: "Mythic+", detailRu: "Подземелья и ключи", detailEn: "Dungeons and keystones" },
  { href: "/wow/raids", ru: "Рейдовый журнал", en: "Raid journal", detailRu: "Рейды и их обитатели", detailEn: "Raids and their inhabitants" },
  { href: "/wow/lairs", ru: "Логова и мировые боссы", en: "Lairs & world bosses", detailRu: "Испытания открытого мира", detailEn: "Challenges of the open world" },
];
const utilityItems: NavigationItem[] = [
  { href: "/search", ru: "Поиск по Азероту", en: "Search Azeroth", detailRu: "Найдите нужную страницу в хрониках Азерота", detailEn: "Find your next page in the chronicles of Azeroth" },
];
// WoW-only MVP: the former "Other worlds archive" (/genshin) entry is gone —
// that route answers 404 (lib/mvp.ts).
const archiveItems: NavigationItem[] = [
  { href: "/wow", ru: "Обзор World of Warcraft", en: "World of Warcraft overview", detailRu: "Все разделы о мире Warcraft в одном месте", detailEn: "Explore every chapter of the Warcraft world" },
];

const routePrefetchEnabled = process.env.NODE_ENV !== "development";

type Account = { state: "idle" | "loading" | "ready"; connected: boolean; name?: string };

/** The open contents spread, shared by the full-page dialog and the home page book. */
export function BookVolume({ lang, active, titleId, onNavigate, closeButton, layout, artworkSrc = bookArtworkSrc }: {
  lang: Lang;
  /** "spread" keeps both pages side by side even on a phone (the home page book). */
  layout?: "spread";
  artworkSrc?: string;
  /** Account status is requested only while the spread is actually visible. */
  active: boolean;
  titleId?: string;
  onNavigate?: () => void;
  closeButton?: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const idPrefix = useId();
  const [account, setAccount] = useState<Account>({ state: "idle", connected: false });
  const ru = lang === "ru";
  const prefix = ru ? "/ru" : "";
  const battleNetConnected = account.connected;
  // A connected account always goes to its real character roster; there is no
  // other profile page (the sample /profile/arcanist is hidden, lib/mvp.ts).
  const accountHref = prefix + (battleNetConnected ? "/wow/characters" : "/login");
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setAccount({ state: "loading", connected: false });
    const request = window.setTimeout(() => {
      fetch("/api/auth/status", { cache: "no-store", credentials: "same-origin", signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("Account status unavailable");
          const value: unknown = await response.json();
          if (!value || typeof value !== "object") throw new Error("Invalid account status");
          const status = value as { connected?: unknown; accountName?: unknown };
          const connected = status.connected === true;
          setAccount({
            state: "ready",
            connected,
            name: connected && typeof status.accountName === "string" ? status.accountName : undefined,
          });
        })
        .catch(() => {
          if (!controller.signal.aborted) setAccount({ state: "ready", connected: false });
        });
    }, 0);
    return () => { window.clearTimeout(request); controller.abort(); };
  }, [active]);
  const links = (items: NavigationItem[], numbered = false) => items.map((item, index) => {
    const href = item.href === "/" ? prefix || "/" : prefix + item.href;
    const active = item.href === "/" || item.href === "/wow" ? pathname === href : pathname === href || pathname.startsWith(href + "/");
    const detailId = `${idPrefix}-${numbered ? "chapter" : "guide"}-${index}`;
    const warmDestination = () => {
      if (!routePrefetchEnabled) return;
      router.prefetch(href);
    };
    return <Link key={item.href} className={styles.entry} href={href} prefetch={false}
      aria-label={ru ? item.ru : item.en} aria-describedby={detailId}
      aria-current={active ? "page" : undefined} onPointerEnter={warmDestination} onFocus={warmDestination} onClick={onNavigate}>
      {numbered && <span className={styles.chapter} aria-hidden="true">{["I", "II", "III", "IV", "V", "VI"][index]}</span>}
      <span className={styles.entryCopy}><span className={styles.entryLabel}>{ru ? item.ru : item.en}</span>
        <span className={styles.entryDetail} id={detailId}>{ru ? item.detailRu : item.detailEn}</span></span>
    </Link>;
  });
  return <div className={styles.volume} style={physicalBookMaterials as CSSProperties} data-layout={layout}>
    <img className={styles.bookArtwork} src={artworkSrc} data-book-artwork
      width={1536} height={1024} alt="" aria-hidden="true" draggable={false} decoding="async" />
    <div className={styles.mobileBookFrame} data-book-frame><PhysicalBookFrame /></div>
    {closeButton}
    <div className={styles.spread}>
      <section className={styles.leaf} data-book-page="left">
        <p className={styles.runningTitle}>Gildra · World of Warcraft</p>
        <h2 id={titleId}>{ru ? "Оглавление" : "Contents"}</h2>
        <span className={styles.ornament} aria-hidden="true" />
        <nav className={styles.chapters} aria-label={ru ? "Разделы книги" : "Book chapters"}>{links(primaryItems, true)}</nav>
        <span className={styles.pageNumber} aria-hidden="true">I</span>
      </section>
      <section className={styles.leaf} data-book-page="right">
        <p className={styles.runningTitle}>{ru ? "На полях хроник" : "In the margins"}</p>
        <h2>{ru ? "Путеводитель" : "Companion"}</h2>
        <span className={styles.ornament} aria-hidden="true" />
        <nav className={styles.guide} aria-label={ru ? "Путеводитель" : "Companion"}>{links([...utilityItems, ...archiveItems])}</nav>
        <div className={styles.accountPlate}>
        <p className={styles.accountKicker}>{ru ? "Личная летопись" : "Your own chronicle"}</p>
        <h3 className={styles.accountHeading}>{ru ? "Ваши герои" : "Your heroes"}</h3>
        <Link className={styles.account} href={accountHref}
          aria-disabled={account.state === "loading" || undefined}
          onPointerEnter={routePrefetchEnabled ? () => router.prefetch(accountHref) : undefined}
          onFocus={routePrefetchEnabled ? () => router.prefetch(accountHref) : undefined}
          onClick={(event) => { if (account.state === "loading") event.preventDefault(); else onNavigate?.(); }} prefetch={false}>
          <span>{account.state === "loading"
            ? (ru ? "Проверяем аккаунт…" : "Checking account…")
            : battleNetConnected ? account.name ?? (ru ? "Персонажи аккаунта" : "Account characters") : (ru ? "Войти через Battle.net" : "Sign in with Battle.net")}</span>
        </Link>
        <p className={styles.accountDetail}>{battleNetConnected ? (ru ? "Открыть список персонажей" : "Open your character roster") : (ru ? "Подключите аккаунт и найдите своих героев" : "Connect your account to find your heroes")}</p>
        </div>
        <span className={styles.pageNumber} aria-hidden="true">II</span>
      </section>
    </div>
  </div>;
}
