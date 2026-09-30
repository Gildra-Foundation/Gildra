"use client";

import { type RefObject, useEffect } from "react";

const revealSelector = "[data-book-reveal]";

/** Enhance visible content once, without putting the character workspace in
 * an invisible pre-hydration state or rerendering it as the reader scrolls. */
export function useCharacterBookReveals(rootRef: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root || typeof IntersectionObserver === "undefined") return;

    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches) return;

    let active = true;
    const pending = new Set<Element>();
    const observer = new IntersectionObserver((entries) => {
      if (!active) return;
      for (const entry of entries) {
        if (!entry.isIntersecting || preference.matches) continue;
        observer.unobserve(entry.target);
        pending.delete(entry.target);
        if (root.contains(entry.target)) entry.target.setAttribute("data-book-revealed", "true");
      }
    }, { rootMargin: "0px 0px -32px 0px", threshold: 0.08 });

    const observe = (element: Element) => {
      if (active && root.contains(element) && !element.hasAttribute("data-book-revealed") && !pending.has(element)) {
        pending.add(element);
        observer.observe(element);
      }
    };
    const visit = (node: Node, action: (element: Element) => void) => {
      if (!(node instanceof Element)) return;
      if (node.matches(revealSelector)) action(node);
      node.querySelectorAll(revealSelector).forEach(action);
    };
    const unobserve = (element: Element) => {
      observer.unobserve(element);
      pending.delete(element);
    };

    root.querySelectorAll(revealSelector).forEach(observe);

    // History is fetched after mount. Inspect only added/removed element trees;
    // attribute updates and text changes never trigger another scan or render.
    const additions = new MutationObserver((records) => {
      if (!active) return;
      for (const record of records) {
        record.removedNodes.forEach((node) => visit(node, unobserve));
        record.addedNodes.forEach((node) => visit(node, observe));
      }
    });
    additions.observe(root, { childList: true, subtree: true });

    const disconnect = () => {
      active = false;
      observer.disconnect();
      additions.disconnect();
      pending.clear();
    };
    const onPreferenceChange = () => {
      if (preference.matches) disconnect();
    };
    preference.addEventListener("change", onPreferenceChange);

    return () => {
      disconnect();
      preference.removeEventListener("change", onPreferenceChange);
    };
  }, [enabled, rootRef]);
}
