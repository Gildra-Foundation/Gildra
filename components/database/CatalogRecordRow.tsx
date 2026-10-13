import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { ResilientImage } from "@/components/media/ResilientImage";
import { itemQualityColors } from "@/lib/atlas/dataPalette";
import { CatalogGlyph } from "@/components/database/CatalogGlyph";
import styles from "./catalogRecordRow.module.css";

export type CatalogRecordRowProps = {
  href: string;
  name: string;
  /** Uppercase line above the name (record type, game); left out when the whole list has one type. */
  typeLabel?: ReactNode;
  iconUrl?: string | null;
  /** Sprite symbol of the record type, shown muted while the catalog icon is missing. */
  iconSymbol?: string;
  /** Blizzard item quality (0–7): tints the name and the icon frame (data colour). */
  quality?: number;
  description?: string;
  /** Short facts in one line ("Item level 40", "Fire", "ID 100290"). */
  meta?: ReactNode[];
  /** Small action in the row corner (tooltip preview). */
  action?: ReactNode;
  /** Analytics hook for the name link (read by CatalogBehavior). */
  track?: { event: string; props: Record<string, string | number> };
};

/**
 * One catalog record: icon, type, name (the whole row is the link) and a
 * single line of facts. Shared by /database, /library/<dataset> and /search.
 */
export function CatalogRecordRow({ href, name, typeLabel, iconUrl, iconSymbol = "#ic-gem", quality, description, meta = [], action, track }: CatalogRecordRowProps) {
  const qualityColor = quality !== undefined ? itemQualityColors[quality as keyof typeof itemQualityColors] : undefined;
  const facts = meta.filter((entry) => entry !== null && entry !== undefined && entry !== "");
  return (
    <li className={styles.row} data-quality={qualityColor ? quality : undefined} style={qualityColor ? { "--record-quality": qualityColor.frame, "--record-quality-text": qualityColor.text } as CSSProperties : undefined}>
      <span className={styles.icon} aria-hidden="true">
        <ResilientImage src={iconUrl} alt="" width={48} height={48} loading="lazy" fallback={<CatalogGlyph symbol={iconSymbol} className={styles.glyph} />} />
      </span>
      <div className={styles.body}>
        {typeLabel ? <p className={styles.type}>{typeLabel}</p> : null}
        <h3 className={styles.name}>
          <Link href={href} prefetch={false} className={styles.link} data-track={track?.event} data-track-props={track ? JSON.stringify(track.props) : undefined}>{name}</Link>
        </h3>
        {description ? <p className={styles.description}>{description}</p> : null}
        {/* A no-break space keeps each "·" on the line of the fact before it, so a wrapped line never starts with a dot. */}
        {facts.length ? <p className={styles.meta}>{facts.map((fact, index) => <span key={index}>{index ? "\u00a0· " : null}{fact}</span>)}</p> : null}
      </div>
      {action ? <div className={styles.action}>{action}</div> : null}
    </li>
  );
}
