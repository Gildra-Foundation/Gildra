"use client";

import { useEffect, useState } from "react";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "mythic", label: "Mythic+" },
  { id: "raid", label: "Raid" },
  { id: "guides", label: "Guides" },
  { id: "tierlist", label: "Tier List" },
  { id: "builds", label: "Builds" },
];

/** Contextual navigation: липнет под global header; активный пункт —
 *  последняя секция, чей верх прошёл отметку под липкими панелями
 *  (rAF-троттлинг, passive scroll). Плавный скролл — CSS scroll-behavior
 *  + scroll-margin-top; prefers-reduced-motion отключает анимацию. */
export function SectionNav() {
  const [active, setActive] = useState("overview");

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const threshold = 130;
      let current = SECTIONS[0].id;
      for (const { id } of SECTIONS) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= threshold) current = id;
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
  }, []);

  return (
    <nav className="secnav" aria-label="Page sections">
      <div className="secnav-in">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={active === s.id ? "on" : undefined}
            aria-current={active === s.id ? "true" : undefined}
          >
            {s.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
