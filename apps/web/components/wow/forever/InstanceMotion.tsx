"use client";

import { useEffect, useRef } from "react";
import { lessMotion, subscribeSiteMotion } from "@gildra/atlas-ui/motionPreference";

function milliseconds(value: string, fallback: number) {
  const match = /^(\d*\.?\d+)\s*(ms|s)$/.exec(value.trim());
  return match ? Number(match[1]) * (match[2] === "s" ? 1000 : 1) : fallback;
}

/**
 * Cascade of the card grids of the dungeon and raid pages (after the home page's HomeMotion): cards
 * of the grids marked `data-instance-cascade` beside it rise one after another as they are scrolled to.
 * Nothing is hidden while it waits; what is on screen when the page lands stays put; reduced motion,
 * "Less motion", reduced transparency and forced colours leave the page still.
 */
export function InstanceMotion() {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const scope = marker.current?.parentElement;
    if (!scope) return;
    if (typeof IntersectionObserver === "undefined" || typeof HTMLElement.prototype.animate !== "function") return;
    const root = document.documentElement;
    const preferences = [
      window.matchMedia("(prefers-reduced-motion: reduce)"),
      window.matchMedia("(prefers-reduced-transparency: reduce)"),
      window.matchMedia("(forced-colors: active)"),
    ];
    const reduced = () => lessMotion() || preferences.some(query => query.matches) || !!document.querySelector('[data-ui-motion="reduce"], [data-transparency="reduced"]');
    const style = getComputedStyle(root);
    const easing = style.getPropertyValue("--atlas-ease").trim() || "ease-out";
    const duration = milliseconds(style.getPropertyValue("--atlas-duration-enter"), 620);
    const stagger = milliseconds(style.getPropertyValue("--atlas-stagger"), 60);
    const shift = Number.parseFloat(style.getPropertyValue("--atlas-reveal-shift")) || 14;
    const running = new Set<Animation>();
    const seen = new WeakSet<Element>();

    const observer = new IntersectionObserver(entries => {
      // Cards that come into view together rise left to right, top to bottom.
      const arriving = entries.filter(entry => entry.isIntersecting && !seen.has(entry.target)).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left);
      arriving.forEach((entry, index) => {
        seen.add(entry.target);
        observer.unobserve(entry.target);
        if (reduced() || document.hidden || entry.target.contains(document.activeElement)) return;
        // What a jump (Back, a restored scroll position, an anchor) has already put on screen stays as it is.
        if (entry.boundingClientRect.top < window.innerHeight - 48) return;
        try {
          const animation = entry.target.animate([{ opacity: 0, translate: `0 ${shift + 6}px` }, { opacity: 1, translate: "0 0px" }], { duration, delay: Math.min(index * stagger, 360), easing, fill: "backwards" });
          running.add(animation);
          const done = () => running.delete(animation);
          animation.onfinish = done;
          animation.oncancel = done;
        } catch {
          // Unsupported animation details leave the content as the server sent it.
        }
      });
      // The margin starts an arrival just under the fold, before its first line is in view.
    }, { rootMargin: "0px 0px 24px 0px" });

    // A grid belongs to the first cascade that finds it (a page-level one or the grid's own).
    const grids = [...scope.querySelectorAll<HTMLElement>("[data-instance-cascade]")].filter(grid => grid.dataset.instanceCascade !== "on");
    for (const grid of grids) {
      grid.dataset.instanceCascade = "on";
      for (const card of grid.children) {
        // In view when the page lands: it is part of the first screen and stays put.
        if (card.getBoundingClientRect().top >= window.innerHeight) observer.observe(card);
        else seen.add(card);
      }
    }

    const stop = () => { if (reduced()) for (const animation of [...running]) animation.cancel(); };
    const unsubscribe = subscribeSiteMotion(stop);
    preferences.forEach(query => query.addEventListener("change", stop));
    return () => {
      observer.disconnect();
      for (const grid of grids) grid.dataset.instanceCascade = "";
      unsubscribe();
      preferences.forEach(query => query.removeEventListener("change", stop));
      for (const animation of [...running]) animation.cancel();
    };
  }, []);
  return <span ref={marker} hidden />;
}
