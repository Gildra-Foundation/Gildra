"use client";

import { useConfig, useDocumentInfo, useForm, useFormBackgroundProcessing, useFormFields, useFormModified, useFormProcessing, useLocale, useRouteTransition } from "@payloadcms/ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { CONTENT_LOCALES, filled, hasText, type LocaleState, localeState } from "../../admin/completeness";

/** One language version as saved (latest draft, no fallback to another language). */
export type LocaleDoc = { title?: unknown; summary?: unknown; content?: unknown };

const cache = new Map<string, Promise<LocaleDoc | null>>();

/** Lexical writes to Payload at idle time; let queued field updates commit. */
async function settleEditorFields(): Promise<void> {
  await new Promise<void>((resolve) => {
    if ("requestIdleCallback" in window) window.requestIdleCallback(() => resolve(), { timeout: 600 });
    else requestAnimationFrame(() => setTimeout(resolve, 0));
  });
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

/**
 * The saved version of `locale`, fetched once per editing session of the
 * current language: switching languages fetches again, typing does not. The
 * language bar, the article panel and the comparison panel share the request.
 */
export function loadLocaleDoc(collection: string, id: string | number, locale: string, editing: string): Promise<LocaleDoc | null> {
  const key = `${collection}:${id}:${locale}@${editing}`;
  let request = cache.get(key);
  if (!request) {
    const query = new URLSearchParams({
      locale,
      "fallback-locale": "none",
      draft: "true",
      depth: "0",
      "select[title]": "true",
      "select[summary]": "true",
      "select[content]": "true",
    });
    request = fetch(`/api/${collection}/${id}?${query}`, { credentials: "include" })
      .then((response) => (response.ok ? (response.json() as Promise<LocaleDoc>) : null))
      .catch(() => null);
    cache.set(key, request);
    void request.then((doc) => doc ?? cache.delete(key));
  }
  return request;
}

/** Drop cached versions of a document (after copying text between languages). */
export function forgetLocaleDocs(collection: string, id: string | number) {
  for (const key of cache.keys()) if (key.startsWith(`${collection}:${id}:`)) cache.delete(key);
}

/**
 * Completeness of every language version: the language being edited is read
 * live from the form, the others from the server.
 */
export function useLocaleStates() {
  const { id, collectionSlug } = useDocumentInfo();
  const locale = useLocale();
  const current = locale?.code ?? "en";
  const title = useFormFields(([fields]) => filled(fields.title?.value));
  const summary = useFormFields(([fields]) => filled(fields.summary?.value));
  const content = useFormFields(([fields]) => hasText(fields.content?.value));
  const [others, setOthers] = useState<Record<string, LocaleState> | null>(null);

  useEffect(() => {
    if (!id || !collectionSlug) return;
    let alive = true;
    const codes = CONTENT_LOCALES.map((l) => l.code).filter((code) => code !== current);
    void Promise.all(codes.map((code) => loadLocaleDoc(collectionSlug, id, code, current))).then((docs) => {
      if (!alive) return;
      const out: Record<string, LocaleState> = {};
      codes.forEach((code, index) => {
        const doc = docs[index];
        if (doc) out[code] = localeState(doc);
      });
      setOthers(out);
    });
    return () => {
      alive = false;
    };
  }, [id, collectionSlug, current]);

  const states: Record<string, LocaleState> = { ...(others ?? {}), [current]: { title, summary, content } };
  return { states, loaded: others !== null || !id, current, collection: collectionSlug ?? "guides", id };
}

/**
 * Open another language version of the document in place (no page reload).
 * Save a draft before switching. Lexical may leave `modified` true even after
 * autosave accepted the same text, so waiting for that flag can stall forever.
 */
export function useSwitchLocale() {
  const router = useRouter();
  const { startRouteTransition } = useRouteTransition();
  const modified = useFormModified();
  const dirty = useRef(modified);
  dirty.current = modified;
  const background = useFormBackgroundProcessing();
  const processing = useFormProcessing();
  const { createFormData, getData, setDisabled, setModified } = useForm();
  const { id, collectionSlug } = useDocumentInfo();
  const locale = useLocale();
  const { config: { routes: { api } } } = useConfig();
  const [pending, setPending] = useState<string | null>(null);
  const [stalled, setStalled] = useState(false);
  const pendingRef = useRef<string | null>(null);
  const contextKey = `${collectionSlug}:${id}:${locale?.code}`;
  const contextRef = useRef(contextKey);
  contextRef.current = contextKey;
  const saving = useRef<string | null>(null);
  const frozen = useRef<string | null>(null);
  const alive = useRef(true);
  const busy = useRef({ background, processing });
  busy.current = { background, processing };
  const releaseForm = useCallback((key?: string) => {
    if (frozen.current !== null && (key === undefined || frozen.current === key)) {
      frozen.current = null;
      setDisabled(false);
    }
  }, [setDisabled]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; releaseForm(); }; }, [releaseForm]);
  useEffect(() => {
    pendingRef.current = null;
    setPending(null);
    setStalled(false);
    if (frozen.current !== contextKey) releaseForm();
  }, [contextKey, releaseForm]);

  const go = useCallback(
    (code: string) => {
      const params = new URLSearchParams(window.location.search);
      params.set("locale", code);
      startRouteTransition(() => router.push(`${window.location.pathname}?${params.toString()}`));
    },
    [router, startRouteTransition],
  );

  useEffect(() => {
    if (!pending || pendingRef.current !== pending) return;
    if (saving.current === contextKey || background || processing) return;
    if (!id || !collectionSlug) {
      pendingRef.current = null;
      setPending(null);
      setStalled(true);
      return;
    }
    saving.current = contextKey;
    const target = pending;
    const current = () => alive.current && pendingRef.current === target && contextRef.current === contextKey;
    const query = new URLSearchParams({ locale: locale?.code ?? "en", depth: "0", "fallback-locale": "null", draft: "true" });
    // Freeze before draining Lexical's deferred change. A native autosave
    // already in progress may re-enable the form, so repeat that boundary if
    // necessary. Queued autosaves see the disabled form and cannot race us.
    void (async () => {
      do {
        while (current() && (busy.current.background || busy.current.processing)) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        if (!current()) return null;
        frozen.current = contextKey;
        setDisabled(true);
        await settleEditorFields();
      } while (busy.current.background || busy.current.processing);
      if (!current()) return null;
      if (!dirty.current) return new Response(null, { status: 204 });
      const body = await createFormData({ _status: "draft" }, { data: getData(), mergeOverrideData: true });
      if (!current()) return null;
      return fetch(`${api}/${collectionSlug}/${encodeURIComponent(id)}?${query}`, {
        method: "PATCH", credentials: "same-origin", body, signal: AbortSignal.timeout(7000),
      });
    })().then((response) => {
      if (!current()) return;
      pendingRef.current = null;
      setPending(null);
      if (response?.ok) {
        setModified(false);
        forgetLocaleDocs(collectionSlug, id);
        go(target);
      } else setStalled(true);
    }).catch(() => {
      if (!current()) return;
      pendingRef.current = null;
      setPending(null);
      setStalled(true);
    }).finally(() => {
      if (saving.current === contextKey) saving.current = null;
      if (alive.current) releaseForm(contextKey);
    });
  }, [pending, modified, background, processing, contextKey, id, collectionSlug, locale?.code, api, createFormData, getData, setDisabled, setModified, releaseForm, go]);

  useEffect(() => {
    if (!pending) return;
    const target = pending;
    const timer = setTimeout(() => {
      if (pendingRef.current !== target) return;
      pendingRef.current = null;
      setPending(null);
      setStalled(true);
    }, 8000);
    return () => clearTimeout(timer);
  }, [pending]);

  const switchTo = useCallback(
    (code: string) => {
      if (pendingRef.current || saving.current === contextRef.current) return;
      setStalled(false);
      pendingRef.current = code;
      setPending(code);
    },
    [modified, background, processing, go],
  );
  return { switchTo, pending, stalled };
}
