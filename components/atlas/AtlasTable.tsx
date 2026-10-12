import type { ReactNode } from "react";
import clsx from "clsx";
import styles from "./AtlasTable.module.css";

export type AtlasColumn<T> = {
  key: string;
  header: ReactNode;
  /** Plain text of the header for the phone card layout when `header` is not a string. */
  label?: string;
  cell: (row: T, index: number) => ReactNode;
  /** The first column usually names the row: rendered as <th scope="row">. */
  rowHeader?: boolean;
  /** Numbers: tabular figures, aligned to the end. */
  numeric?: boolean;
  className?: string;
};

/**
 * The one data table of the atlas (loot, item levels, version diffs): sticky
 * header, quiet row rules, tabular numbers, a focusable scroll region. On
 * phones `layout="cards"` turns each row into a small card of label: value
 * pairs instead of a sideways scroll (short tables); `scroll` keeps the grid.
 */
export function AtlasTable<T>({ columns, rows, rowKey, label, caption, layout = "scroll", maxWidth, className, testId }: {
  columns: AtlasColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T, index: number) => string;
  /** Accessible name of the scroll region. */
  label: string;
  caption?: ReactNode;
  layout?: "scroll" | "cards";
  /** Cap the width of narrow tables (CSS length). */
  maxWidth?: string;
  className?: string;
  testId?: string;
}) {
  return (
    <div className={clsx(styles.region, layout === "cards" && styles.cards, className)} role="region" aria-label={label} tabIndex={0} style={maxWidth ? { maxWidth } : undefined}>
      <table className={styles.table} data-testid={testId}>
        {caption ? <caption className={styles.caption}>{caption}</caption> : null}
        <thead>
          <tr>{columns.map((column) => <th key={column.key} scope="col" className={clsx(column.numeric && styles.numeric, column.className)}>{column.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey(row, index)}>
              {columns.map((column) => {
                const Cell = column.rowHeader ? "th" : "td";
                const label = column.label ?? (typeof column.header === "string" ? column.header : undefined);
                return (
                  <Cell key={column.key} scope={column.rowHeader ? "row" : undefined} data-label={label} className={clsx(column.numeric && styles.numeric, column.className)}>
                    {column.cell(row, index)}
                  </Cell>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
