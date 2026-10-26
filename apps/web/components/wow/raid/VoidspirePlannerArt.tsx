import Image from "next/image";
import type { ReactNode } from "react";
import manifest from "../../../public/assets/wow/raids/voidspire-planner/manifest.json";
import styles from "./voidspirePlanner.module.css";

type PlannerGlyph = "map" | "arena" | "grid" | "art" | "command" | "sketch" | "zoom";
const forcedGlyphs: Record<PlannerGlyph, string> = { map: "↦", arena: "◇", grid: "▦", art: "✦", command: "◆", sketch: "✎", zoom: "○" };

/** Original planner decoration, never a creature portrait or a combat ability. */
export function RaidPlannerIcon({ slug, kind, fallback, mark }: { slug: string; kind: PlannerGlyph; fallback?: ReactNode; mark?: string }) {
  if (slug !== "the-voidspire") return fallback;
  return <span className={styles.glyph} data-voidspire-glyph={kind} aria-hidden="true">
    <Image src={manifest.entries[kind].path} alt="" width={64} height={64} draggable={false} />
    {mark && <span className={styles.glyphMark}>{mark}</span>}
    <span className={styles.forcedGlyph}>{mark ?? forcedGlyphs[kind]}</span>
  </span>;
}

export function RaidPlannerTextMark({ slug, text, fallback, compact = false }: { slug: string; text: string; fallback: ReactNode; compact?: boolean }) {
  return slug === "the-voidspire" ? <span className={styles.textMark} data-compact={compact} aria-hidden="true">{text}</span> : fallback;
}

export function RaidPlannerPullPosition({ slug, label, current, total }: { slug: string; label: string; current: number; total: number }) {
  return slug === "the-voidspire" ? <p className={styles.pullPosition} data-voidspire-pull-position>{label} {current} / {total}</p> : null;
}
