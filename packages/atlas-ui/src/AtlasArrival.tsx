"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { lessMotion, routeTurnActive, subscribeSiteMotion } from "./motionPreference";

/** Frames whose page brings an arrival of its own: the home page, the Mythic+ and raid hubs. */
const OWN_ARRIVAL = "[data-wow-atlas], [data-mythic-hub], [data-raid-hub]";

/** The frame the visit opened with: its hero arrives by CSS from the first paint (AtlasHero.module.css). */
let landing: HTMLElement | null = null;

function milliseconds(value: string, fallback: number) {
  const match = /^(\d*\.?\d+)\s*(ms|s)$/.exec(value.trim());
  return match ? Number(match[1]) * (match[2] === "s" ? 1000 : 1) : fallback;
}

/**
 * The arrival every atlas page shares. The hero settles as a cascade on the first load only: a page
 * reached through the site is brought in by the route hand-over, so its frame is marked to skip.
 * Below the fold a section rises once as it is scrolled to; nothing is hidden while it waits.
 */
export function AtlasArrival() {
  const anchor = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const frame = anchor.current?.closest<HTMLElement>("[data-atlas-frame]");
    if (!frame) return;
    if (!landing && !routeTurnActive()) landing = frame;
    if (frame !== landing) frame.dataset.atlasArrival = "skip";
    return () => { delete frame.dataset.atlasArrival; };
  }, []);

  useEffect(() => {
    const frame = anchor.current?.closest<HTMLElement>("[data-atlas-frame]");
    if (!frame || frame.matches(OWN_ARRIVAL) || typeof IntersectionObserver === "undefined" || typeof HTMLElement.prototype.animate !== "function") return;
    const preferences = [
      window.matchMedia("(prefers-reduced-motion: reduce)"),
      window.matchMedia("(prefers-reduced-transparency: reduce)"),
      window.matchMedia("(forced-colors: active)"),
    ];
    const reduced = () => lessMotion() || preferences.some(query => query.matches) || !!frame.closest('[data-ui-motion="reduce"], [data-transparency="reduced"]');
    const style = getComputedStyle(frame);
    const easing = style.getPropertyValue("--atlas-ease").trim() || "ease-out";
    const duration = milliseconds(style.getPropertyValue("--atlas-duration-enter"), 620);
    const stagger = milliseconds(style.getPropertyValue("--atlas-stagger"), 60);
    const shift = Number.parseFloat(style.getPropertyValue("--atlas-reveal-shift")) || 14;
    const running = new Set<Animation>();

    const rise = (element: Element, delay: number) => {
      try {
        const animation = element.animate([{ opacity: 0, translate: `0 ${shift}px` }, { opacity: 1, translate: "0 0px" }], { duration, delay, easing, fill: "backwards" });
        running.add(animation);
        const done = () => running.delete(animation);
        animation.onfinish = done;
        animation.oncancel = done;
      } catch {
        // Unsupported animation details leave the content as the server sent it.
      }
    };

    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        if (reduced() || document.hidden || entry.target.contains(document.activeElement)) continue;
        // What a jump (Back, a restored scroll position, an anchor) has already put on screen stays as it is.
        if (entry.boundingClientRect.top < window.innerHeight - 48) continue;
        // The heading first, then the section's content as one step.
        Array.from(entry.target.children).forEach((child, index) => rise(child, index === 0 ? 0 : stagger));
      }
      // The margin starts an arrival just under the fold, before its first line is in view.
    }, { rootMargin: "0px 0px 24px 0px" });
    for (const section of frame.querySelectorAll<HTMLElement>("[data-atlas-section]")) {
      // In view when the page lands: it is part of the first screen and stays put.
      if (section.getBoundingClientRect().top >= window.innerHeight) observer.observe(section);
    }

    const stop = () => { if (reduced()) for (const animation of [...running]) animation.cancel(); };
    const unsubscribe = subscribeSiteMotion(stop);
    preferences.forEach(query => query.addEventListener("change", stop));
    return () => {
      observer.disconnect();
      unsubscribe();
      preferences.forEach(query => query.removeEventListener("change", stop));
      for (const animation of [...running]) animation.cancel();
    };
  }, []);

  return <i ref={anchor} hidden />;
}
