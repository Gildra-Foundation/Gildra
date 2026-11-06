import type { CSSProperties, ReactNode } from "react";
import styles from "./TalentTreePanel.module.css";

type PanelVariant = "class" | "hero" | "spec";

type TalentTreePanelProps = {
  variant: PanelVariant;
  title: string;
  iconSrc?: string;
  loading?: boolean;
  children: ReactNode;
  style?: CSSProperties;
};

/** One talent tree on its painted panel: emblem and name. The points of every tree sit together in the toolbar. */
export function TalentTreePanel({ variant, title, iconSrc, loading = false, children, style }: TalentTreePanelProps) {
  return <article className={`tc-panel tc-${variant}-panel ${styles.panel}`} data-panel-variant={variant} data-tree={variant} data-loading={loading || undefined} style={style}>
    <div className={styles.header}>
      <span className={styles.emblem} aria-hidden="true">{iconSrc ? <img src={iconSrc} alt="" width={32} height={32} loading="eager" decoding="async" draggable={false} /> : null}</span>
      <h2 className={styles.title}>{title}</h2>
    </div>
    {children}
  </article>;
}
