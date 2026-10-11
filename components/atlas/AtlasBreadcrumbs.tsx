import Link from "next/link";
import { ChevronRight } from "lucide-react";
import clsx from "clsx";
import styles from "./AtlasBreadcrumbs.module.css";

export type AtlasCrumb = { label: string; href?: string };

/** Trail back to the section hub. The last item is the current page. */
export function AtlasBreadcrumbs({ items, label, className }: { items: AtlasCrumb[]; label: string; className?: string }) {
  return (
    <nav className={clsx(styles.trail, className)} aria-label={label}>
      <ol>
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`}>
              {item.href && !last ? <Link href={item.href}>{item.label}</Link> : <span aria-current={last ? "page" : undefined}>{item.label}</span>}
              {last ? null : <ChevronRight aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
