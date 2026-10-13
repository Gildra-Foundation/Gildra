"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { BookVolume } from "@/components/platform/navigation/BookVolume";
import { BookNavigationDialog } from "@/components/platform/navigation/BookNavigationDialog";
import { animateBookCover } from "@/components/platform/navigation/bookCoverMotion";
import type { OpenBookProps } from "./HomeBook";
import styles from "./homeBook.module.css";

// Wide screens: the cover glides to the middle of the hero and swings open over
// the spread (phones use PhoneBook, a modal version of the same book).
export function OpenBook({ lang, phase, onPhase, coverPose, coverFace }: OpenBookProps) {
  const ru = lang === "ru";
  const stage = useRef<HTMLDivElement>(null);
  const book = useRef<HTMLDivElement>(null);
  const motion = useRef<HTMLDivElement>(null);
  const leaf = useRef<HTMLDivElement>(null);
  const actions = useRef<HTMLDivElement>(null);
  const [lifted, setLifted] = useState(false);
  const arriving = useRef(false);

  /** On wide screens the open spread is exactly as tall as the closed cover. */
  const fit = useCallback(() => {
    const element = stage.current;
    const pose = coverPose();
    if (!element || !pose) return pose;
    const width = Math.min(pose.height * 1.5, element.clientWidth - 32);
    element.style.setProperty("--book-width", `${width}px`);
    element.style.setProperty("--leaf-width", `${pose.width}px`);
    element.style.setProperty("--leaf-height", `${pose.height}px`);
    element.style.setProperty("--leaf-scale", `${width / 1.5 / pose.height}`);
    return pose;
  }, [coverPose]);

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(() => fit());
    observer.observe(element);
    return () => observer.disconnect();
  }, [fit]);

  useLayoutEffect(() => {
    if (phase !== "opening" && phase !== "closing") return;
    const opening = phase === "opening";
    const finish = () => onPhase(opening ? "open" : "closed");
    const bookElement = book.current;
    const motionElement = motion.current;
    const leafElement = leaf.current;
    const actionsElement = actions.current;
    const pose = fit();
    arriving.current = opening;
    if (!bookElement || !motionElement || !leafElement || !actionsElement || !pose) {
      finish();
      return;
    }
    return animateBookCover({
      book: bookElement,
      leaf: leafElement,
      actions: actionsElement,
      pose,
      opening,
      onFinish: finish,
    });
  }, [phase, fit, onPhase]);

  useEffect(() => {
    if (phase !== "open") return;
    // Focus follows the cover into the opened book (the cover itself is hidden now).
    if (arriving.current) book.current?.focus({ preventScroll: true });
    arriving.current = false;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && !document.querySelector("dialog[open]")) onPhase("closing");
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [phase, onPhase]);

  const release = useCallback(() => {
    setLifted(false);
    onPhase((current) => current === "held" ? "open" : current);
  }, [onPhase]);
  const liftFrom = useCallback(() => book.current?.getBoundingClientRect() ?? null, []);
  const moving = phase === "opening" || phase === "closing";

  return <div ref={stage} className={styles.stage} data-phase={phase}>
    <div ref={book} className={styles.book} role="region" aria-label={ru ? "Открытая книга Gildra" : "The open Gildra book"}
      tabIndex={-1} inert={moving} data-lifted={lifted || undefined}>
      <BookVolume lang={lang} active />
      <div ref={motion} className={styles.leafMotion} hidden={!moving}>
        <div ref={leaf} className={styles.leaf} aria-hidden="true">
          <div className={styles.front}><div className={styles.cover} data-cover-awake={phase === "opening" || undefined}>{coverFace}</div><span className={styles.shade} data-shade /></div>
          <div className={styles.back}><span className={styles.shade} data-shade /></div>
        </div>
      </div>
    </div>
    <div ref={actions} className={styles.actions} inert={moving}>
      <button type="button" className={`${styles.action} ${styles.primary}`} onClick={() => onPhase("held")}>{ru ? "Взять в руки" : "Hold the book"}</button>
      <button type="button" className={styles.action} onClick={() => onPhase("closing")}>{ru ? "Закрыть книгу" : "Close the book"}</button>
    </div>
    <BookNavigationDialog open={phase === "held"} onClose={release} lang={lang} liftFrom={liftFrom} onLiftStart={() => setLifted(true)} />
  </div>;
}
