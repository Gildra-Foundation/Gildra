"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, ChevronDown, Menu, X } from "lucide-react";
import { p, type Lang } from "@/lib/i18n-paths";
import { gameDestinationForPath } from "@/lib/games/destinations";
import { SiteSearch } from "@/components/platform/search/SiteSearch";
import { LocaleSwitch } from "@/components/platform/locale/LocaleSwitch";
import { GameSwitcher } from "./GameSwitcher";
import { barePathOf, currentRealm, navigationRealms, realmArt, type NavigationRealm } from "./navigationMap";
import toolbarStyles from "./atlasToolbar.module.css";

const noSubscribe = () => () => {};
/** Prerendered 404 pages must hydrate with their original toolbar language. */
const renderedPath = (fallback: string) => typeof document === "undefined"
  ? fallback
  : document.querySelector("[data-toolbar-path]")?.getAttribute("data-toolbar-path") ?? fallback;

/** Hover intent: a pointer passing over the bar does not flash a portal. */
const OPEN_DELAY = 90;
const CLOSE_DELAY = 180;

const word = (lang: Lang, value: { en: string; ru: string }) => value[lang];

/** The Gildra sigil: a gilded diamond with its inner facet. Decorative. */
function Sigil() {
  return <svg className={toolbarStyles.sigil} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <path d="M16 1.5 30.5 16 16 30.5 1.5 16Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <path d="M16 7.5 24.5 16 16 24.5 7.5 16Z" fill="currentColor" opacity=".22" />
    <path d="M16 7.5V24.5M7.5 16H24.5" stroke="currentColor" strokeWidth="1" opacity=".7" />
    <circle cx="16" cy="16" r="2.2" fill="currentColor" />
  </svg>;
}

/** The art panel a realm opens: its painting leads to the hub, the rest are its other pages. */
function RealmPortal({ realm, lang, barePath, id, onNavigate }: { realm: NavigationRealm; lang: Lang; barePath: string; id: string; onNavigate: () => void }) {
  const [hub, ...others] = realm.links;
  const art = realmArt(realm);
  return <div id={id} className={toolbarStyles.portal} data-atlas-scope>
    <Link href={p(lang, hub.href)} prefetch={false} className={toolbarStyles.portalFeature}
      aria-current={barePath === hub.href ? "page" : undefined} onClick={onNavigate}>
      <Image className={toolbarStyles.portalArt} src={art.art} alt="" fill sizes="340px" quality={55} loading="eager" style={{ objectPosition: art.position }} />
      <span className={toolbarStyles.portalText}>
        <span className={toolbarStyles.portalTitle}>{word(lang, hub.label)}</span>
        <span className={toolbarStyles.portalLede}>{word(lang, realm.lede)}</span>
        <span className={toolbarStyles.portalGo}>{lang === "ru" ? "Открыть" : "Open"}<ArrowRight size={14} aria-hidden="true" /></span>
      </span>
    </Link>
    <div className={toolbarStyles.portalList}>
      <p className={toolbarStyles.portalCaption}>{lang === "ru" ? "Также в разделе" : "Also in this realm"}</p>
      <ul>
        {others.map(link => <li key={link.href}>
          <Link href={p(lang, link.href)} prefetch={false} className={toolbarStyles.portalLink}
            aria-current={barePath === link.href ? "page" : undefined} onClick={onNavigate}>
            <span><strong>{word(lang, link.label)}</strong><small>{word(lang, link.note)}</small></span>
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </li>)}
      </ul>
    </div>
  </div>;
}

function RealmNavigation({ path, lang }: { path: string; lang: Lang }) {
  const ru = lang === "ru";
  const barePath = barePathOf(path);
  const current = currentRealm(barePath);
  // The open portal belongs to the page it was opened on: any navigation closes it.
  const [open, setOpen] = useState<{ path: string; realm: string } | null>(null);
  const openRealm = open?.path === path ? open.realm : null;
  const list = useRef<HTMLUListElement>(null);
  const rune = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const id = useId();

  const later = (action: () => void, delay: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(action, delay);
  };
  const show = (realm: string) => setOpen({ path, realm });
  const close = () => { clearTimeout(timer.current); setOpen(null); };

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!openRealm) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !list.current?.contains(event.target)) setOpen(null);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [openRealm]);

  // The rune under the current realm glides to the new one when the page changes.
  const currentId = current?.realm.id ?? null;
  useLayoutEffect(() => {
    const marker = rune.current;
    const host = list.current;
    if (!marker || !host) return;
    const place = () => {
      const item = currentId ? host.querySelector<HTMLElement>(`[data-realm="${currentId}"] > a`) : null;
      if (!item) { marker.dataset.hidden = ""; return; }
      delete marker.dataset.hidden;
      marker.style.setProperty("--rune-x", `${item.offsetLeft + item.offsetWidth / 2}px`);
      marker.style.setProperty("--rune-w", `${Math.max(24, item.offsetWidth - 20)}px`);
    };
    place();
    // Glide only after the first placement, and again once the label font has settled.
    const ready = requestAnimationFrame(() => { marker.dataset.ready = ""; });
    const observer = new ResizeObserver(place);
    observer.observe(host);
    void document.fonts?.ready.then(place);
    return () => { cancelAnimationFrame(ready); observer.disconnect(); };
  }, [currentId]);

  return <nav className={toolbarStyles.realms} aria-label={ru ? "Основная навигация" : "Main navigation"}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}
    onKeyDown={event => {
      if (event.key !== "Escape" || !openRealm) return;
      event.preventDefault();
      const toggle = list.current?.querySelector<HTMLButtonElement>(`[data-realm="${openRealm}"] button`);
      close();
      toggle?.focus();
    }}>
    <ul ref={list} className={toolbarStyles.realmList}>
      {navigationRealms.map(realm => {
        const hub = realm.links[0];
        const isOpen = openRealm === realm.id;
        const inRealm = current?.realm.id === realm.id;
        const label = word(lang, realm.label);
        return <li key={realm.id} data-realm={realm.id} data-open={isOpen || undefined}
          onPointerEnter={event => {
            if (event.pointerType !== "mouse") return;
            // Moving between realms with a portal open switches at once.
            if (openRealm) { clearTimeout(timer.current); show(realm.id); } else later(() => show(realm.id), OPEN_DELAY);
          }}
          onPointerLeave={event => { if (event.pointerType === "mouse") later(close, CLOSE_DELAY); }}>
          <Link href={p(lang, hub.href)} prefetch={false} className={toolbarStyles.realmLink}
            aria-current={barePath === hub.href ? "page" : inRealm ? "true" : undefined} onClick={close}>
            {label}
          </Link>
          <button type="button" className={toolbarStyles.realmToggle} aria-expanded={isOpen} aria-controls={`${id}-${realm.id}`}
            aria-label={ru ? `${label}: все страницы раздела` : `${label}: all pages`}
            onClick={() => (isOpen ? close() : show(realm.id))}>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          {isOpen && <RealmPortal realm={realm} lang={lang} barePath={barePath} id={`${id}-${realm.id}`} onNavigate={close} />}
        </li>;
      })}
    </ul>
    <span ref={rune} className={toolbarStyles.rune} aria-hidden="true" />
  </nav>;
}

/** Phones and tablets: the realms as a full-height sheet of paintings under the bar. */
function RealmSheet({ path, lang }: { path: string; lang: Lang }) {
  const ru = lang === "ru";
  const barePath = barePathOf(path);
  const current = currentRealm(barePath);
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const previous = html.style.overflow;
    // The page under the sheet does not scroll along with it.
    html.style.overflow = "hidden";
    root.current?.querySelector<HTMLElement>("[data-sheet] a")?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpenOn(null);
    };
    document.addEventListener("pointerdown", outside);
    return () => {
      html.style.overflow = previous;
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);

  return <div ref={root} className={toolbarStyles.sheetRoot}
    onKeyDown={event => {
      if (event.key === "Escape" && open) {
        event.preventDefault();
        setOpenOn(null);
        trigger.current?.focus();
      }
    }}>
    <button ref={trigger} type="button" className={toolbarStyles.menuToggle} aria-controls={id} aria-expanded={open}
      aria-label={ru ? (open ? "Закрыть меню" : "Открыть меню") : (open ? "Close menu" : "Open menu")}
      onClick={() => setOpenOn(open ? null : path)}>
      {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
      <span>{ru ? "Меню" : "Menu"}</span>
    </button>
    {open && <nav id={id} className={toolbarStyles.sheet} data-sheet aria-label={ru ? "Основная навигация" : "Main navigation"}
      onBlur={event => { if (!root.current?.contains(event.relatedTarget)) setOpenOn(null); }}>
      <Link href={p(lang, "/")} prefetch={false} className={toolbarStyles.sheetHome} aria-current={barePath === "/" ? "page" : undefined} onClick={() => setOpenOn(null)}>
        <Sigil />{ru ? "Главная" : "Home"}
      </Link>
      <ul className={toolbarStyles.sheetRealms}>
        {navigationRealms.map((realm, index) => {
          const [hub, ...others] = realm.links;
          const art = realmArt(realm);
          return <li key={realm.id} style={{ "--i": index } as CSSProperties} data-current={current?.realm.id === realm.id || undefined}>
            <Link href={p(lang, hub.href)} prefetch={false} className={toolbarStyles.sheetFeature}
              aria-current={barePath === hub.href ? "page" : undefined} onClick={() => setOpenOn(null)}>
              <Image className={toolbarStyles.portalArt} src={art.art} alt="" fill sizes="(min-width: 640px) 50vw, 100vw" quality={50} style={{ objectPosition: art.position }} />
              <span className={toolbarStyles.portalText}>
                <span className={toolbarStyles.portalTitle}>{word(lang, realm.label)}</span>
                <span className={toolbarStyles.portalLede}>{word(lang, realm.lede)}</span>
              </span>
            </Link>
            {others.length > 0 && <ul className={toolbarStyles.sheetLinks}>
              {others.map(link => <li key={link.href}>
                <Link href={p(lang, link.href)} prefetch={false} aria-current={barePath === link.href ? "page" : undefined} onClick={() => setOpenOn(null)}>
                  {word(lang, link.label)}<ArrowRight size={14} aria-hidden="true" />
                </Link>
              </li>)}
            </ul>}
          </li>;
        })}
      </ul>
    </nav>}
  </div>;
}

/** The bar deepens once the page scrolls under it. */
function useScrolled() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let frame = 0;
    const read = () => { frame = 0; setScrolled(window.scrollY > 8); };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(read); };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); };
  }, []);
  return scrolled;
}

export function WorkspaceNavigatorContent() {
  const pathname = usePathname();
  const livePath = useSyncExternalStore(noSubscribe, () => pathname, () => renderedPath(pathname));
  const ru = /^\/ru(?:\/|$)/.test(livePath);
  const lang: Lang = ru ? "ru" : "en";
  const comingSoon = gameDestinationForPath(livePath).soon;
  const scrolled = useScrolled();

  return <header className={toolbarStyles.toolbar} data-atlas-scope data-toolbar-path={livePath} data-scrolled={scrolled || undefined}>
    <a className={toolbarStyles.skip} href="#atlas-content" onClick={event => {
      const content = document.getElementById("atlas-content");
      if (!content) return;
      // Own this in-page jump: route interception must not leave keyboard focus in the header.
      event.preventDefault();
      window.history.replaceState(window.history.state, "", "#atlas-content");
      content.focus({ preventScroll: true });
      content.scrollIntoView({ block: "start", behavior: "instant" });
    }}>{ru ? "К содержанию" : "Skip to content"}</a>
    <div className={toolbarStyles.start}>
      <RealmSheet path={livePath} lang={lang} />
      <Link href={p(lang, "/")} prefetch={false} className={toolbarStyles.brand}
        aria-current={barePathOf(livePath) === "/" ? "page" : undefined} aria-label={ru ? "Gildra — главная" : "Gildra — home"}>
        <Sigil /><span>GILDRA</span>
      </Link>
    </div>
    <RealmNavigation path={livePath} lang={lang} />
    <div className={toolbarStyles.end}>
      {!comingSoon && <SiteSearch lang={lang} />}
      <LocaleSwitch path={livePath} lang={lang} />
      <GameSwitcher key={livePath} lang={lang} pathname={livePath} brandless />
    </div>
  </header>;
}
