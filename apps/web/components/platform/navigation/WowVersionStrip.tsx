"use client";
import Link from "next/link";
import { useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { lessMotion } from "@gildra/atlas-ui/motionPreference";
import { wowPortalFor, wowPortalHref, wowPortals, type WowPortalId } from "@/lib/games/wowPortals";
import { armGameTurn } from "@/components/motion/gameTurn";
import { useToolbarPath } from "./toolbarPath";
import styles from "./wowVersionStrip.module.css";

/**
 * The game versions above the bar, as on Wowhead: the live game, Forever and Mists of Pandaria Classic.
 * The address names the version; a switch keeps the reader in the same section when the version has it.
 * One rule marks the current version and glides to the chosen one on the click (before the
 * page arrives); the chosen emblem flares in its version's colour, and the page hand-over
 * of that navigation slides in from the side of the chosen version (components/motion/gameTurn.ts).
 */
export function WowVersionStrip() {
  const path = useToolbarPath();
  const lang = /^\/ru(?:\/|$)/.test(path) ? "ru" : "en";
  const current = wowPortalFor(path);
  const [chosen, setChosen] = useState<{ id: WowPortalId; from: string } | null>(null);
  // A choice holds until the address has moved on (or another one is made).
  const shown = chosen && chosen.from === path ? chosen.id : current.id;
  const list = useRef<HTMLUListElement>(null);
  const [rule, setRule] = useState<{ x: number; width: number } | null>(null);

  // The rule sits under the shown version's label; measured, not guessed, so it fits either language.
  useLayoutEffect(() => {
    const link = list.current?.querySelector<HTMLElement>(`[data-version="${shown}"]`);
    if (!link) return;
    const inset = Number.parseFloat(getComputedStyle(link).paddingInlineStart) || 0;
    const next = { x: link.offsetLeft + inset, width: link.offsetWidth - 2 * inset };
    setRule((previous) => (previous && previous.x === next.x && previous.width === next.width ? previous : next));
  }, [shown, lang]);

  const choose = (event: MouseEvent<HTMLAnchorElement>, id: WowPortalId) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || id === shown) return;
    setChosen({ id, from: path });
    if (lessMotion()) return;
    const order = wowPortals.findIndex((portal) => portal.id === id) - wowPortals.findIndex((portal) => portal.id === shown);
    const box = event.currentTarget.getBoundingClientRect();
    armGameTurn(id, Math.sign(order) || 1, (box.left + box.width / 2) / window.innerWidth);
  };

  return <nav className={styles.strip} aria-label={lang === "ru" ? "Версии World of Warcraft" : "World of Warcraft versions"} data-atlas-scope data-wow-version-strip>
    <ul className={styles.list} ref={list} data-glide={rule ? "" : undefined}>
      {wowPortals.map(portal => <li key={portal.id}>
        <Link className={styles.version} href={wowPortalHref(lang, portal, path)} prefetch={false} data-version={portal.id}
          aria-current={portal.id === current.id ? "true" : undefined} data-shown={portal.id === shown || undefined}
          data-chosen={chosen?.id === portal.id && chosen.from === path ? "" : undefined}
          onClick={(event) => choose(event, portal.id)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- an 18 px emblem; the optimiser would only add a request hop */}
          <img className={styles.emblem} src={portal.emblem} alt="" width={18} height={18} decoding="async" />
          <span className={styles.full}>{portal.label[lang]}</span>
          <span className={styles.short}>{portal.shortLabel[lang]}</span>
        </Link>
      </li>)}
      {rule ? <li className={styles.rule} aria-hidden="true" data-version={shown}
        style={{ transform: `translateX(${rule.x}px)`, width: rule.width }} /> : null}
    </ul>
  </nav>;
}
