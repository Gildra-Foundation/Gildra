import "server-only";
import { apiInternalUrl } from "@/lib/env";

type InternalRequest = Omit<RequestInit, "signal"> & { timeoutMs: number };

/** A request to the internal Gildra API (API_INTERNAL_URL) that gives up after `timeoutMs`. */
export function internalApiFetch(path: string, { timeoutMs, ...init }: InternalRequest) {
  return fetch(`${apiInternalUrl()}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

/** The JSON body of a successful response; otherwise "<label> request failed (<status>)". */
export async function readApiJson<T>(response: Response, label: string): Promise<T> {
  if (!response.ok) throw new Error(`${label} request failed (${response.status})`);
  return await response.json() as T;
}

/** internalApiFetch + readApiJson: one JSON read of the internal API. */
export async function internalApiJson<T>(path: string, { label, ...request }: InternalRequest & { label: string }): Promise<T> {
  return readApiJson<T>(await internalApiFetch(path, request), label);
}
