"use client";

import { catalogLocaleView } from "@/lib/catalogLocale";
import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import { Eye } from "lucide-react";
import type { CatalogRecord } from "@/lib/api/client";
import { trackCatalogEvent } from "@/lib/catalogAnalytics";

const loadTooltip = () => import("@/components/database/DatabaseEntityTooltip").then((module) => module.EntityTooltip);
const EntityTooltip = dynamic(loadTooltip, {
  ssr: false,
  loading: () => <div className="db-tooltip-loading" data-atlas-scope aria-hidden="true"><span /></div>,
});

type Labels = { label: string; loading: string; error: string; retry: string };

/**
 * Small icon button of a catalog row: fetches the record's in-game tooltip on
 * demand and opens it as a dialog. The dialog module loads only on hover,
 * focus or click, so rows cost no tooltip code until someone asks for one.
 */
export function RecordPreviewButton({ id, externalId, type, lang, iconSymbol, labels, className, errorClassName }: {
  id: string; externalId: number; type: string; lang: "en" | "ru"; iconSymbol?: string; labels: Labels; className?: string; errorClassName?: string;
}) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [entity, setEntity] = useState<CatalogRecord | null>(null);
  const [open, setOpen] = useState(false);
  const loaded = useRef<CatalogRecord | null>(null);

  const prefetch = () => { void loadTooltip().catch(() => undefined); };
  const close = useCallback(() => setOpen(false), []);

  async function openPreview() {
    prefetch();
    trackCatalogEvent("catalog_tooltip_opened", lang, { id: externalId, type });
    if (loaded.current) { setEntity(loaded.current); setOpen(true); return; }
    setState("loading");
    try {
      const response = await fetch(`/api/catalog/entities/${id}?locale=${lang === "ru" ? "ru_RU" : "en_US"}`);
      if (!response.ok) throw new Error(String(response.status));
      const detail = catalogLocaleView(await response.json() as CatalogRecord, lang);
      if (!detail.tooltip) throw new Error("no tooltip");
      loaded.current = detail;
      setEntity(detail);
      setState("idle");
      setOpen(true);
    } catch {
      setState("error");
    }
  }

  return (
    <>
      <button type="button" className={className} aria-haspopup="dialog" aria-expanded={open} aria-label={labels.label} title={labels.label}
        aria-busy={state === "loading" || undefined} data-state={state} onPointerEnter={prefetch} onFocus={prefetch} onClick={() => void openPreview()}>
        <Eye aria-hidden="true" />
      </button>
      {state === "loading" ? <span className="sr-only" role="status">{labels.loading}</span> : null}
      {state === "error" ? <p className={errorClassName} role="alert">{labels.error} <button type="button" onClick={() => void openPreview()}>{labels.retry}</button></p> : null}
      {open && entity ? <EntityTooltip entity={entity} lang={lang} iconSymbol={iconSymbol} onClose={close} /> : null}
    </>
  );
}
