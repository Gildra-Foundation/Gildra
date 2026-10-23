"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import React from "react";

import type { AdminLang } from "../../admin/text";
import { tableLabels } from "../tableLabels";
import { NATIVE_COOKIE } from "./workbenchList";
import { Button } from "../valyro-ui/basic/Button";
import { DataTable, type DataTableColumn } from "../valyro-ui/data-display/DataTable";

export type ListRow = { id: string; cells: Record<string, ReactNode> };
export type ListColumn = { key: string; header: string; align?: "left" | "right" };

/**
 * Valyro table for rows the server already rendered (server cells such as
 * the page's site address or its blocks check arrive as finished markup).
 * Sorting and paging stay with Payload's query, so the table never sorts a
 * single page as if it were the whole list.
 */
export function ListTable({ rows, columns, label, lang }: { rows: ListRow[]; columns: ListColumn[]; label: string; lang: AdminLang }) {
  const tableColumns: DataTableColumn<ListRow>[] = columns.map((column) => ({
    key: column.key,
    header: column.header,
    align: column.align,
    cell: (row) => row.cells[column.key],
  }));
  return <DataTable data={rows} columns={tableColumns} getRowId={(row) => row.id} label={label} locale={lang} labels={tableLabels(lang)} />;
}

/**
 * Switch between the workbench and Payload's own table (column picker,
 * selection, bulk publish and delete). The choice is remembered per
 * collection in a cookie that the list view reads on the server.
 */
export function ListModeSwitch({ slug, native, lang }: { slug: string; native: boolean; lang: AdminLang }) {
  const router = useRouter();
  const label = native
    ? lang === "ru" ? "Вернуться к рабочему виду" : "Back to the workbench"
    : slug === "media"
      ? lang === "ru" ? "Таблица Payload: массовая загрузка и действия" : "Payload table: bulk upload and actions"
      : lang === "ru" ? "Таблица Payload: колонки и массовые действия" : "Payload table: columns and bulk actions";
  const toggle = () => {
    const current = (document.cookie.match(new RegExp(`(?:^|; )${NATIVE_COOKIE}=([^;]*)`))?.[1] ?? "").split(",").filter(Boolean);
    const next = native ? current.filter((value) => value !== slug) : [...new Set([...current, slug])];
    document.cookie = `${NATIVE_COOKIE}=${next.join(",")}; path=/admin; max-age=31536000; samesite=lax`;
    router.refresh();
  };
  return <Button variant={native ? "secondary" : "ghost"} size="sm" onClick={toggle}>{label}</Button>;
}
