"use client";

import { useListQuery, useRouteTransition } from "@payloadcms/ui";
import { useRouter } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";

import type { AdminLang } from "../../admin/text";
import { Button } from "../valyro-ui/basic/Button";
import { Spinner } from "../valyro-ui/basic/Spinner";
import { Select } from "../valyro-ui/forms/Select";
import { TextInput } from "../valyro-ui/forms/TextInput";
import { Pagination } from "../valyro-ui/navigation/Pagination";

const COPY = {
  ru: { status: "Статус", all: "Все", draft: "Черновик", published: "Опубликовано", language: "Язык текста", ru: "Русский", en: "Английский", reset: "Сбросить", loading: "Загружаю…", total: (n: number) => `Всего: ${n}`, previous: "Предыдущая страница", next: "Следующая страница", page: (p: string) => `Страница ${p}`, pages: "Страницы списка" },
  en: { status: "Status", all: "All", draft: "Draft", published: "Published", language: "Content language", ru: "Russian", en: "English", reset: "Reset", loading: "Loading…", total: (n: number) => `${n} total`, previous: "Previous page", next: "Next page", page: (p: string) => `Page ${p}`, pages: "List pages" },
};

type Status = "all" | "draft" | "published";

/** Current `_status` filter of Payload's list query (set by this control or the native table). */
function statusOf(where: unknown): Status {
  const clauses = (where as { and?: unknown[] } | undefined)?.and ?? [where];
  for (const clause of clauses) {
    const value = (clause as { _status?: { equals?: unknown } } | undefined)?._status?.equals;
    if (value === "draft" || value === "published") return value;
  }
  return "all";
}

/**
 * Search, status and content language above a workbench list. Payload's list
 * query owns the URL and fetches the rows on the server, so the filters, Back
 * and the native table stay in step.
 */
export function ListControls({ lang, searchLabel, withStatus, localized, locale }: {
  lang: AdminLang;
  searchLabel: string;
  withStatus?: boolean;
  localized?: boolean;
  locale: string;
}) {
  const t = COPY[lang];
  const { query, handleSearchChange, handleWhereChange } = useListQuery();
  const router = useRouter();
  const { startRouteTransition } = useRouteTransition();
  const [search, setSearch] = useState(query.search ?? "");
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const status = statusOf(query.where);

  useEffect(() => setSearch(query.search ?? ""), [query.search]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const run = (change: Promise<void> | undefined) => {
    setPending(true);
    void Promise.resolve(change).finally(() => setPending(false));
  };
  const searchFor = (value: string) => {
    setSearch(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => run(handleSearchChange?.(value.trim().slice(0, 120))), 300);
  };
  const setLocale = (next: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("locale", next);
    url.searchParams.delete("page");
    startRouteTransition(() => router.replace(`${url.pathname}${url.search}`));
  };
  const filtered = Boolean(query.search) || status !== "all";

  return (
    <>
      <div className="gd-workspace__filters">
        <label>
          <span>{searchLabel}</span>
          <TextInput type="search" value={search} maxLength={120} onChange={(event) => searchFor(event.target.value)} placeholder={searchLabel} />
        </label>
        {withStatus ? (
          <label>
            <span>{t.status}</span>
            <Select
              aria-label={t.status}
              value={status}
              onValueChange={(value) => run(handleWhereChange?.(value === "all" ? {} : { and: [{ _status: { equals: value } }] }))}
              options={[{ value: "all", label: t.all }, { value: "draft", label: t.draft }, { value: "published", label: t.published }]}
            />
          </label>
        ) : null}
        {localized ? (
          <label>
            <span>{t.language}</span>
            <Select aria-label={t.language} value={locale} onValueChange={setLocale} options={[{ value: "ru", label: t.ru }, { value: "en", label: t.en }]} />
          </label>
        ) : null}
      </div>
      <div className="gd-workspace__query-status">
        <p role="status" className="gd-workspace__status">{pending ? <><Spinner label={null} size={14} /> {t.loading}</> : ""}</p>
        {filtered ? (
          <Button variant="secondary" size="sm" onClick={() => { setSearch(""); run(Promise.all([handleSearchChange?.(""), withStatus ? handleWhereChange?.({}) : undefined]).then(() => undefined)); }}>
            {t.reset}
          </Button>
        ) : null}
      </div>
    </>
  );
}

/** "Nothing found" action: clears the search (and the status filter) of the list query. */
export function ResetListButton({ label }: { label: string }) {
  const { handleSearchChange, handleWhereChange } = useListQuery();
  return <Button variant="secondary" onClick={() => void Promise.all([handleSearchChange?.(""), handleWhereChange?.({})])}>{label}</Button>;
}

/** Total and Valyro pagination over Payload's server-side pages. */
export function ListPager({ lang, page, totalPages, totalDocs }: { lang: AdminLang; page: number; totalPages: number; totalDocs: number }) {
  const t = COPY[lang];
  const { handlePageChange } = useListQuery();
  return (
    <nav className="gd-workspace__pager" aria-label={t.pages}>
      <span>{t.total(totalDocs)}</span>
      {totalPages > 1 ? (
        <Pagination
          pageCount={totalPages}
          value={page}
          onValueChange={(next) => void handlePageChange?.(next)}
          size="sm"
          locale={lang === "ru" ? "ru-RU" : "en-GB"}
          labels={{ previous: t.previous, next: t.next, page: t.page }}
        />
      ) : null}
    </nav>
  );
}
