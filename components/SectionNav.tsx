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

/** Contextual navigation: липнет под global header, активный пункт — по
 *  видимой секции (IntersectionObserver). Плавный скролл — через CSS
 *  scroll-behavior + scroll-margin-top, уважает prefers-reduced-motion. */
export function SectionNav() {
  const [active, setActive] = useState("overview");

  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id);
        });
      },
      { rootMargin: "-35% 0px -60% 0px" },
    );
    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
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
