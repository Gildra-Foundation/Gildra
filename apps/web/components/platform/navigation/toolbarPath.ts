"use client";
import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

const noSubscribe = () => () => {};
/** Prerendered 404 pages must hydrate with the path the server rendered the bar for. */
const renderedPath = (fallback: string) => typeof document === "undefined"
  ? fallback
  : document.querySelector("[data-toolbar-path]")?.getAttribute("data-toolbar-path") ?? fallback;

/** The path the bar and the version strip are drawn for: the server's on hydration, then the live one. */
export function useToolbarPath() {
  const pathname = usePathname() ?? "/";
  return useSyncExternalStore(noSubscribe, () => pathname, () => renderedPath(pathname));
}
