"use client";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, X } from "lucide-react";
import { useFlip } from "@gildra/atlas-ui/valyro-ui/primitives/useFlip";
import { usePresence } from "@gildra/atlas-ui/valyro-ui/primitives/usePresence";
import { useDismissableLayer } from "@gildra/atlas-ui/valyro-ui/primitives/useDismissableLayer";
import { lessMotion, subscribeSiteMotion } from "@gildra/atlas-ui/motionPreference";
import { altPath, p } from "@/lib/i18n-paths";
import { gameDestinationForPath } from "@/lib/games/destinations";
import { SiteSearch } from "@/components/platform/search/SiteSearch";
import { useSiteTheme } from "@/components/motion/SiteTheme";
import { homeThemes } from "@/components/platform/home/homeThemes";
import { NavigationPreferences } from "./NavigationPreferences";
import styles from "./atlasToolbar.module.css";

const noSubscribe = () => () => {};
/** Prerendered 404 pages must hydrate with their original toolbar language. */
const renderedPath = (fallback: string) => typeof document === "undefined"
  ? fallback
  : document.querySelector("[data-toolbar-path]")?.getAttribute("data-toolbar-path") ?? fallback;
const destinations = [
  { href: "/", en: "Home", ru: "Главная" },
  { href: "/wow/characters", en: "Characters", ru: "Персонажи" },
  { href: "/wow/lairs", en: "Bosses", ru: "Боссы" },
  { href: "/wow/mythic-plus", en: "Mythic+", ru: "Mythic+" },
  { href: "/wow/raids", en: "Raids", ru: "Рейды" },
  { href: "/tier-lists", en: "Tier lists", ru: "Тир-листы" },
  { href: "/wow/articles", en: "Articles", ru: "Статьи" },
] as const;

export function WorkspaceNavigatorContent() {
  const pathname = usePathname();
  const path = useSyncExternalStore(noSubscribe, () => pathname, () => renderedPath(pathname));
  const ru = /^\/ru(?:\/|$)/.test(path);
  const lang = ru ? "ru" : "en";
  const barePath = path.replace(/^\/ru(?=\/|$)/, "").replace(/\/$/, "") || "/";
  const [panel, setPanel] = useState<{ path: string; kind: "menu" | "preferences" } | null>(null);
  const menuOpen = panel?.path === path && panel.kind === "menu";
  const preferencesOpen = panel?.path === path && panel.kind === "preferences";
  const close = () => setPanel(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const portraitTrigger = useRef<HTMLButtonElement>(null);
  const menuPanel = useRef<HTMLDivElement>(null);
  const preferencesPanel = useRef<HTMLDivElement>(null);
  const links = useRef<HTMLElement>(null);
  const reduced = useSyncExternalStore(subscribeSiteMotion, lessMotion, () => true);
  const menuPresence = usePresence(menuOpen, reduced ? 0 : 160);
  const preferencesPresence = usePresence(preferencesOpen, reduced ? 0 : 160);
  const menuId = useId();
  const preferencesId = useId();
  const { theme } = useSiteTheme();
  const selectedTheme = homeThemes.find(item => item.id === theme) ?? homeThemes[0];
  useFlip(links, { auto: true, animateEnter: false, enabled: !reduced, spring: "smooth" });
  useDismissableLayer({ enabled: menuOpen, refs: [menuTrigger, menuPanel], onDismiss: reason => {
    close();
    if (reason === "escape") menuTrigger.current?.focus();
  }});
  useDismissableLayer({ enabled: preferencesOpen, refs: [portraitTrigger, preferencesPanel], onDismiss: reason => {
    close();
    if (reason === "escape") portraitTrigger.current?.focus();
  }});
  useEffect(() => {
    if (preferencesOpen) preferencesPanel.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [preferencesOpen]);
  useEffect(() => {
    // A resized desktop rail must not leave an invisible mobile layer open.
    const query = window.matchMedia("(max-width: 1279px)");
    const reset = () => setPanel(null);
    query.addEventListener("change", reset);
    return () => query.removeEventListener("change", reset);
  }, []);
  const renderLink = (item: typeof destinations[number], marker: boolean) => {
    const current = item.href === "/" ? barePath === "/" : barePath === item.href || barePath.startsWith(`${item.href}/`);
    return <Link key={item.href} href={p(lang, item.href)} prefetch={false} className={styles.link}
      aria-current={current ? "page" : undefined} onClick={close}>
      {ru ? item.ru : item.en}
      {current && marker && <span className={styles.activeMarker} data-flip-id="active-section" aria-hidden="true" />}
    </Link>;
  };
  return <header className={styles.toolbar} data-atlas-scope data-toolbar-path={path}>
    <a className={styles.skip} href="#atlas-content" onClick={event => {
      const content = document.getElementById("atlas-content");
      if (!content) return;
      event.preventDefault();
      window.history.replaceState(window.history.state, "", "#atlas-content");
      content.focus({ preventScroll: true });
      content.scrollIntoView({ block: "start", behavior: "instant" });
    }}>{ru ? "К содержанию" : "Skip to content"}</a>
    <Link className={styles.brand} href={p(lang, "/")} aria-label={ru ? "Gildra — главная" : "Gildra — home"}
      aria-current={barePath === "/" ? "page" : undefined} prefetch={false} onClick={close}>
      <Image src="/assets/gildra/portal/crest.webp" alt="GILDRA" quality={50} width={2172} height={724} sizes="(max-width: 380px) 150px, (max-width: 1279px) 180px, (max-width: 1399px) 340px, 400px" priority />
    </Link>
    <nav ref={links} className={styles.desktopLinks} aria-label={ru ? "Основная навигация" : "Main navigation"}>
      <div className={styles.leftLinks}>{destinations.slice(1, 4).map(item => renderLink(item, true))}</div>
      <div className={styles.rightLinks}>{destinations.slice(4).map(item => renderLink(item, true))}</div>
    </nav>
    <div className={styles.end}>
      <button ref={menuTrigger} type="button" className={styles.menuToggle} aria-controls={menuId} aria-expanded={menuOpen}
        aria-label={ru ? (menuOpen ? "Закрыть меню" : "Открыть меню") : (menuOpen ? "Close menu" : "Open menu")}
        onClick={() => setPanel(menuOpen ? null : { path, kind: "menu" })}>
        {menuOpen ? <X size={21} aria-hidden="true" /> : <Menu size={21} aria-hidden="true" />}
      </button>
      {!gameDestinationForPath(path).soon && <SiteSearch lang={lang} compact onOpen={close} />}
      <nav className={styles.locale} aria-label={ru ? "Язык" : "Language"}>
        <Link href={altPath(path, "ru")} hrefLang="ru" lang="ru" aria-current={ru ? "true" : undefined} prefetch={false}>RU</Link>
        <Link href={altPath(path, "en")} hrefLang="en" lang="en" aria-current={ru ? undefined : "true"} prefetch={false}>EN</Link>
      </nav>
      <button ref={portraitTrigger} type="button" className={styles.portraitToggle} aria-controls={preferencesId} aria-expanded={preferencesOpen}
        aria-label={ru ? "Оформление и игры" : "Appearance and games"}
        onClick={() => setPanel(preferencesOpen ? null : { path, kind: "preferences" })}>
        <Image src={`/assets/wow/character-book/intro/${selectedTheme.art}`} alt="" width={40} height={40} sizes="40px" />
        <ChevronDown size={13} aria-hidden="true" />
      </button>
    </div>
    {menuPresence.isMounted && <div ref={menuPanel} id={menuId} className={styles.mobilePanel} data-state={menuPresence.state} inert={!menuOpen}>
      <nav className={styles.mobileLinks} aria-label={ru ? "Основная навигация" : "Main navigation"}>
        {destinations.map(item => renderLink(item, false))}
      </nav>
      <NavigationPreferences ru={ru} onNavigate={close} />
    </div>}
    {preferencesPresence.isMounted && <div ref={preferencesPanel} id={preferencesId} className={styles.preferencesPanel}
      data-state={preferencesPresence.state} inert={!preferencesOpen}>
      <NavigationPreferences ru={ru} onNavigate={close} />
    </div>}
  </header>;
}
