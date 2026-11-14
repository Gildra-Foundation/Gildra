import type { ReactNode } from "react";
import Link from "next/link";
import styles from "./forever.module.css";

export type ForeverTab = { href: string; label: ReactNode; current?: boolean; count?: number };

/** Views of one page as links (record types, modes): the open one is underlined; the row scrolls on a phone. */
export function ForeverTabs({ label, tabs, className }: { label: string; tabs: readonly ForeverTab[]; className?: string }) {
  return <nav className={className ? `${styles.tabs} ${className}` : styles.tabs} aria-label={label}>
    {tabs.map(tab => <Link key={tab.href} href={tab.href} prefetch={false} aria-current={tab.current ? "page" : undefined}>
      {tab.label}{tab.count !== undefined ? <span className={styles.tabCount}>{tab.count}</span> : null}
    </Link>)}
  </nav>;
}

export type ForeverChip = {
  label: ReactNode;
  /** A game icon in front of the label (decor: the label names the choice). */
  icon?: string;
  active?: boolean;
} & ({ href: string; onClick?: never } | { href?: never; onClick: () => void });

/** Quick choices (roles, classes, categories): links on a server page, buttons where a client component owns the state. */
export function ForeverChips({ label, chips, className }: { label: string; chips: readonly ForeverChip[]; className?: string }) {
  return <ul className={className ? `${styles.chips} ${className}` : styles.chips} aria-label={label}>
    {chips.map((chip, index) => {
      // eslint-disable-next-line @next/next/no-img-element -- a 28 px game icon from the icon host, served as is
      const body = <>{chip.icon ? <img src={chip.icon} alt="" width={28} height={28} loading="lazy" decoding="async" /> : null}<span>{chip.label}</span></>;
      return <li key={index}>
        {chip.href !== undefined
          ? <Link className={styles.chip} href={chip.href} prefetch={false} aria-current={chip.active ? "true" : undefined}>{body}</Link>
          : <button type="button" className={styles.chip} aria-pressed={Boolean(chip.active)} onClick={chip.onClick}>{body}</button>}
      </li>;
    })}
  </ul>;
}
