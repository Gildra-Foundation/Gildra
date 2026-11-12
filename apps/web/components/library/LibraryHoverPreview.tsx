"use client";

import { catalogLocaleView } from "@/lib/catalogLocale";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CatalogRecord } from "@/lib/api/client";
import { TooltipBody, tooltipClassName } from "@/components/database/TooltipContent";
import { catalogIconUrl } from "@/lib/games/wow/assets";
import { withVariantQuality } from "@/lib/library/recordQuality";
import styles from "./libraryHoverPreview.module.css";

const HOVER_DELAY = 280;
/** Once a tooltip is open, moving to the next record swaps it at once (no gap, no second wait). */
const WARM_DELAY = 40;
/** A slow answer gets a small "loading" line, a fast one never flashes it. */
const LOADER_DELAY = 450;
const GAP = 12;

type Anchor = { left: number; right: number; top: number };
type Shown = { entity: CatalogRecord; anchor: Anchor };

/** Beside the record's name (a table row is as wide as the page) or the tile: right when there is room, otherwise left; clamped to the viewport. */
function place(anchor: Anchor, width: number, height: number) {
  const right = anchor.right + GAP + width <= window.innerWidth - GAP;
  const left = right ? anchor.right + GAP : Math.max(GAP, anchor.left - GAP - width);
  const top = Math.max(GAP, Math.min(anchor.top, window.innerHeight - GAP - height));
  return { left, top };
}

function anchorOf(card: HTMLElement): Anchor {
  const name = card.querySelector("a");
  const box = (card.tagName === "TR" && name ? name : card).getBoundingClientRect();
  return { left: box.left, right: box.right, top: card.getBoundingClientRect().top };
}

/**
 * Mouse-hover preview of the in-game tooltip for library records. One island
 * per result list: it listens for pointer hover on `[data-hover-preview]`
 * rows and tiles inside `#rootId`, starts loading the record at once (cached
 * per page), shows the tooltip after a short rest and, while one is open,
 * swaps it immediately as the pointer moves along the list. The final
 * position is measured before paint, so the tooltip never jumps. Touch and
 * keyboard users open the same tooltip through the record's button, so the
 * preview is hidden from assistive tech and only runs with a fine hovering pointer.
 */
export function LibraryHoverPreview({ rootId, lang, iconSymbol, loadingLabel }: { rootId: string; lang: "en" | "ru"; iconSymbol?: string; loadingLabel: string }) {
  const [shown, setShown] = useState<Shown | null>(null);
  const [pending, setPending] = useState<Anchor | null>(null);
  const popover = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.getElementById(rootId);
    if (!root || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const cache = new Map<string, Promise<CatalogRecord | null>>();
    let timer = 0;
    let loader = 0;
    let current: HTMLElement | null = null;
    let warm = false;
    const locale = lang === "ru" ? "ru_RU" : "en_US";

    const load = (id: string, iconUrl?: string) => {
      let request = cache.get(id);
      if (!request) {
        request = fetch(`/api/catalog/entities/${id}?locale=${locale}`)
          .then((response) => (response.ok ? response.json() as Promise<CatalogRecord> : null))
          // The record endpoint has no media URL; the card's own icon fills the tooltip icon, else the game's file of the record's icon name.
          .then((entity) => (entity?.tooltip ? withVariantQuality(catalogLocaleView({ ...entity, iconUrl: catalogIconUrl({ ...entity, iconUrl: entity.iconUrl || iconUrl }) }, lang)) : null))
          .catch(() => null);
        cache.set(id, request);
      }
      return request;
    };

    const hide = () => {
      window.clearTimeout(timer);
      window.clearTimeout(loader);
      current = null;
      warm = false;
      setPending(null);
      setShown(null);
    };

    const onOver = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !(event.target instanceof Element)) return;
      const card = event.target.closest<HTMLElement>("[data-hover-preview]");
      if (!card || card === current || !root.contains(card)) return;
      // The tooltip button opens the full dialog; hovering it does not stack a second tooltip.
      if (event.target.closest("button")) return;
      window.clearTimeout(timer);
      window.clearTimeout(loader);
      current = card;
      const id = card.dataset.hoverPreview ?? "";
      const request = load(id, card.dataset.hoverIcon || undefined);
      timer = window.setTimeout(() => {
        if (current !== card) return;
        let settled = false;
        loader = window.setTimeout(() => {
          if (settled || current !== card) return;
          setShown(null);
          setPending(anchorOf(card));
        }, warm ? WARM_DELAY * 4 : LOADER_DELAY);
        void request.then((entity) => {
          settled = true;
          window.clearTimeout(loader);
          if (current !== card) return;
          setPending(null);
          if (entity) { warm = true; setShown({ entity, anchor: anchorOf(card) }); } else setShown(null);
        });
      }, warm ? WARM_DELAY : HOVER_DELAY);
    };

    const onOut = (event: PointerEvent) => {
      if (!current) return;
      const next = event.relatedTarget instanceof Node ? event.relatedTarget : null;
      if (next && current.contains(next)) return;
      // Into another record of the list: onOver takes over and keeps the tooltip warm.
      if (next instanceof Element && next.closest("[data-hover-preview]") && root.contains(next)) return;
      hide();
    };

    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") hide(); };
    root.addEventListener("pointerover", onOver);
    root.addEventListener("pointerout", onOut);
    window.addEventListener("scroll", hide, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(loader);
      root.removeEventListener("pointerover", onOver);
      root.removeEventListener("pointerout", onOut);
      window.removeEventListener("scroll", hide);
      window.removeEventListener("keydown", onKey);
    };
  }, [lang, rootId]);

  // Measured before paint: a tall tooltip moves up inside the viewport without a visible jump.
  useLayoutEffect(() => {
    const element = popover.current;
    const anchor = shown?.anchor ?? pending;
    if (!element || !anchor) return;
    const box = element.getBoundingClientRect();
    const { left, top } = place(anchor, box.width, box.height);
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.style.visibility = "visible";
  }, [shown, pending]);

  if (shown) {
    return (
      <div ref={popover} className={styles.popover} style={{ visibility: "hidden" }} aria-hidden="true" data-atlas-scope>
        <div className={tooltipClassName(shown.entity, "page")}>
          <TooltipBody entity={shown.entity} lang={lang} iconSymbol={iconSymbol} />
        </div>
      </div>
    );
  }
  return pending ? <div ref={popover} className={`${styles.popover} ${styles.loading}`} style={{ visibility: "hidden" }} aria-hidden="true">{loadingLabel}</div> : null;
}
