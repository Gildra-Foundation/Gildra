"use client";
import { memo, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type FocusEvent, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookMarked, BookOpen, ChevronDown, Coins, Compass, Hammer, KeyRound, Library, Map, Menu, Network, Route, ScrollText, Shield, Shirt, Skull, Swords, TrendingUp, Trophy, UserRound, Users, Wrench, X, type LucideIcon } from "lucide-react";
import { lessMotion } from "@gildra/atlas-ui/motionPreference";
import { p, type Lang } from "@/lib/i18n-paths";
import { SiteSearch } from "@/components/platform/search/SiteSearch";
import { LocaleSwitch } from "@/components/platform/locale/LocaleSwitch";
import { AccountChip } from "@/components/auth/AccountChip";
import { GildraCrest } from "@/components/brand/GildraCrest";
import { barePathOf, currentRealm, groupsFor, linksFor, realmsFor, type NavigationIcon, type NavigationRealm } from "./navigationMap";
import type { NavigationPicks } from "./navigationPicks";
import toolbarStyles from "./atlasToolbar.module.css";

const noSubscribe = () => () => {};
/** Prerendered 404 pages must hydrate with their original toolbar language. */
const renderedPath = (fallback: string) => typeof document === "undefined"
  ? fallback
  : document.querySelector("[data-toolbar-path]")?.getAttribute("data-toolbar-path") ?? fallback;

/**
 * Hover intent of the tab menus: a pointer passing over the bar does not flash
 * a menu, one crossing a neighbouring tab on its way down into the open menu
 * does not switch it, and one slipping out of the menu has a moment to come back.
 */
const OPEN_DELAY = 100;
const SWITCH_DELAY = 120;
const CLOSE_DELAY = 250;
/** Longest exit animation (menu and sheet); a fallback when animationend never comes. */
const EXIT_MS = 200;

const word = (lang: Lang, value: { en: string; ru: string }) => value[lang];

const realmIcons: Record<string, LucideIcon> = { heroes: UserRound, mythic: KeyRound, raids: Swords, meta: BarChart3, library: Library, chronicle: ScrollText, tools: Wrench };

/** Each page its own sign, so the eye finds it before reading. */
const pageIcons: Record<NavigationIcon, LucideIcon> = {
  characters: UserRound, classes: Network,
  atlas: Map, guide: Compass, meta: TrendingUp, comps: Users, stats: BarChart3, leaderboard: Trophy, routes: Route,
  journal: BookMarked, lairs: Skull, raidComp: Shield,
  auction: Coins, professions: Hammer, transmog: Shirt,
  library: Library, stories: BookOpen,
};

function RealmIcon({ id, size }: { id: string; size: number }) {
  const Icon = realmIcons[id];
  return Icon ? <Icon size={size} strokeWidth={1.75} aria-hidden="true" /> : null;
}

/** A realm with one page and no quick picks is a plain tab (a menu would only repeat it). */
const isSingle = (realm: NavigationRealm, lang: Lang, picks: NavigationPicks) => linksFor(realm, lang).length === 1 && !picks[realm.id];

/**
 * The body of a realm menu: its pages under short headings, then its quick
 * picks (dungeon and raid paintings or the class roster) as a compact list.
 */
function RealmMenu({ realm, picks, lang, barePath, onNavigate, compact = false, art = true }: {
  realm: NavigationRealm; picks: NavigationPicks; lang: Lang; barePath: string; onNavigate: () => void; compact?: boolean;
  /** Paint the pictures (the prebuilt sheet adds them on its first opening, not on page load). */
  art?: boolean;
}) {
  const group = picks[realm.id];
  const items = group?.kind === "class"
    ? [...group.picks].sort((a, b) => word(lang, a.label).localeCompare(word(lang, b.label), lang))
    : group?.picks;
  return <div className={toolbarStyles.menu} data-compact={compact || undefined} data-picks={group?.kind}>
    <div className={toolbarStyles.column}>
      {groupsFor(realm, lang).map((pages, index) => <div key={index} className={toolbarStyles.group}>
        {pages.title && <p className={toolbarStyles.caption}>{word(lang, pages.title)}</p>}
        <ul className={toolbarStyles.pages}>
          {pages.links.map(link => {
            const Icon = pageIcons[link.icon];
            return <li key={link.href}>
              <Link href={p(lang, link.href)} prefetch={false} className={toolbarStyles.page} onClick={onNavigate}
                aria-current={barePath === link.href ? "page" : undefined}>
                <span className={toolbarStyles.pageIcon}><Icon size={17} strokeWidth={1.75} aria-hidden="true" /></span>
                <span className={toolbarStyles.pageText}>
                  <strong>{word(lang, link.label)}</strong>
                  {link.note && <small>{word(lang, link.note)}</small>}
                </span>
              </Link>
            </li>;
          })}
        </ul>
      </div>)}
    </div>
    {group && items && <div className={toolbarStyles.column}>
      <p className={toolbarStyles.caption}>{word(lang, group.title)}</p>
      <ul className={toolbarStyles.picks} data-kind={group.kind}>
        {items.map(pick => <li key={pick.href}>
          <Link href={p(lang, pick.href)} prefetch={false} className={toolbarStyles.pick} onClick={onNavigate}
            style={pick.tint ? { "--pick-tint": pick.tint } as CSSProperties : undefined}
            aria-current={barePath === pick.href ? "page" : undefined}>
            <span className={toolbarStyles.pickArt}>
              {art && <Image src={pick.image} alt="" fill sizes={group.kind === "class" ? "28px" : "56px"} quality={50} />}
            </span>
            <span className={toolbarStyles.pickLabel}>{word(lang, pick.label)}</span>
          </Link>
        </li>)}
      </ul>
    </div>}
  </div>;
}

type OpenMenu = {
  /** The page the menu was opened on: any navigation closes it. */
  path: string;
  realm: string;
  /** Opened by hover intent, or pinned by a press (click, Enter, arrow). */
  by: "hover" | "press";
  /** Opened from a closed bar (it drops in); a switch between tabs swaps in place. */
  fresh: boolean;
};

/** The focusable items of an open menu, in reading order. */
const menuItems = (panel: Element | null | undefined) => [...(panel?.querySelectorAll<HTMLElement>("a[href]") ?? [])];

/** The section tabs: each opens its menu on hover intent or on its chevron; the link itself goes to the hub. */
function RealmTabs({ path, lang, picks }: { path: string; lang: Lang; picks: NavigationPicks }) {
  const ru = lang === "ru";
  const barePath = barePathOf(path);
  const current = currentRealm(barePath);
  const [open, setOpen] = useState<OpenMenu | null>(null);
  // The menu that is fading out after a close (its exit animation).
  const [leaving, setLeaving] = useState<{ path: string; realm: string } | null>(null);
  const openMenu = open?.path === path ? open : null;
  const openRealm = openMenu?.realm ?? null;
  const leavingRealm = leaving?.path === path && leaving.realm !== openRealm ? leaving.realm : null;
  const root = useRef<HTMLElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** Keyboard opening: which end of the menu receives focus once it renders. */
  const focusOnOpen = useRef<"first" | "last" | null>(null);
  const id = useId();

  const later = (action: () => void, delay: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(action, delay);
  };
  const show = (realm: string, by: OpenMenu["by"]) => {
    clearTimeout(timer.current);
    setLeaving(null);
    setOpen(previous => ({ path, realm, by, fresh: !(previous && previous.path === path) }));
  };
  const close = () => {
    clearTimeout(timer.current);
    if (openRealm && !lessMotion()) {
      setLeaving({ path, realm: openRealm });
      clearTimeout(exitTimer.current);
      exitTimer.current = setTimeout(() => setLeaving(null), EXIT_MS);
    }
    setOpen(null);
  };

  useEffect(() => () => { clearTimeout(timer.current); clearTimeout(exitTimer.current); }, []);

  useEffect(() => {
    if (!openRealm) return;
    const outside = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(null);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [openRealm]);

  // A menu opened from the keyboard takes focus once it is in the document.
  useLayoutEffect(() => {
    const edge = focusOnOpen.current;
    focusOnOpen.current = null;
    if (!edge || !openRealm) return;
    const items = menuItems(document.getElementById(`${id}-${openRealm}`));
    (edge === "first" ? items[0] : items.at(-1))?.focus();
  }, [openRealm, id]);

  // The menu hangs under its tab; near the window's edge it slides back inside.
  const shown = openRealm ?? leavingRealm;
  useLayoutEffect(() => {
    const panel = shown ? document.getElementById(`${id}-${shown}`) : null;
    if (!panel) return;
    const fit = () => {
      panel.style.setProperty("--panel-shift", "0px");
      const box = panel.getBoundingClientRect();
      const margin = 12;
      const room = document.documentElement.clientWidth - margin;
      const shift = box.right > room ? Math.max(room - box.right, margin - box.left) : 0;
      panel.style.setProperty("--panel-shift", `${Math.round(shift)}px`);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [shown, id]);

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
      if (openRealm === realm) clearTimeout(timer.current);
      // With a menu open, a neighbour takes over only when the pointer rests on it.
      else later(() => show(realm, "hover"), openRealm ? SWITCH_DELAY : OPEN_DELAY);
    },
    onPointerLeave: (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      if (!openRealm) clearTimeout(timer.current);
      else if (openMenu?.by === "hover") later(close, CLOSE_DELAY);
    },
  });
  // A plain tab under the pointer lets an open hover menu go after the same grace.
  const plainHover = {
    onPointerEnter: (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      if (!openRealm) clearTimeout(timer.current);
      else if (openMenu?.by === "hover") later(close, CLOSE_DELAY);
    },
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (event.key === "Escape") {
      if (!openRealm) return;
      event.preventDefault();
      const toggle = list.current?.querySelector<HTMLButtonElement>(`[data-realm="${openRealm}"] > button`);
      close();
      toggle?.focus();
      return;
    }
    const panel = target.closest<HTMLElement>("[data-menu-panel]");
    if (panel && (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End")) {
      // Up and down walk the open menu: its pages, then its quick picks.
      event.preventDefault();
      const items = menuItems(panel);
      const at = items.indexOf(target);
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
        : (at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
      return;
    }
    const realm = target.closest<HTMLElement>("li[data-realm]")?.dataset.realm;
    if (panel || !realm || target.parentElement?.tagName !== "LI") return;
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && target.tagName === "BUTTON") {
      event.preventDefault();
      focusOnOpen.current = event.key === "ArrowDown" ? "first" : "last";
      if (openRealm === realm) {
        const items = menuItems(document.getElementById(`${id}-${realm}`));
        focusOnOpen.current = null;
        (event.key === "ArrowDown" ? items[0] : items.at(-1))?.focus();
      } else show(realm, "press");
    } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      // Left and right walk the strip: each tab and its chevron.
      const stops = [...(list.current?.querySelectorAll<HTMLElement>(":scope > li > a, :scope > li > button") ?? [])];
      const at = stops.indexOf(target);
      if (at < 0) return;
      event.preventDefault();
      stops[(at + (event.key === "ArrowRight" ? 1 : -1) + stops.length) % stops.length]?.focus();
    }
  };

  return <nav ref={root} className={toolbarStyles.tabs} aria-label={ru ? "Основная навигация" : "Main navigation"}
    onBlur={(event: FocusEvent) => { if (openRealm && !event.currentTarget.contains(event.relatedTarget)) close(); }}
    onKeyDown={onKeyDown}>
    <ul ref={list}>
      {realmsFor(lang).map(realm => {
        const isOpen = openRealm === realm.id;
        const isLeaving = leavingRealm === realm.id;
        const label = word(lang, realm.label);
        const single = isSingle(realm, lang, picks);
        const link = <Link href={p(lang, realm.hub)} prefetch={false} className={toolbarStyles.tab} onClick={close}
          aria-current={barePath === realm.hub ? "page" : current?.realm.id === realm.id ? "true" : undefined}>
          <RealmIcon id={realm.id} size={17} />{label}
        </Link>;
        if (single) return <li key={realm.id} data-realm={realm.id} data-single {...plainHover}>{link}</li>;
        return <li key={realm.id} data-realm={realm.id} data-open={isOpen || undefined} {...hover(realm.id)}>
          {link}
          <button type="button" className={toolbarStyles.toggle} aria-expanded={isOpen} aria-controls={`${id}-${realm.id}`}
            aria-label={ru ? `${label}: все страницы раздела` : `${label}: all pages`}
            onClick={event => {
              // A click on a menu the hover has just opened pins it instead of closing it again.
              if (isOpen && openMenu?.by === "hover" && event.detail > 0) setOpen({ ...openMenu, by: "press" });
              else if (isOpen) close();
              else show(realm.id, "press");
            }}>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          {(isOpen || isLeaving) && <div id={`${id}-${realm.id}`} className={toolbarStyles.panel} data-menu-panel
            data-state={isOpen ? "open" : "closed"} data-enter={(isOpen && openMenu?.fresh) || undefined}
            inert={!isOpen || undefined}
            onAnimationEnd={event => { if (!isOpen && event.target === event.currentTarget) setLeaving(null); }}>
            <RealmMenu key={realm.id} realm={realm} picks={picks} lang={lang} barePath={barePath} onNavigate={close} />
          </div>}
        </li>;
      })}
    </ul>
  </nav>;
}

/**
 * The sheet's sections: one row per tab, each a fold with the same groups as its
 * menu (the current one unfolded); a tab of one page is a plain row.
 * Memoised: opening and closing the sheet re-renders only its frame.
 */
const SheetContent = memo(function SheetContent({ lang, picks, barePath, currentId, art, onNavigate }: {
  lang: Lang; picks: NavigationPicks; barePath: string; currentId: string | undefined; art: boolean; onNavigate: () => void;
}) {
  return <>
    <Account lang={lang} />
    <div className={toolbarStyles.sheetRealms}>
      {realmsFor(lang).map(realm => {
        const isCurrent = realm.id === currentId;
        const label = word(lang, realm.label);
        if (isSingle(realm, lang, picks)) return <div key={realm.id} className={toolbarStyles.sheetRealm} data-current={isCurrent || undefined}>
          <Link href={p(lang, realm.hub)} prefetch={false} className={toolbarStyles.sheetHead} onClick={onNavigate}
            aria-current={barePath === realm.hub ? "page" : isCurrent ? "true" : undefined}>
            <RealmIcon id={realm.id} size={19} /><span>{label}</span>
          </Link>
        </div>;
        return <details key={realm.id} className={toolbarStyles.sheetRealm} data-current={isCurrent || undefined} open={isCurrent}>
          <summary className={toolbarStyles.sheetHead}>
            <RealmIcon id={realm.id} size={19} /><span>{label}</span>
            <ChevronDown className={toolbarStyles.sheetChevron} size={18} aria-hidden="true" />
          </summary>
          <RealmMenu realm={realm} picks={picks} lang={lang} barePath={barePath} onNavigate={onNavigate} compact art={art} />
        </details>;
      })}
    </div>
  </>;
});

type SheetIdle = Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number; cancelIdleCallback?: (handle: number) => void };

/**
 * Phones and tablets: every section's menu in one sheet under the bar, with the
 * account. The sheet is built and laid out once, when the page is idle (or on the
 * first touch of the button), and from then on only shown and hidden
 * (visibility): building and laying out seven menus on the tap held its first
 * frame back by 150–500 ms on a slow phone. Its pictures load on the first opening.
 */
function MenuSheet({ path, lang, picks }: { path: string; lang: Lang; picks: NavigationPicks }) {
  const ru = lang === "ru";
  const barePath = barePathOf(path);
  const currentId = currentRealm(barePath)?.realm.id;
  const [openOn, setOpenOn] = useState<string | null>(null);
  const [built, setBuilt] = useState(false);
  const [art, setArt] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const open = openOn === path;
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const id = useId();
  const close = () => {
    if (!open) return;
    if (!lessMotion()) {
      setLeaving(true);
      clearTimeout(exitTimer.current);
      exitTimer.current = setTimeout(() => setLeaving(false), EXIT_MS);
    }
    setOpenOn(null);
  };

  // Build the sheet ahead of the first tap where the bar shows the menu button.
  useEffect(() => {
    if (built || !window.matchMedia("(max-width: 1179px)").matches) return;
    const idle = window as SheetIdle;
    if (idle.requestIdleCallback) {
      const handle = idle.requestIdleCallback(() => setBuilt(true), { timeout: 4000 });
      return () => idle.cancelIdleCallback?.(handle);
    }
    const handle = setTimeout(() => setBuilt(true), 2000);
    return () => clearTimeout(handle);
  }, [built]);

  useEffect(() => () => clearTimeout(exitTimer.current), []);

  // A link in the sheet closes it; one stable handler keeps the memoised sections still.
  const latestClose = useRef(close);
  useLayoutEffect(() => { latestClose.current = close; });
  const navigate = useCallback(() => latestClose.current(), []);

  useEffect(() => {
    if (!open) return;
    // Open on the current section: scroll it to the top and focus its first page.
    const sheet = root.current?.querySelector<HTMLElement>("[data-sheet]");
    const section = sheet?.querySelector<HTMLElement>("[data-current]");
    if (sheet && section) sheet.scrollTop += section.getBoundingClientRect().top - sheet.getBoundingClientRect().top - 16;
    const first = section?.matches("details:not([open])") ? section.querySelector<HTMLElement>("summary") : (section ?? sheet)?.querySelector<HTMLElement>("a");
    first?.focus({ preventScroll: true });
    const outside = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpenOn(null);
    };
    // The page under the sheet stays put: the sheet itself contains its scroll
    // (overscroll-behavior), and a drag on the bar above it is held. No overflow
    // lock on <html>: that relaid the whole page out on the tap.
    const bar = root.current?.closest("header");
    const hold = (event: Event) => {
      if (!(event.target instanceof Node) || !sheet?.contains(event.target)) event.preventDefault();
    };
    document.addEventListener("pointerdown", outside);
    bar?.addEventListener("touchmove", hold, { passive: false });
    bar?.addEventListener("wheel", hold, { passive: false });
    return () => {
      document.removeEventListener("pointerdown", outside);
      bar?.removeEventListener("touchmove", hold);
      bar?.removeEventListener("wheel", hold);
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
      onPointerDown={() => { setBuilt(true); setArt(true); }} onFocus={() => setBuilt(true)}
      onClick={() => { setBuilt(true); setArt(true); if (open) close(); else { setLeaving(false); setOpenOn(path); } }}>
      <Menu className={toolbarStyles.menuIcon} data-icon="open" size={20} aria-hidden="true" />
      <X className={toolbarStyles.menuIcon} data-icon="close" size={20} aria-hidden="true" />
    </button>
    {built && <nav id={id} className={toolbarStyles.sheet} data-sheet data-state={open ? "open" : leaving ? "closing" : "closed"}
      inert={!open || undefined} aria-label={ru ? "Все разделы" : "All sections"}
      onAnimationEnd={event => { if (!open && event.target === event.currentTarget) setLeaving(false); }}
      onBlur={event => { if (open && !root.current?.contains(event.relatedTarget)) close(); }}>
      <SheetContent lang={lang} picks={picks} barePath={barePath} currentId={currentId} art={art} onNavigate={navigate} />
    </nav>}
  </div>;
}

/** Real account state (GET /api/auth/status): "Sign in" or the Battle.net name. */
function Account({ lang }: { lang: Lang }) {
  return <AccountChip lang={lang} className={toolbarStyles.account} avatarClassName={toolbarStyles.accountAvatar}
    labelClassName={toolbarStyles.accountLabel} avatarContent={<UserRound size={15} strokeWidth={2} />} />;
}

/**
 * The bar casts a shadow once the page scrolls under it. The flag is written on
 * the element: a React state re-rendered the whole bar on the frame it changed.
 */
function useScrolledFlag(bar: RefObject<HTMLElement | null>) {
  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      bar.current?.toggleAttribute("data-scrolled", window.scrollY > 8);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(read); };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); };
  }, [bar]);
}

/** The command bar: brand, search and account on top; the section tabs with their menus below. */
export function WorkspaceNavigatorContent({ picks }: { picks: NavigationPicks }) {
  const pathname = usePathname();
  const livePath = useSyncExternalStore(noSubscribe, () => pathname, () => renderedPath(pathname));
  const ru = /^\/ru(?:\/|$)/.test(livePath);
  const lang: Lang = ru ? "ru" : "en";
  const bar = useRef<HTMLElement>(null);
  useScrolledFlag(bar);

  return <header ref={bar} className={toolbarStyles.toolbar} data-atlas-scope data-toolbar-path={livePath}>
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
      <div className={toolbarStyles.search}><SiteSearch lang={lang} /></div>
      <div className={toolbarStyles.end}>
        <LocaleSwitch path={livePath} lang={lang} />
        <span className={toolbarStyles.accountSlot}><Account lang={lang} /></span>
        <MenuSheet path={livePath} lang={lang} picks={picks} />
      </div>
    </div>
    <RealmTabs path={livePath} lang={lang} picks={picks} />
  </header>;
}
