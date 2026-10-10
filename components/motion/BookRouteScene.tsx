"use client";

import { useEffect, useId, type CSSProperties } from "react";
import { SkipForward } from "lucide-react";
import { CharacterBookLoadingScene, characterBookLoadingStyle } from "../wow/audit/CharacterBookLoadingScene";
import intro from "../wow/audit/characterBookIntro.module.css";
import { BOOK_ROUTE_TIMING, type BookRouteState } from "./bookRouteLifecycle";
import styles from "./bookRouteScene.module.css";

const fracture = "M526 -20 510 91 524 151 496 231 511 292 487 365 501 425 484 474 505 521 489 585 514 643 496 710 515 780 492 856 506 914 488 1020";
const tributaries = "M524 151 569 189 592 174 630 202 M496 231 459 257 441 239 406 265 M511 292 548 323 542 350 585 383 614 369 M487 365 439 387 420 376 377 409 M501 425 536 449 548 439 589 468 M505 521 555 549 574 538 625 572 M489 585 447 613 455 633 412 667 375 652 M514 643 548 679 577 666 603 699 M496 710 458 731 443 718 410 752 M515 780 556 806 573 798 611 830 M492 856 450 881 432 871 394 902";
const facets = [
  { x: 51.8, y: 15, w: 17, h: 43, dx: 92, dy: -42, rotation: 52 },
  { x: 48.4, y: 26, w: 11, h: 30, dx: -124, dy: -27, rotation: -71 },
  { x: 52.3, y: 33, w: 26, h: 61, dx: 171, dy: -31, rotation: 84 },
  { x: 46.7, y: 41, w: 16, h: 48, dx: -189, dy: 18, rotation: -64 },
  { x: 50.8, y: 46, w: 9, h: 27, dx: 71, dy: -52, rotation: 113 },
  { x: 49.2, y: 50, w: 31, h: 72, dx: -139, dy: 42, rotation: -96 },
  { x: 53.1, y: 56, w: 14, h: 38, dx: 212, dy: 29, rotation: 61 },
  { x: 47.8, y: 62, w: 22, h: 55, dx: -172, dy: 57, rotation: -112 },
  { x: 51.1, y: 69, w: 12, h: 34, dx: 113, dy: 71, rotation: 78 },
  { x: 48.8, y: 76, w: 18, h: 49, dx: -94, dy: 91, rotation: -57 },
  { x: 51.4, y: 84, w: 10, h: 31, dx: 158, dy: 51, rotation: 125 },
] as const;

function FrostTrace({ side }: { side: "west" | "east" }) {
  return <svg className={`${styles.trace} ${styles[side]}`} viewBox="0 0 1000 1000" preserveAspectRatio="none" focusable="false">
    <path className={styles.refraction} d={fracture} />
    <path className={styles.tributaries} pathLength="1" d={tributaries} />
    <path className={styles.core} pathLength="1" d={fracture} />
    <path className={styles.glint} pathLength="1" d={fracture} />
  </svg>;
}

export function BookRouteScene({ state, locale, onReady, onSkip }: {
  state: BookRouteState; locale: "ru" | "en"; onReady: (id: number) => void; onSkip: () => void;
}) {
  const labelId = useId();
  const crystalId = `${labelId.replace(/:/g, "")}-ice`;
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
        <span id={labelId} className={styles.srOnly}>{ru ? "Открываем следующую страницу" : "Opening the next page"}</span>
        <div className={styles.rift} aria-hidden="true">
          <div className={styles.bloom} />
          <FrostTrace side="west" />
          <FrostTrace side="east" />
          <svg className={styles.aperture} viewBox="0 0 120 120" focusable="false">
            <path className={styles.apertureOuter} d="m60 8 10 41 42 11-42 10-10 42-11-42L8 60l41-11Z" />
            <path className={styles.apertureInner} d="m60 39 13 21-13 21-13-21Z" />
            <path className={styles.apertureLine} d="M60 18v24m0 36v24M18 60h24m36 0h24" />
          </svg>
          {facets.map((facet, index) => <span className={styles.facet} key={index} style={{
            "--x": `${facet.x}%`, "--y": `${facet.y}%`,
            "--width": `${facet.w}px`, "--height": `${facet.h}px`,
            "--dx": `${facet.dx}px`, "--dy": `${facet.dy}px`,
            "--rotation": `${facet.rotation}deg`, "--delay": `${index * 9}ms`,
          } as CSSProperties}>
            <svg viewBox="0 0 64 112" focusable="false">
              <defs><linearGradient id={`${crystalId}-${index}`} x1="0" y1="0" x2="1" y2="1">
                <stop stopColor="#effcff" stopOpacity=".72" /><stop offset=".36" stopColor="#84c9e5" stopOpacity=".12" />
                <stop offset=".62" stopColor="#d3f4ff" stopOpacity=".5" /><stop offset="1" stopColor="#65a5c5" stopOpacity=".04" />
              </linearGradient></defs>
              <path d="m28 1 34 34-19 75L2 69Z" fill={`url(#${crystalId}-${index})`} />
              <path className={styles.facetEdge} d="m28 1 34 34-19 75L2 69Zm0 0 5 55 29-21M33 56l10 54M33 56 2 69" />
              <path className={styles.facetHighlight} d="m28 1 34 34M28 1 2 69" />
            </svg>
          </span>)}
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
