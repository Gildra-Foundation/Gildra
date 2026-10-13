import type { Payload } from "payload";
import React from "react";

import { CONTENT_LOCALES, type LocaleState, localeState, missingParts, stateLevel } from "../../admin/completeness";

type States = Map<string, Record<string, LocaleState>>;
type Batch = { ids: Set<string>; result: Promise<States> };

/**
 * List cells render in one pass; the first cell of a pass opens a batch and
 * every row joins it, so a page of the list costs one query (latest drafts,
 * every language) instead of one per row.
 */
const batches = new Map<string, Batch>();

async function loadStates(payload: Payload, collection: string, ids: string[]): Promise<States> {
  const out: States = new Map();
  if (ids.length === 0) return out;
  try {
    const { docs } = await payload.find({
      collection: collection as "guides",
      where: { id: { in: ids } },
      locale: "all",
      draft: true,
      depth: 0,
      pagination: false,
      // Rows on the page were already filtered by the viewer's access; only yes/no facts leave the server.
      overrideAccess: true,
      select: { title: true, summary: true, content: true } as never,
    });
    for (const doc of docs as unknown as { id: unknown; title?: Record<string, unknown>; summary?: Record<string, unknown>; content?: Record<string, unknown> }[]) {
      const byLocale: Record<string, LocaleState> = {};
      for (const { code } of CONTENT_LOCALES) {
        byLocale[code] = localeState({ title: doc.title?.[code], summary: doc.summary?.[code], content: doc.content?.[code] });
      }
      out.set(String(doc.id), byLocale);
    }
  } catch (error) {
    payload.logger.warn({ msg: "languages column: could not read language versions", err: error });
  }
  return out;
}

function statesFor(payload: Payload, collection: string, id: string): Promise<Record<string, LocaleState> | undefined> {
  let batch = batches.get(collection);
  if (!batch) {
    const ids = new Set<string>();
    const result = new Promise<States>((resolve) => {
      setTimeout(() => {
        batches.delete(collection);
        resolve(loadStates(payload, collection, [...ids]));
      }, 0);
    });
    batch = { ids, result };
    batches.set(collection, batch);
  }
  batch.ids.add(id);
  return batch.result.then((states) => states.get(id));
}

/** "RU ✓ EN —" in article and page lists: which language versions are filled in. */
export async function LanguagesCell({
  payload,
  rowData,
  collectionSlug,
  i18n,
}: {
  payload: Payload;
  rowData?: { id?: unknown };
  collectionSlug: string;
  i18n?: { language?: string };
}) {
  const id = rowData?.id;
  if (id === undefined || id === null) return null;
  const lang = i18n?.language === "en" ? "en" : "ru";
  const states = await statesFor(payload, collectionSlug, String(id));
  return (
    <span className="gd-langs">
      {CONTENT_LOCALES.map((l) => {
        const level = stateLevel(states?.[l.code], collectionSlug);
        const missing = missingParts(states?.[l.code], collectionSlug, lang);
        const label = lang === "ru" ? l.ru : l.en;
        const title =
          level === "complete"
            ? `${label}: ${lang === "ru" ? "заполнена" : "complete"}`
            : level === "empty"
              ? `${label}: ${lang === "ru" ? "пусто" : "empty"}`
              : `${label}: ${lang === "ru" ? "нет" : "missing"} ${missing.join(", ")}`;
        return (
          <span key={l.code} className={`gd-lang gd-lang--${level}`} title={title} aria-label={title}>
            {l.short}
          </span>
        );
      })}
    </span>
  );
}
