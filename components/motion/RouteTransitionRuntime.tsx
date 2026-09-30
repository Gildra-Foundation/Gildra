"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { preconnect } from "react-dom";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { bookLocale, isBookPagePath, isCharacterAuthRedirect, shouldTurnBook } from "./routeTransitionPolicy";
import { createBookRouteLifecycle, type BookRouteState } from "./bookRouteLifecycle";
import styles from "./routeTransition.module.css";

const loadBookRouteScene = () => import("./BookRouteScene");

const BookRouteScene = dynamic(
  () => loadBookRouteScene().then((module) => module.BookRouteScene),
  { ssr: false },
);

// Keep the deliberately staged page turn for production; dev route compilation
// can take long enough that its full-screen scene makes navigation feel stuck.
const bookTransitionsEnabled = process.env.NODE_ENV !== "development"
  || process.env.NEXT_PUBLIC_ENABLE_DEV_BOOK_TRANSITIONS === "1";
// In development, prefetching a route can make Next compile it before the
// user navigates there. Keep that CPU work out of the active page interaction.
const routePrefetchEnabled = process.env.NODE_ENV !== "development";

function layoutForPath(pathname: string) {
  const path = pathname.replace(/^\/ru(?=\/|$)/, "") || "/";
  return path.startsWith("/wow/mythic") || path.startsWith("/wow/rotation") || path.startsWith("/talents") ? "immersive" : "standard";
}

function sharedWowBackgroundForPath(pathname: string) {
  const path = pathname.replace(/^\/ru(?=\/|$)/, "") || "/";
  // Other game hubs own their visual scene and should not download WoW art.
  if (path === "/league-of-legends" || path.startsWith("/league-of-legends/")
    || path === "/genshin" || path.startsWith("/genshin/")
    || path === "/diablo" || path.startsWith("/diablo/")) return null;
  if (path === "/") return null;
  // These pages paint their own full-screen scene and do not use the shared
  // dungeon backdrop. Keep its URL out of CSS so the browser cannot fetch it
  // speculatively before route-specific styles are evaluated.
  if (path === "/wow" || path === "/blueprints" || path.startsWith("/blueprints/")
    || path.startsWith("/talents") || path === "/wow/characters" || path.startsWith("/wow/characters/")) return null;
  return window.matchMedia("(max-width: 720px)").matches
    ? "/assets/wow/mythic/ruby-depth-v3-mobile-optimized.webp"
    : "/assets/wow/mythic/ruby-depth-v3-light-fast.webp";
}

function destinationFromTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest<HTMLAnchorElement>("a[href]");
  if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")
    || anchor.hasAttribute("data-no-book-transition") || anchor.rel.split(/\s+/).includes("external")) return null;
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

function clickDestination(event: MouseEvent) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  return destinationFromTarget(event.target);
}

/** One book survives App Router navigation. Page content never gets an artificial remount key. */
export function RouteTransitionRuntime({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const routePath = pathname.replace(/^\/ru(?=\/|$)/, "") || "/";
  const hasBlizzardIconMedia = /^\/wow\/mythic\/[^/]+\/?$/.test(routePath)
    || /^\/wow\/mythic-plus\/[^/]+\/[^/]+\/?$/.test(routePath);
  if (hasBlizzardIconMedia) {
    preconnect("https://render.worldofwarcraft.com");
  }
  const router = useRouter();
  const frameRef = useRef<HTMLDivElement>(null);
  const committedPath = useRef(pathname);
  const expectedPath = useRef(pathname);
  const [locale, setLocale] = useState(bookLocale(pathname));
  const [state, setState] = useState<BookRouteState>({ kind: "open", phase: "idle", id: 0 });
  const [lifecycle] = useState(() => createBookRouteLifecycle(setState));
  const sceneReady = useRef(false);

  const pageReady = useCallback(() => {
    if (!sceneReady.current || expectedPath.current !== committedPath.current || frameRef.current?.querySelector("[data-book-route-loading]")) return;
    lifecycle.pageReady(lifecycle.state.id);
  }, [lifecycle]);

  const onSceneReady = useCallback(() => {
    sceneReady.current = true;
    lifecycle.ready(lifecycle.state.id);
    pageReady();
  }, [lifecycle, pageReady]);

  const begin = useCallback((destination: string) => {
    if (!shouldTurnBook(committedPath.current, destination)) {
      if (expectedPath.current !== committedPath.current) {
        expectedPath.current = committedPath.current;
        lifecycle.finish();
      }
      return;
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (bookTransitionsEnabled && !reducedMotion) void loadBookRouteScene();
    expectedPath.current = destination;
    setLocale(bookLocale(destination));
    sceneReady.current = !bookTransitionsEnabled || reducedMotion;
    if (bookTransitionsEnabled) lifecycle.start("turn", reducedMotion);
    else if (lifecycle.state.phase !== "idle") lifecycle.finish();
  }, [lifecycle]);

  useEffect(() => {
    if (!bookTransitionsEnabled) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const interrupt = () => {
      if (preference.matches || document.visibilityState === "hidden") lifecycle.finish();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") lifecycle.finish(); };
    preference.addEventListener("change", interrupt);
    document.addEventListener("visibilitychange", interrupt);
    document.addEventListener("keydown", escape);
    return () => {
      preference.removeEventListener("change", interrupt);
      document.removeEventListener("visibilitychange", interrupt);
      document.removeEventListener("keydown", escape);
      lifecycle.cancel();
    };
  }, [lifecycle, pageReady]);

  useEffect(() => {
    if (!bookTransitionsEnabled) return;
    if (state.phase === "idle" || !frameRef.current) return;
    const observer = new MutationObserver(pageReady);
    observer.observe(frameRef.current, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-book-route-loading"],
    });
    // The route may already be ready by the time this effect attaches.
    pageReady();
    return () => observer.disconnect();
  }, [state.phase, pageReady]);

  useLayoutEffect(() => {
    document.documentElement.lang = bookLocale(pathname);
    document.documentElement.dataset.routeTheme = "wow";
    document.documentElement.dataset.routeLayout = layoutForPath(pathname);
    const root = document.documentElement;
    const setBackground = () => {
      const background = sharedWowBackgroundForPath(pathname);
      if (background) root.style.setProperty("--wow-depth-background", `url("${background}")`);
      else root.style.removeProperty("--wow-depth-background");
    };
    const mobileViewport = window.matchMedia("(max-width: 720px)");
    setBackground();
    mobileViewport.addEventListener("change", setBackground);
    const cleanupBackgroundListener = () => mobileViewport.removeEventListener("change", setBackground);
    // Keep the shared theme/background in development, but skip transition-only
    // lifecycle updates while the book scene is disabled.
    if (!bookTransitionsEnabled) return cleanupBackgroundListener;
    if (isCharacterAuthRedirect(committedPath.current, pathname)
      && expectedPath.current === committedPath.current) {
      committedPath.current = pathname;
      expectedPath.current = pathname;
      setLocale(bookLocale(pathname));
      pageReady();
      return cleanupBackgroundListener;
    }
    if (shouldTurnBook(committedPath.current, pathname)) {
      // Also covers router.push/replace, redirects, and browser history.
      // A redirect is part of the same navigation, even if its first route has
      // already committed. Do not restart the leaf at an intermediate URL.
      const navigationAlreadyStarted = expectedPath.current !== committedPath.current;
      if (bookTransitionsEnabled && lifecycle.state.phase === "idle" && !navigationAlreadyStarted) {
        sceneReady.current = false;
        lifecycle.start("turn", window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      }
      committedPath.current = pathname;
      if (!navigationAlreadyStarted) expectedPath.current = pathname;
      setLocale(bookLocale(pathname));
    }
    pageReady();
    return cleanupBackgroundListener;
  }, [pathname, lifecycle, pageReady]);

  useEffect(() => {
    const capture = (event: MouseEvent) => {
      const destination = clickDestination(event) ?? explicitDestinationFromTarget(event.target);
      if (destination) begin(destination.pathname);
    };
    const navigateAnchor = (event: MouseEvent) => {
      if (event.defaultPrevented) return; // Next Link and local handlers already own navigation.
      const destination = clickDestination(event);
      if (!destination || (destination.pathname === window.location.pathname && destination.search === window.location.search)) return;
      event.preventDefault();
      router.push(destination.pathname + destination.search + destination.hash);
    };
    const history = () => begin(window.location.pathname);
    let prefetchTimer: ReturnType<typeof setTimeout> | undefined;
    const warm = (event: PointerEvent | FocusEvent) => {
      if (!routePrefetchEnabled) return;
      const anchor = event.target instanceof Element
        ? event.target.closest<HTMLAnchorElement>("a[href]")
        : null;
      if (event instanceof PointerEvent && anchor && event.relatedTarget instanceof Node && anchor.contains(event.relatedTarget)) return;
      const destination = destinationFromTarget(event.target);
      if (!destination || !shouldTurnBook(committedPath.current, destination.pathname)) return;
      clearTimeout(prefetchTimer);
      prefetchTimer = setTimeout(() => {
        if (bookTransitionsEnabled && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          void loadBookRouteScene().catch(() => undefined);
        }
        router.prefetch(destination.pathname + destination.search);
      }, event.type === "focusin" ? 0 : 100);
    };
    const cancelWarm = (event: PointerEvent) => {
      const anchor = event.target instanceof Element
        ? event.target.closest<HTMLAnchorElement>("a[href]")
        : null;
      if (anchor && event.relatedTarget instanceof Node && anchor.contains(event.relatedTarget)) return;
      clearTimeout(prefetchTimer);
    };
    if (bookTransitionsEnabled) {
      document.addEventListener("click", capture, true);
      window.addEventListener("popstate", history);
    }
    // The book scene is optional in dev, but intent-prefetch still matters for
    // menu links that explicitly opt out of Next Link's automatic prefetch.
    if (routePrefetchEnabled) {
      document.addEventListener("pointerover", warm, true);
      document.addEventListener("pointerout", cancelWarm, true);
      document.addEventListener("focusin", warm, true);
    }
    document.addEventListener("click", navigateAnchor);
    return () => {
      if (bookTransitionsEnabled) {
        document.removeEventListener("click", capture, true);
        window.removeEventListener("popstate", history);
      }
      if (routePrefetchEnabled) {
        document.removeEventListener("pointerover", warm, true);
        document.removeEventListener("pointerout", cancelWarm, true);
        document.removeEventListener("focusin", warm, true);
      }
      document.removeEventListener("click", navigateAnchor);
      clearTimeout(prefetchTimer);
    };
  }, [begin, router]);

  const isCoverPage = /^\/(?:ru\/?)?$/.test(pathname);
  const active = state.phase !== "idle" && !isCoverPage;
  return <div className={styles.system} data-theme="wow" data-book-navigation={active ? state.kind : "idle"}>
    {active && <BookRouteScene state={state} locale={locale} onReady={onSceneReady} onSkip={() => lifecycle.finish()} />}
    <div className={styles.frame} data-theme="wow" ref={frameRef} inert={state.phase === "playing"} aria-busy={active || undefined}>
      {children}
    </div>
  </div>;
}
