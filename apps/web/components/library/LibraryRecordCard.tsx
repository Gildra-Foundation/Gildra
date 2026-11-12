import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { ResilientImage } from "@/components/media/ResilientImage";
import { CatalogGlyph } from "@/components/database/CatalogGlyph";
import { itemQualityColors } from "@/lib/atlas/dataPalette";
// The CSS module directly, not the materialAtlas barrel: this card also renders inside the client list.
import materialStyles from "@/components/wow/shared/material/material.module.css";
import { libraryCardCopy } from "@/components/library/libraryCardCopy";
import type { Lang } from "@/lib/i18n-paths";
import styles from "./libraryRecordCard.module.css";

export type LibraryCardLayout = "cards" | "tray";

export type LibraryRecordCardProps = {
  id: string;
  href: string;
  name: string;
  lang: Lang;
  layout: LibraryCardLayout;
  iconUrl?: string | null;
  iconSymbol?: string;
  /** Blizzard item quality (0–7): data colour of the frame and the name. */
  quality?: number;
  itemLevel?: number;
  /** Slot line under the name ("Ноги"), left out when the record has none. */
  slot?: string;
  /** Short second line of the tray tile (gem bonus, collection source). */
  description?: string;
  /** Small facts of the footer ("Треб. ур. 80", "Physical · Instant"). */
  facts: string[];
  /** Untranslated name marker. */
  badge?: ReactNode;
  /** Tooltip preview button (keyboard and touch way to the tooltip). */
  action?: ReactNode;
  track?: { event: string; props: Record<string, string | number> };
  /** `materialIconFrameStyle(libraryKit, size)`, computed on the server (the kit tables stay out of the browser). */
  iconFrameStyle: CSSProperties;
};

/**
 * One record of a library dataset. "cards": icon in the kit frame (quality on its edge), the
 * full name on up to two lines, one line of item level · slot · quality and a
 * footer with the facts and the tooltip button. "tray": a square tile for gems and
 * collections where the icon is the subject. The name link covers the card;
 * `data-hover-preview` lets LibraryHoverPreview show the in-game tooltip on
 * mouse hover.
 */
export function LibraryRecordCard({ id, href, name, lang, layout, iconUrl, iconSymbol = "#ic-gem", quality, itemLevel, slot, description, facts, badge, action, track, iconFrameStyle }: LibraryRecordCardProps) {
  const copy = libraryCardCopy[lang];
  const colour = quality !== undefined ? itemQualityColors[quality as keyof typeof itemQualityColors] : undefined;
  const qualityName = colour ? copy.quality[quality as keyof typeof copy.quality] : undefined;
  const style = colour ? { "--record-quality": colour.frame, "--record-quality-text": colour.text } as CSSProperties : undefined;
  const tray = layout === "tray";
  // One line under every name, filled the same way across the list: item level always (items), slot and quality when the game gives them.
  const sub = [itemLevel ? copy.levelShort(itemLevel) : null, slot, qualityName ? <span key="q" className={styles.quality}>{qualityName}</span> : null].filter(Boolean);
  return (
    <li className={tray ? `${styles.card} ${styles.tray}` : styles.card} data-quality={colour ? quality : undefined} style={style} data-hover-preview={id} data-hover-icon={iconUrl || undefined}>
      {/* The game icon in the library kit's painted frame; the item quality tints the frame's inner edge. */}
      <span className={`${materialStyles.iconFrame} ${styles.icon}`} style={iconFrameStyle} aria-hidden="true">
        <ResilientImage src={iconUrl} alt="" width={tray ? 64 : 54} height={tray ? 64 : 54} loading="lazy" fallback={<CatalogGlyph symbol={iconSymbol} className={styles.glyph} />} />
      </span>
      <div className={styles.head}>
        <h3 className={styles.name} title={name}>
          <Link href={href} prefetch={false} className={styles.link} data-track={track?.event} data-track-props={track ? JSON.stringify(track.props) : undefined}>{name}</Link>
        </h3>
        {badge}
        {tray ? (description ? <p className={styles.description}>{description}</p> : null)
          : sub.length ? <p className={styles.sub}>{sub.map((part, index) => <span key={index}>{index ? " · " : null}{part}</span>)}</p> : null}
      </div>
      {/* No rule over an empty footer: a record without facts and without a tooltip button ends at its name. */}
      {(tray ? Boolean(qualityName || itemLevel) : facts.length > 0) || action ? <div className={styles.foot}>
        <p className={styles.facts}>
          {tray && (qualityName || itemLevel) ? <span className={styles.quality}>{[qualityName, itemLevel ? copy.levelShort(itemLevel) : null].filter(Boolean).join(" · ")}</span> : null}
          {tray ? null : facts.map((fact, index) => <span key={fact}>{index ? " · " : null}{fact}</span>)}
        </p>
        {action ? <div className={styles.action}>{action}</div> : null}
      </div> : null}
    </li>
  );
}
