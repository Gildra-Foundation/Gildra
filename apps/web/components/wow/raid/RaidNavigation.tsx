import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { CurrentEncounterInView } from "./CurrentEncounterInView";
import styles from "./raidNavigation.module.css";

export type RaidEncounterLink = { href: string; name: string; image?: string; current?: boolean };

/** Compact row of the raid's encounters; scrolls sideways on phones. */
export function EncounterSwitcher({ items, label }: { items: RaidEncounterLink[]; label: string }) {
  if (items.length < 2) return null;
  const current = items.find((item) => item.current)?.href;
  return (
    <nav className={styles.switcher} aria-label={label}>
      {current ? <CurrentEncounterInView current={current} /> : null}
      <ol>
        {items.map((item, index) => (
          <li key={item.href}>
            <Link href={item.href} prefetch={false} aria-current={item.current ? "page" : undefined}>
              <span className={styles.index}>{String(index + 1).padStart(2, "0")}</span>
              {item.image ? <Image className={styles.art} src={item.image} alt="" width={40} height={40} /> : null}
              <span className={styles.name}>{item.name}</span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** End-of-guide links: back to the raid and on to the next encounter. */
export function RaidPager({ label, back, next, nextLabel }: { label: string; back: { href: string; label: string }; next?: RaidEncounterLink; nextLabel: string }) {
  return (
    <nav className={styles.pager} aria-label={label}>
      <Link href={back.href} prefetch={false} className={styles.back}><ArrowLeft aria-hidden="true" />{back.label}</Link>
      {next ? (
        <Link href={next.href} prefetch={false} className={styles.next}>
          {next.image ? <Image src={next.image} alt="" width={48} height={48} /> : null}
          <span><small>{nextLabel}</small><strong>{next.name}</strong></span>
          <ArrowRight aria-hidden="true" />
        </Link>
      ) : null}
    </nav>
  );
}
