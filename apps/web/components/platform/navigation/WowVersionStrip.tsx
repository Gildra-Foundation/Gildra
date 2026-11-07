"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { wowPortalFor, wowPortalHref, wowPortals } from "@/lib/games/wowPortals";
import styles from "./wowVersionStrip.module.css";

/**
 * The game versions above the bar, as on Wowhead: the live game, Forever and Mists of Pandaria Classic.
 * The address names the version; a switch keeps the reader in the same section when the version has it.
 */
export function WowVersionStrip() {
  const path = usePathname() ?? "/";
  const lang = /^\/ru(?:\/|$)/.test(path) ? "ru" : "en";
  const current = wowPortalFor(path);
  return <nav className={styles.strip} aria-label={lang === "ru" ? "Версии World of Warcraft" : "World of Warcraft versions"} data-atlas-scope>
    <ul className={styles.list}>
      {wowPortals.map(portal => <li key={portal.id}>
        <Link className={styles.version} href={wowPortalHref(lang, portal, path)} prefetch={false} data-version={portal.id}
          aria-current={portal.id === current.id ? "true" : undefined}>
          <span className={styles.full}>{portal.label[lang]}</span>
          <span className={styles.short}>{portal.shortLabel[lang]}</span>
        </Link>
      </li>)}
    </ul>
  </nav>;
}
