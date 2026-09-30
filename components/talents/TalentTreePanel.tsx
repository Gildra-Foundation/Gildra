import { Crown, Shield, Swords } from "lucide-react";
import type { ReactNode } from "react";
import Image from "next/image";
import { SpecEmblem } from "./SpecEmblem";
import styles from "./TalentTreePanel.module.css";

type PanelVariant = "class" | "hero" | "spec";

const panelIcons = { class: Shield, hero: Crown, spec: Swords };

type TalentTreePanelProps = {
  lang?: "ru" | "en";
  appearance?: "default" | "manuscript";
  specSlug?: string;
  variant: PanelVariant;
  eyebrow: string;
  title: ReactNode;
  iconSrc?: string;
  secondary?: ReactNode;
  spent: number;
  budget: number;
  nodeCount: number;
  loading?: boolean;
  children: ReactNode;
  scene?: ReactNode;
};

export function TalentTreePanel({ lang = "ru", appearance = "default", specSlug, variant, eyebrow, title, iconSrc, secondary, spent, budget, nodeCount, loading = false, children, scene }: TalentTreePanelProps) {
  const Icon = panelIcons[variant];
  const manuscript = appearance === "manuscript";
  return <article className={`tc-panel tc-${variant}-panel ${styles.panel}${manuscript ? ` ${styles.manuscript}` : ""}`} data-panel-variant={variant} data-panel-appearance={appearance} data-loading={loading || undefined}>
    <svg className={styles.frame} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path d="M1 14V3Q1 1 3 1H18M82 1H97Q99 1 99 3V14M99 86V97Q99 99 97 99H82M18 99H3Q1 99 1 97V86" />
      <path d="M1 24V76M99 24V76" />
      <circle cx="1" cy="19" r=".7" /><circle cx="99" cy="19" r=".7" />
      <circle cx="1" cy="81" r=".7" /><circle cx="99" cy="81" r=".7" />
    </svg>
    {scene}
    <header className={`${styles.header}${secondary ? ` ${styles.headerWithSecondary}` : ""}`}>
      <div className={styles.identity}>
        <span className={`${styles.icon}${manuscript && specSlug ? ` ${styles.engravedIcon}` : ""}`} aria-hidden="true">{manuscript && specSlug ? <SpecEmblem specSlug={specSlug} size={72} /> : iconSrc ? <img src={iconSrc} alt="" width={56} height={56} loading="eager" decoding="async" draggable={false} /> : <Icon />}</span>
        <div className={styles.heading}><small>{eyebrow}</small><h2>{title}</h2></div>
      </div>
      {secondary ? <div className={styles.secondary}>{secondary}</div> : null}
      <span className={styles.counter} aria-label={loading ? lang === "ru" ? "Данные дерева загружаются" : "Loading talent tree" : lang === "ru" ? `${spent} из ${budget} очков, ${nodeCount} узлов` : `${spent} of ${budget} points, ${nodeCount} nodes`}>
        <strong><b>{loading ? "—" : spent}</b><i>/</i>{loading ? "—" : budget}</strong>
        <small>{loading ? lang === "ru" ? "загрузка" : "loading" : `${nodeCount} ${lang === "ru" ? "узлов" : "nodes"}`}</small>
      </span>
      {manuscript ? <span className={styles.manuscriptRule} aria-hidden="true"><Image src="/assets/wow/character-book/talent-divider-v1.png" alt="" width={2079} height={756} sizes="(max-width: 768px) 760px, 1200px" draggable={false} /></span> : null}
    </header>
    {children}
  </article>;
}
