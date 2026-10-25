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
    const reduced = (element: Element = root) => lessMotion() || preferences.some((query) => query.matches)
      || !!element.closest('[data-ui-motion="reduce"], [data-transparency="reduced"]');
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
    const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-hub-raid-card]"));
    const visibleCards = new Set<HTMLElement>();
    const scenes = new Map<HTMLElement, HTMLElement>();
    const decodedScenes = new WeakSet<HTMLElement>();
    const revealedScenes = new WeakSet<HTMLElement>();
    const imageCleanups: (() => void)[] = [];
    const ornamentPieces = Array.from(root.querySelectorAll<HTMLElement>("[data-raid-ornament-piece]"));
    const visibleOrnaments = new Set<HTMLElement>();
    let disposed = false;

    // A cutout starts growing after its own image decodes, so slow connections
    // get the same arrival as a cached page. CSS keeps no-JS/reduced views static.
    for (const piece of ornamentPieces) {
      const image = piece.querySelector<HTMLImageElement>("img");
      if (!image) continue;
      const growth = piece.querySelector<HTMLElement>("[data-growth]");
      const grown = (event: AnimationEvent) => {
        if (event.target === growth) piece.dataset.raidOrnamentGrown = "";
      };
      growth?.addEventListener("animationend", grown);
      imageCleanups.push(() => growth?.removeEventListener("animationend", grown));
      const ready = () => {
        if (disposed || image.naturalWidth === 0) return;
        const decoded = typeof image.decode === "function" ? image.decode() : Promise.resolve();
        void decoded.catch(() => {}).then(() => {
          if (!disposed) piece.dataset.raidOrnamentReady = "";
        });
      };
      image.addEventListener("load", ready, { once: true });
      imageCleanups.push(() => image.removeEventListener("load", ready));
      if (image.complete) ready();
    }

    const syncAtmosphere = () => {
      if (disposed) return;
      for (const card of cards) card.toggleAttribute("data-raid-card-active", !document.hidden && !reduced(card) && visibleCards.has(card));
      for (const piece of ornamentPieces) piece.toggleAttribute("data-raid-ornament-active", !document.hidden && !reduced(piece) && visibleOrnaments.has(piece));
    };
    // Footer details arrive when the detail itself enters the viewport, rather
    // than growing unseen while the painting at the top of its raid is visible.
    const ornamentObserver = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!(entry.target instanceof HTMLElement)) continue;
        if (entry.isIntersecting) {
          visibleOrnaments.add(entry.target);
          entry.target.dataset.raidOrnamentRevealed = "true";
          if (reduced(entry.target)) entry.target.dataset.raidOrnamentGrown = "";
        } else visibleOrnaments.delete(entry.target);
      }
      syncAtmosphere();
    }, { threshold: .18, rootMargin: "0px 0px -12px 0px" });
    if (!ornamentObserver) root.dataset.raidOrnamentsStatic = "";
    const atmosphereObserver = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!(entry.target instanceof HTMLElement)) continue;
        if (entry.isIntersecting) visibleCards.add(entry.target);
        else {
          visibleCards.delete(entry.target);
          const scene = scenes.get(entry.target);
          if (scene) settle(scene);
        }
      }
      syncAtmosphere();
      for (const card of visibleCards) revealScene(card);
    });

    const settle = (element: HTMLElement) => {
      const animation = running.get(element);
      running.delete(element);
      animation?.cancel();
    };
    const settleAll = () => {
      for (const element of running.keys()) settle(element);
    };
    // Art settles only after the card finishes entering, and only after its real
    // image decodes. Both layers remain readable from the first server paint.
    function revealScene(card: HTMLElement) {
      const layer = scenes.get(card);
      if (disposed || !layer || revealedScenes.has(card) || !decodedScenes.has(card)
        || !seen.has(card) || running.has(card) || !visibleCards.has(card)) return;
      revealedScenes.add(card);
      if (reduced(card) || document.hidden || card.contains(document.activeElement) || card.matches(":hover")) return;
      layer.dataset.raidHubMotionItem = "";
      marked.add(layer);
      try {
        const animation = layer.animate([
          { opacity: .94, scale: "1.025" },
          { opacity: 1, scale: "1" },
        ], { duration: Math.min(duration, 540), easing, fill: "backwards" });
        running.set(layer, animation);
        animation.onfinish = () => settle(layer);
      } catch { settle(layer); }
    }
    for (const card of cards) {
      const layer = card.querySelector<HTMLElement>("[data-raid-card-scene]");
      const image = card.querySelector<HTMLImageElement>("[data-raid-card-image]");
      if (!layer || !image) continue;
      scenes.set(card, layer);
      const ready = () => {
        if (disposed || image.naturalWidth === 0) return;
        const decoded = typeof image.decode === "function" ? image.decode() : Promise.resolve();
        void decoded.catch(() => {}).then(() => {
          if (disposed) return;
          decodedScenes.add(card);
          revealScene(card);
        });
      };
      image.addEventListener("load", ready, { once: true });
      imageCleanups.push(() => image.removeEventListener("load", ready));
      if (image.complete) ready();
    }
    const arrive = (element: HTMLElement, delay = 0, distance = 14) => {
      if (disposed || seen.has(element)) return;
      seen.add(element);
      marked.add(element);
      element.dataset.raidHubMotionItem = "";
      element.dataset.raidHubRevealed = "true";
      if (reduced(element) || document.hidden || element.contains(document.activeElement)) return;
      try {
        const animation = element.animate([
          { opacity: .86, translate: `0 ${distance}px` },
          { opacity: 1, translate: "0 0px" },
        ], { duration, delay, easing, fill: "backwards" });
        running.set(element, animation);
        animation.onfinish = () => { settle(element); revealScene(element); };
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
      for (const card of cards) atmosphereObserver?.observe(card);
      for (const piece of ornamentPieces) ornamentObserver?.observe(piece);
    });

    const stopScenes = () => { settleAll(); for (const card of visibleCards) revealedScenes.add(card); };
    const stopForPreference = () => {
      for (const element of running.keys()) if (reduced(element)) settle(element);
      for (const card of visibleCards) if (reduced(card)) revealedScenes.add(card);
      for (const piece of ornamentPieces) {
        if (reduced(piece) && piece.dataset.raidOrnamentRevealed) piece.dataset.raidOrnamentGrown = "";
      }
      syncAtmosphere();
    };
    const stopForVisibility = () => { if (document.hidden) stopScenes(); syncAtmosphere(); };
    const stopForInteraction = (event: Event) => {
      const element = event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-raid-hub-motion-item]") : null;
      if (element && root.contains(element)) settle(element);
      const card = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-hub-raid-card]") : null;
      if (card && root.contains(card)) {
        revealedScenes.add(card);
        const scene = scenes.get(card);
        if (scene) settle(scene);
        for (const piece of card.querySelectorAll<HTMLElement>("[data-raid-ornament-piece]")) {
          piece.dataset.raidOrnamentSettled = "";
          piece.dataset.raidOrnamentGrown = "";
        }
      }
    };
    const unsubscribe = subscribeSiteMotion(stopForPreference);
    const attributes = typeof MutationObserver === "undefined" ? null : new MutationObserver(stopForPreference);
    // Local Valyro scopes and the site's transparency choice can change independently.
    const preferenceAttributes = ["data-motion", "data-ui-motion", "data-transparency"];
    attributes?.observe(root, { attributes: true, subtree: true, attributeFilter: preferenceAttributes });
    for (let parent = root.parentElement; parent; parent = parent.parentElement) {
      attributes?.observe(parent, { attributes: true, attributeFilter: preferenceAttributes });
    }
    preferences.forEach((query) => query.addEventListener("change", stopForPreference));
    document.addEventListener("visibilitychange", stopForVisibility);
    root.addEventListener("focusin", stopForInteraction);
    root.addEventListener("pointerdown", stopForInteraction);

    return () => {
      disposed = true;
      observer?.disconnect();
      atmosphereObserver?.disconnect();
      ornamentObserver?.disconnect();
      imageCleanups.forEach((cleanup) => cleanup());
      ornamentPieces.forEach((piece) => {
        delete piece.dataset.raidOrnamentReady;
        delete piece.dataset.raidOrnamentRevealed;
        delete piece.dataset.raidOrnamentActive;
        delete piece.dataset.raidOrnamentGrown;
        delete piece.dataset.raidOrnamentSettled;
      });
      delete root.dataset.raidOrnamentsStatic;
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
      for (const card of cards) card.removeAttribute("data-raid-card-active");
    };
  }, []);

  return null;
}
