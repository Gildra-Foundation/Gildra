"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type FocusEvent, type KeyboardEvent, type PointerEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, BarChart3, ChevronDown, KeyRound, Menu, ScrollText, Swords, UserRound, X, type LucideIcon } from "lucide-react";
import { p, type Lang } from "@/lib/i18n-paths";
import { gameDestinationForPath } from "@/lib/games/destinations";
import { SiteSearch } from "@/components/platform/search/SiteSearch";
import { LocaleSwitch } from "@/components/platform/locale/LocaleSwitch";
import { AccountChip } from "@/components/auth/AccountChip";
import { GildraCrest } from "@/components/brand/GildraCrest";
import { GameSwitcher } from "./GameSwitcher";
import { barePathOf, currentRealm, navigationRealms, type NavigationRealm } from "./navigationMap";
import type { NavigationPicks } from "./navigationPicks";
import toolbarStyles from "./atlasToolbar.module.css";

const noSubscribe = () => () => {};
/** Prerendered 404 pages must hydrate with their original toolbar language. */
const renderedPath = (fallback: string) => typeof document === "undefined"
  ? fallback
  : document.querySelector("[data-toolbar-path]")?.getAttribute("data-toolbar-path") ?? fallback;

/** Hover intent: a pointer passing over the bar does not flash a menu. */
const OPEN_DELAY = 90;
const CLOSE_DELAY = 180;

const word = (lang: Lang, value: { en: string; ru: string }) => value[lang];

const realmIcons: Record<string, LucideIcon> = { heroes: UserRound, mythic: KeyRound, raids: Swords, meta: BarChart3, chronicle: ScrollText };

function RealmIcon({ id, size }: { id: string; size: number }) {
  const Icon = realmIcons[id];
  return Icon ? <Icon size={size} strokeWidth={1.75} aria-hidden="true" /> : null;
}

/** The body of a realm menu: the realm's pages, then its quick picks (paintings or the class roster). */
function RealmMenu({ realm, picks, lang, barePath, onNavigate, compact = false }: {
  realm: NavigationRealm; picks: NavigationPicks; lang: Lang; barePath: string; onNavigate: () => void; compact?: boolean;
}) {
  const group = picks[realm.id];
  const items = group?.kind === "class"
    ? [...group.picks].sort((a, b) => word(lang, a.label).localeCompare(word(lang, b.label), lang))
    : group?.picks;
  return <div className={toolbarStyles.menu} data-compact={compact || undefined}>
    <div>
      <p className={toolbarStyles.caption}>{word(lang, realm.label)}</p>
      <ul className={toolbarStyles.pages}>
        {realm.links.map(link => <li key={link.href}>
          <Link href={p(lang, link.href)} prefetch={false} className={toolbarStyles.page} onClick={onNavigate}
            aria-current={barePath === link.href ? "page" : undefined}>
            <span className={toolbarStyles.pageIcon}><RealmIcon id={realm.id} size={16} /></span>
            <span className={toolbarStyles.pageText}><strong>{word(lang, link.label)}</strong><small>{word(lang, link.note)}</small></span>
            <ArrowRight className={toolbarStyles.pageGo} size={15} aria-hidden="true" />
          </Link>
        </li>)}
      </ul>
    </div>
    {group && items && <div>
      <p className={toolbarStyles.caption}>{word(lang, group.title)}</p>
      <ul className={toolbarStyles.picks} data-kind={group.kind}>
        {items.map(pick => <li key={pick.href}>
          <Link href={p(lang, pick.href)} prefetch={false} className={toolbarStyles.pick} onClick={onNavigate}
            style={pick.tint ? { "--pick-tint": pick.tint } as CSSProperties : undefined}
            aria-current={barePath === pick.href ? "page" : undefined}>
            <span className={toolbarStyles.pickArt}>
              <Image src={pick.image} alt="" fill sizes={group.kind === "class" ? "32px" : "(max-width: 1179px) 62vw, 220px"} quality={50} />
            </span>
            <span className={toolbarStyles.pickLabel}>{word(lang, pick.label)}</span>
          </Link>
        </li>)}
      </ul>
    </div>}
  </div>;
}

/** The section tabs: each opens its menu on hover intent or on its chevron; the link itself goes to the hub. */
function RealmTabs({ path, lang, picks }: { path: string; lang: Lang; picks: NavigationPicks }) {
  const ru = lang === "ru";
  const barePath = barePathOf(path);
  const current = currentRealm(barePath);
  // The open menu belongs to the page it was opened on: any navigation closes it.
  const [open, setOpen] = useState<{ path: string; realm: string } | null>(null);
  const openRealm = open?.path === path ? open.realm : null;
  const root = useRef<HTMLElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const id = useId();

  const later = (action: () => void, delay: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(action, delay);
  };
  const show = (realm: string) => { clearTimeout(timer.current); setOpen({ path, realm }); };
  const close = () => { clearTimeout(timer.current); setOpen(null); };

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!openRealm) return;
    const outside = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(null);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [openRealm]);

  // On narrow screens the strip scrolls sideways: keep the current section in view.
  const currentId = current?.realm.id ?? null;
  useLayoutEffect(() => {
    const host = list.current;
    const item = currentId ? host?.querySelector<HTMLElement>(`[data-realm="${currentId}"]`) : null;
    if (!host || !item || host.scrollWidth <= host.clientWidth) return;
    host.scrollLeft = item.offsetLeft - (host.clientWidth - item.offsetWidth) / 2;
  }, [currentId]);

  const hover = (realm: string) => ({
    onPointerEnter: (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      // Moving between tabs with a menu open switches at once.
      if (openRealm) show(realm); else later(() => show(realm), OPEN_DELAY);
    },
    onPointerLeave: (event: PointerEvent) => { if (event.pointerType === "mouse") later(close, CLOSE_DELAY); },
  });

  return <nav ref={root} className={toolbarStyles.tabs} aria-label={ru ? "Основная навигация" : "Main navigation"}
    onBlur={(event: FocusEvent) => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}
    onKeyDown={(event: KeyboardEvent) => {
      if (event.key !== "Escape" || !openRealm) return;
      event.preventDefault();
      const toggle = list.current?.querySelector<HTMLButtonElement>(`[data-realm="${openRealm}"] button`);
      close();
      toggle?.focus();
    }}>
    <ul ref={list}>
      {navigationRealms.map(realm => {
        const hub = realm.links[0];
        const isOpen = openRealm === realm.id;
        const label = word(lang, realm.label);
        return <li key={realm.id} data-realm={realm.id} data-open={isOpen || undefined} {...hover(realm.id)}>
          <Link href={p(lang, hub.href)} prefetch={false} className={toolbarStyles.tab} onClick={close}
            aria-current={barePath === hub.href ? "page" : current?.realm.id === realm.id ? "true" : undefined}>
            <RealmIcon id={realm.id} size={17} />{label}
          </Link>
          <button type="button" className={toolbarStyles.toggle} aria-expanded={isOpen} aria-controls={`${id}-${realm.id}`}
            aria-label={ru ? `${label}: все страницы раздела` : `${label}: all pages`}
            onClick={() => (isOpen ? close() : show(realm.id))}>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          {isOpen && <div id={`${id}-${realm.id}`} className={toolbarStyles.panel}>
            <RealmMenu realm={realm} picks={picks} lang={lang} barePath={barePath} onNavigate={close} />
          </div>}
        </li>;
      })}
    </ul>
  </nav>;
}

/** Phones and tablets: every section's menu in one sheet under the bar, with the account. */
function MenuSheet({ path, lang, picks }: { path: string; lang: Lang; picks: NavigationPicks }) {
  const ru = lang === "ru";
  const barePath = barePathOf(path);
  const currentId = currentRealm(barePath)?.realm.id;
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = () => setOpenOn(null);

  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const previous = html.style.overflow;
    // The page under the sheet does not scroll along with it.
    html.style.overflow = "hidden";
    // Open on the current section: scroll it to the top and focus its first page.
    const sheet = root.current?.querySelector<HTMLElement>("[data-sheet]");
    const section = sheet?.querySelector<HTMLElement>("[data-current]");
    if (sheet && section) sheet.scrollTop += section.getBoundingClientRect().top - sheet.getBoundingClientRect().top - 16;
    (section ?? sheet)?.querySelector<HTMLElement>("a")?.focus({ preventScroll: true });
    const outside = (event: globalThis.PointerEvent) => {
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
        close();
        trigger.current?.focus();
      }
    }}>
    <button ref={trigger} type="button" className={toolbarStyles.menuButton} aria-controls={id} aria-expanded={open}
      aria-label={ru ? (open ? "Закрыть меню" : "Открыть меню") : (open ? "Close menu" : "Open menu")}
      onClick={() => setOpenOn(open ? null : path)}>
      {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
    </button>
    {open && <nav id={id} className={toolbarStyles.sheet} data-sheet aria-label={ru ? "Все разделы" : "All sections"}
      onBlur={event => { if (!root.current?.contains(event.relatedTarget)) close(); }}>
      <Account lang={lang} />
      {navigationRealms.map(realm => <section key={realm.id} className={toolbarStyles.sheetRealm} data-current={realm.id === currentId || undefined}>
        <RealmMenu realm={realm} picks={picks} lang={lang} barePath={barePath} onNavigate={close} compact />
      </section>)}
    </nav>}
  </div>;
}

/** Real account state (GET /api/auth/status): "Sign in" or the Battle.net name. */
function Account({ lang }: { lang: Lang }) {
  return <AccountChip lang={lang} className={toolbarStyles.account} avatarClassName={toolbarStyles.accountAvatar}
    labelClassName={toolbarStyles.accountLabel} avatarContent={<UserRound size={15} strokeWidth={2} />} />;
}

/** The bar casts a shadow once the page scrolls under it. */
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

/** The command bar: brand, search and account on top; the section tabs with their menus below. */
export function WorkspaceNavigatorContent({ picks }: { picks: NavigationPicks }) {
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
    <div className={toolbarStyles.top}>
      <Link href={p(lang, "/")} prefetch={false} className={toolbarStyles.brand}
        aria-current={barePathOf(livePath) === "/" ? "page" : undefined} aria-label={ru ? "Gildra — главная" : "Gildra — home"}>
        <GildraCrest height={32} className={toolbarStyles.sigil} eager /><span>GILDRA</span>
      </Link>
      <div className={toolbarStyles.search}>{!comingSoon && <SiteSearch lang={lang} />}</div>
      <div className={toolbarStyles.end}>
        <LocaleSwitch path={livePath} lang={lang} />
        <GameSwitcher key={livePath} lang={lang} pathname={livePath} brandless />
        <span className={toolbarStyles.accountSlot}><Account lang={lang} /></span>
        <MenuSheet path={livePath} lang={lang} picks={picks} />
      </div>
    </div>
    <RealmTabs path={livePath} lang={lang} picks={picks} />
  </header>;
}
