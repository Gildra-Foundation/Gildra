"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Lang } from "@/lib/i18n";
import { useHomeScene } from "./HomeScene";
import { CinematicEpigraph } from "./CinematicEpigraph";
import { inkWords } from "./EpigraphInk";
import styles from "./grimoireHome.module.css";

export function WrittenEpigraph(props: { lang: Lang; quote: string; author: string; extended: boolean }) {
  const { cinematic } = useHomeScene();
  return cinematic ? <CinematicEpigraph {...props} /> : <StandardWrittenEpigraph {...props} />;
}

function StandardWrittenEpigraph({ quote, author, extended }: { quote: string; author: string; extended: boolean }) {
  const { started } = useHomeScene();
  const figureRef = useRef<HTMLElement>(null);
  const [phase, setPhase] = useState<"waiting" | "writing" | "done">("waiting");
  const quoteLength = Array.from(quote).length;
  const quoteDuration = Math.min(5400, Math.max(2000, quoteLength * 38));
  const quoteStep = quoteDuration / quoteLength;
  // The last letter needs 180ms to finish its ink animation before the pause.
  const quoteFinish = (quoteLength - 1) * quoteStep + 180;
  const signatureStart = quoteFinish + 600;
  const finish = signatureStart + Array.from(author).length * 70 + 180;

  useEffect(() => {
    const figure = figureRef.current;
    if (!figure) return;
    if (!started) { setPhase("waiting"); return; }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let cancelled = false;
    let animationStarted = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let observer: IntersectionObserver | undefined;

    const showImmediately = () => {
      if (!reducedMotion.matches) return;
      cancelled = true;
      clearTimeout(timer);
      observer?.disconnect();
      setPhase("done");
    };
    reducedMotion.addEventListener("change", showImmediately);

    if (reducedMotion.matches) {
      showImmediately();
    } else {
      // Keep the final text layout while waiting for the font and viewport.
      const fontReady = document.fonts.load('400 32px "Gildra Preciosa"').catch(() => []);
      const start = () => {
        if (animationStarted || cancelled) return;
        animationStarted = true;
        observer?.disconnect();
        void fontReady.then(() => {
          if (cancelled) return;
          // Match the spoken scenes: music first, then handwriting.
          timer = setTimeout(() => {
            if (cancelled) return;
            setPhase("writing");
            timer = setTimeout(() => setPhase("done"), finish);
          }, 3000);
        });
      };
      if ("IntersectionObserver" in window) {
        observer = new IntersectionObserver(entries => {
          if (entries.some(entry => entry.isIntersecting)) start();
        }, { threshold: 0.15 });
        observer.observe(figure);
      } else {
        start();
      }
    }

    return () => {
      cancelled = true;
      clearTimeout(timer);
      observer?.disconnect();
      reducedMotion.removeEventListener("change", showImmediately);
    };
  }, [finish, started]);

  return <figure ref={figureRef} className={styles.epigraph} data-writing={phase}>
    <blockquote>
      <h1 className={`${styles.quoteText}${extended ? ` ${styles.longQuote}` : ""}`} aria-label={quote}>
        <span aria-hidden="true">{inkWords(quote, 0, quoteStep)}</span>
      </h1>
    </blockquote>
    <figcaption className={styles.quoteAuthor} style={{ "--signature-delay": `${signatureStart}ms` } as CSSProperties}>
      <span aria-hidden="true" />
      <cite aria-label={author}><span aria-hidden="true">{inkWords(author, signatureStart, 70)}</span></cite>
    </figcaption>
    <noscript><style>{`.${styles.epigraph}[data-writing="waiting"] .${styles.inkLetter},.${styles.epigraph}[data-writing="waiting"] .${styles.quoteAuthor}>span{opacity:1;clip-path:none}`}</style></noscript>
  </figure>;
}
