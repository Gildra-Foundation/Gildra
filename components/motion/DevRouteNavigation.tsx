"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isBookPagePath } from "./routeTransitionPolicy";

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

function destinationFromClick(event: MouseEvent) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  return destinationFromTarget(event.target);
}

/** Retains App Router navigation for plain anchors while dev page-turn effects are disabled. */
export function DevRouteNavigation() {
  const router = useRouter();

  useEffect(() => {
    const navigateAnchor = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      const destination = destinationFromClick(event);
      if (!destination || (destination.pathname === window.location.pathname
        && destination.search === window.location.search && destination.hash === window.location.hash)) return;
      event.preventDefault();
      router.push(destination.pathname + destination.search + destination.hash);
    };

    document.addEventListener("click", navigateAnchor);
    return () => document.removeEventListener("click", navigateAnchor);
  }, [router]);

  return null;
}
