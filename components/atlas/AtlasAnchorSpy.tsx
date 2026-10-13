"use client";

import { useEffect, useRef } from "react";
import { lessMotion } from "@/lib/client/motionPreference";

/**
 * Marks the chapter the reader is in: the link of the last section whose top
 * has passed under the sticky bars gets aria-current="location", and on phones
 * the scrolling strip keeps that link in view. Mounted inside AtlasAnchorNav.
 */
export function AtlasAnchorSpy() {
  const marker = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const nav = marker.current?.closest("nav");
    if (!nav) return;
    const links = [...nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')];
    const targets = links.map((link) => document.getElementById(decodeURIComponent(link.hash.slice(1))));
    let frame = 0;
    let current: HTMLAnchorElement | null = null;

    const update = () => {
      frame = 0;
      // Just below the toolbar and this strip, or where a jump to the chapter lands (its scroll-margin).
      const line = nav.getBoundingClientRect().bottom + 24;
      let active: HTMLAnchorElement | null = null;
      targets.forEach((target, index) => {
        if (!target) return;
        const landing = (parseFloat(getComputedStyle(target).scrollMarginTop) || 0) + 8;
        if (target.getBoundingClientRect().top <= Math.max(line, landing)) active = links[index];
      });
      // At the very bottom the last chapter may never reach the line.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2 && targets.at(-1)) active = links.at(-1) ?? active;
      if (active === current) return;
      current?.removeAttribute("aria-current");
      current = active;
      if (current) {
        current.setAttribute("aria-current", "location");
        const strip = current.closest("ul");
        if (strip && strip.scrollWidth > strip.clientWidth) {
          strip.scrollTo({ left: current.offsetLeft - strip.clientWidth / 2 + current.offsetWidth / 2, behavior: lessMotion() ? "auto" : "smooth" });
        }
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      current?.removeAttribute("aria-current");
    };
  }, []);

  return <span ref={marker} hidden />;
}
