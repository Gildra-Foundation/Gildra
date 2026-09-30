"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";

function layoutForPath(pathname: string) {
  const path = pathname.replace(/^\/ru(?=\/|$)/, "") || "/";
  return path.startsWith("/wow/mythic") || path.startsWith("/wow/rotation") || path.startsWith("/talents") ? "immersive" : "standard";
}

function sharedWowBackgroundForPath(pathname: string, mobile: boolean) {
  const path = pathname.replace(/^\/ru(?=\/|$)/, "") || "/";
  // Other game hubs own their visual scene and should not download WoW art.
  if (path === "/league-of-legends" || path.startsWith("/league-of-legends/")
    || path === "/genshin" || path.startsWith("/genshin/")
    || path === "/diablo" || path.startsWith("/diablo/")) return null;
  if (path === "/") return null;
  // These pages paint their own full-screen scene; do not fetch the shared dungeon backdrop for them.
  if (path === "/wow" || path === "/blueprints" || path.startsWith("/blueprints/")
    || path.startsWith("/talents") || path === "/wow/characters" || path.startsWith("/wow/characters/")) return null;
  return mobile
    ? "/assets/wow/mythic/ruby-depth-v3-mobile-optimized.webp"
    : "/assets/wow/mythic/ruby-depth-v3-light-fast.webp";
}

/** Keeps route theme and shared background in dev without mounting the page-turn client boundary. */
export function RouteThemeController() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    document.documentElement.lang = /^\/ru(?:\/|$)/.test(pathname) ? "ru" : "en";
    document.documentElement.dataset.routeTheme = "wow";
    document.documentElement.dataset.routeLayout = layoutForPath(pathname);

    const root = document.documentElement;
    const viewport = window.matchMedia("(max-width: 720px)");
    const setBackground = () => {
      const background = sharedWowBackgroundForPath(pathname, viewport.matches);
      if (background) root.style.setProperty("--wow-depth-background", `url("${background}")`);
      else root.style.removeProperty("--wow-depth-background");
    };

    setBackground();
    viewport.addEventListener("change", setBackground);
    return () => viewport.removeEventListener("change", setBackground);
  }, [pathname]);

  return null;
}
