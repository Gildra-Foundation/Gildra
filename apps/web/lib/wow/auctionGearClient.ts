import { normalizeAuctionBudgetGold } from "./auctionGearBudget";
import { parseAuctionGearSlots, type AuctionGearSlot } from "./auctionGearSelection";

/** Browser transport, recovery handles and safe input intent. Prices/stats always come from the server. */
export type AuctionClientFormIntent = {
  characterSlug: string; locale: "ru" | "en"; budgetGold: string;
  scenario: "single-target" | "aoe" | "execute"; objective: "value" | "dps"; selectedSlots: AuctionGearSlot[];
};
/** Whitelist bounded user inputs; never restore cached prices, stats or account facts. */
export function parseAuctionClientFormIntent(input: unknown): AuctionClientFormIntent | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (typeof value.characterSlug !== "string" || !value.characterSlug || value.characterSlug.length > 180 ||
      value.locale !== "en" && value.locale !== "ru" || typeof value.budgetGold !== "string" || value.budgetGold.length > 30 ||
      !/^\d+(?:\.\d{1,4})?$/.test(value.budgetGold) ||
      !["single-target", "aoe", "execute"].includes(value.scenario as string) || value.objective !== "value" && value.objective !== "dps") return null;
  try {
    return { characterSlug: value.characterSlug, locale: value.locale,
      budgetGold: normalizeAuctionBudgetGold(value.budgetGold, "en"),
      scenario: value.scenario as AuctionClientFormIntent["scenario"], objective: value.objective,
      selectedSlots: parseAuctionGearSlots(value.selectedSlots) };
  } catch { return null; }
}
export type AuctionClientScope = { characterSlug: string; locale: "ru" | "en" };
export type AuctionClientCache = { version: 1; profileKey: string; searchId?: string; jobId?: string; clientRequestId?: string; mode: "search" | "assembly"; excludedOptionIds: string[]; excludedVariantKeys?: string[]; cancellationRequested?: boolean; formIntent?: AuctionClientFormIntent };
const activeKey = "gildra:auction-active:v1";
let retiring: Promise<void> = Promise.resolve();

export function retireAuctionClient(...work: Promise<unknown>[]) {
  // Keep the ordering barrier, discard settled responses and the previous chain.
  retiring = Promise.allSettled([retiring, ...work]).then(() => undefined);
}
export function waitForAuctionClientRetirement() { return retiring; }
/** Fast cached results should not wait a full native-calculation polling interval. */
export function auctionClientPollDelay(attempt: number) { return attempt < 4 ? 250 : 1500; }
export function auctionClientCacheKey(scope: AuctionClientScope, specialization: string) {
  return `gildra:auction:v1:${encodeURIComponent(scope.characterSlug)}:${encodeURIComponent(specialization)}:${scope.locale}`;
}
const requestIdentity = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{16,100}$/.test(value);
const identity = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 180;
export function readAuctionClientCache(key: string): AuctionClientCache | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? "null") as Partial<AuctionClientCache> | null;
    const formIntent = value?.formIntent === undefined ? undefined : parseAuctionClientFormIntent(value.formIntent);
    return (value?.formIntent === undefined || formIntent !== null) && (value?.cancellationRequested === undefined || typeof value.cancellationRequested === "boolean") && value?.version === 1 && typeof value.profileKey === "string" && value.profileKey.length <= 300 && (identity(value.searchId) || identity(value.jobId) || requestIdentity(value.clientRequestId)) &&
      (value.mode === "search" || value.mode === "assembly") && Array.isArray(value.excludedOptionIds) &&
      value.excludedOptionIds.length <= 20000 && value.excludedOptionIds.every(identity) &&
      (value.excludedVariantKeys === undefined || Array.isArray(value.excludedVariantKeys) && value.excludedVariantKeys.length <= 20000 && value.excludedVariantKeys.every(key => typeof key === "string" && key.length > 0 && key.length <= 240))
      ? { version: 1, profileKey: value.profileKey, searchId: identity(value.searchId) ? value.searchId : undefined,
        jobId: identity(value.jobId) ? value.jobId : undefined, clientRequestId: requestIdentity(value.clientRequestId) ? value.clientRequestId : undefined, mode: value.mode, excludedOptionIds: [...new Set(value.excludedOptionIds)], excludedVariantKeys: [...new Set(value.excludedVariantKeys ?? [])], ...(formIntent ? { formIntent } : {}), ...(value.cancellationRequested ? { cancellationRequested: true } : {}) } : null;
  } catch { return null; }
}
export function writeAuctionClientCache(key: string, value: AuctionClientCache | null) {
  try { if (value) sessionStorage.setItem(key, JSON.stringify(value)); else sessionStorage.removeItem(key); } catch { /* Storage may be disabled. */ }
}
/** An acknowledged retired controller may clear only its exact saved ownership, preserving newer input. */
export function clearAcknowledgedAuctionClientCache(key: string, owner: { profileKey: string; jobId?: string; clientRequestId?: string }) {
  const saved = readAuctionClientCache(key);
  if (!saved || !owner.jobId && !owner.clientRequestId || saved.profileKey !== owner.profileKey ||
      saved.jobId !== owner.jobId || saved.clientRequestId !== owner.clientRequestId) return false;
  const next = { ...saved, jobId: undefined, clientRequestId: undefined, cancellationRequested: undefined };
  writeAuctionClientCache(key, next.searchId ? next : null);
  return true;
}
export function rememberAuctionClientRequest(scope: AuctionClientScope, clientRequestId: string) {
  try { sessionStorage.setItem(activeKey, JSON.stringify({ ...scope, clientRequestId })); } catch { /* Storage may be disabled. */ }
}
export function forgetAuctionClientRequest(clientRequestId: string) {
  try { if (JSON.parse(sessionStorage.getItem(activeKey) ?? "null")?.clientRequestId === clientRequestId) sessionStorage.removeItem(activeKey); } catch { /* Invalid saved state is ignored. */ }
}
export function auctionClientRequestUrl(clientRequestId: string, scope: AuctionClientScope) {
  return `/api/wow/auction-gear-plans?${new URLSearchParams({ clientRequestId, ...scope })}`;
}
export function rememberAuctionClientJob(scope: AuctionClientScope, id: string) {
  try { sessionStorage.setItem(activeKey, JSON.stringify({ ...scope, id })); } catch { /* Recovery is optional when storage is disabled. */ }
}
export function forgetAuctionClientJob(id: string) {
  try { if (JSON.parse(sessionStorage.getItem(activeKey) ?? "null")?.id === id) sessionStorage.removeItem(activeKey); } catch { /* Invalid saved state is ignored. */ }
}
export function removeAuctionClientJob(id: string) {
  return fetch(`/api/wow/auction-gear-plans?id=${encodeURIComponent(id)}`, {
    method: "DELETE", keepalive: true, signal: AbortSignal.timeout(10_000),
  }).then(response => { if (response.ok || response.status === 404) forgetAuctionClientJob(id); return response; }).catch(() => undefined);
}
export function removeAuctionClientRequest(clientRequestId: string, scope: AuctionClientScope) {
  return fetch(auctionClientRequestUrl(clientRequestId, scope), {
    method: "DELETE", keepalive: true, signal: AbortSignal.timeout(10_000),
  }).then(response => {
    if (response.ok) forgetAuctionClientRequest(clientRequestId);
    return response;
  }).catch(() => undefined);
}
/** A retained valid handle means retirement is not yet acknowledged. */
export function hasPendingAuctionClientJob() {
  try {
    const prior = JSON.parse(sessionStorage.getItem(activeKey) ?? "null");
    return identity(prior?.id) || requestIdentity(prior?.clientRequestId) && identity(prior.characterSlug) && (prior.locale === "ru" || prior.locale === "en");
  } catch { return false; }
}
export async function releasePriorAuctionClientJob() {
  try {
    const prior = JSON.parse(sessionStorage.getItem(activeKey) ?? "null") as { id?: unknown; clientRequestId?: unknown; characterSlug?: unknown; locale?: unknown } | null;
    if (identity(prior?.id)) return await removeAuctionClientJob(prior.id);
    else if (requestIdentity(prior?.clientRequestId) && identity(prior.characterSlug) && (prior.locale === "ru" || prior.locale === "en")) {
      // The server durably cancels this identity even before its POST arrives.
      // A missing lookup is not cancellation acknowledgement.
      return await removeAuctionClientRequest(prior.clientRequestId, { characterSlug: prior.characterSlug, locale: prior.locale });
    }
  } catch { /* The owner-checked server endpoint remains authoritative. */ }
}
export function auctionClientJobUrl(id: string, scope: AuctionClientScope) {
  return `/api/wow/auction-gear-plans?${new URLSearchParams({ id, ...scope })}`;
}
export class AuctionClientError extends Error {
  constructor(message: string, readonly reconnect = false) { super(message); }
}
export function auctionClientDelay(milliseconds: number, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, milliseconds);
    function abort() { clearTimeout(timer); reject(signal.reason ?? new DOMException("Aborted", "AbortError")); }
    signal.addEventListener("abort", abort, { once: true });
  });
}
export async function fetchAuctionClientResult<T>(url: string, signal: AbortSignal, onReconnect: () => void): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    try {
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) });
      if (response.status >= 500) throw new AuctionClientError("plan_connection_interrupted", true);
      const payload = await response.json() as T & { error?: string };
      if (!response.ok) throw new AuctionClientError(payload.error ?? "auction_plan_unavailable");
      return payload;
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof AuctionClientError && !error.reconnect) throw error;
      if (attempt >= 3) throw new AuctionClientError("plan_connection_interrupted", true);
      onReconnect();
      await auctionClientDelay(750 * (attempt + 1), signal);
    }
  }
}
