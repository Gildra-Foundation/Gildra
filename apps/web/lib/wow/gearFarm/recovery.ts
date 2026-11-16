import type { GearFarmInput, GearFarmJob } from "./types";
import { normalizeFarmSettings } from "./settings";

/** A UI profile revision, never a client-supplied armory or proof of ownership. */
export type GearFarmScope = GearFarmInput & ReturnType<typeof normalizeFarmSettings> & { profileKey: string };
export type RecoverableGearFarmJob = GearFarmJob & {
  scope: GearFarmScope;
  clientRequestId: string;
  createdAt: number;
  expiresAt: number;
};
export const farmRequestLifetime = 30 * 60_000;

export function parseFarmScope(input: Record<string, unknown>): GearFarmScope {
  const { characterSlug, profileKey, locale } = input;
  if (typeof characterSlug !== "string" || !characterSlug || characterSlug.length > 180 ||
      typeof profileKey !== "string" || !profileKey || profileKey.length > 300 ||
      locale !== "en" && locale !== "ru") throw new Error("invalid_plan_request");
  return { characterSlug, profileKey, locale, ...normalizeFarmSettings(input) };
}
export function farmScopeKey(scope: GearFarmScope) {
  return JSON.stringify([scope.characterSlug, scope.profileKey, scope.locale, scope.dungeonDifficulty, scope.raidDifficulty, scope.mythicKeyLevel ?? null]);
}
export function sameFarmScope(a: GearFarmScope, b: GearFarmScope) { return farmScopeKey(a) === farmScopeKey(b); }
export function isFarmRequestId(value: unknown): value is string {
  return typeof value === "string" && /^\d{13}:[a-f0-9-]{36}$/.test(value);
}
export function validateFarmRequestId(value: unknown, now = Date.now()) {
  if (!isFarmRequestId(value)) throw new Error("invalid_plan_request");
  const issuedAt = Number(value.split(":", 1)[0]);
  if (issuedAt > now + 60_000 || issuedAt + farmRequestLifetime <= now) throw new Error("plan_request_expired");
  return value;
}
export function farmJobActive(job?: GearFarmJob | null) { return job?.status === "queued" || job?.status === "running"; }
export function farmRecoveryUrl(scope: GearFarmScope, identity?: { id?: string; clientRequestId?: string }) {
  const query = new URLSearchParams({ characterSlug: scope.characterSlug, profileKey: scope.profileKey, locale: scope.locale,
    dungeonDifficulty: scope.dungeonDifficulty, raidDifficulty: scope.raidDifficulty });
  if (scope.mythicKeyLevel !== undefined) query.set("mythicKeyLevel", String(scope.mythicKeyLevel));
  if (identity?.id) query.set("id", identity.id);
  else if (identity?.clientRequestId) query.set("clientRequestId", identity.clientRequestId);
  return `/api/wow/gear-farm-plans?${query}`;
}
/** Even server responses cannot be adopted by a controller for another profile/settings. */
export function parseFarmJob(value: unknown, scope: GearFarmScope): RecoverableGearFarmJob {
  const job = value as Partial<RecoverableGearFarmJob> | null;
  if (!job || typeof job !== "object" || typeof job.id !== "string" || !job.id || !job.scope ||
      !sameFarmScope(parseFarmScope(job.scope), scope) || !isFarmRequestId(job.clientRequestId) ||
      !Number.isFinite(job.createdAt) || !Number.isFinite(job.expiresAt) ||
      !["queued", "running", "completed", "failed", "cancelled"].includes(job.status ?? "") ||
      job.status === "completed" && (!job.result || !Array.isArray(job.result.activities) || !job.result.coverage)) throw new Error("invalid_plan_result");
  return job as RecoverableGearFarmJob;
}
