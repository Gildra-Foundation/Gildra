"use client";
import Link from "next/link";
import { wowPortalFor, wowPortalHref, wowPortals } from "@/lib/games/wowPortals";
import { useToolbarPath } from "./toolbarPath";
import styles from "./wowVersionStrip.module.css";

/**
 * The game versions above the bar, as on Wowhead: the live game, Forever and Mists of Pandaria Classic.
 * The address names the version; a switch keeps the reader in the same section when the version has it.
 */
export function WowVersionStrip() {
  const path = useToolbarPath();
  const lang = /^\/ru(?:\/|$)/.test(path) ? "ru" : "en";
  const current = wowPortalFor(path);
  return <nav className={styles.strip} aria-label={lang === "ru" ? "Версии World of Warcraft" : "World of Warcraft versions"} data-atlas-scope>
    <ul className={styles.list}>
      {wowPortals.map(portal => <li key={portal.id}>
        <Link className={styles.version} href={wowPortalHref(lang, portal, path)} prefetch={false} data-version={portal.id}
          aria-current={portal.id === current.id ? "true" : undefined}>
          {/* eslint-disable-next-line @next/next/no-img-element -- an 18 px emblem; the optimiser would only add a request hop */}
          <img className={styles.emblem} src={portal.emblem} alt="" width={18} height={18} decoding="async" />
          <span className={styles.full}>{portal.label[lang]}</span>
          <span className={styles.short}>{portal.shortLabel[lang]}</span>
        </Link>
      </li>)}
    </ul>
  </nav>;
}
