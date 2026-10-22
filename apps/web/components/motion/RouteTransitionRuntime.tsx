"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { preconnect } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { isBookPagePath, isCharacterAuthRedirect, navigationDirection, routeTransitionKind, type RouteTransitionKind } from "./routeTransitionPolicy";
import { RouteThemeController } from "./RouteThemeController";
import styles from "./routeTransition.module.css";
import { lessMotion } from "@/lib/client/motionPreference";
import { captureMorphArt, playMorphArt, type MorphArtSource } from "@gildra/atlas-ui/morph";
import { resolveRenderTier, warmRenderTier } from "@gildra/atlas-ui/motionTier";
import { GildraCrest } from "@/components/brand/GildraCrest";

/**
 * Persistent navigation shell and the single owner of page hand-overs
 * (routeTransitionKind): a quick atlas hand-over on every public page. Loading,
 * watchdogs and route identity stay independent of the visual phases.
 */
type RouteState = "idle" | "leaving" | "loading";
type Direction = ReturnType<typeof navigationDirection>;

// The rune veil hand-over. A clicked link does not swap the page at once: a dark
// veil with a lit edge of runes sweeps over it from the side of the movement
// (deeper: from the right, up/back: from the left, siblings: from below) while the
// next page is fetched, then sweeps on and uncovers the new page, whose hero
// arrives in a cascade. The veil is one fixed layer moved by transform, so the
// whole hand-over (~0.55 s when the page is ready) stays on the compositor; a page
// that takes longer holds the veil with the Gildra crest as its loading screen.
// The new page itself opens out of the point the reader touched, and a ring of
// light in the theme's accent bursts from the same point.
const ENTER: KeyframeAnimationOptions = { duration: 520, easing: "cubic-bezier(.16, 1, .3, 1)" };
const ENTER_FROM: Record<Direction, string> = { deeper: "translate3d(48px, 0, 0) scale(.97)", up: "translate3d(-48px, 0, 0) scale(.97)", across: "translate3d(0, 32px, 0) scale(.97)" };
/** The veil comes in fast and accelerating (a closing gate) and leaves decelerating. */
const COVER: KeyframeAnimationOptions = { duration: 210, easing: "cubic-bezier(.65, 0, .85, .25)" };
const COVER_PHONE: KeyframeAnimationOptions = { ...COVER, duration: 180 };
const REVEAL: KeyframeAnimationOptions = { duration: 380, easing: "cubic-bezier(.2, .75, .25, 1)" };
/** The veil waits outside the screen on the side it comes from and leaves on the other one (its lit edge included). */
const VEIL_OUT: Record<Direction, { from: string; to: string; axis: "x" | "y" }> = {
  deeper: { from: "translate3d(calc(100% + 160px), 0, 0)", to: "translate3d(calc(-100% - 160px), 0, 0)", axis: "x" },
  up: { from: "translate3d(calc(-100% - 160px), 0, 0)", to: "translate3d(calc(100% + 160px), 0, 0)", axis: "x" },
  across: { from: "translate3d(0, calc(100% + 160px), 0)", to: "translate3d(0, calc(-100% - 160px), 0)", axis: "y" },
};
/** A page still loading under the veil shows the crest after this long… */
const CREST_AFTER_MS = 240;
/** …and its skeleton (loading.tsx) is uncovered after this long, so a slow page never hides behind the veil. */
const VEIL_HOLD_MS = 1100;
/** Ring burst: from a spark at the point of the click to beyond the farthest corner. */
const RING_SIZE = 160;
const BURST: KeyframeAnimationOptions = { duration: 640, easing: "cubic-bezier(.2, .8, .25, 1)" };
type Origin = { x: number; y: number };
/** Give up on a navigation that never commits (aborted, offline). */
const WATCHDOG_MS = 12000;
/** How long the arrival cascade marker stays on the frame (longest hero/section delay + duration). */
const ARRIVAL_MS = 1300;
// In development, prefetching a route can make Next compile it before the
// user navigates there. Keep that CPU work out of the active page interaction.
// Literal NODE_ENV: the bundler inlines it in the browser (see routePrefetch in lib/flags.ts).
const routePrefetchEnabled = process.env.NODE_ENV !== "development";

function destinationFromTarget(target: EventTarget | null, includeOptOut = false) {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest<HTMLAnchorElement>("a[href]");
  if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")
    || anchor.getAttribute("aria-disabled") === "true" || anchor.closest("[inert]")
    || (!includeOptOut && anchor.hasAttribute("data-no-book-transition")) || anchor.rel.split(/\s+/).includes("external")) return null;
  const destination = new URL(anchor.href, window.location.href);
  if (destination.origin !== window.location.origin || !/^https?:$/.test(destination.protocol)
    || !isBookPagePath(destination.pathname)) return null;
  return destination;
}

function explicitDestinationFromTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const control = target.closest<HTMLElement>("[data-book-navigation-target]");
  const href = control?.dataset.bookNavigationTarget;
  if (!href) return null;
  const destination = new URL(href, window.location.href);
  if (destination.origin !== window.location.origin || !isBookPagePath(destination.pathname)) return null;
  return destination;
}

function clickDestination(event: MouseEvent, includeOptOut = false) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  return destinationFromTarget(event.target, includeOptOut);
}

const reducedMotion = () => lessMotion();
const phone = () => matchMedia("(max-width: 720px)").matches;
/** Valyro's render tier (QA can pin it with <html data-route-tier="gpu|cpu">): a CPU-composited machine gets the one-layer dissolve. */
const renderTier = () => resolveRenderTier((document.documentElement.dataset.routeTier as "gpu" | "cpu" | undefined) ?? "auto");
/** The CPU variant: the veil fades in and out in place, without its moving edges. */
const DISSOLVE_IN: KeyframeAnimationOptions = { duration: 150, easing: "ease-in" };
const DISSOLVE_OUT: KeyframeAnimationOptions = { duration: 260, easing: "ease-out" };

/** Where the hand-over starts: the pointer, or the centre of a keyboard-activated link. */
function originOf(event: MouseEvent, anchor: Element | null): Origin | null {
  if (event.detail > 0 && (event.clientX || event.clientY)) return { x: event.clientX, y: event.clientY };
  const box = anchor?.getBoundingClientRect();
  return box && box.width ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null;
}

/** Scale that carries the ring from `origin` past the farthest corner of the viewport. */
function burstScale(origin: Origin) {
  const far = Math.hypot(Math.max(origin.x, innerWidth - origin.x), Math.max(origin.y, innerHeight - origin.y));
  return (far * 2) / RING_SIZE;
}


/** One shell survives App Router navigation. Page content never gets an artificial remount key. */
export function RouteTransitionRuntime({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const routePath = pathname.replace(/^\/ru(?=\/|$)/, "") || "/";
  if (/^\/wow\/mythic\/[^/]+\/?$/.test(routePath) || /^\/wow\/mythic-plus\/[^/]+\/[^/]+\/?$/.test(routePath)) {
    preconnect("https://render.worldofwarcraft.com");
  }
  const router = useRouter();
  const frameRef = useRef<HTMLDivElement>(null);
  const committedPath = useRef(pathname);
  const poppedHistory = useRef(false);
  const expectedPath = useRef(pathname);
  const quietPath = useRef<string | null>(null);
  /** The hand-over planned by the click/history event for `expectedPath`. */
  const plannedKind = useRef<RouteTransitionKind>("still");
  const morphSource = useRef<MorphArtSource | null>(null);
  const origin = useRef<Origin | null>(null);
  const ringRef = useRef<HTMLSpanElement>(null);
  const veilRef = useRef<HTMLDivElement>(null);
  /** The destination waiting for the veil to close (a later click replaces it, Escape drops it). */
  const pendingHref = useRef<{ href: string; scroll: boolean } | null>(null);
  const veilTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const watchdog = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const arrival = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [state, setState] = useState<RouteState>("idle");

  const clearVeilTimers = useCallback(() => { veilTimers.current.splice(0).forEach(clearTimeout); }, []);

  /** The veil sweeps on and uncovers whatever is under it now. */
  const revealVeil = useCallback((direction: Direction) => {
    const veil = veilRef.current;
    if (!veil || veil.dataset.veil !== "covered") return false;
    clearVeilTimers();
    veil.dataset.veil = "revealing";
    delete veil.dataset.waiting;
    const out = VEIL_OUT[direction];
    veil.dataset.axis = out.axis;
    veil.getAnimations().forEach((animation) => animation.cancel());
    // Held at the far side until hidden, so the finished sweep never flashes back over the page.
    const away = veil.dataset.tier === "cpu"
      ? veil.animate([{ opacity: 1 }, { opacity: 0 }], { ...DISSOLVE_OUT, fill: "forwards" })
      : veil.animate([{ transform: "translate3d(0, 0, 0)" }, { transform: out.to }], { ...REVEAL, fill: "forwards" });
    away.finished.then(() => {
      if (veil.dataset.veil !== "revealing") return;
      delete veil.dataset.veil;
      away.cancel();
    }, () => {});
    return true;
  }, [clearVeilTimers]);

  /** A hand-over that never completes (aborted, Escape, offline): the veil fades and the page stays. */
  const dropVeil = useCallback(() => {
    pendingHref.current = null;
    clearVeilTimers();
    const veil = veilRef.current;
    if (!veil?.dataset.veil || veil.dataset.veil === "revealing") return;
    veil.dataset.veil = "revealing";
    delete veil.dataset.waiting;
    veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: "ease-out", fill: "forwards" }).finished.then(() => {
      if (veil.dataset.veil !== "revealing") return;
      delete veil.dataset.veil;
      veil.getAnimations().forEach((animation) => animation.cancel());
    }, () => {});
  }, [clearVeilTimers]);

  const settle = useCallback(() => {
    clearTimeout(watchdog.current);
    dropVeil();
    morphSource.current = null;
    origin.current = null;
    // A charged portal that never opens (aborted, same page) fades with the navigation.
    ringRef.current?.getAnimations().forEach((animation) => animation.cancel());
    plannedKind.current = "still";
    setState("idle");
  }, [dropVeil]);

  /** The new page is in place: hand it over (unless the reader asked for less motion). */
  const enter = useCallback((direction: Direction) => {
    clearTimeout(watchdog.current);
    setState("idle");
    plannedKind.current = "still";
    const frame = frameRef.current;
    const morph = morphSource.current;
    morphSource.current = null;
    const from = origin.current;
    origin.current = null;
    if (!frame) return;
    // A dimming transition that started on the old page must not finish on the new one.
    frame.getAnimations().forEach((animation) => animation.cancel());
    if (reducedMotion()) { dropVeil(); return; }
    // A navigation the veil did not close over (history, a script) still passes
    // through it: the veil stands over the new page for a frame and sweeps on.
    const veil = veilRef.current;
    if (veil && veil.dataset.veil !== "covered") {
      pendingHref.current = null;
      veil.dataset.tier = renderTier();
      veil.getAnimations().forEach((animation) => animation.cancel());
      veil.dataset.veil = "covered";
    }
    revealVeil(direction);
    // The page opens out of the touched point (in frame coordinates, after scroll restoration).
    const box = frame.getBoundingClientRect();
    const transformOrigin = from ? `${from.x - box.left}px ${from.y - box.top}px` : `50% ${Math.max(0, -box.top) + innerHeight / 3}px`;
    frame.animate([
      { opacity: .3, transform: ENTER_FROM[direction], transformOrigin },
      { opacity: 1, transform: "none", transformOrigin },
    ], ENTER);
    const ring = ringRef.current;
    if (ring && from) {
      ring.getAnimations().forEach((animation) => animation.cancel());
      ring.style.left = `${from.x}px`;
      ring.style.top = `${from.y}px`;
      ring.animate([
        { opacity: 0, transform: "translate(-50%, -50%) scale(.15)" },
        { opacity: 1, transform: "translate(-50%, -50%) scale(.6)", offset: .12 },
        { opacity: 0, transform: `translate(-50%, -50%) scale(${burstScale(from)})` },
      ], BURST);
    }
    clearTimeout(arrival.current);
    frame.dataset.routeArrived = "";
    arrival.current = setTimeout(() => { delete frame.dataset.routeArrived; }, ARRIVAL_MS);
    // Measure the scene after the router has restored the scroll position.
    if (morph) requestAnimationFrame(() => playMorphArt(morph, frame));
  }, [dropVeil, revealVeil]);

  /** A route with loading.tsx first commits its skeleton; wait for the real page. */
  const pendingArrival = useRef<{ kind: RouteTransitionKind; direction: Direction }>({ kind: "page", direction: "across" });
  const enterWhenLoaded = useCallback(() => {
    if (frameRef.current?.querySelector("[data-book-route-loading]")) {
      setState("loading");
      // The crest holds the screen for a moment; a slow page then shows its skeleton.
      veilTimers.current.push(setTimeout(() => revealVeil(pendingArrival.current.direction), VEIL_HOLD_MS));
    } else enter(pendingArrival.current.direction);
  }, [enter, revealVeil]);


  const begin = useCallback((destination: string, anchor?: Element | null, from?: Origin | null) => {
    const kind = routeTransitionKind(committedPath.current, destination);
    if (kind === "still") {
      expectedPath.current = committedPath.current;
      settle();
      return;
    }
    expectedPath.current = destination;
    quietPath.current = null;
    plannedKind.current = kind;
    morphSource.current = kind === "page" && anchor && !reducedMotion() ? captureMorphArt(anchor) : null;
    origin.current = from ?? null;
    const frame = frameRef.current;
    if (frame && from) {
      const box = frame.getBoundingClientRect();
      frame.style.setProperty("--route-origin", `${from.x - box.left}px ${from.y - box.top}px`);
    }
    const ring = ringRef.current;
    if (ring && from && !reducedMotion()) {
      // The portal charges where the reader touched while the next page is on its way.
      ring.getAnimations().forEach((animation) => animation.cancel());
      ring.style.left = `${from.x}px`;
      ring.style.top = `${from.y}px`;
      ring.animate([
        { opacity: 0, transform: "translate(-50%, -50%) scale(.05)" },
        { opacity: .9, transform: "translate(-50%, -50%) scale(.28)" },
      ], { duration: 260, easing: "cubic-bezier(.2, .8, .25, 1)", fill: "forwards" });
    }
    setState("leaving");
    clearTimeout(watchdog.current);
    watchdog.current = setTimeout(settle, WATCHDOG_MS);
  }, [settle]);

  /**
   * A clicked link: the veil closes over the page while the next one is fetched,
   * then the router goes. Returns false when the click should navigate at once.
   */
  const sweep = useCallback((destination: URL, anchor: HTMLAnchorElement, from: Origin | null) => {
    const veil = veilRef.current;
    const href = destination.pathname + destination.search + destination.hash;
    if (!veil || reducedMotion() || routeTransitionKind(committedPath.current, destination.pathname) !== "page") return false;
    const keepScroll = anchor.dataset.routeScroll === "keep";
    if (routePrefetchEnabled) router.prefetch(destination.pathname + destination.search);
    begin(destination.pathname, anchor, from);
    pendingHref.current = { href, scroll: !keepScroll };
    const go = () => {
      const next = pendingHref.current;
      if (!next) return;
      pendingHref.current = null;
      router.push(next.href, { scroll: next.scroll });
      veilTimers.current.push(setTimeout(() => { if (veil.dataset.veil === "covered") veil.dataset.waiting = ""; }, CREST_AFTER_MS));
    };
    if (veil.dataset.veil === "covered") { go(); return true; }
    const out = VEIL_OUT[navigationDirection(committedPath.current, destination.pathname, false)];
    clearVeilTimers();
    if (veil.dataset.veil === "covering") return true; // already closing: the new destination waits for it
    veil.getAnimations().forEach((animation) => animation.cancel());
    veil.dataset.axis = out.axis;
    veil.dataset.tier = renderTier();
    veil.dataset.veil = "covering";
    const close = veil.dataset.tier === "cpu"
      ? veil.animate([{ opacity: 0 }, { opacity: 1 }], { ...DISSOLVE_IN, fill: "forwards" })
      : veil.animate([{ transform: out.from }, { transform: "translate3d(0, 0, 0)" }], { ...(phone() ? COVER_PHONE : COVER), fill: "forwards" });
    close.finished.then(() => {
      if (veil.dataset.veil !== "covering") return;
      veil.dataset.veil = "covered";
      go();
    }, () => {});
    return true;
  }, [begin, clearVeilTimers, router]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") settle(); };
    const timers = veilTimers.current;
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("keydown", escape);
      clearTimeout(watchdog.current);
      clearTimeout(arrival.current);
      timers.forEach(clearTimeout);
    };
  }, [settle]);

  // Skeleton → page: the loading marker disappears from the frame.
  useEffect(() => {
    if (state !== "loading" || !frameRef.current) return;
    const observer = new MutationObserver(enterWhenLoaded);
    observer.observe(frameRef.current, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-book-route-loading"] });
    return () => observer.disconnect();
  }, [state, enterWhenLoaded]);

  useLayoutEffect(() => {
    if (pathname === committedPath.current) return;
    const from = committedPath.current;
    committedPath.current = pathname;
    const direction = navigationDirection(from, pathname, poppedHistory.current);
    poppedHistory.current = false;
    if (isCharacterAuthRedirect(from, pathname) && expectedPath.current === from) {
      // A protected character page resolved through the sign-in redirect: same turn.
      expectedPath.current = pathname;
      pendingArrival.current = { kind: plannedKind.current, direction };
      enterWhenLoaded();
      return;
    }
    expectedPath.current = pathname;
    if (quietPath.current === pathname) {
      quietPath.current = null;
      settle();
      return;
    }
    // Router.push/replace and history also land here; language switches stay still.
    const kind = routeTransitionKind(from, pathname);
    if (kind === "still") { settle(); return; }
    pendingArrival.current = { kind: "page", direction };
    enterWhenLoaded();
  }, [pathname, enterWhenLoaded, settle]);

  useEffect(() => {
    const capture = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const destination = clickDestination(event, true) ?? explicitDestinationFromTarget(event.target);
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (destination && anchor?.hasAttribute("data-no-book-transition")) {
        // Remember the intent so the eventual App Router commit stays quiet too.
        expectedPath.current = destination.pathname;
        quietPath.current = destination.pathname;
        settle();
      } else if (destination) {
        const from = originOf(event, anchor);
        // Links sweep the rune veil first (Next's Link skips a click whose default
        // is prevented, after running the link's own onClick); other controls go now.
        if (anchor instanceof HTMLAnchorElement && destination.pathname + destination.search !== window.location.pathname + window.location.search
          && sweep(destination, anchor, from)) event.preventDefault();
        else begin(destination.pathname, anchor, from);
      }
    };
    const navigateAnchor = (event: MouseEvent) => {
      if (event.defaultPrevented) return; // Next Link and local handlers already own navigation.
      const destination = clickDestination(event, true);
      if (!destination || (destination.pathname === window.location.pathname && destination.search === window.location.search)) return;
      event.preventDefault();
      router.push(destination.pathname + destination.search + destination.hash);
    };
    const history = () => { poppedHistory.current = true; begin(window.location.pathname); };
    let prefetchTimer: ReturnType<typeof setTimeout> | undefined;
    const warm = (event: PointerEvent | FocusEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (event instanceof PointerEvent && anchor && event.relatedTarget instanceof Node && anchor.contains(event.relatedTarget)) return;
      const destination = destinationFromTarget(event.target);
      if (!destination || routeTransitionKind(committedPath.current, destination.pathname) === "still") return;
      clearTimeout(prefetchTimer);
      prefetchTimer = setTimeout(() => router.prefetch(destination.pathname + destination.search), event.type === "focusin" ? 0 : 100);
    };
    const cancelWarm = (event: PointerEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (anchor && event.relatedTarget instanceof Node && anchor.contains(event.relatedTarget)) return;
      clearTimeout(prefetchTimer);
    };
    document.addEventListener("click", capture, true);
    window.addEventListener("popstate", history);
    // Intent prefetch still matters for menu links that opt out of Next Link's automatic prefetch.
    if (routePrefetchEnabled) {
      document.addEventListener("pointerover", warm, true);
      document.addEventListener("pointerout", cancelWarm, true);
      document.addEventListener("focusin", warm, true);
    }
    document.addEventListener("click", navigateAnchor);
    // Valyro's GPU probe runs once, when the browser is idle, not on the first click.
    warmRenderTier();
    // Hydrated and intercepting: browser QA waits for this marker before clicking.
    const frame = frameRef.current;
    if (frame) frame.dataset.routeReady = "";
    return () => {
      if (frame) delete frame.dataset.routeReady;
      document.removeEventListener("click", capture, true);
      window.removeEventListener("popstate", history);
      if (routePrefetchEnabled) {
        document.removeEventListener("pointerover", warm, true);
        document.removeEventListener("pointerout", cancelWarm, true);
        document.removeEventListener("focusin", warm, true);
      }
      document.removeEventListener("click", navigateAnchor);
      clearTimeout(prefetchTimer);
    };
  }, [begin, router, settle, sweep]);

  const active = state !== "idle";
  return <div className={styles.system} data-theme="wow" data-book-navigation={active ? "turn" : "idle"} data-route-state={state}>
    <RouteThemeController />
    <span className={styles.progress} aria-hidden="true" />
    <span className={styles.spark} aria-hidden="true" />
    <span ref={ringRef} className={styles.portalRing} aria-hidden="true" />
    <div className={styles.veilPort} aria-hidden="true">
      <div ref={veilRef} className={styles.veil}>
        <span className={styles.veilRunes} data-edge="start" />
        <span className={styles.veilRunes} data-edge="end" />
        <span className={styles.veilCrest}><GildraCrest height={88} /></span>
      </div>
    </div>
    <div className={styles.frame} data-theme="wow" ref={frameRef} data-book-route-frame data-route-state={state} aria-busy={active || undefined}>
      {children}
    </div>
  </div>;
}
