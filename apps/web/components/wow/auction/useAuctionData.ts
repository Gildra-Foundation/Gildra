"use client";
import { useEffect, useState } from "react";

/** Answers stay for a minute, so Back, re-sorting and reopening an item never refetch. */
const cache = new Map<string, { at: number; value: unknown }>();
const TTL = 60_000;

export class AuctionRequestError extends Error {}

export async function auctionFetch<T>(url: string, signal?: AbortSignal): Promise<T> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.value as T;
  const response = await fetch(url, { signal });
  const body = await response.json().catch(() => ({ error: "upstream_unavailable" }));
  if (!response.ok) throw new AuctionRequestError(typeof body?.error === "string" ? body.error : "upstream_unavailable");
  if (cache.size > 60) cache.delete(cache.keys().next().value!);
  cache.set(url, { at: Date.now(), value: body });
  return body as T;
}

type State<T> = { url: string | null; data: T | null; error: string };

/** One request per URL; a new URL cancels the previous one. `null` loads nothing. */
export function useAuctionData<T>(url: string | null) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State<T>>({ url: null, data: null, error: "" });
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    auctionFetch<T>(url, controller.signal)
      .then(data => { if (!controller.signal.aborted) setState({ url, data, error: "" }); })
      .catch(reason => { if (!controller.signal.aborted) setState({ url, data: null, error: reason instanceof AuctionRequestError ? reason.message : "upstream_unavailable" }); });
    return () => controller.abort();
  }, [url, attempt]);
  const current = state.url === url && url !== null;
  return {
    data: current ? state.data : null, error: current ? state.error : "", loading: url !== null && !current,
    retry: () => { if (url) cache.delete(url); setState(previous => ({ ...previous, url: null })); setAttempt(n => n + 1); },
  };
}
