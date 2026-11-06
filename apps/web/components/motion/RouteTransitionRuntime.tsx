"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { preconnect } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { lessMotion } from "@gildra/atlas-ui/motionPreference";
import { isBookPagePath, isCharacterAuthRedirect, routeTransitionKind } from "./routeTransitionPolicy";
import { warmRouteArt } from "./routeArt";
import { RouteThemeController } from "./RouteThemeController";
import styles from "./routeTransition.module.css";

/**
 * Persistent navigation shell and the single owner of page hand-overs
 * (routeTransitionKind). A click navigates at once — nothing waits for an
 * animation. While the next page is on its way a thin line runs over the top bar;
 * the old page stays as it is, then the new one replaces it in a single frame.
 * No fade: an opacity animation over the whole page frame made the browser
 * composite one page-sized layer for every frame of the hand-over and showed
 * the bare background through the page (a dark flash on every click). Link
 * intent also preloads the destination hub's painting (routeArt.ts), so the new
 * page does not land on an empty background. The top bar lives outside this frame.
 * The new page's title block alone rises in over 170 ms (playHeroEntrance): a
 * small composited layer, so the hand-over reads as an arrival and costs no frames.
 */
type RouteState = "idle" | "leaving" | "loading";

/** Give up on a navigation that never commits (aborted, offline). */
const WATCHDOG_MS = 12000;
// In development, prefetching a route can make Next compile it before the
// user navigates there. Keep that CPU work out of the active page interaction.
// Literal NODE_ENV: the bundler inlines it in the browser (see routePrefetch in lib/flags.ts).
const routePrefetchEnabled = process.env.NODE_ENV !== "development";

/** Pages whose hero has an arrival of its own (the M+ and raid hubs). */
const OWN_ARRIVAL = "[data-hub-hero], [data-raid-hub-hero], [data-route-own-arrival]";
const HERO_ENTRANCE: Keyframe[] = [{ opacity: 0, transform: "translate3d(0, 10px, 0)" }, { opacity: 1, transform: "none" }];

/**
 * The block around the new page's H1 (eyebrow, title, lede, actions) fades and
 * rises 10 px. Runs before the first paint of the new page, so it never shows
 * at rest first; skipped with less motion, off screen or on very large blocks.
 */
function playHeroEntrance(frame: HTMLElement | null) {
  if (!frame || typeof HTMLElement.prototype.animate !== "function" || lessMotion()
    || frame.closest('[data-ui-motion="reduce"]') || frame.querySelector("[data-book-route-loading]")) return;
  const title = frame.querySelector<HTMLElement>("main h1") ?? frame.querySelector<HTMLElement>("h1");
  const hero = title?.parentElement;
  if (!title || !hero || hero === frame || title.closest(OWN_ARRIVAL) || hero.getAnimations().length) return;
  const box = hero.getBoundingClientRect();
  if (box.bottom <= 0 || box.top >= window.innerHeight || box.height > window.innerHeight * .8) return;
  hero.animate(HERO_ENTRANCE, { duration: 170, easing: "cubic-bezier(.2, .7, .2, 1)" });
}

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
  const expectedPath = useRef(pathname);
  const quietPath = useRef<string | null>(null);
  const watchdog = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [state, setState] = useState<RouteState>("idle");

  const settle = useCallback(() => {
    clearTimeout(watchdog.current);
    setState("idle");
  }, []);

  /** A loading.tsx skeleton marked data-book-route-loading commits first; the line runs on until the real page is in. */
  const enterWhenLoaded = useCallback(() => {
    if (frameRef.current?.querySelector("[data-book-route-loading]")) setState("loading");
    else {
      playHeroEntrance(frameRef.current);
      settle();
    }
  }, [settle]);

  const begin = useCallback((destination: string) => {
    if (routeTransitionKind(committedPath.current, destination) === "still") {
      expectedPath.current = committedPath.current;
      settle();
      return;
    }
    expectedPath.current = destination;
    quietPath.current = null;
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
    if (routeTransitionKind(from, pathname) === "still") { settle(); return; }
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
      } else if (destination && destination.pathname + destination.search !== window.location.pathname + window.location.search) {
        warmRouteArt(destination.pathname);
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
    const history = () => begin(window.location.pathname);
    let prefetchTimer: ReturnType<typeof setTimeout> | undefined;
    const warm = (event: PointerEvent | FocusEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (event instanceof PointerEvent && anchor && event.relatedTarget instanceof Node && anchor.contains(event.relatedTarget)) return;
      const destination = destinationFromTarget(event.target);
      if (!destination || routeTransitionKind(committedPath.current, destination.pathname) === "still") return;
      clearTimeout(prefetchTimer);
      prefetchTimer = setTimeout(() => {
        router.prefetch(destination.pathname + destination.search);
        warmRouteArt(destination.pathname);
      }, event.type === "focusin" ? 0 : 100);
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
  return <div className={styles.system} data-book-navigation={active ? "turn" : "idle"} data-route-state={state}>
    <RouteThemeController />
    <span className={styles.progress} aria-hidden="true" />
    <div className={styles.frame} ref={frameRef} data-book-route-frame data-route-state={state} aria-busy={active || undefined}>
      {children}
    </div>
  </div>;
}
