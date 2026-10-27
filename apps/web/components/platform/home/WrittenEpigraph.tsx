"use client";

import { Fragment, useEffect, useRef, useState, type CSSProperties } from "react";
import type { Lang } from "@/lib/i18n";
import { lessMotion, subscribeSiteMotion } from "@/lib/client/motionPreference";
import { epigraphTiming, inkDuration } from "./epigraphTiming";
import styles from "./grimoireHome.module.css";

function InkWords({ text, delays }: { text: string; delays: number[] }) {
  let index = 0;
  return text.split(/(\s+)/u).map((word, wordIndex) => {
    if (/^\s+$/u.test(word)) {
      index += Array.from(word).length;
      return <Fragment key={wordIndex}>{word}</Fragment>;
    }
    return <span className={styles.inkWord} key={wordIndex}>
      {Array.from(word).map((letter, letterIndex) => <span className={styles.inkLetter} key={letterIndex}
        style={{ "--ink-delay": `${delays[index++]}ms`, "--ink-duration": `${inkDuration}ms` } as CSSProperties}>{letter}</span>)}
    </span>;
  });
}

/** Silent handwriting: the full layout and accessible text are present from the start. */
export function WrittenEpigraph({ quote, author, extended }: { lang: Lang; quote: string; author: string; extended: boolean }) {
  const figure = useRef<HTMLElement>(null);
  const [phase, setPhase] = useState<"waiting" | "writing" | "done">("waiting");
  const writing = epigraphTiming(quote);
  const signatureStart = writing.finish + Math.max(800, writing.pauseAfter);
  const signature = epigraphTiming(author, signatureStart);

  useEffect(() => {
    let cancelled = false;
    let began = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let observer: IntersectionObserver | undefined;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const finish = () => {
      if (!lessMotion()) return;
      cancelled = true;
      clearTimeout(timer);
      observer?.disconnect();
      setPhase("done");
    };
    const unsubscribe = subscribeSiteMotion(finish);
    media.addEventListener("change", finish);
    const font = document.fonts.load('400 32px "Gildra Preciosa"').catch(() => []);
    const begin = () => {
      if (began || cancelled) return;
      began = true;
      observer?.disconnect();
      void font.then(() => {
        if (cancelled) return;
        timer = setTimeout(() => {
          if (cancelled) return;
          setPhase("writing");
          timer = setTimeout(() => setPhase("done"), signature.finish);
        }, 180);
      });
    };
    if (lessMotion()) finish();
    else if (figure.current && "IntersectionObserver" in window) {
      observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) begin();
      }, { threshold: 0.15 });
      observer.observe(figure.current);
    } else begin();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      observer?.disconnect();
      unsubscribe();
      media.removeEventListener("change", finish);
    };
  }, [signature.finish]);

  return <figure ref={figure} className={styles.epigraph} data-writing={phase}>
    <blockquote>
      {/* The quote is read whole at once; the hand only writes its picture. */}
      <p className={`${styles.quoteText}${extended ? ` ${styles.longQuote}` : ""}`}>
        <span className={styles.srOnly}>{quote}</span>
        <span aria-hidden="true"><InkWords text={quote} delays={writing.delays} /></span>
      </p>
    </blockquote>
    <figcaption className={styles.quoteAuthor} style={{ "--signature-delay": `${signatureStart}ms` } as CSSProperties}>
      <span aria-hidden="true" />
      <cite><span className={styles.srOnly}>{author}</span><span aria-hidden="true"><InkWords text={author} delays={signature.delays} /></span></cite>
    </figcaption>
    <noscript><style>{`.${styles.epigraph}[data-writing="waiting"] .${styles.inkLetter},.${styles.epigraph}[data-writing="waiting"] .${styles.quoteAuthor}>span{opacity:1;clip-path:none}`}</style></noscript>
  </figure>;
}
