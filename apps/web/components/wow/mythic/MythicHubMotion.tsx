"use client";

import { useEffect } from "react";
import { lessMotion, subscribeSiteMotion } from "@gildra/atlas-ui/motionPreference";
import styles from "./mythicHubMotion.module.css";

const revealSelector = "[data-hub-reveal], [data-hub-dungeon-card], [data-mythic-hub-timers]";

function milliseconds(value: string, fallback: number) {
  const match = /^(\d*\.?\d+)\s*(ms|s)$/.exec(value.trim());
  return match ? Number(match[1]) * (match[2] === "s" ? 1000 : 1) : fallback;
}

/** Visible server content gets one quiet arrival. Nothing waits for hydration,
 * scrolling never renders React, and card hover keeps its own transform. */
export function MythicHubMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-mythic-hub]");
    if (!root || typeof HTMLElement.prototype.animate !== "function") return;

    root.classList.add(styles.motion);
    root.dataset.hubMotion = "ready";
    const preferences = [
      window.matchMedia("(prefers-reduced-motion: reduce)"),
      window.matchMedia("(prefers-reduced-transparency: reduce)"),
      window.matchMedia("(forced-colors: active)"),
    ];
    const reduced = () => lessMotion() || preferences.some((query) => query.matches)
      || !!root.closest('[data-ui-motion="reduce"]');
    const style = getComputedStyle(root);
    // Genuine installed Valyro smooth spring, exposed by AtlasValyroScope.
    const spring = style.getPropertyValue("--ui-spring-smooth").trim();
    const easing = spring && CSS.supports("animation-timing-function", spring)
      ? spring : style.getPropertyValue("--atlas-ease").trim() || "ease-out";
    const duration = Math.min(620, milliseconds(style.getPropertyValue("--hub-enter-duration"), 620));
    const stagger = Math.min(60, milliseconds(style.getPropertyValue("--hub-enter-stagger"), 60));
    const running = new Map<HTMLElement, Animation>();
    const marked = new Set<HTMLElement>();
    const seen = new WeakSet<HTMLElement>();
    let disposed = false;

    const settle = (element: HTMLElement) => {
      const animation = running.get(element);
      running.delete(element);
      animation?.cancel();
      element.dataset.hubRevealed = "true";
    };
    const settleAll = () => {
      for (const element of running.keys()) settle(element);
    };
    const arrive = (element: HTMLElement, delay = 0, distance = 14) => {
      if (disposed || seen.has(element)) return;
      seen.add(element);
      marked.add(element);
      element.dataset.hubMotionItem = "";
      element.dataset.hubRevealed = "true";
      if (reduced() || document.hidden || element.contains(document.activeElement)) return;
      const animation = element.animate([
        { opacity: .86, translate: `0 ${distance}px` },
        { opacity: 1, translate: "0 0px" },
      ], { duration, delay, easing, fill: "backwards" });
      running.set(element, animation);
      animation.onfinish = () => settle(element);
    };

    // One hero cascade, including its facts as a group. The page frame belongs
    // to the global route transition; it never receives a second entrance.
    const hero = root.querySelector<HTMLElement>("[data-hub-hero]");
    if (hero) {
      const box = hero.getBoundingClientRect();
      if (box.bottom > 0 && box.top < window.innerHeight) {
        hero.querySelectorAll<HTMLElement>('h1, p, [role="list"], [data-hub-actions]')
          .forEach((element, index) => arrive(element, Math.min(index, 3) * stagger, element.tagName === "H1" ? 16 : 10));
      }
    }

    const targets = new Set<HTMLElement>();
    root.querySelectorAll<HTMLElement>(revealSelector).forEach((element) => {
      if (element.closest("[data-hub-hero]")) return;
      // A section heading can enter alongside its cards; never move a whole
      // section and each of its children at the same time.
      if (element.hasAttribute("data-hub-reveal") && element.querySelector(revealSelector)) {
        const heading = element.querySelector<HTMLElement>("h2, h3");
        if (heading?.parentElement) targets.add(heading.parentElement);
      } else targets.add(element);
    });
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
      let visibleIndex = 0;
      for (const entry of entries) {
        if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) continue;
        observer?.unobserve(entry.target);
        // Neighbours share a small stagger; an entire grid never queues up.
        arrive(entry.target, Math.min(visibleIndex++, 2) * stagger);
      }
    }, { threshold: .08, rootMargin: "0px 0px -28px 0px" });
    for (const target of targets) observer?.observe(target);

    const stopForPreference = () => { if (reduced()) settleAll(); };
    const stopForVisibility = () => { if (document.hidden) settleAll(); };
    const stopForInteraction = (event: Event) => {
      const element = event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-hub-motion-item]") : null;
      if (element && root.contains(element)) settle(element);
    };
    const unsubscribe = subscribeSiteMotion(stopForPreference);
    preferences.forEach((query) => query.addEventListener("change", stopForPreference));
    document.addEventListener("visibilitychange", stopForVisibility);
    root.addEventListener("focusin", stopForInteraction);
    root.addEventListener("pointerdown", stopForInteraction);

    return () => {
      disposed = true;
      observer?.disconnect();
      unsubscribe();
      preferences.forEach((query) => query.removeEventListener("change", stopForPreference));
      document.removeEventListener("visibilitychange", stopForVisibility);
      root.removeEventListener("focusin", stopForInteraction);
      root.removeEventListener("pointerdown", stopForInteraction);
      settleAll();
      for (const element of marked) {
        delete element.dataset.hubMotionItem;
        delete element.dataset.hubRevealed;
      }
      root.classList.remove(styles.motion);
      delete root.dataset.hubMotion;
    };
  }, []);

  return null;
}
