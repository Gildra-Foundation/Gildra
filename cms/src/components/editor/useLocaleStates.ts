"use client";

import { useDocumentInfo, useFormFields, useFormModified, useLocale, useRouteTransition } from "@payloadcms/ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { CONTENT_LOCALES, filled, hasText, type LocaleState, localeState } from "../../admin/completeness";

/** One language version as saved (latest draft, no fallback to another language). */
export type LocaleDoc = { title?: unknown; summary?: unknown; content?: unknown };

const cache = new Map<string, Promise<LocaleDoc | null>>();

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
 * Unsaved typing is autosaved first: the switch waits until the form is clean.
 */
export function useSwitchLocale() {
  const router = useRouter();
  const { startRouteTransition } = useRouteTransition();
  const modified = useFormModified();
  const [pending, setPending] = useState<string | null>(null);
  const [stalled, setStalled] = useState(false);
  const waitedSince = useRef(0);

  const go = useCallback(
    (code: string) => {
      const params = new URLSearchParams(window.location.search);
      params.set("locale", code);
      startRouteTransition(() => router.push(`${window.location.pathname}?${params.toString()}`));
    },
    [router, startRouteTransition],
  );

  useEffect(() => {
    if (!pending) return;
    if (!modified) {
      setPending(null);
      go(pending);
      return;
    }
    // Autosave runs every 2 s; if it cannot save, stay here rather than lose the text.
    const timer = setTimeout(
      () => {
        setPending(null);
        setStalled(true);
      },
      Math.max(0, 8000 - (performance.now() - waitedSince.current)),
    );
    return () => clearTimeout(timer);
  }, [pending, modified, go]);

  const switchTo = useCallback(
    (code: string) => {
      setStalled(false);
      if (!modified) return go(code);
      waitedSince.current = performance.now();
      setPending(code);
    },
    [modified, go],
  );
  return { switchTo, pending, stalled };
}
