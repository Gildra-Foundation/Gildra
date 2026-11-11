"use client";
import { memo, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ComponentType, type CSSProperties, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent, type RefObject } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BarChart3, BookMarked, BookOpen, Castle, ChevronDown, Coins, Compass, Hammer, KeyRound, Library, Map, Menu, Network, Route, ScrollText, Search, Shield, Shirt, Shuffle, Skull, Sword, Swords, TrendingUp, Trophy, UserRound, Users, Wrench, X, Zap, type LucideIcon } from "lucide-react";
import { lessMotion } from "@gildra/atlas-ui/motionPreference";
import { p, type Lang } from "@/lib/i18n-paths";
import { SiteSearch } from "@/components/platform/search/SiteSearch";
import { OPEN_SITE_SEARCH } from "@/components/platform/search/siteSearchIndex";
import { LocaleSwitch } from "@/components/platform/locale/LocaleSwitch";
import { AccountChip } from "@/components/auth/AccountChip";
import { GildraCrest } from "@/components/brand/GildraCrest";
import { WowVersionStrip } from "./WowVersionStrip";
import { barePathOf, currentRealm, groupsFor, linksFor, realmsFor, type NavigationIcon, type NavigationLink, type NavigationRealm } from "./navigationMap";
import type { NavigationPickGlyph, NavigationPicks } from "./navigationPicks";
import { collectionGlyphs } from "./CollectionGlyphs";
import { useToolbarPath } from "./toolbarPath";
import toolbarStyles from "./atlasToolbar.module.css";


/**
 * Hover intent of the tab menus: a pointer passing over the bar does not flash
 * a menu, one crossing a neighbouring tab on its way down into the open menu
 * does not switch it, and one slipping out of the menu has a moment to come back.
 */
const OPEN_DELAY = 100;
const SWITCH_DELAY = 120;
const CLOSE_DELAY = 250;
/** How long a closed menu or sheet stays for its exit animation (130 ms; a frame or two to spare). */
const EXIT_MS = 170;
/** Where the bar has its tab row and menus; below it, the sheet holds every section. */
const WIDE = "(min-width: 1180px)";
const wide = () => window.matchMedia(WIDE).matches;

const word = (lang: Lang, value: { en: string; ru: string }) => value[lang];

const realmIcons: Record<string, LucideIcon> = { "forever-library": Library, "forever-talent-calc": Network, "forever-classes": Network, "forever-professions": Wrench, "forever-tier-lists": BarChart3, "forever-dungeons": KeyRound, "forever-raids": Swords, heroes: UserRound, classes: Network, mythic: KeyRound, raids: Swords, meta: BarChart3, library: Library, chronicle: ScrollText, tools: Wrench };

/** Each page its own sign, so the eye finds it before reading. */
const pageIcons: Record<NavigationIcon, LucideIcon> = {
  characters: UserRound, classes: Network,
  atlas: Map, guide: Compass, meta: TrendingUp, comps: Users, stats: BarChart3, leaderboard: Trophy, routes: Route,
  journal: BookMarked, lairs: Skull, raidComp: Shield,
  auction: Coins, professions: Hammer, transmog: Shirt,
  library: Library, stories: BookOpen,
};

const glyphIcons: Record<NavigationPickGlyph, ComponentType<{ size?: number; strokeWidth?: number }>> = {
  raid: Castle, arena: Swords, duel: Sword, shuffle: Shuffle, blitz: Zap,
  ...collectionGlyphs,
};

function RealmIcon({ id, size }: { id: string; size: number }) {
  const Icon = realmIcons[id];
  return Icon ? <Icon className={toolbarStyles.realmIcon} size={size} strokeWidth={1.75} aria-hidden="true" /> : null;
}

/** A realm with one page and no quick picks is a plain tab (a menu would only repeat it). */
const isSingle = (realm: NavigationRealm, lang: Lang, picks: NavigationPicks) => linksFor(realm, lang).length === 1 && !picks[realm.id];

/** The world map's own picture: four tiles of its first zoom, 480 × 320 of 512 (per language). */
function MapArt({ base, lang }: { base: string; lang: Lang }) {
  const root = lang === "ru" ? base.replace("/maps/tiles/", "/maps/tiles/ru/") : base;
  return <span className={toolbarStyles.mapArt}>
    {[0, 1].map(y => [0, 1].map(x =>
      // eslint-disable-next-line @next/next/no-img-element -- map tiles: an exact pixel grid, no optimizer
      <img key={`${x}-${y}`} src={`${root}/${x}_${y}.webp`} alt="" width={256} height={256} decoding="async" style={{ left: `${x * 53.34}%`, top: `${y * 80}%` }} />))}
  </span>;
}

/** The menu's lead: one of the realm's pages as a picture card. */
function FeatureCard({ link, realm, lang, barePath, art, onNavigate }: { link: NavigationLink; realm: NavigationRealm; lang: Lang; barePath: string; art: boolean; onNavigate: (event: MouseEvent<HTMLAnchorElement>) => void }) {
  const Icon = pageIcons[link.icon];
  return <Link href={p(lang, link.href)} prefetch={false} className={toolbarStyles.feature} onClick={onNavigate}
    aria-current={barePath === link.href ? "page" : undefined}>
    <span className={toolbarStyles.featureArt} aria-hidden="true">
      {art && realm.art ? (realm.art.startsWith("/maps/tiles/")
        ? <MapArt base={realm.art} lang={lang} />
        : <Image src={realm.art} alt="" fill sizes="(min-width: 1180px) 264px, 72px" quality={50} />) : null}
      {art && <span className={toolbarStyles.featureIcon}><Icon size={17} strokeWidth={1.75} /></span>}
    </span>
    <span className={toolbarStyles.featureText}>
      <strong>{word(lang, link.label)}</strong>
      {link.note && <small>{word(lang, link.note)}</small>}
    </span>
    {art && <ArrowRight className={toolbarStyles.featureArrow} size={16} aria-hidden="true" />}
  </Link>;
}

/**
 * Signs and pictures of the menus are drawn only once the reader reaches for
 * the bar (hover, press, focus): closed, the menus are in the page as plain
 * links, without their SVG icons (tens of kilobytes of markup on every page).
 *
 * The body of a realm menu: the lead picture card, the realm's other pages under
 * short headings, then its quick picks (dungeon and raid paintings, classes,
 * professions, modes or collections). The same markup is the dropdown on wide
 * screens and the unfolded section in the phone sheet.
 */
const RealmMenu = memo(function RealmMenu({ realm, picks, lang, barePath, onNavigate, art }: {
  realm: NavigationRealm; picks: NavigationPicks; lang: Lang; barePath: string; onNavigate: (event: MouseEvent<HTMLAnchorElement>) => void;
  /** Paint the pictures (only once the reader reaches for a menu, not on page load). */
  art: boolean;
}) {
  const group = picks[realm.id];
  const items = group?.order ? group.order[lang].map((index) => group.picks[index]) : group?.picks;
  const groups = groupsFor(realm, lang);
  const featureHref = realm.feature ?? realm.hub;
  const feature = groups.flatMap(pages => pages.links).find(link => link.href === featureHref);
  const rest = groups.map(pages => ({ ...pages, links: pages.links.filter(link => link !== feature) })).filter(pages => pages.links.length > 0);
  return <div className={toolbarStyles.menu}>
    {feature && <FeatureCard link={feature} realm={realm} lang={lang} barePath={barePath} art={art} onNavigate={onNavigate} />}
    <div className={toolbarStyles.columns}>
      {rest.map((pages, index) => <div key={index} className={toolbarStyles.group}>
        {pages.title && <p className={toolbarStyles.caption}>{word(lang, pages.title)}</p>}
        <ul className={toolbarStyles.pages}>
          {pages.links.map(link => {
            const Icon = pageIcons[link.icon];
            return <li key={link.href}>
              <Link href={p(lang, link.href)} prefetch={false} className={toolbarStyles.page} onClick={onNavigate}
                aria-current={barePath === link.href ? "page" : undefined}>
                <span className={toolbarStyles.pageIcon}>{art && <Icon size={17} strokeWidth={1.75} aria-hidden="true" />}</span>
                <span className={toolbarStyles.pageText}>
                  <strong>{word(lang, link.label)}</strong>
                  {link.note && <small>{word(lang, link.note)}</small>}
                </span>
              </Link>
            </li>;
          })}
        </ul>
      </div>)}
      {group && items && <div className={toolbarStyles.group} data-picks={group.kind} data-count={items.length > 9 ? "many" : undefined}>
        {/* A heading that only repeats the tab's name is left out (Classes → classes). */}
        {word(lang, group.title) !== word(lang, realm.label) && <p className={toolbarStyles.caption}>{word(lang, group.title)}</p>}
        <ul className={toolbarStyles.picks} data-kind={group.kind}>
          {items.map(pick => {
            const Glyph = pick.glyph ? glyphIcons[pick.glyph] : null;
            return <li key={pick.href}>
              <Link href={p(lang, pick.href)} prefetch={false} className={toolbarStyles.pick} onClick={onNavigate}
                style={pick.tint ? { "--pick-tint": pick.tint } as CSSProperties : undefined}
                aria-current={barePath === pick.href ? "page" : undefined}>
                <span className={toolbarStyles.pickArt}>
                  {!art ? null : Glyph ? <Glyph size={18} strokeWidth={1.75} aria-hidden={true} />
                    : pick.image ? <Image src={pick.image} alt="" fill sizes={group.kind === "art" ? "56px" : "28px"} quality={50} unoptimized={pick.remote} /> : null}
                </span>
                <span className={toolbarStyles.pickLabel}>{word(lang, pick.label)}</span>
              </Link>
            </li>;
          })}
        </ul>
      </div>}
    </div>
  </div>;
});

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
/** The tab row's own stops: each section's button or plain link. */
const rowStops = (list: HTMLElement | null) => [...(list?.querySelectorAll<HTMLElement>(":scope > li > a, :scope > li > button") ?? [])];

/**
 * The sections. On wide screens a row of tabs: a section with several pages is
 * one button (label and chevron) that opens its menu on hover intent or press;
 * a section of one page is a plain link. In the sheet below 1180 px the same
 * list is a column of large rows, each unfolding its menu in place. Every menu
 * is in the server HTML (hidden until opened), so all its links are crawlable.
 */
const RealmNav = memo(function RealmNav({ path, lang, picks, rows, sheetState, onNavigate }: {
  path: string; lang: Lang; picks: NavigationPicks;
  /** Draw the sheet rows' section icons (the sheet has been prepared). */
  rows: boolean;
  /** The sheet's state: closed (and prepared) or open, it holds the current section unfolded. */
  sheetState: "open" | "closing" | "closed";
  onNavigate: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const ru = lang === "ru";
  const barePath = barePathOf(path);
  const current = currentRealm(barePath);
  const currentId = current?.realm.id ?? null;
  const [open, setOpen] = useState<OpenMenu | null>(null);
  // The menu that is fading out after a close or a switch (its exit animation, wide screens only).
  const [leaving, setLeaving] = useState<{ path: string; realm: string; swap?: boolean } | null>(null);
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
  const realms = realmsFor(lang, barePath);
  // The menus whose icons and pictures are drawn: each on its first hover, focus or opening,
  // so the first opening renders one menu, not all of them.
  const [warmed, setWarmed] = useState<ReadonlySet<string>>(() => new Set());
  const warm = (realm: string | null | undefined) => {
    if (realm) setWarmed(previous => previous.has(realm) ? previous : new Set(previous).add(realm));
  };

  const later = (action: () => void, delay: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(action, delay);
  };
  const show = (realm: string, by: OpenMenu["by"]) => {
    clearTimeout(timer.current);
    warm(realm);
    const from = openRealm !== realm && wide() && !lessMotion() ? openRealm : null;
    // A switch resizes the frame from the old menu's height (a read of the clean layout, before any write).
    swapFrom.current = from ? document.getElementById(`${id}-${from}`)?.offsetHeight ?? 0 : 0;
    leave(from, true);
    setOpen(previous => ({ path, realm, by, fresh: !(previous && previous.path === path) }));
  };
  /** The menu that fades out (a close, or a switch that hands its frame to the next one). */
  function leave(realm: string | null, swap?: boolean) {
    setLeaving(realm ? { path, realm, swap } : null);
    clearTimeout(exitTimer.current);
    if (realm) exitTimer.current = setTimeout(() => setLeaving(null), EXIT_MS);
  }
  const close = () => {
    clearTimeout(timer.current);
    if (openRealm && wide() && !lessMotion()) leave(openRealm);
    setOpen(null);
  };

  useEffect(() => {
    // Crossing into the wide bar drops the sheet's unfolded section (it would open as a dropdown).
    const query = window.matchMedia(WIDE);
    const change = () => { if (query.matches) setOpen(null); };
    query.addEventListener("change", change);
    return () => { clearTimeout(timer.current); clearTimeout(exitTimer.current); query.removeEventListener("change", change); };
  }, []);

  // Idle time draws the menus' icons and pictures ahead, one menu per idle slice, so the
  // first opening only shows a menu (rendering one at the press was a 60–130 ms task on a slow CPU).
  const realmIds = realms.map(realm => realm.id).join(" ");
  useEffect(() => {
    const idle = window as SheetIdle;
    if (!idle.requestIdleCallback) return;
    const queue = realmIds.split(" ");
    let handle = 0;
    const next = () => {
      const realm = queue.shift();
      if (!realm) return;
      handle = idle.requestIdleCallback!(() => { warm(realm); next(); }, { timeout: 6000 });
    };
    next();
    return () => idle.cancelIdleCallback?.(handle);
  }, [realmIds]);

  // An open menu or sheet stands above the cookie notice: the bar's own flag (a :has() over
  // the bar restyled all of it on every opening).
  const menuShown = Boolean(openRealm || leavingRealm);
  // (Below 1180 px the sheet carries its own flag; the section it holds unfolded is no dropdown.)
  useEffect(() => { root.current?.closest("header")?.toggleAttribute("data-menu-open", menuShown && wide()); }, [menuShown]);

  // One stable handler for every menu link, so the memoised menus stay still while the bar's state changes.
  const latest = useRef({ close, onNavigate });
  useLayoutEffect(() => { latest.current = { close, onNavigate }; });
  const navigate = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    latest.current.close();
    latest.current.onNavigate(event);
  }, []);

  // The sheet opens on the reader's section, unfolded (a plain section has nothing to unfold). It is
  // unfolded while the sheet is still closed and unseen, so the tap only shows the sheet; after a
  // close the sheet goes back to it.
  const currentHasMenu = Boolean(current && !isSingle(current.realm, lang, picks) && realms.includes(current.realm));
  useEffect(() => {
    if (wide() || sheetState === "closing") return;
    if ((rows || sheetState === "open") && currentId && currentHasMenu) {
      warm(currentId);
      setOpen(previous => previous?.path === path && previous.realm === currentId && sheetState === "open" ? previous : { path, realm: currentId, by: "press", fresh: true });
    }
    else if (sheetState === "closed") setOpen(null);
  }, [sheetState, rows, currentId, currentHasMenu, path]);

  useEffect(() => {
    if (!openRealm) return;
    const outside = (event: globalThis.PointerEvent) => {
      if (wide() && event.target instanceof Node && !root.current?.contains(event.target)) setOpen(null);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [openRealm]);

  // The frame of a switch grows or shrinks from the old menu's height to the new one's: a scale of
  // its own layer (FLIP). The new height is read once the menu is in the document, the read that
  // lays it out for the coming frame anyway.
  const swapFrom = useRef(0);
  useLayoutEffect(() => {
    const before = swapFrom.current;
    swapFrom.current = 0;
    const panel = openRealm ? document.getElementById(`${id}-${openRealm}`) : null;
    const after = panel?.offsetHeight;
    if (!before || !after || Math.abs(before - after) < 2 || typeof panel.animate !== "function") return;
    panel.animate([{ scale: `1 ${before / after}` }, { scale: "1 1" }], { duration: 150, easing: "cubic-bezier(.25, .46, .45, .94)", pseudoElement: "::before" });
  }, [openRealm, id]);

  // A menu opened from the keyboard takes focus once it is in the document.
  useLayoutEffect(() => {
    const edge = focusOnOpen.current;
    focusOnOpen.current = null;
    if (!edge || !openRealm) return;
    const items = menuItems(document.getElementById(`${id}-${openRealm}`));
    (edge === "first" ? items[0] : items.at(-1))?.focus();
  }, [openRealm, id]);

  const hover = (realm: string) => ({
    onPointerEnter: (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !wide()) return;
      warm(realm);
      if (openRealm === realm) clearTimeout(timer.current);
      // With a menu open, a neighbour takes over only when the pointer rests on it.
      else later(() => show(realm, "hover"), openRealm ? SWITCH_DELAY : OPEN_DELAY);
    },
    onPointerLeave: (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !wide()) return;
      if (!openRealm) clearTimeout(timer.current);
      else if (openMenu?.by === "hover") later(close, CLOSE_DELAY);
    },
  });
  // A plain tab under the pointer lets an open hover menu go after the same grace.
  const plainHover = {
    onPointerEnter: (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !wide()) return;
      if (!openRealm) clearTimeout(timer.current);
      else if (openMenu?.by === "hover") later(close, CLOSE_DELAY);
    },
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (event.key === "Escape") {
      // In the sheet Escape closes the sheet itself (MenuSheet).
      if (!openRealm || !wide()) return;
      event.preventDefault();
      event.stopPropagation();
      const toggle = list.current?.querySelector<HTMLButtonElement>(`[data-realm="${openRealm}"] > button`);
      close();
      toggle?.focus();
      return;
    }
    if (!wide()) return;
    const panel = target.closest<HTMLElement>("[data-menu-panel]");
    if (panel && (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End")) {
      // Up and down walk the open menu: the lead card, its pages, then its quick picks.
      event.preventDefault();
      const items = menuItems(panel);
      const at = items.indexOf(target);
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
        : (at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
      return;
    }
    const stops = rowStops(list.current);
    const at = stops.indexOf(target);
    if (panel || at < 0) return;
    const realm = target.closest<HTMLElement>("li[data-realm]")?.dataset.realm;
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && target.tagName === "BUTTON" && realm) {
      event.preventDefault();
      if (openRealm === realm) {
        const items = menuItems(document.getElementById(`${id}-${realm}`));
        (event.key === "ArrowDown" ? items[0] : items.at(-1))?.focus();
      } else {
        focusOnOpen.current = event.key === "ArrowDown" ? "first" : "last";
        show(realm, "press");
      }
    } else if (event.key === "ArrowRight" || event.key === "ArrowLeft" || event.key === "Home" || event.key === "End") {
      // Left and right walk the row; Home and End jump to its ends.
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? stops.length - 1
        : (at + (event.key === "ArrowRight" ? 1 : -1) + stops.length) % stops.length;
      stops[next]?.focus();
    }
  };

  return <nav ref={root} className={toolbarStyles.tabs} aria-label={ru ? "Основная навигация" : "Main navigation"}
    onBlur={(event: FocusEvent) => { if (openRealm && wide() && !event.currentTarget.contains(event.relatedTarget)) close(); }}
    onFocus={(event: FocusEvent) => {
      const owner = (event.target as HTMLElement).closest<HTMLElement>("li[data-realm]")?.dataset.realm;
      warm(owner);
      // Focus moving on to another tab lets an open menu go (Tab out of its last link).
      if (!openRealm || !wide()) return;
      if (owner !== openRealm) close();
    }}
    onKeyDown={onKeyDown}>
    <ul ref={list}>
      {realms.map(realm => {
        const isOpen = openRealm === realm.id;
        const isLeaving = leavingRealm === realm.id;
        const isCurrent = currentId === realm.id;
        const label = word(lang, realm.label);
        if (isSingle(realm, lang, picks)) return <li key={realm.id} data-realm={realm.id} data-single data-current={isCurrent || undefined} {...plainHover}>
          <Link href={p(lang, realm.hub)} prefetch={false} className={toolbarStyles.tab} onClick={navigate}
            aria-current={barePath === realm.hub ? "page" : isCurrent ? "true" : undefined}>
            {rows && <RealmIcon id={realm.id} size={19} />}<span className={toolbarStyles.tabLabel}>{label}</span>
          </Link>
        </li>;
        return <li key={realm.id} data-realm={realm.id} data-open={isOpen || undefined} data-current={isCurrent || undefined} {...hover(realm.id)}>
          <button type="button" className={toolbarStyles.tab} aria-expanded={isOpen} aria-controls={`${id}-${realm.id}`}
            aria-current={isCurrent ? "true" : undefined}
            onClick={event => {
              // A click on a menu the hover has just opened pins it instead of closing it again.
              if (isOpen && openMenu?.by === "hover" && event.detail > 0) setOpen({ ...openMenu, by: "press" });
              else if (isOpen) close();
              else show(realm.id, "press");
            }}>
            {rows && <RealmIcon id={realm.id} size={19} />}<span className={toolbarStyles.tabLabel}>{label}</span>
            <ChevronDown className={toolbarStyles.chevron} size={14} strokeWidth={2} aria-hidden="true" />
          </button>
          <div id={`${id}-${realm.id}`} className={toolbarStyles.panel} data-menu-panel hidden={!(isOpen || isLeaving)}
            data-swap-out={(isLeaving && leaving?.swap) || undefined}
            data-state={isOpen ? "open" : "closed"} data-enter={(isOpen && openMenu?.fresh) || undefined}
            inert={(!isOpen && isLeaving) || undefined}>
            <RealmMenu realm={realm} picks={picks} lang={lang} barePath={barePath} art={warmed.has(realm.id)} onNavigate={navigate} />
          </div>
        </li>;
      })}
    </ul>
  </nav>;
});

/** Real account state (GET /api/auth/status): "Sign in" or the Battle.net name. */
function Account({ lang, reuse = false }: { lang: Lang; reuse?: boolean }) {
  return <AccountChip lang={lang} className={toolbarStyles.account} avatarClassName={toolbarStyles.accountAvatar}
    labelClassName={toolbarStyles.accountLabel} avatarContent={<UserRound size={15} strokeWidth={2} />} initial reuse={reuse} />;
}

/** The sheet starts at the bar's lower edge. */
const placeSheet = (header: HTMLElement | null) => {
  header?.style.setProperty("--sheet-top", `${Math.max(0, Math.round(header.getBoundingClientRect().bottom))}px`);
};

type SheetIdle = Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number; cancelIdleCallback?: (handle: number) => void };
type CloseWatcherLike = { onclose: (() => void) | null; destroy: () => void };
type CloseWatcherWindow = Window & { CloseWatcher?: new () => CloseWatcherLike };

/** The visible focusable controls inside an element, in order. */
const focusables = (host: Element | null) => [...(host?.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input, [tabindex]:not([tabindex='-1'])") ?? [])]
  .filter(element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden");

/**
 * Below 1180 px: every section in one sheet under the bar — search and the game
 * versions on top, the sections as large rows that unfold, the account and the
 * language at the foot (phones; tablets keep those in the bar). The section rows
 * are the tab row's own markup, already in the page; the sheet only shows them.
 * While it is open the page under it holds still, focus stays in the bar and the
 * sheet, and Escape (or the system back gesture, where the browser has
 * CloseWatcher) closes it.
 */
function useMenuSheet(path: string, bar: RefObject<HTMLElement | null>) {
  const [openOn, setOpenOn] = useState<string | null>(null);
  // The sheet's own head and foot (and its rows' icons) mount when the page is idle,
  // or on the first reach for the button, so the tap only shows them.
  const [built, setBuilt] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const open = openOn === path;
  const sheet = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const id = useId();

  const openRef = useRef(open);
  useLayoutEffect(() => { openRef.current = open; });
  const close = useCallback((focusTrigger = false) => {
    if (!openRef.current) return;
    if (!lessMotion()) {
      setLeaving(true);
      clearTimeout(exitTimer.current);
      exitTimer.current = setTimeout(() => setLeaving(false), EXIT_MS);
    }
    setOpenOn(null);
    if (focusTrigger) trigger.current?.focus();
  }, []);
  const toggle = () => {
    if (open) { close(); return; }
    setBuilt(true);
    placeSheet(bar.current);
    setLeaving(false);
    setOpenOn(path);
  };
  const prepare = () => setBuilt(true);

  useEffect(() => {
    if (built || wide()) return;
    const idle = window as SheetIdle;
    if (idle.requestIdleCallback) {
      const handle = idle.requestIdleCallback(() => setBuilt(true), { timeout: 4000 });
      return () => idle.cancelIdleCallback?.(handle);
    }
    const handle = setTimeout(() => setBuilt(true), 2000);
    return () => clearTimeout(handle);
  }, [built]);

  useEffect(() => () => clearTimeout(exitTimer.current), []);

  // A link in the sheet closes it (a modified click opens a tab and leaves it open).
  const navigate = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    close();
  }, [close]);

  useEffect(() => {
    if (!open) return;
    const host = sheet.current;
    // Focus moves into the sheet: its first control that takes it (the search field on phones, the
    // first section on tablets), without measuring every control of the sheet on the tap.
    for (const target of host?.querySelectorAll<HTMLElement>("[data-sheet-first], nav li > :is(a, button)") ?? []) {
      target.focus({ preventScroll: true });
      if (document.activeElement === target) break;
    }
    const header = bar.current;
    // The page under the sheet stays put: the sheet contains its own scroll
    // (overscroll-behavior) and a drag anywhere else is held. No overflow lock
    // on <html>: that relaid the whole page out on the tap.
    const hold = (event: Event) => {
      const target = event.target instanceof Node ? event.target : null;
      const scroller = host?.querySelector<HTMLElement>("[data-sheet-scroll]");
      if (!target || !scroller?.contains(target) || scroller.scrollHeight <= scroller.clientHeight) event.preventDefault();
    };
    const outside = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Node && !header?.contains(event.target)) close();
    };
    const resize = () => { if (wide()) close(); else placeSheet(header); };
    // Escape anywhere closes it; Tab and Shift+Tab stay inside the bar and the sheet.
    const keys = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(true); return; }
      if (event.key !== "Tab") return;
      const stops = focusables(header);
      if (!stops.length) return;
      const at = stops.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && at <= 0) { event.preventDefault(); stops.at(-1)?.focus(); }
      else if (!event.shiftKey && (at === stops.length - 1 || at < 0)) { event.preventDefault(); stops[0]?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("touchmove", hold, { passive: false });
    document.addEventListener("wheel", hold, { passive: false });
    document.addEventListener("keydown", keys);
    window.addEventListener("resize", resize);
    // The system back gesture closes the sheet, not the page (Chromium's CloseWatcher; elsewhere Escape).
    const Watcher = (window as CloseWatcherWindow).CloseWatcher;
    let watcher: CloseWatcherLike | null = null;
    try { watcher = Watcher ? new Watcher() : null; } catch { watcher = null; }
    if (watcher) watcher.onclose = () => close(true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("touchmove", hold);
      document.removeEventListener("wheel", hold);
      document.removeEventListener("keydown", keys);
      window.removeEventListener("resize", resize);
      watcher?.destroy();
    };
  }, [open, close, bar]);

  const state: "open" | "closing" | "closed" = open ? "open" : leaving ? "closing" : "closed";
  useEffect(() => { bar.current?.toggleAttribute("data-sheet-open", state !== "closed"); }, [state, bar]);
  return { sheetRef: sheet, triggerRef: trigger, sheet: { id, open, state, built, toggle, prepare, close, navigate } };
}

type Sheet = ReturnType<typeof useMenuSheet>["sheet"];

function MenuButton({ sheet, triggerRef, lang }: { sheet: Sheet; triggerRef: RefObject<HTMLButtonElement | null>; lang: Lang }) {
  const ru = lang === "ru";
  return <button ref={triggerRef} type="button" className={toolbarStyles.menuButton} aria-controls={sheet.id} aria-expanded={sheet.open}
    aria-label={ru ? (sheet.open ? "Закрыть меню" : "Открыть меню") : (sheet.open ? "Close menu" : "Open menu")}
    onPointerDown={sheet.prepare} onFocus={sheet.prepare} onClick={sheet.toggle}>
    <Menu className={toolbarStyles.menuIcon} data-icon="open" size={20} aria-hidden="true" />
    <X className={toolbarStyles.menuIcon} data-icon="close" size={20} aria-hidden="true" />
  </button>;
}

/** On wide screens the sheet is only the tab row's frame (display: contents); below, the sheet itself. */
function MenuSheet({ sheet, sheetRef, path, lang, picks }: { sheet: Sheet; sheetRef: RefObject<HTMLDivElement | null>; path: string; lang: Lang; picks: NavigationPicks }) {
  const ru = lang === "ru";
  return <>
    {/* The scrim beside the tablet drawer; a tap on it closes the sheet. */}
    <div className={toolbarStyles.scrim} data-state={sheet.state} aria-hidden="true" onClick={() => sheet.close()} />
    <div ref={sheetRef} id={sheet.id} className={toolbarStyles.sheet} data-sheet data-state={sheet.state}>
      <div className={toolbarStyles.sheetScroll} data-sheet-scroll>
        {sheet.built && <div className={toolbarStyles.sheetHead}>
          <button type="button" className={toolbarStyles.sheetSearch} data-sheet-first
            onClick={() => { sheet.close(); window.dispatchEvent(new CustomEvent(OPEN_SITE_SEARCH)); }}>
            <Search size={18} strokeWidth={1.9} aria-hidden="true" /><span>{ru ? "Поиск" : "Search"}</span>
          </button>
          <WowVersionStrip variant="sheet" />
        </div>}
        <RealmNav path={path} lang={lang} picks={picks} rows={sheet.built} sheetState={sheet.state} onNavigate={sheet.navigate} />
        {sheet.built && <div className={toolbarStyles.sheetFoot}>
          <Account lang={lang} reuse />
          <LocaleSwitch path={path} lang={lang} />
        </div>}
      </div>
    </div>
  </>;
}

/**
 * The bar casts a shadow once the page scrolls under it; on wide screens the
 * brand row scrolls away (the bar is sticky above its own top) and the tab row,
 * now the whole bar, takes the crest and a search button (data-compact). The
 * flags are written on the element: a React state re-rendered the whole bar on
 * the frame they changed.
 */
function useScrolledFlag(bar: RefObject<HTMLElement | null>) {
  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      const header = bar.current;
      if (!header) return;
      header.toggleAttribute("data-scrolled", window.scrollY > 8);
      // The bar sticks with its 56 px brand row scrolled off (wide screens; below, it sticks at 0).
      header.toggleAttribute("data-compact", header.getBoundingClientRect().top < -54);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(read); };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); cancelAnimationFrame(frame); };
  }, [bar]);
}

/** The command bar: brand, game versions, search, language and account on top; the sections below (or in the sheet). */
export function WorkspaceNavigatorContent({ picks }: { picks: NavigationPicks }) {
  const livePath = useToolbarPath();
  const ru = /^\/ru(?:\/|$)/.test(livePath);
  const lang: Lang = ru ? "ru" : "en";
  const bar = useRef<HTMLElement>(null);
  useScrolledFlag(bar);
  const { sheet, sheetRef, triggerRef } = useMenuSheet(livePath, bar);
  const home = ru ? "WowArcana — главная" : "WowArcana — home";

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
        aria-current={barePathOf(livePath) === "/" ? "page" : undefined} aria-label={home}>
        <GildraCrest height={32} className={toolbarStyles.sigil} eager /><span>WOWARCANA</span>
      </Link>
      <span className={toolbarStyles.divider} aria-hidden="true" />
      <div className={toolbarStyles.versions}><WowVersionStrip /></div>
      <div className={toolbarStyles.search}><SiteSearch lang={lang} /></div>
      <div className={toolbarStyles.end}>
        <span className={toolbarStyles.localeSlot}><LocaleSwitch path={livePath} lang={lang} /></span>
        <span className={toolbarStyles.accountSlot}><Account lang={lang} /></span>
        <MenuButton sheet={sheet} triggerRef={triggerRef} lang={lang} />
      </div>
    </div>
    <MenuSheet sheet={sheet} sheetRef={sheetRef} path={livePath} lang={lang} picks={picks} />
    {/* The compact bar's crest and search (wide screens, brand row scrolled away): pointer
        shortcuts only — the brand link and the search field above stay the keyboard's stops. */}
    <div className={toolbarStyles.compact} aria-hidden="true">
      <Link href={p(lang, "/")} prefetch={false} tabIndex={-1} className={toolbarStyles.compactCrest} aria-label={home}>
        <GildraCrest height={26} className={toolbarStyles.sigil} />
      </Link>
      <button type="button" tabIndex={-1} className={toolbarStyles.compactSearch} aria-label={ru ? "Поиск" : "Search"}
        onClick={() => window.dispatchEvent(new CustomEvent(OPEN_SITE_SEARCH))}>
        <Search size={17} strokeWidth={1.9} />
      </button>
    </div>
  </header>;
}
