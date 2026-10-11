"use client";

import { useEffect, useId, type CSSProperties } from "react";
import { SkipForward } from "lucide-react";
import { CharacterBookLoadingScene, characterBookLoadingStyle } from "../wow/audit/CharacterBookLoadingScene";
import intro from "../wow/audit/characterBookIntro.module.css";
import { BOOK_ROUTE_TIMING, type BookRouteState } from "./bookRouteLifecycle";
import styles from "./bookRouteScene.module.css";

export function BookRouteScene({ state, locale, onReady, onSkip }: {
  state: BookRouteState; locale: "ru" | "en"; onReady: (id: number) => void; onSkip: () => void;
}) {
  const labelId = useId();
  useEffect(() => onReady(state.id), [onReady, state.id]);
  if (state.phase === "idle") return null;
  const ru = locale === "ru";
  const pending = state.phase === "waiting" || state.phase === "loading";
  return <>
    <noscript><style>{"[data-book-route-scene] { display: none !important; }"}</style></noscript>
    <div className={`${intro.dialog} ${styles.scene}`}
      data-book-route-scene={state.kind} data-book-route-phase={state.phase}
      data-book-hydrated="true"
      data-character-book-intro={state.kind === "open" ? (state.phase === "playing" ? "opening" : "preparing") : undefined}
      style={{ ...characterBookLoadingStyle, "--book-duration": `${BOOK_ROUTE_TIMING.open}ms`, "--book-lift-duration": `${BOOK_ROUTE_TIMING.lift}ms`, "--book-turn-duration": `${BOOK_ROUTE_TIMING.turn}ms` } as CSSProperties}
      role="region" aria-labelledby={labelId}>
      {state.kind === "open" ? <CharacterBookLoadingScene locale={locale} scope="site" pending={pending} labelId={labelId} /> : <>
        <span id={labelId} className={styles.srOnly}>{ru ? "Перелистываем хронику" : "Turning the chronicle"}</span>
        <div className={styles.veil} aria-hidden="true" />
        <div className={styles.rift} aria-hidden="true">
          <div className={`${styles.panel} ${styles.west}`} />
          <div className={`${styles.panel} ${styles.east}`} />
          <svg className={styles.cracks} viewBox="0 0 1000 1000" preserveAspectRatio="none" focusable="false">
            <path className={styles.mainCrack} pathLength="1" d="M530 0 L487 175 L523 290 L476 440 L516 565 L479 720 L520 860 L490 1000" />
            <path pathLength="1" d="M523 290 L651 235 L710 120 M476 440 L359 380 L292 245 M516 565 L664 498 L779 550 M479 720 L351 665 L239 743" />
          </svg>
          <div className={styles.seal}><span>✧</span><i /><i /></div>
          <div className={styles.light} />
          {Array.from({ length: 18 }, (_, index) => <i className={styles.spark} key={index} style={{
            "--x": `${43 + index * 13 % 15}%`,
            "--y": `${12 + index * 19 % 78}%`,
            "--dx": `${(index % 2 ? -1 : 1) * (40 + index * 8)}px`,
            "--dy": `${-25 - index * 4}px`,
            "--delay": `${index * 8}ms`,
          } as CSSProperties} />)}
        </div>
        <p className={styles.pending} role="status" aria-live="polite">
          {pending ? (ru ? "Загружаем страницу…" : "Loading the page…") : ""}
        </p>
      </>}
      <button className={`${intro.skip} ${styles.skip}`} data-book-route-skip type="button" onClick={onSkip} aria-label={ru ? "Пропустить анимацию" : "Skip animation"}>
        {ru ? "Пропустить" : "Skip"}<SkipForward size={15} aria-hidden="true" /><kbd>Esc</kbd>
      </button>
    </div>
  </>;
}
