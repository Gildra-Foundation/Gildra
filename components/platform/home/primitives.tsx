import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Info } from "lucide-react";
import type { PlatformGame } from "@/lib/platform/home/types";
import styles from "./platformHome.module.css";

export function Panel({ className = "", children }: { className?: string; children: ReactNode }) {
  return <section className={`${styles.panel} ${className}`} data-reveal>{children}</section>;
}

export function PanelTitle({ children, info = false }: { children: ReactNode; info?: boolean }) {
  return (
    <h2 className={styles.panelTitle}>
      {children}
      {info && <Info aria-label="More information" size={14} strokeWidth={1.5} />}
    </h2>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className={styles.textLink} href={href} prefetch={false}>
      {children}<ArrowRight size={14} aria-hidden="true" />
    </Link>
  );
}

export function GameMark({ game, small = false }: { game: PlatformGame; small?: boolean }) {
  return (
    <span
      className={`${styles.gameMark} ${small ? styles.gameMarkSmall : ""}`}
      style={{ "--game-accent": game.accent } as CSSProperties}
    >
      <img
        src={game.iconUrl}
        alt=""
        width={small ? 38 : 59}
        height={small ? 38 : 59}
        loading={small ? "lazy" : "eager"}
        decoding="async"
      />
    </span>
  );
}

export function Sparkline({ values, color }: { values: number[]; color: string }) {
  const width = 132;
  const height = 36;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((value, index) => ({
    x: 3 + (index * (width - 6)) / Math.max(values.length - 1, 1),
    y: height - 4 - ((value - min) / range) * (height - 9),
  }));
  return (
    <svg className={styles.sparkline} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Seven day trend">
      <polyline pathLength="1" points={points.map(({ x, y }) => `${x},${y}`).join(" ")} fill="none" stroke={color} strokeWidth="1.2" />
      {points.map(({ x, y }, index) => <circle key={index} cx={x} cy={y} r="2" fill={color} stroke="#061018" strokeWidth=".8" />)}
    </svg>
  );
}
