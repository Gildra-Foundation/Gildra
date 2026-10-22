"use client";

import React, { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { filled, hasText } from "../../admin/completeness";
import { AdminSurface } from "../AdminSurface";
import { Button } from "../valyro-ui/basic/Button";
import { useDismissableLayer } from "../valyro-ui/primitives/useDismissableLayer";
import { LexicalPreview } from "./LexicalPreview";
import { loadLocaleDoc, type LocaleDoc } from "./useLocaleStates";

const COPY = {
  ru: {
    title: "Заголовок", summary: "Краткое описание", content: "Текст", loading: "Загружаю…",
    failed: "Не удалось загрузить эту версию.", retry: "Повторить загрузку", empty: "— пусто —",
    close: "Закрыть сверку", copy: "Копировать", copied: "Скопировано",
    copyFailed: "Не удалось скопировать. Выделите и скопируйте текст вручную.",
    heading: (name: string) => `${name} — для сверки`,
    note: "Только чтение. Показан последний сохранённый вариант.",
  },
  en: {
    title: "Title", summary: "Summary", content: "Text", loading: "Loading…",
    failed: "Could not load this version.", retry: "Retry loading", empty: "— empty —",
    close: "Close comparison", copy: "Copy", copied: "Copied",
    copyFailed: "Could not copy. Select and copy the text manually.",
    heading: (name: string) => `${name} — for comparison`,
    note: "Read-only. Shows the latest saved version.",
  },
};
type Lang = keyof typeof COPY;

function CopyText({ text, lang, label }: { text: string; lang: Lang; label: string }) {
  const [result, setResult] = useState<"copied" | "failed" | null>(null);
  const [copying, setCopying] = useState(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (result !== "copied") return;
    const timer = setTimeout(() => setResult(null), 1800);
    return () => clearTimeout(timer);
  }, [result]);
  if (!text) return null;
  const copy = async () => {
    setCopying(true);
    setResult(null);
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      if (active.current) setResult("copied");
    } catch {
      if (active.current) setResult("failed");
    } finally {
      if (active.current) setCopying(false);
    }
  };
  return (
    <div className="gd-ref__copy-action">
      <Button size="sm" variant="secondary" loading={copying} onClick={copy} aria-label={`${COPY[lang].copy}: ${label}`}>
        {result === "copied" ? COPY[lang].copied : COPY[lang].copy}
      </Button>
      <span className={result === "failed" ? "gd-ref__copy-error" : "gd-ref__announcement"} role="status">
        {result === "failed" ? COPY[lang].copyFailed : result === "copied" ? COPY[lang].copied : ""}
      </span>
    </div>
  );
}

/** Non-modal: the editor remains usable beside the saved translation. */
export function ComparePanel({ collection, id, locale, localeName, editing, lang, onClose, open, panelId, triggerRef }: {
  collection: string; id: string | number; locale: string; localeName: string;
  editing: string; lang: Lang; onClose: () => void; open: boolean; panelId: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const t = COPY[lang];
  const [doc, setDoc] = useState<LocaleDoc | null | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useDismissableLayer({ enabled: open, refs: [panelRef, triggerRef], closeOnOutside: false, onDismiss: onClose });

  useEffect(() => {
    setMounted(true);
    document.body.classList.add("gd-compare-open");
    return () => document.body.classList.remove("gd-compare-open");
  }, []);
  useEffect(() => {
    if (!mounted || !open) return;
    // Opening by the trigger moves focus into the panel. Restoring the saved
    // preference on page load must not steal focus from the native editor.
    if (document.activeElement === triggerRef.current) closeRef.current?.focus({ preventScroll: true });
    const panel = panelRef.current;
    const trigger = triggerRef.current;
    return () => {
      if (panel?.contains(document.activeElement) && trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [mounted, open, triggerRef]);
  useEffect(() => {
    let alive = true;
    setDoc(undefined);
    void loadLocaleDoc(collection, id, locale, editing).then((value) => { if (alive) setDoc(value); });
    return () => { alive = false; };
  }, [collection, id, locale, editing, attempt]);

  if (!mounted) return null;
  const title = filled(doc?.title) ? String(doc?.title) : "";
  const summary = filled(doc?.summary) ? String(doc?.summary) : "";
  return createPortal(
    <aside ref={panelRef} id={panelId} className="gd-ref" aria-label={t.heading(localeName)}
      lang={lang} data-state={open ? "open" : "closed"} inert={!open} aria-hidden={!open || undefined}>
      <AdminSurface lang={lang}>
        <header className="gd-ref__head">
          <strong>{t.heading(localeName)}</strong>
          <Button ref={closeRef} size="sm" variant="ghost" className="gd-ref__close" onClick={onClose} aria-label={t.close} title={t.close}>×</Button>
        </header>
        <p className="gd-ref__note">{t.note}</p>
        {doc === undefined ? <p className="gd-ref__feedback" role="status">{t.loading}</p> : doc === null ? (
          <div className="gd-ref__feedback">
            <p role="alert">{t.failed}</p>
            <Button size="sm" onClick={() => setAttempt((value) => value + 1)}>{t.retry}</Button>
          </div>
        ) : (
          <>
            <section>
              <div className="gd-ref__section-head"><h3>{t.title}</h3><CopyText key={`${locale}:${title}`} text={title} lang={lang} label={t.title} /></div>
              <p className="gd-ref__title" lang={locale}>{title || t.empty}</p>
            </section>
            {collection === "guides" || summary ? <section>
              <div className="gd-ref__section-head"><h3>{t.summary}</h3><CopyText key={`${locale}:${summary}`} text={summary} lang={lang} label={t.summary} /></div>
              <p lang={locale}>{summary || t.empty}</p>
            </section> : null}
            <section><h3>{t.content}</h3><div lang={locale}><LexicalPreview value={doc.content} />{!hasText(doc.content) ? <p className="gd-muted">{t.empty}</p> : null}</div></section>
          </>
        )}
      </AdminSurface>
    </aside>, document.body,
  );
}
