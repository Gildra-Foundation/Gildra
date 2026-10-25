"use client";

import { useEffect } from "react";
import { lessMotion, subscribeSiteMotion } from "@gildra/atlas-ui/motionPreference";
import styles from "./raidHubMotion.module.css";

const revealSelector = "[data-raid-hub-reveal], [data-hub-raid-card]";
const heroSelector = 'h1, p, [role="list"], [data-raid-hub-actions]';

function milliseconds(value: string, fallback: number) {
  const match = /^(\d*\.?\d+)\s*(ms|s)$/.exec(value.trim());
  return match ? Number(match[1]) * (match[2] === "s" ? 1000 : 1) : fallback;
}

/** One quiet arrival over readable server content. The route frame and each
 * card's hover transform remain independent; scrolling never renders React. */
export function RaidHubMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-raid-hub]");
    if (!root || typeof HTMLElement.prototype.animate !== "function") return;

    root.classList.add(styles.motion);
    root.dataset.raidHubMotion = "ready";
    const preferences = [
      window.matchMedia("(prefers-reduced-motion: reduce)"),
      window.matchMedia("(prefers-reduced-transparency: reduce)"),
      window.matchMedia("(forced-colors: active)"),
    ];
    const reduced = () => lessMotion() || preferences.some((query) => query.matches)
      || !!root.closest('[data-ui-motion="reduce"]');
    const style = getComputedStyle(root);
    // The genuine installed Valyro smooth spring is supplied by AtlasValyroScope.
    const spring = style.getPropertyValue("--ui-spring-smooth").trim();
    const easing = spring && CSS.supports("animation-timing-function", spring)
      ? spring : style.getPropertyValue("--atlas-ease").trim() || "ease-out";
    const duration = Math.min(620, milliseconds(style.getPropertyValue("--raid-hub-enter-duration"), 620));
    const stagger = Math.min(60, milliseconds(style.getPropertyValue("--raid-hub-enter-stagger"), 60));
    const running = new Map<HTMLElement, Animation>();
    const marked = new Set<HTMLElement>();
    const seen = new WeakSet<HTMLElement>();
    let disposed = false;

    const settle = (element: HTMLElement) => {
      const animation = running.get(element);
      running.delete(element);
      animation?.cancel();
    };
    const settleAll = () => {
      for (const element of running.keys()) settle(element);
    };
    const arrive = (element: HTMLElement, delay = 0, distance = 14) => {
      if (disposed || seen.has(element)) return;
      seen.add(element);
      marked.add(element);
      element.dataset.raidHubMotionItem = "";
      element.dataset.raidHubRevealed = "true";
      if (reduced() || document.hidden || element.contains(document.activeElement)) return;
      try {
        const animation = element.animate([
          { opacity: .86, translate: `0 ${distance}px` },
          { opacity: 1, translate: "0 0px" },
        ], { duration, delay, easing, fill: "backwards" });
        running.set(element, animation);
        animation.onfinish = () => settle(element);
      } catch {
        // Unsupported Web Animation details leave the original content visible.
        settle(element);
      }
    };

    const targets = new Set<HTMLElement>();
    root.querySelectorAll<HTMLElement>(revealSelector).forEach((element) => {
      if (element.closest("[data-raid-hub-hero]")) return;
      // Move a section's heading alongside its cards, never the section and its
      // children together. Header descriptions share the heading's arrival.
      if (element.hasAttribute("data-raid-hub-reveal") && element.querySelector(revealSelector)) {
        const heading = element.querySelector<HTMLElement>("h2, h3");
        if (heading?.parentElement) targets.add(heading.parentElement);
      } else targets.add(element);
    });
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
      let visibleIndex = 0;
      for (const entry of entries) {
        if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) continue;
        observer?.unobserve(entry.target);
        arrive(entry.target, Math.min(visibleIndex++, 2) * stagger);
      }
    }, { threshold: .08, rootMargin: "0px 0px -28px 0px" });

    // Deferring one microtask lets Strict Mode clean up its trial setup before
    // an entrance begins. There are no timers or animation frames to leak.
    queueMicrotask(() => {
      if (disposed) return;
      const hero = root.querySelector<HTMLElement>("[data-raid-hub-hero]");
      if (hero) {
        const box = hero.getBoundingClientRect();
        if (box.bottom > 0 && box.top < window.innerHeight) {
          const groups = Array.from(hero.querySelectorAll<HTMLElement>(heroSelector));
          groups.filter((element) => !groups.some((other) => other !== element && other.contains(element)))
            .forEach((element, index) => arrive(element, Math.min(index, 3) * stagger, element.tagName === "H1" ? 16 : 10));
        }
      }
      for (const target of targets) {
        if (observer) observer.observe(target);
        else arrive(target);
      }
    });

    const stopForPreference = () => { if (reduced()) settleAll(); };
    const stopForVisibility = () => { if (document.hidden) settleAll(); };
    const stopForInteraction = (event: Event) => {
      const element = event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-raid-hub-motion-item]") : null;
      if (element && root.contains(element)) settle(element);
    };
    const unsubscribe = subscribeSiteMotion(stopForPreference);
    const attributes = typeof MutationObserver === "undefined" ? null : new MutationObserver(stopForPreference);
    // A local Valyro scope can change its preference independently of the site toggle.
    for (let parent: HTMLElement | null = root; parent; parent = parent.parentElement) {
      attributes?.observe(parent, { attributes: true, attributeFilter: ["data-motion", "data-ui-motion"] });
    }
    preferences.forEach((query) => query.addEventListener("change", stopForPreference));
    document.addEventListener("visibilitychange", stopForVisibility);
    root.addEventListener("focusin", stopForInteraction);
    root.addEventListener("pointerdown", stopForInteraction);

    return () => {
      disposed = true;
      observer?.disconnect();
      attributes?.disconnect();
      unsubscribe();
      preferences.forEach((query) => query.removeEventListener("change", stopForPreference));
      document.removeEventListener("visibilitychange", stopForVisibility);
      root.removeEventListener("focusin", stopForInteraction);
      root.removeEventListener("pointerdown", stopForInteraction);
      settleAll();
      for (const element of marked) {
        delete element.dataset.raidHubMotionItem;
        delete element.dataset.raidHubRevealed;
      }
      root.classList.remove(styles.motion);
      delete root.dataset.raidHubMotion;
    };
  }, []);

  return null;
}
