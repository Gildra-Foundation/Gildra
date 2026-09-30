"use client";

import { useEffect, useId, type CSSProperties } from "react";
import { SkipForward } from "lucide-react";
import { CharacterBookLoadingScene, characterBookLoadingStyle } from "../wow/audit/CharacterBookLoadingScene";
import intro from "../wow/audit/characterBookIntro.module.css";
import atmosphere from "../wow/audit/bookAtmosphere.module.css";
import { characterWorldBackdropStyle } from "../wow/audit/CharacterBookBackdrop";
import { BOOK_ROUTE_TIMING, type BookRouteState } from "./bookRouteLifecycle";
import styles from "./bookRouteScene.module.css";

export function BookRouteScene({ state, locale, onReady, onSkip }: {
  state: BookRouteState; locale: "ru" | "en"; onReady: () => void; onSkip: () => void;
}) {
  const labelId = useId();
  useEffect(() => onReady(), [onReady]);
  if (state.phase === "idle") return null;
  const ru = locale === "ru";
  return <>
    <noscript><style>{"[data-book-route-scene] { display: none !important; }"}</style></noscript>
    <div key={state.id} className={`${intro.dialog} ${styles.scene}`}
      data-book-route-scene={state.kind} data-book-route-phase={state.phase}
      data-book-hydrated="true"
      data-character-book-intro={state.kind === "open" ? (state.phase === "playing" ? "opening" : "preparing") : undefined}
      style={{ ...characterBookLoadingStyle, "--book-duration": `${BOOK_ROUTE_TIMING.open}ms`, "--book-lift-duration": `${BOOK_ROUTE_TIMING.lift}ms`, "--book-turn-duration": `${BOOK_ROUTE_TIMING.turn}ms` } as CSSProperties}
      role="region" aria-labelledby={labelId}>
      {state.kind === "open" ? <CharacterBookLoadingScene locale={locale} scope="site" pending={state.phase === "waiting" || state.phase === "loading"} labelId={labelId} /> : <>
        <div className={`${atmosphere.backdrop} ${styles.veil}`} style={characterWorldBackdropStyle} aria-hidden="true" />
        <div className={styles.stage} aria-hidden="true">
          <div className={styles.spread}>
            <div className={`${styles.page} ${styles.left}`}><i className={styles.ornament} /><span className={styles.monogram}>G</span><i className={styles.lines} /></div>
            <div className={`${styles.page} ${styles.right}`}><i className={styles.ornament} /><span className={styles.monogram}>G</span><i className={styles.lines} /></div>
            <div className={styles.leaf}>
              <div className={styles.front}><i className={styles.ornament} /><i className={styles.lines} /></div>
              <div className={styles.back}><i className={styles.ornament} /><i className={styles.lines} /></div>
            </div>
            <i className={styles.spine} />
          </div>
        </div>
        <div className={styles.caption}>
          <span>GILDRA</span>
          <h2 id={labelId}>{ru ? "Новая глава" : "A new chapter"}</h2>
          <p role="status" aria-live="polite">{state.phase === "waiting" || state.phase === "loading" ? (ru ? "Загружаем страницу…" : "Loading the page…") : (ru ? "Перелистываем хронику…" : "Turning the page…")}</p>
        </div>
      </>}
      <button className={intro.skip} data-book-route-skip type="button" onClick={onSkip} aria-label={ru ? "Пропустить анимацию" : "Skip animation"}>
        {ru ? "Пропустить" : "Skip"}<SkipForward size={15} aria-hidden="true" /><kbd>Esc</kbd>
      </button>
    </div>
  </>;
}
