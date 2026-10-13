"use client";

import {
  toast,
  useDocumentInfo,
  useFormModified,
  useRouteTransition,
  useServerFunctions,
  useTranslation,
} from "@payloadcms/ui";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { CONTENT_LOCALES, filled, hasText, missingParts, stateLevel } from "../../admin/completeness";
import { LexicalPreview } from "./LexicalPreview";
import { forgetLocaleDocs, type LocaleDoc, loadLocaleDoc, useLocaleStates, useSwitchLocale } from "./useLocaleStates";

const COMPARE_KEY = "gd-compare-open";

const COPY = {
  ru: {
    label: "Язык версии",
    editing: "редактируете",
    complete: "заполнена",
    empty: "пусто",
    missing: (parts: string[]) => `нет: ${parts.join(", ")}`,
    saving: "Сохраняю правки и переключаю…",
    stalled: "Правки ещё не сохранились — язык не переключён, чтобы ничего не потерять. Проверьте поля с ошибками.",
    compare: (name: string) => `Сверка: ${name}`,
    compareHint: "Показать другую языковую версию рядом с редактором",
    fill: (from: string) => `Заполнить пустые поля из версии «${from}»`,
    fillHint: "Скопирует текст в пустые поля этой версии — переводите поверх. Заполненные поля не меняются.",
    filling: "Копирую…",
    filled: "Текст скопирован — переводите поверх.",
    waitSave: "Дождитесь автосохранения и повторите.",
    fallback: (name: string) => `Пока у этой версии нет заголовка, описания и текста, сайт показывает версию «${name}».`,
  },
  en: {
    label: "Language",
    editing: "editing",
    complete: "complete",
    empty: "empty",
    missing: (parts: string[]) => `missing: ${parts.join(", ")}`,
    saving: "Saving your changes, then switching…",
    stalled: "Your changes are not saved yet, so the language was not switched. Check fields with errors.",
    compare: (name: string) => `Compare: ${name}`,
    compareHint: "Show the other language version next to the editor",
    fill: (from: string) => `Fill empty fields from the ${from} version`,
    fillHint: "Copies text into the empty fields of this version to translate over. Filled fields are kept.",
    filling: "Copying…",
    filled: "Text copied — translate over it.",
    waitSave: "Wait for the autosave and try again.",
    fallback: (name: string) => `Until this version has a title, summary and text, the site shows the ${name} version.`,
  },
};

type Lang = keyof typeof COPY;

/**
 * Language switch at the top of the article and page editors: both versions
 * with how complete they are, switching in place, filling an empty version
 * from the other one and a side-by-side comparison panel.
 */
export function LanguageBar() {
  const { i18n } = useTranslation();
  const lang: Lang = i18n.language === "en" ? "en" : "ru";
  const t = COPY[lang];
  const { states, loaded, current, collection, id } = useLocaleStates();
  const { switchTo, pending, stalled } = useSwitchLocale();
  const { docPermissions } = useDocumentInfo();
  const modified = useFormModified();
  const { copyDataFromLocale } = useServerFunctions();
  const router = useRouter();
  const { startRouteTransition } = useRouteTransition();
  const [compare, setCompare] = useState(false);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    try {
      setCompare(sessionStorage.getItem(COMPARE_KEY) === "1");
    } catch {
      // storage unavailable: the panel just starts closed
    }
  }, []);
  const toggleCompare = useCallback((open: boolean) => {
    setCompare(open);
    try {
      sessionStorage.setItem(COMPARE_KEY, open ? "1" : "0");
    } catch {
      // ignore
    }
  }, []);
  const closeCompare = useCallback(() => toggleCompare(false), [toggleCompare]);

  const other = CONTENT_LOCALES.find((l) => l.code !== current) ?? CONTENT_LOCALES[0];
  const name = (l: (typeof CONTENT_LOCALES)[number]) => (lang === "ru" ? l.ru : l.en);
  const currentLevel = stateLevel(states[current], collection);
  const otherLevel = stateLevel(states[other.code], collection);
  const canFill = Boolean(id) && loaded && docPermissions?.update === true && currentLevel !== "complete" && otherLevel !== "empty";

  const fill = async () => {
    if (!id) return;
    if (modified) {
      toast.info(t.waitSave);
      return;
    }
    setCopying(true);
    try {
      await copyDataFromLocale({ collectionSlug: collection, docID: id, fromLocale: other.code, toLocale: current, overrideData: false });
      forgetLocaleDocs(collection, id);
      toast.success(t.filled);
      startRouteTransition(() => router.push(`/admin/collections/${collection}/${id}?locale=${current}`));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="gd-langbar" role="group" aria-label={t.label}>
      <div className="gd-langbar__row">
        <span className="gd-langbar__label">{t.label}</span>
        <div className="gd-langbar__switch">
          {CONTENT_LOCALES.map((l) => {
            const level = stateLevel(states[l.code], collection);
            const active = l.code === current;
            const known = active || (loaded && states[l.code] !== undefined) || !id;
            const detail = !known
              ? ""
              : level === "complete"
                ? t.complete
                : level === "empty"
                  ? t.empty
                  : t.missing(missingParts(states[l.code], collection, lang));
            return (
              <button
                key={l.code}
                type="button"
                className={`gd-langbar__btn${active ? " is-active" : ""}`}
                aria-pressed={active}
                disabled={!id && !active}
                onClick={() => (active ? undefined : switchTo(l.code))}
                title={detail}
              >
                <span className={`gd-dot ${known ? `gd-dot--${level === "complete" ? "ok" : level === "empty" ? "none" : "warn"}` : ""}`} aria-hidden="true" />
                <span className="gd-langbar__name">{name(l)}</span>
                <span className="gd-langbar__state">{active ? t.editing : detail}</span>
              </button>
            );
          })}
        </div>
        {id ? (
          <button
            type="button"
            className={`gd-langbar__compare${compare ? " is-active" : ""}`}
            aria-pressed={compare}
            title={t.compareHint}
            onClick={() => toggleCompare(!compare)}
          >
            ⇆ {t.compare(name(other))}
          </button>
        ) : null}
      </div>
      {pending ? <p className="gd-langbar__note" role="status">{t.saving}</p> : null}
      {stalled ? <p className="gd-langbar__note gd-langbar__note--warn" role="alert">{t.stalled}</p> : null}
      {canFill ? (
        <div className="gd-langbar__fill">
          <span>{collection === "guides" && otherLevel === "complete" ? t.fallback(name(other)) : t.fillHint}</span>
          <button type="button" className="gd-btn" disabled={copying} onClick={fill} title={t.fillHint}>
            {copying ? t.filling : t.fill(name(other))}
          </button>
        </div>
      ) : null}
      {compare && id ? (
        <ComparePanel
          collection={collection}
          id={id}
          locale={other.code}
          localeName={name(other)}
          editing={current}
          lang={lang}
          onClose={closeCompare}
        />
      ) : null}
    </div>
  );
}

const PANEL = {
  ru: {
    title: "Заголовок",
    summary: "Краткое описание",
    content: "Текст",
    loading: "Загружаю…",
    failed: "Не удалось загрузить эту версию.",
    empty: "— пусто —",
    close: "Закрыть сверку",
    copy: "Копировать",
    copied: "Скопировано",
    heading: (name: string) => `${name} — для сверки`,
    note: "Только чтение. Показан последний сохранённый вариант.",
  },
  en: {
    title: "Title",
    summary: "Summary",
    content: "Text",
    loading: "Loading…",
    failed: "Could not load this version.",
    empty: "— empty —",
    close: "Close comparison",
    copy: "Copy",
    copied: "Copied",
    heading: (name: string) => `${name} — for comparison`,
    note: "Read-only. Shows the latest saved version.",
  },
};

function CopyText({ text, lang }: { text: string; lang: Lang }) {
  const [done, setDone] = useState(false);
  if (!text) return null;
  return (
    <button
      type="button"
      className="gd-ref__copy"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? PANEL[lang].copied : PANEL[lang].copy}
    </button>
  );
}

/** The other language version, read-only, docked to the right of the editor. */
function ComparePanel({
  collection,
  id,
  locale,
  localeName,
  editing,
  lang,
  onClose,
}: {
  collection: string;
  id: string | number;
  locale: string;
  localeName: string;
  editing: string;
  lang: Lang;
  onClose: () => void;
}) {
  const t = PANEL[lang];
  const [doc, setDoc] = useState<LocaleDoc | null | undefined>(undefined);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    document.body.classList.add("gd-compare-open");
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("gd-compare-open");
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    setDoc(undefined);
    void loadLocaleDoc(collection, id, locale, editing).then((value) => alive && setDoc(value));
    return () => {
      alive = false;
    };
  }, [collection, id, locale, editing]);

  if (!mounted) return null;
  const title = filled(doc?.title) ? String(doc?.title) : "";
  const summary = filled(doc?.summary) ? String(doc?.summary) : "";
  return createPortal(
    <aside className="gd-ref" aria-label={t.heading(localeName)} lang={locale}>
      <header className="gd-ref__head">
        <strong>{t.heading(localeName)}</strong>
        <button type="button" onClick={onClose} aria-label={t.close} title={t.close}>
          ×
        </button>
      </header>
      <p className="gd-ref__note">{t.note}</p>
      {doc === undefined ? (
        <p className="gd-muted">{t.loading}</p>
      ) : doc === null ? (
        <p className="gd-muted">{t.failed}</p>
      ) : (
        <>
          <section>
            <h3>
              {t.title} <CopyText text={title} lang={lang} />
            </h3>
            <p className="gd-ref__title">{title || t.empty}</p>
          </section>
          {collection === "guides" || summary ? (
            <section>
              <h3>
                {t.summary} <CopyText text={summary} lang={lang} />
              </h3>
              <p>{summary || t.empty}</p>
            </section>
          ) : null}
          <section>
            <h3>{t.content}</h3>
            <LexicalPreview value={doc.content} />
            {!hasText(doc.content) ? <p className="gd-muted">{t.empty}</p> : null}
          </section>
        </>
      )}
    </aside>,
    document.body,
  );
}
