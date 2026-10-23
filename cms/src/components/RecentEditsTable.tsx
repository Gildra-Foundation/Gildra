"use client";

import { Link } from "@payloadcms/ui";
import { adminText, type AdminLang } from "../admin/text";
import { DataTable, type DataTableColumn } from "./valyro-ui/data-display/DataTable";
import { Badge } from "./valyro-ui/basic/Badge";
import { EmptyState } from "./valyro-ui/data-display/EmptyState";
import { LocalTime, SiteLink } from "./SiteLink";
import { tableLabels } from "./tableLabels";

export type RecentEditRow = {
  id: string;
  title: string;
  kind: "guides" | "pages";
  href: string;
  siteID: string | null;
  siteName: string;
  status: string;
  updatedAt: string;
};

export function RecentEditsTable({ rows, lang }: { rows: RecentEditRow[]; lang: AdminLang }) {
  const t = adminText(lang);
  const columns: DataTableColumn<RecentEditRow>[] = [
    { key: "title", header: t.colTitle, sortable: true, cell: (row) => <span className="gd-cell-title">
      {row.siteID !== null ? <SiteLink siteID={row.siteID} href={row.href}>{row.title || t.untitled}</SiteLink> : <Link href={row.href}>{row.title || t.untitled}</Link>}
      <span className="gd-kind">{row.kind === "guides" ? t.article : t.page}</span>
    </span> },
    { key: "siteName", header: t.colSite, sortable: true },
    { key: "status", header: t.colStatus, sortable: true,
      accessor: (row) => row.status === "published" ? t.statusPublished : t.statusDraft,
      cell: (row) => <Badge color={row.status === "published" ? "green" : "amber"}>{row.status === "published" ? t.statusPublished : t.statusDraft}</Badge> },
    { key: "updatedAt", header: t.colUpdated, sortable: true, align: "right", cell: (row) => <LocalTime iso={row.updatedAt} lang={lang} /> },
  ];
  return <DataTable data={rows} columns={columns} label={t.recent} searchable={rows.length > 0}
    locale={lang} density="compact" labels={tableLabels(lang)} empty={rows.length === 0 ? <EmptyState size="sm" title={t.recentEmpty} /> : undefined} />;
}
