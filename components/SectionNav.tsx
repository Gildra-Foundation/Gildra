"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { season } from "@/data/site";
import { langOf, p, t } from "@/lib/i18n";

const SECTIONS = [
  { id: "meta", label: "Meta" },
  { id: "raid", label: "Raid" },
  { id: "guides", label: "Guides" },
  { id: "tier-list-preview", label: "Tier List" },
];

/** Contextual navigation — часть идентичности Gildra: сезонный ярлык +
 *  крупные секции. Route-aware: на /tier-lists активен Tier List и пункты
 *  ведут на homepage-якоря. Scrollspy — rAF-троттлинг, passive scroll. */
export function SectionNav() {
  const pathname = usePathname();
  const lang = langOf(pathname);
  const tt = t(lang);
  const onTierRoute =
    pathname === "/tier-lists" || pathname === "/ru/tier-lists";
  const [active, setActive] = useState<string>(onTierRoute ? "tier" : "");

  useEffect(() => {
    if (onTierRoute) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const threshold = 130;
      let current = "";
      for (const { id } of SECTIONS) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= threshold) current = id;
      }
      if (
        window.innerHeight + window.scrollY >=
        document.body.scrollHeight - 4
      ) {
        current = SECTIONS[SECTIONS.length - 1].id;
      }
      setActive(current);
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
  }, [onTierRoute]);

  const href = (id: string) => (onTierRoute ? p(lang, `/#${id}`) : `#${id}`);
  const isOn = (id: string) =>
    onTierRoute ? id === "tier-list-preview" : active === id;

  return (
    <nav className="secnav" aria-label="Sections">
      <div className="secnav-in">
        <Link className="sn-season" href={onTierRoute ? p(lang, "/") : "#overview"}>
          <span className="sn-season-full">
            {season.expansion} · {tt(season.season)}
          </span>
          <span className="sn-season-sm">S1</span>
        </Link>
        {SECTIONS.map((s) => {
          const on = isOn(s.id);
          const to =
            onTierRoute && s.id === "tier-list-preview"
              ? p(lang, "/tier-lists")
              : href(s.id);
          return (
            <Link
              key={s.id}
              href={to}
              className={on ? "on" : undefined}
              aria-current={on ? "location" : undefined}
            >
              {s.label === "Meta" && lang === "ru" ? "Мета" : tt(s.label)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
