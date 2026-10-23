import clsx from "clsx";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import "./valyro-ui/navigation/Pagination.css";
import bridge from "./valyroAtlasBridge.module.css";
import styles from "./AtlasPageLinks.module.css";

/** Page numbers with ellipses, the same shape as Valyro's getPaginationRange (constant length once collapsing). */
function pageRange(page: number, count: number, siblings = 1): Array<number | "start-ellipsis" | "end-ellipsis"> {
  const total = siblings * 2 + 5;
  if (count <= total) return Array.from({ length: count }, (_, i) => i + 1);
  const left = Math.max(page - siblings, 2);
  const right = Math.min(page + siblings, count - 1);
  const showLeft = left > 3;
  const showRight = right < count - 2;
  if (!showLeft) return [...Array.from({ length: total - 2 }, (_, i) => i + 1), "end-ellipsis", count];
  if (!showRight) return [1, "start-ellipsis", ...Array.from({ length: total - 2 }, (_, i) => count - (total - 3) + i)];
  return [1, "start-ellipsis", ...Array.from({ length: right - left + 1 }, (_, i) => left + i), "end-ellipsis", count];
}

/**
 * Numbered paging as plain links on Valyro's Pagination styles: works without
 * JavaScript, every page has its own URL (`href(page)`), and the server renders it.
 */
export function AtlasPageLinks({ page, pageCount, href, label, labels, className }: {
  page: number;
  pageCount: number;
  href: (page: number) => string;
  label: string;
  labels: { previous: string; next: string; page: (n: number) => string };
  className?: string;
}) {
  if (pageCount <= 1) return null;
  const step = (target: number, rel: "prev" | "next", text: string, icon: React.ReactNode) =>
    target < 1 || target > pageCount ? (
      <span className="ui-pagination__item" data-kind="step" aria-disabled="true" aria-label={text}>{icon}</span>
    ) : (
      <a className="ui-pagination__item" data-kind="step" href={href(target)} rel={rel} aria-label={text}>{icon}</a>
    );
  return (
    <nav className={clsx("ui-pagination", bridge.scope, styles.pages, className)} data-size="md" aria-label={label}>
      <ul className="ui-pagination__list">
        <li>{step(page - 1, "prev", labels.previous, <ChevronLeft aria-hidden="true" />)}</li>
        {pageRange(page, pageCount).map((item) =>
          typeof item === "number" ? (
            <li key={item}>
              <a className="ui-pagination__item" href={href(item)} aria-current={item === page ? "page" : undefined} aria-label={labels.page(item)}>{item}</a>
            </li>
          ) : (
            <li key={item} className="ui-pagination__ellipsis" aria-hidden="true"><MoreHorizontal /></li>
          ),
        )}
        <li>{step(page + 1, "next", labels.next, <ChevronRight aria-hidden="true" />)}</li>
      </ul>
    </nav>
  );
}
