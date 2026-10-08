"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import type { Lang } from "@/lib/i18n";
import { useHomeScene } from "./HomeScene";
import { inkWords } from "./EpigraphInk";
import styles from "./grimoireHome.module.css";

export function CinematicEpigraph({ quote, author, extended }: { lang: Lang; quote: string; author: string; extended: boolean }) {
  const figure = useRef<HTMLElement>(null);
  const { phase, clock, generation, scene, setEpigraphReady } = useHomeScene();
  const writing = phase === "writing" || phase === "signing";
  const visualPhase = phase === "done" ? "done" : writing ? "writing" : "waiting";

  useEffect(() => {
    const element = figure.current;
    if (!element) return;
    let cancelled = false;
    // Prepare once the font is ready, even when the quote is below the fold.
    // Scrolling must never replace the soundtrack or restart the scene.
    const font = document.fonts.load('400 32px "Gildra Preciosa"').catch(() => []);
    void font.then(() => { if (!cancelled) setEpigraphReady(true); });
    return () => { cancelled = true; setEpigraphReady(false); };
  }, [setEpigraphReady]);

  useEffect(() => {
    if (!writing || !figure.current) return;
    const animations = figure.current.getAnimations({ subtree: true });
    animations.forEach(animation => animation.pause());
    let frame = 0;
    const update = () => {
      for (const animation of animations) animation.currentTime = clock.current;
      frame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [writing, clock, generation]);

  if (!scene) return null;

  return <figure ref={figure} className={styles.epigraph} data-writing={visualPhase} data-cinematic="true">
    <blockquote>
      <h1 className={`${styles.quoteText}${extended ? ` ${styles.longQuote}` : ""}`} aria-label={quote}>
        <span aria-hidden="true">{inkWords(quote, 0, 0, scene.words)}</span>
      </h1>
    </blockquote>
    <figcaption className={styles.quoteAuthor} style={{ "--signature-delay": `${scene.quoteEnd + 600}ms` } as CSSProperties}>
      <span aria-hidden="true" />
      <cite aria-label={author}><span aria-hidden="true">{inkWords(author, scene.quoteEnd + 600, 70)}</span></cite>
    </figcaption>
    <noscript><style>{`.${styles.epigraph}[data-writing="waiting"] .${styles.inkLetter},.${styles.epigraph}[data-writing="waiting"] .${styles.quoteAuthor}>span{opacity:1;clip-path:none}`}</style></noscript>
  </figure>;
}
