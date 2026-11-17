import type { AuctionGearAssemblyResult, AuctionGearSearchResult } from "./auctionGearTypes";
import { auctionGearAssemblyGoalComplete } from "./auctionGearEnhancementMode";

export const auctionQuickSearchTurns = 3;
export const auctionQuickSearchDurationMs = 45_000;
export type AuctionGearRunPolicy = { kind: "quick" | "full"; phase: "search" | "assembly" | "done";
  startedAt: number; searchTurns: number; assemblyTurns: number; lastCompletedJobId?: string };
export function createAuctionGearRunPolicy(kind: AuctionGearRunPolicy["kind"] = "quick", phase: "search" | "assembly" = "search", now = Date.now()): AuctionGearRunPolicy {
  return { kind, phase, startedAt: now, searchTurns: 0, assemblyTurns: 0 };
}
export function parseAuctionGearRunPolicy(value: unknown): AuctionGearRunPolicy | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  if (row.kind !== "quick" && row.kind !== "full" || !["search", "assembly", "done"].includes(String(row.phase)) ||
    !Number.isSafeInteger(row.startedAt) || Number(row.startedAt) < 0 ||
    !Number.isSafeInteger(row.searchTurns) || Number(row.searchTurns) < 0 || Number(row.searchTurns) > 1_000_000 ||
    !Number.isSafeInteger(row.assemblyTurns) || Number(row.assemblyTurns) < 0 || Number(row.assemblyTurns) > 1_000_000 ||
    row.lastCompletedJobId !== undefined && (typeof row.lastCompletedJobId !== "string" || !row.lastCompletedJobId || row.lastCompletedJobId.length > 180)) return undefined;
  return { kind: row.kind, phase: row.phase as AuctionGearRunPolicy["phase"], startedAt: Number(row.startedAt), searchTurns: Number(row.searchTurns),
    assemblyTurns: Number(row.assemblyTurns), ...(typeof row.lastCompletedJobId === "string" ? { lastCompletedJobId: row.lastCompletedJobId } : {}) };
}
export function auctionGearSearchRunPhase(policy: AuctionGearRunPolicy, searchComplete: boolean, canAssemble: boolean, now = Date.now()): AuctionGearRunPolicy["phase"] {
  if (policy.phase === "done") return "done";
  const budgetReached = policy.searchTurns >= auctionQuickSearchTurns || now - policy.startedAt >= auctionQuickSearchDurationMs;
  return !searchComplete && (policy.kind === "full" || !budgetReached) ? "search" : canAssemble ? "assembly" : "done";
}
/** Time is checked between complete server turns; owned jobs are never aborted
 * merely because their native work outlasted the cooperative quick budget. */
export function advanceAuctionGearRunPolicy(policy: AuctionGearRunPolicy, result: AuctionGearSearchResult | AuctionGearAssemblyResult,
  options: { jobId: string; canAssemble: boolean; now?: number }): { policy: AuctionGearRunPolicy; next: "search" | "assembly" | null } {
  if (policy.phase === "done") return { policy, next: null };
  if (policy.lastCompletedJobId === options.jobId) return { policy, next: policy.phase };
  const next = { ...policy, lastCompletedJobId: options.jobId };
  if (result.kind === "search") {
    next.searchTurns++;
    next.phase = auctionGearSearchRunPhase(next, result.searchComplete, options.canAssemble, options.now);
  } else {
    next.assemblyTurns++;
    // Full may have been requested while recovering an already-owned quick
    // assembly. Finish that job, then honor the explicit search-first intent.
    next.phase = next.kind === "full" && policy.phase === "search" ? "search"
      : next.kind === "quick" || auctionGearAssemblyGoalComplete(result) ? "done" : "assembly";
  }
  return { policy: next, next: next.phase === "done" ? null : next.phase };
}
