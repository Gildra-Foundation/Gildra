"use client";

import { catalogLocaleView } from "@/lib/catalogLocale";
import { useEffect, useRef, useState } from "react";
import type { CatalogRecord } from "@/lib/api/client";
import { TooltipBody, tooltipClassName } from "@/components/database/TooltipContent";
import { withVariantQuality } from "@/lib/library/recordQuality";
import styles from "./libraryHoverPreview.module.css";

const HOVER_DELAY = 350;
const GAP = 12;

type Shown = { entity: CatalogRecord; left: number; top: number };

/**
 * Mouse-hover preview of the in-game tooltip for library cards. One island
 * per result list: it listens for pointer hover on `[data-hover-preview]`
 * cards inside `#rootId`, loads the record (cached per page) and shows the
 * tooltip beside the card. Touch and keyboard users open the same tooltip
 * through the card's button, so the preview is hidden from assistive tech
 * and only runs on devices with a fine hovering pointer.
 */
export function LibraryHoverPreview({ rootId, lang, iconSymbol, loadingLabel }: { rootId: string; lang: "en" | "ru"; iconSymbol?: string; loadingLabel: string }) {
  const [shown, setShown] = useState<Shown | null>(null);
  const [pending, setPending] = useState<{ left: number; top: number } | null>(null);
  const popover = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.getElementById(rootId);
    if (!root || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const cache = new Map<string, Promise<CatalogRecord | null>>();
    let timer = 0;
    let current: HTMLElement | null = null;
    const locale = lang === "ru" ? "ru_RU" : "en_US";

    const load = (id: string, iconUrl?: string) => {
      let request = cache.get(id);
      if (!request) {
        request = fetch(`/api/catalog/entities/${id}?locale=${locale}`)
          .then((response) => (response.ok ? response.json() as Promise<CatalogRecord> : null))
          // The record endpoint has no media URL; the card's own icon fills the tooltip icon.
          .then((entity) => (entity?.tooltip ? withVariantQuality(catalogLocaleView({ ...entity, iconUrl: entity.iconUrl || iconUrl }, lang)) : null))
          .catch(() => null);
        cache.set(id, request);
      }
      return request;
    };

    // Beside the card: right when there is room, otherwise left; clamped to the viewport.
    const place = (card: HTMLElement) => {
      const box = card.getBoundingClientRect();
      const width = Math.min(420, window.innerWidth - 2 * GAP);
      const right = box.right + GAP + width <= window.innerWidth - GAP;
      const left = right ? box.right + GAP : Math.max(GAP, box.left - GAP - width);
      return { left, top: Math.max(GAP, box.top) };
    };

    const hide = () => {
      window.clearTimeout(timer);
      current = null;
      setPending(null);
      setShown(null);
    };

    const onOver = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !(event.target instanceof Element)) return;
      const card = event.target.closest<HTMLElement>("[data-hover-preview]");
      if (!card || card === current || !root.contains(card)) return;
      // The tooltip button opens the full dialog; hovering it does not stack a second tooltip.
      if (event.target.closest("button")) return;
      hide();
      current = card;
      const id = card.dataset.hoverPreview ?? "";
      timer = window.setTimeout(() => {
        if (current !== card) return;
        setPending(place(card));
        void load(id, card.dataset.hoverIcon || undefined).then((entity) => {
          if (current !== card) return;
          setPending(null);
          setShown(entity ? { entity, ...place(card) } : null);
        });
      }, HOVER_DELAY);
    };

    const onOut = (event: PointerEvent) => {
      if (!current) return;
      const next = event.relatedTarget instanceof Node ? event.relatedTarget : null;
      if (next && current.contains(next)) return;
      hide();
    };

    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") hide(); };
    root.addEventListener("pointerover", onOver);
    root.addEventListener("pointerout", onOut);
    window.addEventListener("scroll", hide, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      root.removeEventListener("pointerover", onOver);
      root.removeEventListener("pointerout", onOut);
      window.removeEventListener("scroll", hide);
      window.removeEventListener("keydown", onKey);
    };
  }, [lang, rootId]);

  // Keep a tall tooltip inside the viewport once its height is known.
  useEffect(() => {
    const element = popover.current;
    if (!element || !shown) return;
    const overflow = element.getBoundingClientRect().bottom - (window.innerHeight - GAP);
    if (overflow > 0) element.style.top = `${Math.max(GAP, shown.top - overflow)}px`;
  }, [shown]);

  if (shown) {
    return (
      <div ref={popover} className={styles.popover} style={{ left: shown.left, top: shown.top }} aria-hidden="true" data-atlas-scope>
        <div className={tooltipClassName(shown.entity, "page")}>
          <TooltipBody entity={shown.entity} lang={lang} iconSymbol={iconSymbol} />
        </div>
      </div>
    );
  }
  return pending ? <div className={`${styles.popover} ${styles.loading}`} style={{ left: pending.left, top: pending.top }} aria-hidden="true">{loadingLabel}</div> : null;
}
