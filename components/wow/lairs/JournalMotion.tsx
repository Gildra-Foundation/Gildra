"use client";

import { useEffect } from "react";

export function JournalMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-lairs-root]");
    if (!root) return;

    root.classList.add("motion-ready");
    requestAnimationFrame(() => root.classList.add("journal-loaded"));

    const revealNodes = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          (entry.target as HTMLElement).classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8%", threshold: 0.08 },
    );
    revealNodes.forEach((node, index) => {
      node.style.setProperty("--reveal-order", String(index % 5));
      revealObserver.observe(node);
    });

    const sections = Array.from(root.querySelectorAll<HTMLElement>(".guide-section[id]"));
    let activeTabId = "";
    const setActiveTab = (id: string) => {
      if (activeTabId === id) return;
      activeTabId = id;
      root.querySelectorAll<HTMLAnchorElement>(".guide-tabs a").forEach((link) => {
        const active = link.hash === `#${id}`;
        link.classList.toggle("is-active", active);
        if (active) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
    };
    let scrollFrame = 0;
    const syncActiveTab = () => {
      const threshold = window.innerHeight * 0.28;
      let current: HTMLElement | undefined = sections[0];
      sections.forEach((section) => {
        if (section.getBoundingClientRect().top <= threshold) current = section;
      });
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 32) {
        current = sections.at(-1);
      }
      if (current) setActiveTab(current.id);
      scrollFrame = 0;
    };
    const onScroll = () => {
      if (!scrollFrame) scrollFrame = window.requestAnimationFrame(syncActiveTab);
    };
    // The hub has no section tabs; don't keep a scroll handler that only reads
    // document geometry on every frame. Boss guide pages still sync their tabs.
    if (sections.length > 0) {
      window.addEventListener("scroll", onScroll, { passive: true });
      syncActiveTab();
    }

    const interactiveNodes = Array.from(root.querySelectorAll<HTMLElement>("[data-reactive]"));
    const cleanups = interactiveNodes.map((node) => {
      let pointerFrame = 0;
      let pointerX = 0;
      let pointerY = 0;
      let rect: DOMRect | null = null;
      const enter = () => { rect = node.getBoundingClientRect(); };
      const move = (event: PointerEvent) => {
        pointerX = event.clientX;
        pointerY = event.clientY;
        if (pointerFrame) return;
        pointerFrame = window.requestAnimationFrame(() => {
          pointerFrame = 0;
          const bounds = rect ?? node.getBoundingClientRect();
          node.style.setProperty("--pointer-x", `${pointerX - bounds.left}px`);
          node.style.setProperty("--pointer-y", `${pointerY - bounds.top}px`);
        });
      };
      const leave = () => {
        if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
        pointerFrame = 0;
        rect = null;
        node.style.removeProperty("--pointer-x");
        node.style.removeProperty("--pointer-y");
        node.classList.remove("is-pressed");
      };
      const down = () => node.classList.add("is-pressed");
      const up = () => node.classList.remove("is-pressed");
      node.addEventListener("pointerenter", enter);
      node.addEventListener("pointermove", move);
      node.addEventListener("pointerleave", leave);
      node.addEventListener("pointerdown", down);
      node.addEventListener("pointerup", up);
      return () => {
        node.removeEventListener("pointerenter", enter);
        node.removeEventListener("pointermove", move);
        node.removeEventListener("pointerleave", leave);
        node.removeEventListener("pointerdown", down);
        node.removeEventListener("pointerup", up);
      };
    });

    return () => {
      revealObserver.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  return null;
}
