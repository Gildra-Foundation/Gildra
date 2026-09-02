"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Console HTTP client.
 *
 * Every request gets its own deadline (AbortController + timer, so it works
 * without AbortSignal.timeout/any), is cancelled when the caller aborts, and
 * idempotent GETs retry a couple of times on network failures, timeouts and
 * 5xx answers.  Errors carry the HTTP status and the API problem code so the
 * UI can show a meaningful message instead of a spinner.
 */

export const REQUEST_TIMEOUT_MS = 12_000;
const RETRY_DELAYS_MS = [400, 1200];

export class ConsoleError extends Error {
  status: number;
  code: string;
  retryable: boolean;
  constructor(message: string, options: { status?: number; code?: string; retryable?: boolean } = {}) {
    super(message);
    this.name = "ConsoleError";
    this.status = options.status ?? 0;
    this.code = options.code ?? "";
    this.retryable = options.retryable ?? false;
  }
}

export function isAbortError(reason: unknown): boolean {
  return reason instanceof DOMException ? reason.name === "AbortError" : reason instanceof Error && reason.name === "AbortError";
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const timer = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
    function onAbort() { clearTimeout(timer); reject(abortError()); }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function abortError(): Error {
  return typeof DOMException === "function" ? new DOMException("Request aborted", "AbortError") : Object.assign(new Error("Request aborted"), { name: "AbortError" });
}

type RequestOptions = RequestInit & { timeoutMs?: number; retries?: number };

async function attempt<T>(path: string, init: RequestOptions, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = init.timeoutMs ?? REQUEST_TIMEOUT_MS;
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const forward = () => controller.abort();
  signal?.addEventListener("abort", forward, { once: true });
  try {
    const { timeoutMs: _timeout, retries: _retries, ...rest } = init;
    void _timeout; void _retries;
    let response: Response;
    try {
      response = await fetch(path, { credentials: "include", ...rest, signal: controller.signal });
    } catch (reason) {
      if (timedOut) {
        throw new ConsoleError(`Сервис не ответил за ${Math.round(timeoutMs / 1000)} с.`, { status: 0, code: "timeout", retryable: true });
      }
      if (signal?.aborted || isAbortError(reason)) throw abortError();
      throw new ConsoleError("Нет соединения с API. Проверьте сеть и повторите запрос.", { status: 0, code: "network", retryable: true });
    }
    if (!response.ok) {
      let message = response.status >= 500 ? "Сервис временно недоступен" : "Запрос не выполнен";
      let code = "";
      try {
        const problem = await response.json() as { message?: string; detail?: string; code?: string };
        code = problem.code ?? "";
        message = problem.detail ?? problem.message ?? (code ? `${code}: ${message}` : message);
      } catch { /* non-JSON error body */ }
      throw new ConsoleError(message, { status: response.status, code, retryable: response.status >= 500 || response.status === 429 });
    }
    return await response.json() as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forward);
  }
}

export async function requestJSON<T>(path: string, init: RequestOptions = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const retries = init.retries ?? (method === "GET" ? RETRY_DELAYS_MS.length : 0);
  const signal = init.signal ?? undefined;
  let lastError: unknown;
  for (let round = 0; round <= retries; round += 1) {
    if (signal?.aborted) throw abortError();
    try {
      return await attempt<T>(path, init, signal);
    } catch (reason) {
      lastError = reason;
      const retryable = reason instanceof ConsoleError && reason.retryable;
      if (!retryable || round === retries || signal?.aborted) throw reason;
      await sleep(RETRY_DELAYS_MS[Math.min(round, RETRY_DELAYS_MS.length - 1)], signal);
    }
  }
  throw lastError;
}

export function errorMessage(reason: unknown, fallback: string): string {
  if (reason instanceof Error && reason.message) return reason.message;
  return fallback;
}

export type ConsoleRequestState<T> = {
  data: T | null;
  error: string;
  loading: boolean;
  reload: () => void;
};

/**
 * Loads one console resource with cancellation on unmount or when the path
 * changes.  `enabled: false` skips the request (the state stays idle) and
 * `refreshKey` forces a reload from the outside (the header refresh button).
 */
export function useConsoleRequest<T>(path: string | null, options: { enabled?: boolean; refreshKey?: number; fallback?: string } = {}): ConsoleRequestState<T> {
  const enabled = options.enabled ?? true;
  const fallback = options.fallback ?? "Не удалось загрузить данные";
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(path) && enabled);
  const [version, setVersion] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    if (!path || !enabled) { setLoading(false); return; }
    const controller = new AbortController();
    const ticket = latest.current + 1;
    latest.current = ticket;
    setLoading(true); setError("");
    requestJSON<T>(path, { signal: controller.signal })
      .then((value) => { if (latest.current === ticket) { setData(value); setError(""); } })
      .catch((reason) => { if (isAbortError(reason) || latest.current !== ticket) return; setError(errorMessage(reason, fallback)); })
      .finally(() => { if (latest.current === ticket) setLoading(false); });
    return () => controller.abort();
  }, [path, enabled, version, options.refreshKey, fallback]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  return { data, error, loading, reload };
}
