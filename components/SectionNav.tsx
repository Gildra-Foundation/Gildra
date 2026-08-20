"use client";

import { useEffect, useState } from "react";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "meta", label: "Meta" },
  { id: "raid", label: "Current Raid" },
  { id: "guides", label: "Guides" },
  { id: "tier-list-preview", label: "Tier List" },
];

/** Contextual navigation по крупным секциям homepage. Активный пункт —
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
      // у самого низа страницы активируем последнюю секцию
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
  }, []);

  return (
    <nav className="secnav" aria-label="Page sections">
      <div className="secnav-in">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={active === s.id ? "on" : undefined}
            aria-current={active === s.id ? "location" : undefined}
          >
            {s.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
