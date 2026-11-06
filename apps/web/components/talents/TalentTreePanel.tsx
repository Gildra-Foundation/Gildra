import type { CSSProperties, ReactNode } from "react";
import styles from "./TalentTreePanel.module.css";
import { talentTreePanelCopy } from "./talentTreePanelCopy";

type PanelVariant = "class" | "hero" | "spec";

type TalentTreePanelProps = {
  lang?: "ru" | "en";
  variant: PanelVariant;
  title: string;
  iconSrc?: string;
  /** Replaces the visible title (the hero path switch names the tree itself). */
  switcher?: ReactNode;
  spent: number;
  budget: number;
  loading?: boolean;
  children: ReactNode;
  style?: CSSProperties;
};

/** One talent tree on its painted panel: emblem, name (or the hero path switch) and the points spent in it. */
export function TalentTreePanel({ lang = "ru", variant, title, iconSrc, switcher, spent, budget, loading = false, children, style }: TalentTreePanelProps) {
  const copy = talentTreePanelCopy[lang];
  const full = !loading && budget > 0 && spent >= budget;
  return <article className={`tc-panel tc-${variant}-panel ${styles.panel}`} data-panel-variant={variant} data-tree={variant} data-loading={loading || undefined} style={style}>
    <div className={styles.header}>
      <span className={styles.emblem} aria-hidden="true">{iconSrc ? <img src={iconSrc} alt="" width={40} height={40} loading="eager" decoding="async" draggable={false} /> : null}</span>
      <h2 className={switcher ? styles.srOnly : styles.title}>{title}</h2>
      {switcher}
      <span className={styles.points} data-full={full || undefined} data-tree-points={variant} aria-label={loading ? copy.loadingTalentTree : copy.pointsOf(spent, budget)}>
        <b>{loading ? "—" : spent}</b><i>/</i>{loading ? "—" : budget}
      </span>
    </div>
    {children}
  </article>;
}
