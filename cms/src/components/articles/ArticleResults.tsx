"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import type { AdminLang } from "../../admin/text";
import type { ArticleRow } from "../../articles/data";
import { tableLabels } from "../tableLabels";
import { Skeleton } from "../valyro-ui/basic/Skeleton";
import { DataTable, type DataTableColumn } from "../valyro-ui/data-display/DataTable";

const compactQuery = "(max-width: 640px)";
function subscribeCompact(onChange: () => void) {
  const media = window.matchMedia(compactQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const readCompact = () => window.matchMedia(compactQuery).matches;
const serverCompact = () => false;

/** One result tree: the desktop table and mobile list share the same cells and links. */
export function ArticleResults({ data, columns, label, lang, loading, empty }: {
  data: ArticleRow[];
  columns: DataTableColumn<ArticleRow>[];
  label: string;
  lang: AdminLang;
  loading: boolean;
  empty: ReactNode;
}) {
  const compact = useSyncExternalStore(subscribeCompact, readCompact, serverCompact);
  if (!compact) return <DataTable data={data} columns={columns} label={label} locale={lang} labels={tableLabels(lang)} loading={loading} empty={empty} />;
  if (loading) return <div className="gd-article-list" aria-busy="true" aria-label={label}>
    {[0, 1, 2].map((index) => <div key={index} className="gd-article-card" aria-hidden="true"><Skeleton width="80%" height={22} /><Skeleton width="55%" /><Skeleton height={40} /></div>)}
  </div>;
  if (data.length === 0) return empty;

  const title = columns.find((column) => column.key === "title");
  const actions = columns.find((column) => column.key === "actions");
  const metadata = columns.filter((column) => column !== title && column !== actions);
  return <ul className="gd-article-list" aria-label={label} role="list">
    {data.map((row) => <li className="gd-article-card" key={row.id}>
      {title?.cell?.(row)}
      <dl>{metadata.map((column) => <div key={column.key}><dt>{column.header}</dt><dd>{column.cell?.(row)}</dd></div>)}</dl>
      {actions?.cell?.(row)}
    </li>)}
  </ul>;
}
