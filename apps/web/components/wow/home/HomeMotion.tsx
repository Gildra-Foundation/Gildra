"use client";

import { useEffect, useLayoutEffect } from "react";
import { lessMotion, routeTurnActive, subscribeSiteMotion } from "@gildra/atlas-ui/motionPreference";

/** The first screen arrives once per visit (CSS, from the first paint); a return to the page lands as it is. */
let arrived = false;

function milliseconds(value: string, fallback: number) {
  const match = /^(\d*\.?\d+)\s*(ms|s)$/.exec(value.trim());
  return match ? Number(match[1]) * (match[2] === "s" ? 1000 : 1) : fallback;
}

/** Motion over readable server content: chapters rise as they are scrolled to, the banners
 * glide to their chapter, late images fade in. Nothing is hidden while it waits. */
export function HomeMotion() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-wow-atlas]");
    if (!root) return;
    if (arrived || routeTurnActive()) root.dataset.homeArrival = "skip";
    arrived = true;
    return () => { delete root.dataset.homeArrival; };
  }, []);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-wow-atlas]");
    if (!root || typeof HTMLElement.prototype.animate !== "function") return;
    const preferences = [
      window.matchMedia("(prefers-reduced-motion: reduce)"),
      window.matchMedia("(prefers-reduced-transparency: reduce)"),
      window.matchMedia("(forced-colors: active)"),
    ];
    const reduced = () => lessMotion() || preferences.some(query => query.matches) || !!root.closest('[data-ui-motion="reduce"], [data-transparency="reduced"]');
    const style = getComputedStyle(root);
    const spring = style.getPropertyValue("--ui-spring-smooth").trim();
    const easing = spring && CSS.supports("animation-timing-function", spring) ? spring : style.getPropertyValue("--atlas-ease").trim() || "ease-out";
    const duration = milliseconds(style.getPropertyValue("--atlas-duration-enter"), 620);
    const stagger = milliseconds(style.getPropertyValue("--atlas-stagger"), 60);
    const shift = Number.parseFloat(style.getPropertyValue("--atlas-reveal-shift")) || 14;
    const running = new Set<Animation>();
    const cleanups: (() => void)[] = [];
    let disposed = false;

    const play = (element: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions) => {
      try {
        const animation = element.animate(frames, { easing, fill: "backwards", ...options });
        running.add(animation);
        const done = () => running.delete(animation);
        animation.onfinish = done;
        animation.oncancel = done;
      } catch {
        // Unsupported animation details leave the content as the server sent it.
      }
    };
    const rise = (element: HTMLElement, delay: number) => {
      if (reduced() || document.hidden || element.contains(document.activeElement)) return;
      // What a jump (Back, a restored scroll position) has already put on screen stays as it is.
      if (element.getBoundingClientRect().top < window.innerHeight - 48) return;
      play(element, [{ opacity: 0, translate: `0 ${shift + 6}px` }, { opacity: 1, translate: "0 0px" }], { duration, delay });
    };

    // A chapter's heading, then its rows and plaques as a cascade.
    const units: HTMLElement[][] = [];
    for (const section of root.querySelectorAll<HTMLElement>("section[aria-labelledby]")) {
      if (section.firstElementChild instanceof HTMLElement) units.push([section.firstElementChild]);
    }
    for (const group of root.querySelectorAll<HTMLElement>("[data-home-cascade]")) {
      units.push(Array.from(group.children).filter((child): child is HTMLElement => child instanceof HTMLElement));
    }
    for (const element of root.querySelectorAll<HTMLElement>("[data-home-reveal]")) units.push([element]);

    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) continue;
        observer?.unobserve(entry.target);
        const unit = units.find(unit => unit[0] === entry.target);
        const step = unit && unit.length > 6 ? stagger / 2 : stagger;
        unit?.forEach((element, index) => rise(element, Math.min(index * step, 360)));
      }
      // The margin starts an arrival just under the fold, before its first line is in view.
    }, { rootMargin: "0px 0px 24px 0px" });
    for (const unit of units) {
      // In view when the page lands: it is part of the first screen and stays put.
      if (unit[0] && unit[0].getBoundingClientRect().top >= window.innerHeight) observer?.observe(unit[0]);
    }

    // Pictures that load after the page fade in instead of popping.
    for (const image of root.querySelectorAll<HTMLImageElement>('img[loading="lazy"]')) {
      if (image.complete) continue;
      const loaded = () => { if (!disposed && !reduced()) play(image, [{ opacity: 0 }, { opacity: 1 }], { duration: duration / 2, easing: "ease-out" }); };
      image.addEventListener("load", loaded, { once: true });
      cleanups.push(() => image.removeEventListener("load", loaded));
    }

    // A banner glides to its chapter and the chapter's sign answers.
    const glide = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href^="#"]') : null;
      const target = link && root.contains(link) ? document.getElementById(decodeURIComponent(link.hash.slice(1))) : null;
      if (!link || !target) return;
      event.preventDefault();
      const still = reduced();
      target.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
      history.pushState(null, "", link.hash);
      if (still) return;
      delete target.dataset.homeArrived;
      const settle = () => { if (!disposed) target.dataset.homeArrived = ""; };
      if ("onscrollend" in window) window.addEventListener("scrollend", settle, { once: true });
      else setTimeout(settle, duration);
    };
    root.addEventListener("click", glide);

    const stop = () => { if (reduced()) for (const animation of [...running]) animation.cancel(); };
    const unsubscribe = subscribeSiteMotion(stop);
    preferences.forEach(query => query.addEventListener("change", stop));

    return () => {
      disposed = true;
      observer?.disconnect();
      root.removeEventListener("click", glide);
      cleanups.forEach(cleanup => cleanup());
      unsubscribe();
      preferences.forEach(query => query.removeEventListener("change", stop));
      for (const animation of [...running]) animation.cancel();
      root.querySelectorAll<HTMLElement>("[data-home-arrived]").forEach(element => { delete element.dataset.homeArrived; });
    };
  }, []);

  return null;
}
