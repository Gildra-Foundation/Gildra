import type { ReactNode } from "react";
import clsx from "clsx";
import { AtlasAnchorSpy } from "./AtlasAnchorSpy";
import styles from "./AtlasAnchorNav.module.css";

export type AtlasAnchor = { href: string; label: ReactNode; count?: ReactNode };

/** In-page chapter links ("Abilities 6 · Loot 12"); the current chapter is marked as the reader scrolls. Scrolls horizontally on phones. */
export function AtlasAnchorNav({ items, label, className }: { items: AtlasAnchor[]; label: string; className?: string }) {
  return (
    <nav className={clsx(styles.nav, className)} aria-label={label}>
      <ul>
        {items.map((item) => (
          <li key={item.href}>
            <a href={item.href}>
              <span>{item.label}</span>
              {item.count !== undefined ? <b>{item.count}</b> : null}
            </a>
          </li>
        ))}
      </ul>
      <AtlasAnchorSpy />
    </nav>
  );
}
