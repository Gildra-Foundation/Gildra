"use client";

import Image from "next/image";
import { memo, useEffect, useId, useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronDown, Gem, LoaderCircle, Map, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import type { DungeonSelectorOption, DungeonSlug } from "./dungeonRoutes";
import styles from "./mythicRouteSelectors.module.css";

type Locale = "en" | "ru";
type SelectorOption<T extends string | number> = {
  value: T;
  title: string;
  subtitle: string;
  artwork?: string;
  tone?: "weathered" | "uncommon" | "rare" | "epic" | "mythic";
};

type WowSelectorProps<T extends string | number> = {
  label: string;
  value: T;
  options: SelectorOption<T>[];
  onChange: (value: T) => void;
  icon: ReactNode;
  className?: string;
  busy?: boolean;
};

function WowSelector<T extends string | number>({ label, value, options, onChange, icon, className = "", busy = false }: WowSelectorProps<T>) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    setActiveIndex(selectedIndex);
    const frame = window.requestAnimationFrame(() => optionRefs.current[selectedIndex]?.focus());
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", closeOnOutsideClick);
    };
  }, [open, selectedIndex]);

  function openFromKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    setOpen(true);
  }

  function moveFocus(index: number) {
    const nextIndex = (index + options.length) % options.length;
    setActiveIndex(nextIndex);
    optionRefs.current[nextIndex]?.focus();
  }

  function navigateOptions(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(activeIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(activeIndex - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveFocus(0);
    } else if (event.key === "End") {
      event.preventDefault();
      moveFocus(options.length - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  function selectOption(option: SelectorOption<T>) {
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div ref={rootRef} className={`${styles.selectorRoot} ${className}`} data-open={open || undefined}>
      <span className={styles.selectorLabel}>{label}</span>
      <button
        ref={triggerRef}
        type="button"
        className={styles.selectorTrigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={openFromKeyboard}
      >
        {selected.artwork ? (
          <span className={styles.triggerArtwork}><Image src={selected.artwork} alt="" fill sizes="42px" /></span>
        ) : (
          <span className={styles.triggerGem} data-tone={selected.tone} aria-hidden="true">{icon}</span>
        )}
        <span className={styles.triggerCopy}><strong>{selected.title}</strong><small>{selected.subtitle}</small></span>
        {busy ? <LoaderCircle className={styles.loadingIcon} aria-label="Загрузка" /> : <ChevronDown className={styles.chevron} aria-hidden="true" />}
      </button>

      {open ? (
        <div id={listboxId} className={styles.selectorMenu} role="listbox" aria-label={label} onKeyDown={navigateOptions}>
          <div className={styles.menuOrnament} aria-hidden="true"><i /><Sparkles /><i /></div>
          <div className={styles.optionGrid}>
            {options.map((option, index) => (
              <button
                key={option.value}
                ref={(node) => { optionRefs.current[index] = node; }}
                type="button"
                role="option"
                aria-selected={option.value === value}
                tabIndex={index === activeIndex ? 0 : -1}
                className={styles.selectorOption}
                data-tone={option.tone}
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                onClick={() => selectOption(option)}
              >
                {option.artwork ? (
                  <span className={styles.optionArtwork}><Image src={option.artwork} alt="" fill sizes="52px" /></span>
                ) : (
                  <span className={styles.optionGem} aria-hidden="true"><Gem /><b>{option.title}</b></span>
                )}
                <span className={styles.optionCopy}><strong>{option.title}</strong><small>{option.subtitle}</small></span>
                <Check className={styles.selectedCheck} aria-hidden="true" />
              </button>
            ))}
          </div>
          <p className={styles.keyboardHint}>↑↓ выбрать · Enter подтвердить · Esc закрыть</p>
        </div>
      ) : null}
    </div>
  );
}

const keyOptions: SelectorOption<number>[] = [
  { value: 2, title: "+2", subtitle: "Входной уровень", tone: "weathered" },
  { value: 5, title: "+5", subtitle: "Быстрый забег", tone: "uncommon" },
  { value: 8, title: "+8", subtitle: "Усиленный ключ", tone: "rare" },
  { value: 10, title: "+10", subtitle: "Слаженная группа", tone: "epic" },
  { value: 12, title: "+12", subtitle: "Высокий ключ", tone: "mythic" },
  { value: 15, title: "+15", subtitle: "Без права на ошибку", tone: "mythic" },
];

export const MythicRouteSelectors = memo(function MythicRouteSelectors({ locale, dungeonSlug, dungeonOptions, keyLevel, onKeyLevelChange }: { locale: Locale; dungeonSlug: DungeonSlug; dungeonOptions: DungeonSelectorOption[]; keyLevel: number; onKeyLevelChange: (level: number) => void }) {
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const options: SelectorOption<DungeonSlug>[] = dungeonOptions.map((route) => {
    return {
      value: route.slug,
      title: locale === "ru" ? route.nameRu : route.name,
      subtitle: locale === "ru" ? route.name : route.location,
      artwork: route.backdropImage,
    };
  });

  function changeDungeon(slug: DungeonSlug) {
    if (slug === dungeonSlug) return;
    const localePrefix = locale === "ru" ? "/ru" : "";
    startNavigation(() => router.push(`${localePrefix}/wow/mythic-plus/midnight-season-2/${slug}`));
  }

  return (
    <>
      <WowSelector label="Подземелье" value={dungeonSlug} options={options} onChange={changeDungeon} icon={<Map />} className={styles.dungeonSelector} busy={isNavigating} />
      <WowSelector label="Сложность" value={keyLevel} options={keyOptions} onChange={onKeyLevelChange} icon={<Gem />} className={styles.keySelector} />
    </>
  );
});
