"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";

function layoutForPath(pathname: string) {
  const path = pathname.replace(/^\/ru(?=\/|$)/, "") || "/";
  return path.startsWith("/wow/mythic") || path.startsWith("/wow/rotation") || path.startsWith("/talents") ? "immersive" : "standard";
}

/** Routes that show the shared dungeon backdrop behind the page (wow-skin.css, html[data-wow-depth]). */
function sharedWowBackgroundForPath(pathname: string) {
  const path = pathname.replace(/^\/ru(?=\/|$)/, "") || "/";
  // Other game hubs own their visual scene and should not download WoW art.
  if (path === "/league-of-legends" || path.startsWith("/league-of-legends/")
    || path === "/genshin" || path.startsWith("/genshin/")
    || path === "/diablo" || path.startsWith("/diablo/")) return false;
  if (path === "/") return false;
  // These pages paint their own full-screen scene; do not fetch the shared dungeon backdrop for them.
  if (path === "/blueprints" || path.startsWith("/blueprints/")
    || path.startsWith("/talents") || path === "/wow/characters" || path.startsWith("/wow/characters/")) return false;
  return true;
}

/** Sets an attribute only when it changes: a write on <html> invalidates the page's style. */
function setRootData(name: string, value: string | null) {
  const root = document.documentElement;
  if (value === null) { if (root.hasAttribute(name)) root.removeAttribute(name); }
  else if (root.getAttribute(name) !== value) root.setAttribute(name, value);
}

/** Keeps route theme and shared background in dev without mounting the page-turn client boundary. */
export function RouteThemeController() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    setRootData("lang", /^\/ru(?:\/|$)/.test(pathname) ? "ru" : "en");
    setRootData("data-route-theme", "wow");
    setRootData("data-route-layout", layoutForPath(pathname));
    setRootData("data-wow-depth", sharedWowBackgroundForPath(pathname) ? "" : null);
  }, [pathname]);

  return null;
}
