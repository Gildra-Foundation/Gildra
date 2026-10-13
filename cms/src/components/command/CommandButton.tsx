"use client";

import { useTranslation } from "@payloadcms/ui";
import React, { Suspense, useEffect, useState } from "react";

const loadPalette = () => import("./CommandPalette");
const CommandPalette = React.lazy(loadPalette);

/**
 * "Find…" button in the admin header and the Ctrl+K / ⌘K shortcut. The
 * palette itself (cmdk) is a separate chunk, fetched when the browser is idle
 * or on first use, so it never slows down opening a page.
 */
export function CommandButton() {
  const { i18n } = useTranslation();
  const ru = i18n.language !== "en";
  const [open, setOpen] = useState(false);
  const [mac, setMac] = useState(false);

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(() => void loadPalette(), { timeout: 4000 })
      : window.setTimeout(() => void loadPalette(), 2500);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        className="gd-cmd-button"
        onClick={() => setOpen(true)}
        onPointerEnter={() => void loadPalette()}
        aria-keyshortcuts={mac ? "Meta+K" : "Control+K"}
        aria-label={ru ? "Найти и перейти" : "Find and go"}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="gd-cmd-button__text">{ru ? "Найти…" : "Find…"}</span>
        <kbd>{mac ? "⌘K" : "Ctrl K"}</kbd>
      </button>
      {open ? (
        <Suspense fallback={null}>
          <CommandPalette onClose={() => setOpen(false)} />
        </Suspense>
      ) : null}
    </>
  );
}
