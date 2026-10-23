import { DefaultListView } from "@payloadcms/ui";
import { cookies } from "next/headers";
import Link from "next/link";
import type { ListViewServerProps } from "payload";
import type { ReactNode } from "react";
import React from "react";

import { relationID } from "../../access/roles";
import { adminLang, type AdminLang } from "../../admin/text";
import { SITE_COOKIE } from "../../admin/siteCookie";
import { BlocksStateCell, SitePageCell } from "../../fields/blocksEditor/cells";
import { AdminSurface } from "../AdminSurface";
import { LocalTime, SiteLink } from "../SiteLink";
import { Badge } from "../valyro-ui/basic/Badge";
import { Button } from "../valyro-ui/basic/Button";
import { EmptyState } from "../valyro-ui/data-display/EmptyState";
import { LanguagesCell } from "./LanguagesCell";
import { ListControls, ListModeSwitch, ListPager, ListTable, MediaGrid, ResetListButton } from "./lazy";
import type { MediaTile } from "./MediaGrid";
import type { ListColumn, ListRow } from "./ListTable";
import { NATIVE_COOKIE } from "./workbenchList";

type Doc = Record<string, unknown> & { id: string | number };
type Slug = "pages" | "media" | "categories" | "tags";
type PageRow = { site?: unknown; slug?: unknown; blocks?: unknown };

const COPY = {
  ru: {
    pages: { title: "Страницы", hint: "Страницы сайта, которые можно вести из CMS. Остальные разделы собраны в коде.", create: "Переопределить страницу", search: "Название или адрес страницы", empty: "Страниц из CMS пока нет", emptyHint: "Пока страницы нет в CMS, сайт показывает версию из кода.", note: "Новую страницу выбирают из списка поддерживаемых сайтом, адрес вручную не вводится." },
    media: { title: "Медиа", hint: "Картинки для статей и страниц. Подпись (alt) заполняется на обоих языках.", create: "Загрузить изображение", search: "Имя файла или подпись", empty: "Медиатека пуста", emptyHint: "Загрузите обложку или иллюстрацию: PNG, JPG, WebP, AVIF или GIF.", note: "" },
    categories: { title: "Рубрики", hint: "Разделы, по которым статьи собираются на сайте.", create: "Новая рубрика", search: "Название или адрес рубрики", empty: "Рубрик пока нет", emptyHint: "Создайте первую рубрику, чтобы группировать статьи на сайте.", note: "" },
    tags: { title: "Теги", hint: "Метки статей: классы, сезоны, режимы.", create: "Новый тег", search: "Название или адрес тега", empty: "Тегов пока нет", emptyHint: "Добавьте первый тег, чтобы связывать похожие статьи.", note: "" },
    noResults: "Ничего не найдено", noResultsHint: "Измените запрос или сбросьте фильтры.", reset: "Сбросить фильтры",
    colPage: "Страница", colAddress: "Адрес на сайте", colLangs: "Языки", colBlocks: "Блоки", colStatus: "Статус", colTitle: "Название", colDescription: "Описание", colUpdated: "Изменено",
    published: "на сайте", changed: "есть правки", draft: "черновик", untitled: "Без названия в этом языке", noAlt: "нет подписи",
  },
  en: {
    pages: { title: "Pages", hint: "Site pages that can be run from the CMS. Every other section is built in code.", create: "Override a page", search: "Page name or address", empty: "No CMS pages yet", emptyHint: "Until a page is in the CMS, the site shows the version from code.", note: "A new page is picked from the site's supported list; the address is never typed by hand." },
    media: { title: "Media", hint: "Images for articles and pages. The alt text is filled in for both languages.", create: "Upload an image", search: "File name or alt text", empty: "The library is empty", emptyHint: "Upload a cover or an illustration: PNG, JPG, WebP, AVIF or GIF.", note: "" },
    categories: { title: "Categories", hint: "Sections that group articles on the site.", create: "New category", search: "Category name or address", empty: "No categories yet", emptyHint: "Create the first category to group articles on the site.", note: "" },
    tags: { title: "Tags", hint: "Article labels: classes, seasons, modes.", create: "New tag", search: "Tag name or address", empty: "No tags yet", emptyHint: "Add the first tag to connect related articles.", note: "" },
    noResults: "Nothing found", noResultsHint: "Change the search or reset the filters.", reset: "Reset filters",
    colPage: "Page", colAddress: "Address on the site", colLangs: "Languages", colBlocks: "Blocks", colStatus: "Status", colTitle: "Name", colDescription: "Description", colUpdated: "Updated",
    published: "live", changed: "changes", draft: "draft", untitled: "No title in this language", noAlt: "no alt text",
  },
};

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const siteOf = (doc: Doc) => {
  const id = relationID(doc.site as never);
  return id === null ? null : String(id);
};

function bytes(size: unknown, lang: AdminLang) {
  if (typeof size !== "number" || size <= 0) return "";
  const kb = size / 1024;
  return kb < 1024 ? `${Math.round(kb)} ${lang === "ru" ? "КБ" : "KB"}` : `${(kb / 1024).toFixed(1)} ${lang === "ru" ? "МБ" : "MB"}`;
}

/** Title linked to its editor (switching the working site first when needed), with a monospace address below. */
function TitleCell({ doc, href, title, sub }: { doc: Doc; href: string; title: string; sub?: string }) {
  const site = siteOf(doc);
  return (
    <span className="gd-cell-title">
      {site ? <SiteLink siteID={site} href={href}>{title}</SiteLink> : <Link href={href} prefetch={false}>{title}</Link>}
      {sub ? <span className="gd-kind gd-kind--mono">{sub}</span> : null}
    </span>
  );
}

function StatusBadge({ doc, lang }: { doc: Doc; lang: AdminLang }) {
  const t = COPY[lang];
  const status = doc._displayStatus ?? doc._status;
  if (status === "published") return <Badge color="green">{t.published}</Badge>;
  if (status === "changed") return <Badge color="amber">{t.changed}</Badge>;
  return <Badge color="gray">{t.draft}</Badge>;
}

/**
 * List view of pages, media, categories and tags as a Valyro workbench, in
 * the look of the articles workbench. Payload has already run the query
 * (access, selected site, search, filters, page) — the rows here are its
 * `data`, so nothing is fetched twice. Payload's own table stays one click
 * away for columns and bulk actions.
 */
export async function CollectionList(props: ListViewServerProps) {
  const { collectionConfig: _config, data, i18n, payload, locale, searchParams, user: _user, permissions: _permissions, params: _params, limit: _limit, listSearchableFields: _fields, ...client } = props;
  const slug = props.collectionSlug as Slug;
  const lang = adminLang(i18n?.language);
  const jar = await cookies();
  const native = (jar.get(NATIVE_COOKIE)?.value ?? "").split(",").includes(slug);

  if (native) {
    return (
      <>
        <div className="gutter--left gutter--right gd-list-mode"><AdminSurface lang={lang}><ListModeSwitch slug={slug} native lang={lang} /></AdminSurface></div>
        <DefaultListView {...(client as React.ComponentProps<typeof DefaultListView>)} />
      </>
    );
  }

  const t = COPY[lang];
  const copy = t[slug];
  const contentLocale = locale?.code === "en" ? "en" : "ru";
  const docs = (data?.docs ?? []) as Doc[];
  const edit = (doc: Doc) => `/admin/collections/${slug}/${doc.id}?locale=${contentLocale}`;
  const site = jar.get(SITE_COOKIE)?.value;
  const createHref = site ? props.newDocumentURL : `/admin/select-site?collection=${slug}`;
  const create = props.hasCreatePermission ? <Button asChild variant="accent"><Link href={createHref} prefetch={false}>+ {copy.create}</Link></Button> : null;
  const filtered = hasListFilter(searchParams);
  const empty = filtered
    ? <EmptyState title={t.noResults} description={t.noResultsHint} primaryAction={<ResetListButton label={t.reset} />} />
    : <EmptyState title={copy.empty} description={copy.emptyHint} primaryAction={create ?? undefined} />;

  let body: ReactNode;
  if (docs.length === 0) {
    body = empty;
  } else if (slug === "media") {
    const tiles: MediaTile[] = docs.map((doc) => {
      const mimeType = text(doc.mimeType);
      return {
        id: String(doc.id),
        href: edit(doc),
        filename: text(doc.filename),
        alt: text(doc.alt),
        meta: [typeof doc.width === "number" && typeof doc.height === "number" ? `${doc.width}×${doc.height}` : "", bytes(doc.filesize, lang)].filter(Boolean).join(" · "),
        file: mimeType.startsWith("image/") ? mediaPath(doc.url) : null,
        mimeType,
      };
    });
    body = <MediaGrid tiles={tiles} label={copy.title} noAlt={t.noAlt} />;
  } else {
    const columns: ListColumn[] =
      slug === "pages"
        ? [{ key: "page", header: t.colPage }, { key: "address", header: t.colAddress }, { key: "langs", header: t.colLangs }, { key: "blocks", header: t.colBlocks }, { key: "status", header: t.colStatus }]
        : [{ key: "title", header: t.colTitle }, ...(slug === "categories" ? [{ key: "description", header: t.colDescription }] : []), { key: "updated", header: t.colUpdated, align: "right" as const }];
    const rows: ListRow[] = docs.map((doc) => {
      const title = text(doc.title) || t.untitled;
      if (slug === "pages") {
        return {
          id: String(doc.id),
          cells: {
            page: <TitleCell doc={doc} href={edit(doc)} title={title} sub={text(doc.slug)} />,
            address: <SitePageCell rowData={doc as PageRow} payload={payload} i18n={i18n} />,
            langs: <LanguagesCell payload={payload} rowData={doc} collectionSlug="pages" i18n={i18n} />,
            blocks: <BlocksStateCell rowData={doc as PageRow} payload={payload} i18n={i18n} />,
            status: <StatusBadge doc={doc} lang={lang} />,
          },
        };
      }
      return {
        id: String(doc.id),
        cells: {
          title: <TitleCell doc={doc} href={edit(doc)} title={title} sub={`/${text(doc.slug)}`} />,
          description: <span className="gd-cell-muted">{text(doc.description)}</span>,
          updated: typeof doc.updatedAt === "string" ? <LocalTime iso={doc.updatedAt} lang={lang} /> : null,
        },
      };
    });
    body = <ListTable rows={rows} columns={columns} label={copy.title} lang={lang} />;
  }

  return (
    <div className="gutter--left gutter--right gd-workspace gd-list">
      <AdminSurface lang={lang}>
        <header className="gd-workspace__head">
          <div>
            <h1>{copy.title}</h1>
            <p>{copy.hint}</p>
          </div>
          {create}
        </header>
        <ListControls lang={lang} searchLabel={copy.search} withStatus={slug === "pages"} localized locale={contentLocale} />
        <div className="gd-workspace__results">{body}</div>
        {data && docs.length > 0 ? <ListPager lang={lang} page={data.page ?? 1} totalPages={data.totalPages ?? 1} totalDocs={data.totalDocs ?? docs.length} /> : null}
        {copy.note ? <p className="gd-workspace__hint">{copy.note}</p> : null}
        <div className="gd-list-mode"><ListModeSwitch slug={slug} native={false} lang={lang} /></div>
      </AdminSurface>
    </div>
  );
}

/** Path of an uploaded file under /api/media/file/ (the only path Next's optimizer serves for the CMS), else null. */
function mediaPath(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    const path = new URL(url, "http://cms.local").pathname;
    return path.startsWith("/api/media/file/") ? path : null;
  } catch {
    return null;
  }
}

/** A search or `where` filter in the list URL (the empty state then offers a reset instead of "create"). */
function hasListFilter(searchParams: unknown) {
  const params = (searchParams ?? {}) as Record<string, unknown>;
  return Boolean(params.search) || Object.keys(params).some((key) => key.startsWith("where"));
}
