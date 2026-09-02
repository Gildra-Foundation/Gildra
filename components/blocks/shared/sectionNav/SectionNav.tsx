"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export type SectionNavItem = { id: string; label: string; href: string };

export type SectionNavView = {
  items: SectionNavItem[];
  seasonLabel: string;
  seasonShort: string;
  seasonHref: string;
  /** Fixed active item (no scrollspy), e.g. on /tier-lists. */
  active?: string;
};

/** Contextual navigation — часть идентичности Gildra: сезонный ярлык +
 *  крупные секции. Презентационный: пункты приходят из конфига страницы.
 *  Scrollspy — rAF-троттлинг, passive scroll; выключен при fixed `active`. */
export function SectionNav({ items, seasonLabel, seasonShort, seasonHref, active }: SectionNavView) {
  const fixed = active !== undefined;
  const [current, setCurrent] = useState<string>(active ?? "");

  useEffect(() => {
    if (fixed) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const threshold = 130;
      let next = "";
      for (const { id } of items) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= threshold) next = id;
      }
      if (
        window.innerHeight + window.scrollY >=
        document.body.scrollHeight - 4
      ) {
        next = items[items.length - 1]?.id ?? "";
      }
      setCurrent(next);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [fixed, items]);

  return (
    <nav className="secnav" aria-label="Sections">
      <div className="secnav-in">
        <Link className="sn-season" href={seasonHref}>
          <span className="sn-season-full">{seasonLabel}</span>
          <span className="sn-season-sm">{seasonShort}</span>
        </Link>
        {items.map((s) => {
          const on = current === s.id;
          return (
            <Link
              key={s.id}
              href={s.href}
              className={on ? "on" : undefined}
              aria-current={on ? "location" : undefined}
            >
              {s.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
