"use client";

import { useEffect, useState } from "react";
import motion from "./characterBookMotion.module.css";
import type { Lang } from "@/lib/i18n";
import { CharacterLanguageSwitch } from "./CharacterLanguageSwitch";
import { CharacterBookRibbon, type CharacterBookRibbonItem } from "@/components/wow/characters/CharacterBookRibbon";

const chapters = [
  { id: "chapter-armory", number: "01", ru: "Экипировка", en: "Equipment" },
  { id: "chapter-talents", number: "02", ru: "Таланты", en: "Talents" },
  { id: "chapter-rotation", number: "03", ru: "Ротация", en: "Rotation" },
  { id: "chapter-logs", number: "04", ru: "Боевые логи", en: "Combat logs" },
  { id: "chapter-history", number: "05", ru: "История", en: "History" },
];

/** Reading position stays local to the bookmark; scrolling never rerenders
 * the character model, talent tree, or combat simulation. Native hash links
 * preserve keyboard navigation, deep links, and reduced-motion scrolling. */
export function CharacterBookNavigation({ characterName, hasRotation, lang = "ru" }: { characterName: string; hasRotation: boolean; lang?: Lang }) {
  const [activeChapter, setActiveChapter] = useState("chapter-armory");

  useEffect(() => {
    let frame = 0;
    const headings = chapters.filter((chapter) => hasRotation || chapter.id !== "chapter-rotation")
      .flatMap((chapter) => {
        const element = document.getElementById(chapter.id);
        return element ? [{ id: chapter.id, element }] : [];
      });
    const update = () => {
      frame = 0;
      const readingLine = Math.max(96, (document.querySelector<HTMLElement>("[data-character-book-ribbon]")?.getBoundingClientRect().bottom ?? 64) + 32);
      let current = headings[0]?.id ?? "chapter-armory";
      for (const heading of headings) {
        if (heading.element.getBoundingClientRect().top <= readingLine) current = heading.id;
      }
      // A short final chapter cannot reach the sticky bookmark's reading
      // line. At the document end it is still the chapter being read.
      const last = headings.at(-1);
      if (last && window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2
        && last.element.getBoundingClientRect().top < window.innerHeight) current = last.id;
      setActiveChapter((previous) => previous === current ? previous : current);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    const page = document.getElementById("audit-overview");
    if (page) observer?.observe(page);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [hasRotation]);

  const items: CharacterBookRibbonItem[] = chapters
    .filter((chapter) => hasRotation || chapter.id !== "chapter-rotation")
    .map((chapter) => ({
      number: chapter.number,
      label: chapter[lang],
      href: `#${chapter.id}`,
      active: activeChapter === chapter.id,
    }));

  return <CharacterBookRibbon
    locale={lang}
    contents={lang === "ru" ? "Содержание" : "Contents"}
    title={characterName}
    homeHref="#audit-overview"
    items={items}
    ariaLabel={lang === "ru" ? "Навигация по профилю персонажа" : "Character profile navigation"}
    className={motion.navigation}
    languageControl={<CharacterLanguageSwitch lang={lang} />}
  />;
}
