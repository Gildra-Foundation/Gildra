"use client";

import { memo, useEffect, useState, type RefObject } from "react";
import type { TalentKind } from "@/lib/talentCalculatorData";
import { TALENT_KINDS } from "@/lib/talentLoadoutState";
import { lessMotion } from "@/lib/client/motionPreference";
import type { TalentCalculatorCopy } from "./talentCalculatorCopy";
import styles from "./talentWorkbench.module.css";

type Props = {
  copy: TalentCalculatorCopy;
  spent: Record<TalentKind, number>;
  budgets: Record<TalentKind, number>;
  /** The strip that holds the three trees: on phones it scrolls sideways, one tree per screen. */
  trees: RefObject<HTMLDivElement | null>;
  onSelect: () => void;
};

/**
 * Phones: the tree names with their points. A tap scrolls the strip to that tree (the compositor moves
 * trees that are already laid out), a swipe on the strip moves the tab. Keeps its own state, so switching
 * trees never re-renders the calculator.
 */
export const TreeTabs = memo(function TreeTabs({ copy, spent, budgets, trees, onSelect }: Props) {
  const [active, setActive] = useState<TalentKind>("class");

  useEffect(() => {
    const strip = trees.current;
    if (!strip || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const kind = (entry.target as HTMLElement).dataset.tree as TalentKind | undefined;
        if (kind && entry.isIntersecting && entry.intersectionRatio >= 0.6) setActive(kind);
      }
    }, { root: strip, threshold: [0.6] });
    strip.querySelectorAll<HTMLElement>(":scope > [data-tree]").forEach((panel) => observer.observe(panel));
    return () => observer.disconnect();
  }, [trees]);

  const select = (kind: TalentKind) => {
    setActive(kind);
    onSelect();
    const strip = trees.current;
    const panel = strip?.querySelector<HTMLElement>(`:scope > [data-tree="${kind}"]`);
    if (strip && panel) strip.scrollTo({ left: panel.offsetLeft, behavior: lessMotion() ? "auto" : "smooth" });
  };

  return <div className={styles.tabs} role="group" aria-label={copy.treeSwitcher}>
    {TALENT_KINDS.map((kind) => <button key={kind} type="button" aria-pressed={active === kind} data-tree-tab={kind} onClick={() => select(kind)}>
      <span>{copy.treeTabs[kind]}</span><b data-full={spent[kind] >= budgets[kind] || undefined}>{spent[kind]}/{budgets[kind]}</b>
    </button>)}
  </div>;
});
