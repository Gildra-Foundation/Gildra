"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { preconnect } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { isBookPagePath, isCharacterAuthRedirect, shouldTurnBook } from "./routeTransitionPolicy";
import { RouteThemeController } from "./RouteThemeController";
import { ThemedPageTransition, type PageTransitionHandle } from "./ThemedPageTransition";
import { isHomeTheme } from "../platform/home/homeThemes";
import styles from "./routeTransition.module.css";
import { lessMotion } from "@/lib/client/motionPreference";
import { nameMorphArt } from "@gildra/atlas-ui/morph";

/** Persistent navigation shell. The selected character owns the transition;
 * loading, watchdogs and route identity stay independent of its visual phases. */
type RouteState = "idle" | "leaving" | "loading";

// The new page starts dimmed rather than invisible, so the swap never shows an
// empty frame between the two pages; it brightens and settles by 4 px.
const ENTER: KeyframeAnimationOptions = { duration: 240, easing: "cubic-bezier(.2, .7, .2, 1)" };
const ENTER_FRAMES: Keyframe[] = [{ opacity: .35, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }];
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

/** "deeper" into a section, "up" towards its hub (or back in history), "across" between siblings. */
function navigationDirection(from: string, to: string, popped: boolean) {
  if (popped) return "up";
  const depth = (path: string) => path.replace(/^\/ru(?=\/|$)/, "").split("/").filter(Boolean).length;
  const [a, b] = [depth(from), depth(to)];
  return b > a ? "deeper" : b < a ? "up" : "across";
}
const viewTransitions = () => typeof document.startViewTransition === "function";

/** One shell survives App Router navigation. Page content never gets an artificial remount key. */
export function RouteTransitionRuntime({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const routePath = pathname.replace(/^\/ru(?=\/|$)/, "") || "/";
  if (/^\/wow\/mythic\/[^/]+\/?$/.test(routePath) || /^\/wow\/mythic-plus\/[^/]+\/[^/]+\/?$/.test(routePath)) {
    preconnect("https://render.worldofwarcraft.com");
  }
  const router = useRouter();
  const frameRef = useRef<HTMLDivElement>(null);
  const effectRef = useRef<PageTransitionHandle>(null);
  const committedPath = useRef(pathname);
  const poppedHistory = useRef(false);
  const expectedPath = useRef(pathname);
  const quietPath = useRef<string | null>(null);
  const watchdog = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const arrival = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [state, setState] = useState<RouteState>("idle");

  const settle = useCallback(() => {
    clearTimeout(watchdog.current);
    effectRef.current?.cancel();
    setState("idle");
  }, []);

  /** The new page is in place: hand it over and let its hero arrive (unless the reader asked for less motion). */
  const enter = useCallback(() => {
    clearTimeout(watchdog.current);
    setState("idle");
    const frame = frameRef.current;
    if (!frame) return;
    // A dimming transition that started on the old page must not finish on the new one.
    frame.getAnimations().forEach((animation) => animation.cancel());
    if (reducedMotion()) { effectRef.current?.cancel(); return; }
    // Also cover programmatic navigation, where there was no link to capture.
    if (!document.documentElement.dataset.pageTransition) {
      const theme = document.documentElement.dataset.siteTheme;
      effectRef.current?.start(frame, isHomeTheme(theme) ? theme : "arthas");
    }
    if (effectRef.current?.reveal()) return;
    // Atlas pages already rise in through their View Transition.
    if (!(viewTransitions() && frame.querySelector("[data-atlas-frame]"))) frame.animate(ENTER_FRAMES, ENTER);
    clearTimeout(arrival.current);
    frame.dataset.routeArrived = "";
    arrival.current = setTimeout(() => { delete frame.dataset.routeArrived; }, ARRIVAL_MS);
  }, []);

  /** A route with loading.tsx first commits its skeleton; wait for the real page. */
  const enterWhenLoaded = useCallback(() => {
    if (frameRef.current?.querySelector("[data-book-route-loading]")) setState("loading");
    else enter();
  }, [enter]);

  const begin = useCallback((destination: string) => {
    if (!shouldTurnBook(committedPath.current, destination)) {
      expectedPath.current = committedPath.current;
      settle();
      return;
    }
    expectedPath.current = destination;
    quietPath.current = null;
    const theme = document.documentElement.dataset.siteTheme;
    if (frameRef.current) effectRef.current?.start(frameRef.current, isHomeTheme(theme) ? theme : "arthas");
    setState("leaving");
    clearTimeout(watchdog.current);
    watchdog.current = setTimeout(settle, WATCHDOG_MS);
  }, [settle]);

  useEffect(() => {
    // With View Transitions the leaving page stays bright: its snapshot would not carry the dim.
    if (viewTransitions() && frameRef.current) frameRef.current.dataset.viewTransitions = "";
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
    // Direction of the page hand-over (app/styles/view-transitions.css). Set during the
    // commit, before the browser builds the ::view-transition tree.
    document.documentElement.dataset.navDirection = navigationDirection(from, pathname, poppedHistory.current);
    poppedHistory.current = false;
    if (isCharacterAuthRedirect(from, pathname) && expectedPath.current === from) {
      // A protected character page resolved through the sign-in redirect: same turn.
      expectedPath.current = pathname;
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
    if (shouldTurnBook(from, pathname)) enterWhenLoaded();
    else settle();
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
        // Only the tapped picture becomes the shared element of the hand-over.
        if (anchor) nameMorphArt(anchor);
        begin(destination.pathname);
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
      if (!destination || !shouldTurnBook(committedPath.current, destination.pathname)) return;
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
    return () => {
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
    <ThemedPageTransition ref={effectRef} />
    <span className={styles.progress} aria-hidden="true" />
    <span className={styles.spark} aria-hidden="true" />
    <div className={styles.frame} data-theme="wow" ref={frameRef} data-book-route-frame data-route-state={state} aria-busy={active || undefined}>
      {children}
    </div>
  </div>;
}
