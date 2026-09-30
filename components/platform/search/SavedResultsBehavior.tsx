"use client";

import { useEffect } from "react";

const STORAGE_KEY = "gildra:saved-catalog-records";

function readSavedRecords() {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function syncButton(button: HTMLButtonElement, saved: boolean) {
  const action = saved ? button.dataset.removeLabel : button.dataset.saveLabel;
  button.toggleAttribute("data-saved", saved);
  button.setAttribute("aria-pressed", String(saved));
  button.setAttribute("aria-label", `${action ?? "Save"}: ${button.dataset.recordName ?? "record"}`);
  button.title = action ?? "Save";
}

function useImageFallback(image: HTMLImageElement) {
  const fallback = image.dataset.fallbackSrc;
  if (!fallback || image.dataset.fallbackApplied) return;
  image.dataset.fallbackApplied = "true";
  image.removeAttribute("srcset");
  image.removeAttribute("sizes");
  if (image.getAttribute("src") !== fallback) image.src = fallback;
}

export function SavedResultsBehavior() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-saved-results]");
    if (!root) return;

    const saved = readSavedRecords();
    let idleHandle: number | null = null;
    let timeoutHandle: number | null = null;
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const syncSavedButtons = () => {
      root.querySelectorAll<HTMLButtonElement>("button[data-save-record]").forEach((button) => {
        syncButton(button, saved.has(button.dataset.saveRecord ?? ""));
      });
      root.querySelectorAll<HTMLImageElement>("img[data-fallback-src]").forEach((image) => {
        if (image.complete && image.naturalWidth === 0) useImageFallback(image);
      });
    };
    const scheduleSync = () => {
      if (idleHandle !== null) idleWindow.cancelIdleCallback?.(idleHandle);
      if (timeoutHandle !== null) window.clearTimeout(timeoutHandle);
      if (idleWindow.requestIdleCallback) {
        idleHandle = idleWindow.requestIdleCallback(syncSavedButtons, { timeout: 1000 });
      } else {
        timeoutHandle = window.setTimeout(syncSavedButtons, 250);
      }
    };
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>("button[data-save-record]");
      if (!button || !root.contains(button)) return;
      const id = button.dataset.saveRecord;
      if (!id) return;
      if (saved.has(id)) saved.delete(id);
      else saved.add(id);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...saved]));
      } catch {
        // Keep the control responsive when browser storage is unavailable.
      }
      syncButton(button, saved.has(id));
    };
    const handleImageError = (event: Event) => {
      if (event.target instanceof HTMLImageElement) useImageFallback(event.target);
    };

    const observer = new MutationObserver(scheduleSync);
    observer.observe(root, { childList: true, subtree: true });
    root.addEventListener("click", handleClick);
    root.addEventListener("error", handleImageError, true);
    scheduleSync();
    return () => {
      observer.disconnect();
      root.removeEventListener("click", handleClick);
      root.removeEventListener("error", handleImageError, true);
      if (idleHandle !== null) idleWindow.cancelIdleCallback?.(idleHandle);
      if (timeoutHandle !== null) window.clearTimeout(timeoutHandle);
    };
  }, []);

  return null;
}
