import Link from "next/link";
import { ChevronRight } from "lucide-react";
import clsx from "clsx";
import styles from "./AtlasBreadcrumbs.module.css";
import { breadcrumbJsonLd } from "./breadcrumbJsonLd";

export type AtlasCrumb = { label: string; href?: string };

/** Trail back to the section hub. The last item is the current page. */
export function AtlasBreadcrumbs({ items, label, className, structuredData = true }: { items: AtlasCrumb[]; label: string; className?: string; structuredData?: boolean }) {
  return (
    <nav className={clsx(styles.trail, className)} aria-label={label} data-text-links>
      {structuredData && items.length > 1 ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(items)).replace(/</g, "\\u003c") }} />
      ) : null}
      <ol>
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`}>
              {/* The divider leads its crumb: a crumb that leaves the line takes it along. */}
              {index > 0 ? <ChevronRight aria-hidden="true" /> : null}
              {item.href && !last ? <Link href={item.href}>{item.label}</Link> : <span aria-current={last ? "page" : undefined}>{item.label}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
