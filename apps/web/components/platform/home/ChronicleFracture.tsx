"use client";

import { useId, type CSSProperties } from "react";
import styles from "./chronicleFracture.module.css";

// The fracture follows the opening leaf. It never intercepts input or delays
// the book lifecycle, and lives inside the phone dialog's top layer too.
const cracks = [
  "M500 0 L487 138 L518 242 L493 365 L512 478 L486 598 L506 725 L481 851 L500 1000",
  "M518 242 L628 194 L682 96 L795 42",
  "M493 365 L366 299 L312 183 L192 126",
  "M512 478 L653 409 L722 310 L881 269",
  "M486 598 L348 552 L276 427 L110 382",
  "M506 725 L645 656 L742 727 L918 690",
  "M481 851 L348 788 L265 864 L114 918",
  "M628 194 L714 217 L778 167",
  "M366 299 L259 317 L220 252",
  "M653 409 L711 452 L793 429",
  "M348 552 L257 587 L198 550",
];
const shards = [
  "487,138 518,242 628,194 682,96",
  "518,242 493,365 366,299 312,183",
  "493,365 512,478 653,409 722,310",
  "512,478 486,598 348,552 276,427",
  "486,598 506,725 645,656 653,409",
  "506,725 481,851 348,788 348,552",
  "481,851 500,1000 645,956 742,727 645,656",
  "487,138 500,0 380,45 312,183 366,299",
];

export function ChronicleFracture() {
  const frost = useId();
  return <div className={styles.effect} aria-hidden="true" data-chronicle-fracture>
    <div className={styles.breath} />
    <svg className={styles.ice} viewBox="0 0 1000 1000" preserveAspectRatio="none" focusable="false">
      <defs>
        <linearGradient id={frost} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="currentColor" stopOpacity=".02" />
          <stop offset=".48" stopColor="currentColor" stopOpacity=".2" />
          <stop offset="1" stopColor="currentColor" stopOpacity=".035" />
        </linearGradient>
      </defs>
      {shards.map((points, index) => <polygon key={points} className={styles.shard} points={points}
        fill={`url(#${frost})`} style={{
          "--dx": `${(index % 2 ? -1 : 1) * (45 + index * 13)}px`,
          "--dy": `${-35 - index * 12}px`,
          "--turn": `${(index % 2 ? -1 : 1) * (8 + index * 3)}deg`,
          "--delay": `${360 + index * 28}ms`,
        } as CSSProperties} />)}
      <g className={styles.veins}>
        {cracks.map((d, index) => <path key={d} d={d} pathLength="1"
          style={{ "--delay": `${index === 0 ? 30 : 120 + index * 20}ms` } as CSSProperties} />)}
      </g>
    </svg>
    <span className={styles.spine} />
    {Array.from({ length: 24 }, (_, index) => <span key={index} className={styles.ash} style={{
      "--x": `${36 + (index * 17 % 29)}%`,
      "--y": `${18 + (index * 23 % 65)}%`,
      "--dx": `${(index % 2 ? -1 : 1) * (30 + index * 5)}px`,
      "--dy": `${-45 - index * 4}px`,
      "--turn": `${index * 29}deg`,
      "--delay": `${420 + index * 18}ms`,
    } as CSSProperties} />)}
  </div>;
}
