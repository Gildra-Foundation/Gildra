"use client";

/**
 * Article-page pieces from the Valyro editorial kit, in atlas tokens and the
 * site's two locales: byline, table of contents, key points and editor note.
 * Client modules (the kit tracks headings and formats dates), so labels are
 * built here from `locale` — functions cannot cross from a server page.
 */
import clsx from "clsx";
import type { ReactNode } from "react";
import { ArticleToc, type ArticleTocItem } from "./valyro-ui/editorial/ArticleToc";
import { Byline } from "./valyro-ui/editorial/Byline";
import { EditorNote, type EditorNoteKind } from "./valyro-ui/editorial/EditorNote";
import { KeyPoints } from "./valyro-ui/editorial/KeyPoints";
import type { ArticleAuthor } from "./valyro-ui/editorial/utils";
import bridge from "./valyroAtlasBridge.module.css";
import styles from "./AtlasArticleParts.module.css";

type Locale = "en" | "ru";
const intl = (locale: Locale) => (locale === "ru" ? "ru-RU" : "en-GB");

export function AtlasByline({ locale, authors, published, updated, readingMinutes, className }: { locale: Locale; authors: ArticleAuthor[]; published?: string; updated?: string; readingMinutes?: number; className?: string }) {
  return (
    <Byline
      authors={authors}
      published={published}
      updated={updated}
      readingMinutes={readingMinutes}
      locale={intl(locale)}
      timeZone="UTC"
      size="md"
      labels={locale === "ru" ? { by: "Автор:", and: "и", updated: "Обновлено", readingTime: (_m, f) => `${f} мин чтения` } : undefined}
      className={clsx(bridge.scope, styles.parts, className)}
    />
  );
}

export function AtlasArticleToc({ locale, items, className }: { locale: Locale; items: ArticleTocItem[]; className?: string }) {
  return (
    <ArticleToc
      items={items}
      track
      offset={96}
      smooth
      labels={{ title: locale === "ru" ? "Содержание" : "Contents" }}
      className={clsx(bridge.scope, styles.parts, styles.toc, className)}
    />
  );
}

export function AtlasKeyPoints({ locale, items, title, className }: { locale: Locale; items: ReactNode[]; title?: string; className?: string }) {
  return (
    <KeyPoints
      items={items}
      variant="box"
      headingLevel={2}
      labels={{ title: title ?? (locale === "ru" ? "Главное" : "Key points") }}
      className={clsx(bridge.scope, styles.parts, className)}
    />
  );
}

export function AtlasEditorNote({ locale, kind = "update", date, title, children, className }: { locale: Locale; kind?: EditorNoteKind; date?: string; title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <EditorNote
      kind={kind}
      date={date}
      title={title}
      locale={intl(locale)}
      timeZone="UTC"
      labels={locale === "ru" ? { update: "Обновление", correction: "Исправление", clarification: "Уточнение", disclosure: "Раскрытие", sponsored: "Партнёрский материал" } : undefined}
      className={clsx(bridge.scope, styles.parts, className)}
    >
      {children}
    </EditorNote>
  );
}
