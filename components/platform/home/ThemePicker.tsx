"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import { ThemeEmblem } from "./ThemeEmblem";
import { useHomeTheme } from "./HomeTheme";
import { homeThemes, type HomeThemeId } from "./homeThemes";
import styles from "./grimoireHome.module.css";

export function ThemePicker({ lang }: { lang: Lang }) {
  const { theme, selectTheme } = useHomeTheme();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const ru = lang === "ru";
  const current = homeThemes.find(item => item.id === theme)!;

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>(`[data-theme-choice="${theme}"]`)?.focus();
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, theme]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  function choose(next: HomeThemeId) {
    selectTheme(next);
    close();
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
    const buttons = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next = index;
    if (event.key === "ArrowDown") next = (index + 1) % buttons.length;
    else if (event.key === "ArrowUp") next = (index + buttons.length - 1) % buttons.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = buttons.length - 1;
    else return;
    event.preventDefault();
    buttons[next]?.focus();
  }

  return <div className={styles.themePicker} ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <button ref={trigger} type="button" className={styles.themeTrigger} aria-haspopup="menu" aria-expanded={open}
      aria-controls={open ? id : undefined} aria-label={ru ? `Выбрать тему: ${current.ru}` : `Choose theme: ${current.en}`}
      onClick={() => setOpen(value => !value)} onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); }
      }}>
      <ThemeEmblem theme={theme} /><span>{ru ? current.ru : current.en}</span><ChevronDown size={12} aria-hidden="true" />
    </button>
    {open && <div id={id} ref={menu} role="menu" aria-label={ru ? "Тема оформления" : "Page theme"} className={styles.themeMenu} onKeyDown={onKeyDown}>
      <p aria-hidden="true">{ru ? "АТМОСФЕРА АЗЕРОТА" : "THE SPIRIT OF AZEROTH"}</p>
      {homeThemes.map(item => <button key={item.id} type="button" role="menuitemradio" aria-checked={theme === item.id}
        tabIndex={theme === item.id ? 0 : -1} data-theme-choice={item.id} onClick={() => choose(item.id)}>
        <span className={styles.themeSymbol} data-symbol={item.id}><ThemeEmblem theme={item.id} /></span>
        <span className={styles.themeIdentity}><strong>{ru ? item.ru : item.en}</strong><small>{ru ? item.descriptionRu : item.descriptionEn}</small></span>
        {theme === item.id && <Check size={15} aria-hidden="true" />}
      </button>)}
    </div>}
  </div>;
}
