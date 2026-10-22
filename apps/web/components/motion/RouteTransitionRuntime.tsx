"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { preconnect } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { isBookPagePath, isCharacterAuthRedirect, navigationDirection, routeTransitionKind, type RouteTransitionKind } from "./routeTransitionPolicy";
import { RouteThemeController } from "./RouteThemeController";
import styles from "./routeTransition.module.css";
import { lessMotion } from "@/lib/client/motionPreference";
import { captureMorphArt, playMorphArt, type MorphArtSource } from "@gildra/atlas-ui/morph";

/**
 * Persistent navigation shell and the single owner of page hand-overs
 * (routeTransitionKind): a quick atlas hand-over on every public page. Loading,
 * watchdogs and route identity stay independent of the visual phases.
 */
type RouteState = "idle" | "leaving" | "loading";
type Direction = ReturnType<typeof navigationDirection>;

// The portal hand-over. The new page starts dimmed rather than invisible, so the
// swap never shows an empty frame between the two pages; it opens out of the point
// the reader touched (a link, a card, a realm of the top bar) and settles from the
// side it came from (deeper: from the right, up/back: from the left, siblings: from
// below). A ring of light in the theme's accent bursts from the same point.
const ENTER: KeyframeAnimationOptions = { duration: 460, easing: "cubic-bezier(.16, 1, .3, 1)" };
const ENTER_FROM: Record<Direction, string> = { deeper: "translate3d(22px, 0, 0) scale(.975)", up: "translate3d(-22px, 0, 0) scale(.975)", across: "translate3d(0, 12px, 0) scale(.975)" };
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
  const watchdog = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const arrival = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [state, setState] = useState<RouteState>("idle");

  const settle = useCallback(() => {
    clearTimeout(watchdog.current);
    morphSource.current = null;
    origin.current = null;
    // A charged portal that never opens (aborted, same page) fades with the navigation.
    ringRef.current?.getAnimations().forEach((animation) => animation.cancel());
    plannedKind.current = "still";
    setState("idle");
  }, []);

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
    if (reducedMotion()) return;
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
  }, []);

  /** A route with loading.tsx first commits its skeleton; wait for the real page. */
  const pendingArrival = useRef<{ kind: RouteTransitionKind; direction: Direction }>({ kind: "page", direction: "across" });
  const enterWhenLoaded = useCallback(() => {
    if (frameRef.current?.querySelector("[data-book-route-loading]")) setState("loading");
    else enter(pendingArrival.current.direction);
  }, [enter]);

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

  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") settle(); };
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("keydown", escape);
      clearTimeout(watchdog.current);
      clearTimeout(arrival.current);
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
        begin(destination.pathname, anchor, originOf(event, anchor));
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
  }, [begin, router, settle]);

  const active = state !== "idle";
  return <div className={styles.system} data-theme="wow" data-book-navigation={active ? "turn" : "idle"} data-route-state={state}>
    <RouteThemeController />
    <span className={styles.progress} aria-hidden="true" />
    <span className={styles.spark} aria-hidden="true" />
    <span ref={ringRef} className={styles.portalRing} aria-hidden="true" />
    <div className={styles.frame} data-theme="wow" ref={frameRef} data-book-route-frame data-route-state={state} aria-busy={active || undefined}>
      {children}
    </div>
  </div>;
}
