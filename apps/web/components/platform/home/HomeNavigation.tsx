"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/i18n";
import styles from "./grimoireHome.module.css";

const sections = [
  { label: { en: "Characters", ru: "Персонажи" }, path: "/wow/characters" },
  { label: { en: "Bosses", ru: "Боссы" }, path: "/lairs" },
  { label: { en: "Mythic+", ru: "Mythic+" }, path: "/wow/mythic-plus" },
  { label: { en: "Raids", ru: "Рейды" }, path: "/wow/raids" },
  { label: { en: "Tier Lists", ru: "Тир-листы" }, path: "/tier-lists" },
];
type Highlight = { x: number; y: number; width: number; visible: boolean };

export function HomeNavigation({ lang }: { lang: Lang }) {
  const navRef = useRef<HTMLElement>(null);
  const activeLink = useRef<HTMLAnchorElement | null>(null);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const show = useCallback((link: HTMLAnchorElement) => {
    if (!navRef.current) return;
    activeLink.current = link;
    const parent = navRef.current.getBoundingClientRect();
    const label = link.firstElementChild;
    if (!label) return;
    const rect = label.getBoundingClientRect();
    setHighlight({ x: rect.left - parent.left, y: rect.bottom - parent.top + 5, width: rect.width, visible: true });
  }, []);
  const hide = useCallback(() => {
    activeLink.current = null;
    setHighlight(previous => previous ? { ...previous, visible: false } : null);
  }, []);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const observer = new ResizeObserver(() => {
      if (activeLink.current) show(activeLink.current);
    });
    observer.observe(nav);
    nav.querySelectorAll("a").forEach(link => observer.observe(link));
    return () => observer.disconnect();
  }, [show]);

  return <nav ref={navRef} className={styles.headerNav} aria-label={lang === "ru" ? "Разделы" : "Sections"}
    onPointerLeave={() => {
      const focused = document.activeElement;
      if (focused instanceof HTMLAnchorElement && navRef.current?.contains(focused)) show(focused);
      else hide();
    }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) hide(); }}>
    {highlight && <span className={styles.navHighlight} aria-hidden="true" data-visible={highlight.visible} style={{
      width: highlight.width,
      transform: `translate3d(${highlight.x}px, ${highlight.y}px, 0)`,
      opacity: highlight.visible ? 1 : 0,
    }} />}
    <ul>
      {sections.map(link => <li key={link.path}>
        <Link href={`${lang === "ru" ? "/ru" : ""}${link.path}`} prefetch={false}
          onPointerEnter={event => { if (event.pointerType !== "touch") show(event.currentTarget); }}
          onFocus={event => show(event.currentTarget)}>
          <span className={styles.navLabel}>{link.label[lang]}</span>
        </Link>
      </li>)}
    </ul>
  </nav>;
}
