"use client";

import { useEffect } from "react";

export function SearchShortcut({ inputId }: { inputId: string }) {
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      document.getElementById(inputId)?.focus();
    };
    // Capture runs before the toolbar's quick search, which then leaves "/" alone.
    window.addEventListener("keydown", focusSearch, { capture: true });
    return () => window.removeEventListener("keydown", focusSearch, { capture: true });
  }, [inputId]);
  return null;
}
