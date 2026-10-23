"use client";

import { Link } from "@payloadcms/ui";
import type { AdminLang } from "../../admin/text";
import type { ArticleRow, ArticlesResult } from "../../articles/data";
import { articlesQueryString, hasArticleFilters, resetArticlesQuery, type ArticlesQuery } from "../../articles/query";
import { useArticlesQuery } from "./useArticlesQuery";
import { AdminSurface } from "../AdminSurface";
import { LocalTime, SiteLink } from "../SiteLink";
import { tableLabels } from "../tableLabels";
import { Badge } from "../valyro-ui/basic/Badge";
import { Button } from "../valyro-ui/basic/Button";
import { Spinner } from "../valyro-ui/basic/Spinner";
import { DataTable, type DataTableColumn } from "../valyro-ui/data-display/DataTable";
import { EmptyState } from "../valyro-ui/data-display/EmptyState";
import { Select } from "../valyro-ui/forms/Select";
import { TextInput } from "../valyro-ui/forms/TextInput";
import { Pager } from "../workspace/Pager";
import { usePage } from "../workspace/usePage";

const COPY = {
  ru: { title: "Статьи", hint: "Пишите, проверяйте переводы и открывайте материал в редакторе.", create: "Новая статья", search: "Заголовок или адрес", site: "Сайт", allSites: "Все доступные сайты", language: "Язык текста", ru: "Русский", en: "Английский", status: "Последняя версия", all: "Все версии", draft: "Черновик", published: "Опубликованная версия", edits: "Есть правки не на сайте", item: "Материал", updated: "Изменено", edit: "Открыть редактор", live: "На сайте", empty: "Статей пока нет", emptyHint: "Создайте первый материал, если у вас есть права на редактирование.", noResults: "По этим фильтрам статей нет", noResultsHint: "Измените условия или сбросьте фильтры.", reset: "Сбросить фильтры", emptyPage: "На этой странице нет статей", firstPage: "На первую страницу", untitled: "Без заголовка в этом языке", loading: "Загружаю статьи…", error: "Не удалось загрузить статьи", denied: "Доступ к статьям ограничен", retry: "Повторить", native: "Полный список и массовые действия", note: "Черновик опубликованной статьи не меняет текст на сайте до следующей публикации." },
  en: { title: "Articles", hint: "Write, check translations and open each article in the editor.", create: "New article", search: "Title or address", site: "Site", allSites: "All accessible sites", language: "Content language", ru: "Russian", en: "English", status: "Latest version", all: "All versions", draft: "Draft", published: "Published version", edits: "Changes not on the site", item: "Article", updated: "Updated", edit: "Open editor", live: "Live", empty: "No articles yet", emptyHint: "Create the first article if you have content editing access.", noResults: "No articles match these filters", noResultsHint: "Change the selection or reset the filters.", reset: "Reset filters", emptyPage: "No articles on this page", firstPage: "Go to the first page", untitled: "No title in this language", loading: "Loading articles…", error: "Could not load articles", denied: "Article access is restricted", retry: "Try again", native: "Full list and bulk actions", note: "A draft of a published article keeps the live text unchanged until the next publication." },
};

export function ArticlesPanel({ initial, initialQuery, lang }: { initial: ArticlesResult; initialQuery: ArticlesQuery; lang: AdminLang }) {
  const t = COPY[lang];
  const { query, search, navigate, searchFor } = useArticlesQuery(initialQuery);
  const { site, status, locale } = query;
  const filtered = hasArticleFilters(query);
  const { data, error, loading, retry } = usePage<ArticlesResult>("/api/admin/articles", articlesQueryString(query), articlesQueryString(initialQuery), initial);
  const reset = () => navigate(resetArticlesQuery(query));
  const resetButton = <Button variant="secondary" onClick={reset}>{t.reset}</Button>;
  const empty = query.page > 1 ? (
    <EmptyState title={t.emptyPage} size="sm" primaryAction={<Button onClick={() => navigate({ ...query, page: 1 })}>{t.firstPage}</Button>} />
  ) : filtered ? (
    <EmptyState title={t.noResults} description={t.noResultsHint} size="sm" primaryAction={resetButton} />
  ) : <EmptyState title={t.empty} description={t.emptyHint} size="sm" />;
  const create = initial.writable.length > 0 ? (site && initial.writable.includes(site) ?
    <SiteLink siteID={site} href={`/admin/collections/guides/create?locale=${locale}`} variant="accent">{t.create}</SiteLink> :
    <Button asChild variant="accent"><Link href={`/admin/select-site?collection=guides&locale=${locale}`}>{t.create}</Link></Button>) : null;
  const columns: DataTableColumn<ArticleRow>[] = [
    { key: "title", header: t.item, cell: (row) => <><SiteLink siteID={row.siteID} href={row.href}>{row.title || t.untitled}</SiteLink><span className="gd-kind">/{row.slug}</span></> },
    { key: "siteName", header: t.site },
    { key: "status", header: t.status, cell: (row) => <Badge color={row.status === "published" ? "green" : row.live ? "blue" : "amber"}>{row.status === "published" ? t.published : row.live ? t.edits : t.draft}</Badge> },
    { key: "updatedAt", header: t.updated, cell: (row) => <LocalTime iso={row.updatedAt} lang={lang} /> },
    { key: "actions", header: t.edit, cell: (row) => <div className="gd-workspace__actions"><SiteLink siteID={row.siteID} href={row.href} variant="secondary">{t.edit}</SiteLink>{row.liveUrl ? <a href={row.liveUrl} target="_blank" rel="noreferrer">{t.live} ↗</a> : null}</div> },
  ];
  return <AdminSurface lang={lang}>
    <header className="gd-workspace__head"><div><h1>{t.title}</h1><p>{t.hint}</p></div>{create}</header>
    <div className="gd-workspace__filters">
      <label><span>{t.search}</span><TextInput value={search} maxLength={120} onChange={(event) => searchFor(event.target.value)} placeholder={t.search} /></label>
      <label><span>{t.site}</span><Select aria-label={t.site} value={site} onValueChange={(value) => navigate({ ...query, site: value, page: 1 })} options={[{ value: "", label: t.allSites }, ...initial.sites.map((s) => ({ value: s.id, label: s.name }))]} /></label>
      <label><span>{t.language}</span><Select aria-label={t.language} value={locale} onValueChange={(value) => navigate({ ...query, locale: value as "ru" | "en", page: 1 })} options={[{ value: "ru", label: t.ru }, { value: "en", label: t.en }]} /></label>
      <label><span>{t.status}</span><Select aria-label={t.status} value={status} onValueChange={(value) => navigate({ ...query, status: value as ArticlesQuery["status"], page: 1 })} options={[{ value: "", label: t.all }, { value: "draft", label: t.draft }, { value: "published", label: t.published }]} /></label>
    </div>
    <div className="gd-workspace__query-status"><p role="status" className="gd-workspace__status">{loading ? <><Spinner label={null} size={14} /> {t.loading}</> : ""}</p>{filtered ? resetButton : null}</div>
    <div key={`${articlesQueryString(query)}:${loading ? "pending" : error ? "error" : "ready"}`} className="gd-workspace__results">
    {error ? <EmptyState title={error === 403 || error === 401 ? t.denied : t.error} primaryAction={<Button onClick={retry}>{t.retry}</Button>} /> :
      <DataTable data={data?.rows ?? []} columns={columns} label={t.title} locale={lang} labels={tableLabels(lang)} loading={loading} empty={empty} />}
    </div>
    {data ? <Pager page={data.page} totalPages={data.totalPages} totalDocs={data.totalDocs} busy={loading} onPage={(page) => navigate({ ...query, page })} lang={lang} /> : null}
    <p className="gd-workspace__hint">{t.note}</p>
    <Link href={`/admin/collections/guides?locale=${locale}`}>{t.native}</Link>
  </AdminSurface>;
}
