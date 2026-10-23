"use client";

import { Link } from "@payloadcms/ui";
import { adminText, type AdminLang } from "../admin/text";
import { DataTable, type DataTableColumn } from "./valyro-ui/data-display/DataTable";
import { Badge } from "./valyro-ui/basic/Badge";
import { EmptyState } from "./valyro-ui/data-display/EmptyState";
import { LocalTime, SiteLink } from "./SiteLink";
import { tableLabels } from "./tableLabels";

export type UpcomingRow = {
  id: string;
  when: string;
  title: string;
  /** Editor of the scheduled document; null when it is gone. */
  href: string | null;
  siteID: string | null;
  siteName: string;
  action: "publish" | "unpublish";
};

/** The publishing schedule on the desk, soonest first (Dashboard keeps the data and its access rules). */
export function UpcomingTable({ rows, lang }: { rows: UpcomingRow[]; lang: AdminLang }) {
  const t = adminText(lang);
  const columns: DataTableColumn<UpcomingRow>[] = [
    { key: "when", header: t.colWhen, sortable: true, cell: (row) => <LocalTime iso={row.when} lang={lang} /> },
    { key: "title", header: t.colTitle, sortable: true, cell: (row) => <span className="gd-cell-title">
      {row.href === null ? row.title || t.untitled
        : row.siteID !== null ? <SiteLink siteID={row.siteID} href={row.href}>{row.title || t.untitled}</SiteLink>
        : <Link href={row.href} prefetch={false}>{row.title || t.untitled}</Link>}
      {row.siteName ? <span className="gd-kind">{row.siteName}</span> : null}
    </span> },
    { key: "action", header: t.colAction, sortable: true,
      accessor: (row) => row.action === "unpublish" ? t.actionUnpublish : t.actionPublish,
      cell: (row) => <Badge color={row.action === "unpublish" ? "gray" : "blue"}>{row.action === "unpublish" ? t.actionUnpublish : t.actionPublish}</Badge> },
  ];
  return <DataTable data={rows} columns={columns} label={t.upcoming} locale={lang} density="compact"
    labels={tableLabels(lang)} empty={rows.length === 0 ? <EmptyState size="sm" title={t.upcomingEmpty} /> : undefined} />;
}
