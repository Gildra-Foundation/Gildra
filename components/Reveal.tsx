"use client";

import { useEffect } from "react";

/** Сдержанный reveal секций: только opacity/transform, уважает
 *  prefers-reduced-motion, страховка 2.2s — контент не может остаться скрытым. */
export function Reveal() {
  useEffect(() => {
    if (
      !("IntersectionObserver" in window) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const els = document.querySelectorAll<HTMLElement>(
      ".panel, .trendside, .raidfeat, .nfeat, .nlist, .tierpage, .foot-in",
    );
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "250px 0px 250px 0px" },
    );
    els.forEach((el) => {
      el.classList.add("reveal");
      io.observe(el);
    });
    const t = setTimeout(() => {
      els.forEach((el) => el.classList.add("in"));
    }, 2200);
    return () => {
      clearTimeout(t);
      io.disconnect();
    };
  }, []);
  return null;
}
