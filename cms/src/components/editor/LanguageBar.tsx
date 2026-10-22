"use client";

import {
  toast,
  useDocumentInfo,
  useFormModified,
  useForm,
  useTranslation,
} from "@payloadcms/ui";
import React, { useCallback, useEffect, useId, useRef, useState } from "react";

import { emptyLocaleFields } from "../../admin/localeCopy";
import { CONTENT_LOCALES, missingParts, stateLevel } from "../../admin/completeness";
import { ComparePanel } from "./ComparePanel";
import { usePresence } from "../valyro-ui/primitives/usePresence";
import { forgetLocaleDocs, loadLocaleDoc, useLocaleStates, useSwitchLocale } from "./useLocaleStates";

const COMPARE_KEY = "gd-compare-open";

const COPY = {
  ru: {
    label: "Язык версии",
    publication: "RU и EN публикуются и снимаются с публикации вместе. Автосохранение сохраняет только черновик.",
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
    filled: "Текст добавлен в форму. Проверьте перевод и сохраните черновик.",
    failed: "Не удалось загрузить исходную версию. Поля не изменены.",
    waitSave: "Дождитесь автосохранения и повторите.",
    fallback: (name: string) => `Пока у этой версии нет заголовка, описания и текста, сайт показывает версию «${name}».`,
  },
  en: {
    label: "Language",
    publication: "RU and EN are published and unpublished together. Autosave only saves a draft.",
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
    filled: "Text added to the form. Review the translation and save a draft.",
    failed: "Could not load the source version. No fields were changed.",
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
  const { dispatchFields, getData, setModified } = useForm();
  const active = useRef(true);
  const context = useRef("");
  useEffect(() => { context.current = `${collection}:${id}:${current}`; }, [collection, id, current]);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [compare, setCompare] = useState(false);
  const comparePresence = usePresence(compare, 160);
  const compareId = useId();
  const compareTrigger = useRef<HTMLButtonElement>(null);
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
  // Payload's initial permissions are sanitized booleans; its access refresh
  // after autosave may return the original { permission, where } object.
  const updatePermission: unknown = docPermissions?.update;
  const canUpdate = updatePermission === true || (
    updatePermission !== null && typeof updatePermission === "object" &&
    "permission" in updatePermission && updatePermission.permission === true
  );
  const canFill = Boolean(id) && loaded && canUpdate && currentLevel !== "complete" && otherLevel !== "empty";

  const fill = async () => {
    if (!id) return;
    if (modified) {
      toast.info(t.waitSave);
      return;
    }
    setCopying(true);
    try {
      const target = context.current;
      const source = await loadLocaleDoc(collection, id, other.code, current);
      if (!active.current || context.current !== target) return;
      if (!source) throw new Error(t.failed);
      const patch = emptyLocaleFields(getData(), source);
      for (const [path, value] of Object.entries(patch)) {
        // Payload's Lexical field refreshes its editor when initialValue changes.
        // The form value alone would save text while leaving the editor blank.
        dispatchFields({ type: "UPDATE", path, value, ...(path === "content" ? { initialValue: structuredClone(value) } : {}) });
      }
      if (Object.keys(patch).length) setModified(true);
      forgetLocaleDocs(collection, id);
      toast.success(t.filled);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="gd-langbar" role="group" aria-label={t.label}>
      {collection === "guides" ? <p className="gd-langbar__note">{t.publication}</p> : null}
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
                disabled={(!id && !active) || copying || Boolean(pending)}
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
            ref={compareTrigger}
            className={`gd-langbar__compare${compare ? " is-active" : ""}`}
            aria-expanded={compare}
            aria-controls={comparePresence.isMounted ? compareId : undefined}
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
      {comparePresence.isMounted && id ? (
        <ComparePanel
          open={compare}
          panelId={compareId}
          triggerRef={compareTrigger}
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
