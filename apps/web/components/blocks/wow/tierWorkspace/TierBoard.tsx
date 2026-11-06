"use client";

import { useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { ArrowRight, X } from "lucide-react";
import { AtlasTooltip } from "@gildra/atlas-ui/AtlasTooltip";
import { specIcon } from "@/lib/games/wow/assets";
import { groupByTier, type BoardEntry } from "./tierBoardRows";
import { classStyle, tierClass, tierStyle } from "./tierVisuals";
import styles from "./tierWorkspace.module.css";

export type TierBoardLabels = { tier: (tier: string) => string; talents: string; close: string };

/** The spec icon in its class-coloured frame (no text: the name sits next to it or in the tooltip). */
export function SpecIcon({ entry, size = 48 }: { entry: Pick<BoardEntry, "specName" | "className" | "classSlug" | "specSlug">; size?: number }) {
  const src = specIcon(`${entry.specName} ${entry.className}`, entry.classSlug, entry.specSlug);
  return (
    <span className={styles.specIcon} style={classStyle(entry.classSlug)} aria-hidden="true">
      {src ? <Image src={src} alt="" width={size} height={size} /> : <b>{entry.specName.charAt(0)}</b>}
    </span>
  );
}

/**
 * Classic tier rows: a coloured tier badge on the left, the specs of that tier as icons in their class colour.
 * Hover or keyboard focus shows the spec's card (name, hero talents, the source's metric); a click opens its
 * talents. On touch the first tap opens the card under the row and the second tap (or its button) follows the link.
 */
export function TierBoard({ entries, labels, tip, href, busy, empty }: {
  entries: BoardEntry[];
  labels: TierBoardLabels;
  tip: (entry: BoardEntry) => ReactNode;
  href: (entry: BoardEntry) => string | undefined;
  busy: boolean;
  empty: ReactNode;
}) {
  const [openKey, setOpenKey] = useState("");
  const pointer = useRef("mouse");
  const rows = groupByTier(entries);
  const open = entries.find((entry) => entry.key === openKey);

  if (!rows.length) return busy ? <div className={styles.boardEmpty} aria-busy="true" /> : <p className={styles.empty}>{empty}</p>;

  return (
    <div className={styles.tierBoard} aria-busy={busy} data-loading={busy || undefined}>
      {rows.map((row) => {
        const rowId = `tier-row-${tierClass(row.tier)}-${row.tier.replace(/[^a-z0-9]/gi, "p")}`;
        const openHere = open && row.entries.some((entry) => entry.key === open.key);
        return (
          <section key={row.tier} className={styles.tierRow} data-tier={tierClass(row.tier)} style={tierStyle(row.tier)} aria-labelledby={rowId}>
            <h3 className={styles.tierBadge} id={rowId}><span className={styles.srOnly}>{labels.tier(row.tier)}</span><span aria-hidden="true">{row.tier}</span></h3>
            <ul className={styles.tierIcons}>
              {row.entries.map((entry) => {
                const link = href(entry);
                const name = `${entry.specName} ${entry.className}`;
                const face = <><SpecIcon entry={entry} /><span className={styles.chipName}>{entry.specName}</span></>;
                return (
                  <li key={entry.key} className={styles.chipItem}>
                    <AtlasTooltip content={<div className={styles.tip}>{tip(entry)}</div>}>
                      {link ? (
                        <a
                          href={link}
                          className={styles.chip}
                          style={classStyle(entry.classSlug)}
                          data-open={entry.key === openKey || undefined}
                          aria-label={name}
                          onPointerDown={(event) => { pointer.current = event.pointerType; }}
                          onClick={(event) => {
                            if (pointer.current === "mouse" || entry.key === openKey) return;
                            event.preventDefault();
                            setOpenKey(entry.key);
                          }}
                        >{face}</a>
                      ) : (
                        <button type="button" className={styles.chip} style={classStyle(entry.classSlug)} data-open={entry.key === openKey || undefined} aria-label={name} aria-expanded={entry.key === openKey} onClick={() => setOpenKey(entry.key === openKey ? "" : entry.key)}>{face}</button>
                      )}
                    </AtlasTooltip>
                  </li>
                );
              })}
            </ul>
            {openHere && open ? (
              <div className={styles.tierDetail} style={classStyle(open.classSlug)}>
                <SpecIcon entry={open} size={56} />
                <div className={styles.tierDetailText}>{tip(open)}</div>
                <div className={styles.tierDetailActions}>
                  {href(open) ? <a className={styles.talentsLink} href={href(open)}>{labels.talents}<ArrowRight aria-hidden="true" /></a> : null}
                  <button type="button" className={styles.detailClose} aria-label={labels.close} onClick={() => setOpenKey("")}><X aria-hidden="true" /></button>
                </div>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
