"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef } from "react";
import type { Lang } from "@/lib/i18n";
import type { CatalogRecord } from "@/lib/api/client";
import { TooltipBody, tooltipClassName } from "@/components/database/TooltipContent";

/**
 * Modal in-game tooltip opened from a catalog row (RecordPreviewButton loads
 * this module on demand). Focus moves to the close button, Tab stays inside,
 * Escape or the backdrop closes it and focus returns to the opener.
 */
export function EntityTooltip({ entity, lang, iconSymbol, onClose }: { entity: CatalogRecord; lang: Lang; iconSymbol?: string; onClose: () => void }) {
	const dialogRef = useRef<HTMLDivElement>(null);
	const closeRef = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		closeRef.current?.focus();
		function handleKey(event: KeyboardEvent) {
			if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
			if (event.key !== "Tab" || !dialogRef.current) return;
			const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),summary,[tabindex]:not([tabindex='-1'])"));
			if (!focusable.length) { event.preventDefault(); dialogRef.current.focus(); return; }
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
			else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
		}
		window.addEventListener("keydown", handleKey);
		return () => {
			window.removeEventListener("keydown", handleKey);
			document.body.style.overflow = previousOverflow;
			previousFocus?.focus();
		};
	}, [onClose]);
	if (!entity.tooltip) return null;
	return createPortal(
		<>
			<div className="db-tooltip-backdrop" data-atlas-scope aria-hidden="true" onMouseDown={onClose} />
			<div ref={dialogRef} data-atlas-scope className={tooltipClassName(entity, "dialog")} id={`tooltip-${entity.id}`} role="dialog" aria-modal="true" aria-labelledby={`tooltip-name-${entity.id}`} tabIndex={-1}>
				<button ref={closeRef} type="button" className="db-tooltip-close" aria-label={lang === "ru" ? "Закрыть подсказку" : "Close tooltip"} onClick={onClose}>×</button>
				<TooltipBody entity={entity} lang={lang} iconSymbol={iconSymbol} />
			</div>
		</>,
		document.body,
	);
}
