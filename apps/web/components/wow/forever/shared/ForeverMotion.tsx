"use client";

import { useEffect } from "react";
import { lessMotion, subscribeSiteMotion } from "@gildra/atlas-ui/motionPreference";

function milliseconds(value: string, fallback: number) {
  const match = /^(\d*\.?\d+)\s*(ms|s)$/.exec(value.trim());
  return match ? Number(match[1]) * (match[2] === "s" ? 1000 : 1) : fallback;
}

/**
 * The section's motion over readable server content: a group marked `data-forever-cascade`
 * (art cards, rows, crests) rises child by child when it is scrolled to, and a link inside
 * `data-forever-glide` glides to its chapter. What the page lands on stays put (its first-screen cascade is CSS, forever.module.css); nothing is hidden while it waits.
 */
export function ForeverMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-forever]");
    if (!root || typeof IntersectionObserver === "undefined" || typeof HTMLElement.prototype.animate !== "function") return;
    const preferences = [
      window.matchMedia("(prefers-reduced-motion: reduce)"),
      window.matchMedia("(prefers-reduced-transparency: reduce)"),
      window.matchMedia("(forced-colors: active)"),
    ];
    const reduced = () => lessMotion() || preferences.some(query => query.matches) || !!root.closest('[data-ui-motion="reduce"], [data-transparency="reduced"]');
    const style = getComputedStyle(root);
    const easing = style.getPropertyValue("--atlas-ease").trim() || "ease-out";
    const duration = milliseconds(style.getPropertyValue("--atlas-duration-enter"), 620);
    const stagger = milliseconds(style.getPropertyValue("--atlas-stagger"), 60);
    const shift = Number.parseFloat(style.getPropertyValue("--atlas-reveal-shift")) || 14;
    const running = new Set<Animation>();

    const rise = (element: HTMLElement, delay: number) => {
      if (reduced() || document.hidden || element.contains(document.activeElement)) return;
      // What a jump (Back, a restored scroll position) has already put on screen stays as it is.
      if (element.getBoundingClientRect().top < window.innerHeight - 120) return;
      try {
        const animation = element.animate([{ opacity: 0, translate: `0 ${shift + 6}px` }, { opacity: 1, translate: "0 0px" }], { duration, delay, easing, fill: "backwards" });
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
        if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) continue;
        observer.unobserve(entry.target);
        const items = Array.from(entry.target.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
        const step = items.length > 6 ? stagger / 2 : stagger;
        items.forEach((element, index) => rise(element, Math.min(index * step, 360)));
      }
      // The margin starts an arrival just under the fold, before its first line is in view.
    }, { rootMargin: "0px 0px 24px 0px" });
    for (const group of root.querySelectorAll<HTMLElement>("[data-forever-cascade]")) {
      // In view when the page lands: it is part of the first screen and stays put.
      if (group.getBoundingClientRect().top >= window.innerHeight) observer.observe(group);
    }

    // A link inside `data-forever-glide` (the hub banners) glides to its chapter and the chapter's sign answers.
    let disposed = false;
    const glide = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('[data-forever-glide] a[href^="#"]') : null;
      const target = link && root.contains(link) ? document.getElementById(decodeURIComponent(link.hash.slice(1))) : null;
      if (!link || !target) return;
      event.preventDefault();
      const still = reduced();
      target.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
      history.pushState(null, "", link.hash);
      if (still) return;
      delete target.dataset.foreverArrived;
      const settle = () => { if (!disposed) target.dataset.foreverArrived = ""; };
      if ("onscrollend" in window) window.addEventListener("scrollend", settle, { once: true });
      else setTimeout(settle, duration);
    };
    root.addEventListener("click", glide);

    const stop = () => { if (reduced()) for (const animation of [...running]) animation.cancel(); };
    const unsubscribe = subscribeSiteMotion(stop);
    preferences.forEach(query => query.addEventListener("change", stop));
    return () => {
      disposed = true;
      observer.disconnect();
      root.removeEventListener("click", glide);
      root.querySelectorAll<HTMLElement>("[data-forever-arrived]").forEach(element => { delete element.dataset.foreverArrived; });
      unsubscribe();
      preferences.forEach(query => query.removeEventListener("change", stop));
      for (const animation of [...running]) animation.cancel();
    };
  }, []);

  return null;
}
