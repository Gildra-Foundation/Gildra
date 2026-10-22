"use client";

import { useEffect, useRef, useState } from "react";

/** Bind results to the whole query; old responses never appear under new filters. */
export function usePage<T>(endpoint: string, query: string, initialQuery: string, initial: T) {
  const [entry, setEntry] = useState<{ query: string; data?: T; error?: number }>({ query: initialQuery, data: initial });
  const [reload, setReload] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current && query === initialQuery) { first.current = false; return; }
    first.current = false;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`${endpoint}?${query}`, { credentials: "same-origin", signal: controller.signal });
        if (!response.ok) {
          if (!controller.signal.aborted) setEntry({ query, error: response.status });
          return;
        }
        const data = await response.json() as T;
        if (!controller.signal.aborted) setEntry({ query, data });
      } catch {
        if (!controller.signal.aborted) setEntry({ query, error: 500 });
      }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [endpoint, query, initialQuery, reload]);
  const current = entry.query === query ? entry : null;
  return { data: current?.data, error: current?.error, loading: !current, retry: () => { setEntry({ query: "" }); setReload((n) => n + 1); } };
}
