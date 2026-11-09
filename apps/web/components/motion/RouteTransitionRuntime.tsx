"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, ViewTransition as ReactViewTransition, type ReactNode } from "react";
import { preconnect } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { lessMotion, subscribeSiteMotion } from "@gildra/atlas-ui/motionPreference";
import { knownRenderTier, onRenderTier } from "@gildra/atlas-ui/renderTier";
import { ATLAS_DURATION, ATLAS_EASE } from "@gildra/atlas-ui/motionTokens";
import { bookPageIdentity, isBookPagePath, isCharacterAuthRedirect, routeTransitionKind } from "./routeTransitionPolicy";
import { warmRouteArt } from "./routeArt";
import { clearGameTurn } from "./gameTurn";
import { RouteThemeController } from "./RouteThemeController";
import { routeTurnDeviceAllowed, type RouteTurnDevice } from "./routeTurnDevice";
import styles from "./routeTransition.module.css";

/**
 * Persistent navigation shell and the single owner of page hand-overs
 * (routeTransitionKind). A click navigates at once — nothing waits for an
 * animation. While the next page is on its way the old one stays as it is and a
 * thin line runs over the top bar after 150 ms. When the new page is ready it
 * replaces the old one in one cross-fade (a View Transition of the document,
 * started by React in the commit of the new page, so it never freezes the old
 * page while data loads): the old picture stays opaque and the new page fades
 * in over it while rising 8 px, 200 ms on the atlas curve (app/styles/route-motion.css).
 * Covering the old page instead of fading it out keeps the cross-fade from
 * showing the bare background (the dark flash of the old whole-frame fade).
 * The top bar is captured apart and stays still. While the hand-over plays,
 * <html data-route-turn> tells pages to skip their own arrival of what is in
 * view (routeTurnActive in the kit), so nothing animates twice. Link intent
 * prefetches the route and preloads the hub painting (routeArt.ts).
 *
 * With less motion the page is swapped in one frame. Browsers without the API,
 * and devices that would drop frames on it (four cores or less, 4 GB or less,
 * Save-Data, software compositing: routeTurnDevice.ts), get the light
 * hand-over instead: the title block rises on the atlas tempo.
 * A route whose loading.tsx skeleton commits first keeps the old picture for
 * up to SKELETON_DELAY_MS, so a quick load never flashes the skeleton.
 */
type RouteState = "idle" | "leaving" | "loading";

/** Give up on a navigation that never commits (aborted, offline). */
const WATCHDOG_MS = 12000;
// In development, prefetching a route can make Next compile it before the
// user navigates there. Keep that CPU work out of the active page interaction.
// Literal NODE_ENV: the bundler inlines it in the browser (see routePrefetch in lib/flags.ts).
const routePrefetchEnabled = process.env.NODE_ENV !== "development";

/** The old page stays on screen this long when the new one commits as a skeleton (loading.tsx). */
const SKELETON_DELAY_MS = 260;
const ROUTE_IN = "::view-transition-new(root)";

type DocumentWithTransition = Document & { activeViewTransition?: ViewTransition | null; __reactViewTransition?: ViewTransition | null };

function viewTransitionsSupported() {
  return typeof document !== "undefined" && typeof document.startViewTransition === "function";
}

/** The render tier, probed once per tab session (a WebGL context, when the browser is idle). */
const RENDER_TIER_KEY = "gildra-render-tier";
function renderTier() {
  const known = knownRenderTier();
  if (known) return known;
  try {
    const saved = sessionStorage.getItem(RENDER_TIER_KEY);
    return saved === "gpu" || saved === "cpu" ? saved : undefined;
  } catch {
    return undefined;
  }
}

/** View Transitions on a device that can afford them (routeTurnDevice.ts); motion preference apart. */
function routeTurnCapable() {
  return viewTransitionsSupported() && routeTurnDeviceAllowed(navigator as Navigator & RouteTurnDevice, renderTier());
}

/** The page hand-over may cross-fade now. */
function routeTurnAllowed() {
  return routeTurnCapable() && !lessMotion();
}

/** The page hand-over that React has started for the commit in progress (null without one). */
function runningViewTransition() {
  const doc = document as DocumentWithTransition;
  return doc.activeViewTransition ?? doc.__reactViewTransition ?? null;
}

/**
 * Arms the document for the cross-fade of the next commit: <html data-route-turn>
 * (CSS of the hand-over, routeTurnActive) and an explicit root transition name,
 * without which React cancels the root picture of a View Transition it starts.
 */
function armRouteTurn(kind: "page" | "swap" = "page") {
  const root = document.documentElement;
  root.dataset.routeTurn = kind;
  root.style.viewTransitionName = "root";
}

function disarmRouteTurn() {
  const root = document.documentElement;
  // A game switch's marks belong to the hand-over that is ending (gameTurn.ts).
  if (root.dataset.routeTurn) clearGameTurn();
  delete root.dataset.routeTurn;
  if (root.style.viewTransitionName === "root") root.style.viewTransitionName = "";
}

function routeInAnimation() {
  return document.documentElement.getAnimations({ subtree: true }).find((animation) => (animation.effect as KeyframeEffect | null)?.pseudoElement === ROUTE_IN) ?? null;
}

/** Probes the render tier when the browser is idle unless this tab already knows it; the store updates then. */
const subscribeRenderTier = (callback: () => void) => {
  // No probe where the answer cannot change anything: no API, a weak device, or a tier already known.
  if (renderTier() || !viewTransitionsSupported() || !routeTurnDeviceAllowed(navigator as Navigator & RouteTurnDevice)) return () => {};
  return onRenderTier((tier) => {
    try { sessionStorage.setItem(RENDER_TIER_KEY, tier); } catch { /* blocked storage: probe again next load */ }
    callback();
  });
};
/** View Transitions on a capable device with motion allowed: false on the server and during hydration. */
function useRouteTurnMotion() {
  const capable = useSyncExternalStore(subscribeRenderTier, routeTurnCapable, () => false);
  const reduced = useSyncExternalStore(subscribeSiteMotion, lessMotion, () => true);
  return capable && !reduced;
}

/**
 * Same-page switches by link (filters, regions, paging: only the query changes)
 * cross-fade in place. The count moves at the click of such a link; the marker
 * below re-renders with the new query in the commit of that navigation and its
 * new key starts the View Transition. Queries written by pages themselves
 * (history.replaceState of a view) leave the count, so they never animate.
 */
let searchTurns = 0;

function SearchTurnMarker() {
  useSearchParams();
  // Read at render on purpose: the commit that brings the new query carries the count of its click.
  const turn = searchTurns;
  useLayoutEffect(() => {
    const transition = document.documentElement.dataset.routeTurn === "swap" ? runningViewTransition() : null;
    if (transition) transition.finished.then(disarmRouteTurn, disarmRouteTurn);
    else if (document.documentElement.dataset.routeTurn === "swap") disarmRouteTurn();
  }, [turn]);
  return <ReactViewTransition key={turn} default="none"><i hidden /></ReactViewTransition>;
}

/** Pages whose hero has an arrival of its own (the M+ and raid hubs). */
const OWN_ARRIVAL = "[data-hub-hero], [data-raid-hub-hero], [data-route-own-arrival]";
const HERO_ENTRANCE: Keyframe[] = [{ opacity: 0, transform: "translate3d(0, 10px, 0)" }, { opacity: 1, transform: "none" }];

/**
 * The light hand-over (no View Transition: unsupported, or a weak device): the
 * block around the new page's H1 (eyebrow, title, lede, actions) fades and
 * rises 10 px. Runs before the first paint of the new page, so it never shows
 * at rest first; skipped with less motion, off screen or on very large blocks.
 */
function playHeroEntrance(frame: HTMLElement | null) {
  if (!frame || routeTurnCapable() || typeof HTMLElement.prototype.animate !== "function" || lessMotion()
    || frame.closest('[data-ui-motion="reduce"]') || frame.querySelector("[data-book-route-loading]")) return;
  const title = frame.querySelector<HTMLElement>("main h1") ?? frame.querySelector<HTMLElement>("h1");
  const hero = title?.parentElement;
  if (!title || !hero || hero === frame || title.closest(OWN_ARRIVAL) || hero.getAnimations().length) return;
  const box = hero.getBoundingClientRect();
  if (box.bottom <= 0 || box.top >= window.innerHeight || box.height > window.innerHeight * .8) return;
  hero.animate(HERO_ENTRANCE, { duration: ATLAS_DURATION, easing: ATLAS_EASE });
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
  const turnMotion = useRouteTurnMotion();

  const settle = useCallback(() => {
    clearTimeout(watchdog.current);
    setState("idle");
    // A hand-over in progress clears the marks itself when it ends (handOver), and so
    // does a same-page switch waiting for its commit (SearchTurnMarker, or its watchdog).
    if (!runningViewTransition() && document.documentElement.dataset.routeTurn !== "swap") disarmRouteTurn();
  }, []);

  /**
   * The new page has committed inside the View Transition React started (layout
   * effects run in its update callback). With a skeleton the old picture holds
   * until the content arrives or SKELETON_DELAY_MS pass; the marks go when it ends.
   */
  const handOver = useCallback(() => {
    const transition = document.documentElement.hasAttribute("data-route-turn") ? runningViewTransition() : null;
    if (!transition) {
      disarmRouteTurn();
      return;
    }
    const skeleton = frameRef.current?.querySelector("[data-book-route-loading]");
    if (skeleton) {
      transition.ready.then(() => {
        const animation = routeInAnimation();
        if (!animation || !frameRef.current?.querySelector("[data-book-route-loading]")) return;
        animation.effect?.updateTiming({ delay: SKELETON_DELAY_MS });
        // The content came early: the cross-fade starts at once, from the old picture.
        const observer = new MutationObserver(() => {
          if (frameRef.current?.querySelector("[data-book-route-loading]")) return;
          observer.disconnect();
          const elapsed = Number(animation.currentTime ?? 0);
          if (elapsed < SKELETON_DELAY_MS) animation.effect?.updateTiming({ delay: elapsed });
        });
        if (frameRef.current) observer.observe(frameRef.current, { childList: true, subtree: true });
        animation.finished.then(() => observer.disconnect(), () => observer.disconnect());
      }, () => {});
    }
    transition.finished.then(disarmRouteTurn, disarmRouteTurn);
  }, []);

  /** A loading.tsx skeleton marked data-book-route-loading commits first; the line runs on until the real page is in. */
  const enterWhenLoaded = useCallback(() => {
    if (frameRef.current?.querySelector("[data-book-route-loading]")) setState("loading");
    else {
      playHeroEntrance(frameRef.current);
      settle();
    }
  }, [settle]);

  const begin = useCallback((destination: string, crossFade = true) => {
    if (routeTransitionKind(committedPath.current, destination) === "still") {
      expectedPath.current = committedPath.current;
      settle();
      return;
    }
    expectedPath.current = destination;
    quietPath.current = null;
    if (crossFade && routeTurnAllowed()) armRouteTurn();
    else disarmRouteTurn();
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
      disarmRouteTurn();
      settle();
      return;
    }
    // Router.push/replace and history also land here; language switches stay still.
    if (routeTransitionKind(from, pathname) === "still") { disarmRouteTurn(); settle(); return; }
    handOver();
    enterWhenLoaded();
  }, [pathname, enterWhenLoaded, handOver, settle]);

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
        if (destination.pathname === window.location.pathname && routeTurnAllowed()) {
          const turn = searchTurns += 1;
          armRouteTurn("swap");
          setTimeout(() => {
            if (searchTurns === turn && document.documentElement.dataset.routeTurn === "swap" && !runningViewTransition()) disarmRouteTurn();
          }, WATCHDOG_MS);
        }
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
    // A browser that animates back/forward itself (swipe gestures) keeps its own motion only.
    const history = (event: PopStateEvent) => begin(window.location.pathname, !(event as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition);
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
    // A finger has no hover: the press itself is the intent. It lands 50–150 ms
    // before the click, which the route's data spends in flight instead of waiting.
    const warmOnPress = (event: PointerEvent) => {
      if (event.pointerType === "mouse" || event.button !== 0) return;
      const destination = destinationFromTarget(event.target);
      if (!destination || routeTransitionKind(committedPath.current, destination.pathname) === "still") return;
      router.prefetch(destination.pathname + destination.search);
      warmRouteArt(destination.pathname);
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
      document.addEventListener("pointerdown", warmOnPress, { capture: true, passive: true });
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
        document.removeEventListener("pointerdown", warmOnPress, true);
      }
      document.removeEventListener("click", navigateAnchor);
      clearTimeout(prefetchTimer);
    };
  }, [begin, router, settle]);

  const active = state !== "idle";
  // A new page identity remounts this marker in the commit of the new page, which makes React start a
  // View Transition for that commit (language switches keep the identity and stay still).
  const identity = bookPageIdentity(pathname);
  return <div className={styles.system} data-book-navigation={active ? "turn" : "idle"} data-route-state={state} data-cookie-notice-space>
    {turnMotion ? <>
      <ReactViewTransition key={identity} default="none"><i hidden /></ReactViewTransition>
      <Suspense fallback={null}><SearchTurnMarker /></Suspense>
    </> : null}
    <RouteThemeController />
    <span className={styles.progress} aria-hidden="true" />
    <div className={styles.frame} ref={frameRef} data-book-route-frame data-route-state={state} aria-busy={active || undefined} data-cookie-notice-space>
      {children}
    </div>
  </div>;
}
