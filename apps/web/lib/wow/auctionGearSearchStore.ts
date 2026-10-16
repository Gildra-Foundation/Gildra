import "server-only";
import { randomUUID } from "node:crypto";
import type { AuctionGearContext, AuctionGearRunMetadata } from "./auctionGearRunner";
import type { AuctionGearAssemblyCheckpoint, AuctionGearAssemblyResult, AuctionGearIncumbent, AuctionGearSearchCheckpoint, AuctionGearSearchResult, AuctionGearSimulationCache, GearPlanSimulation } from "./auctionGearTypes";

/** Private server state. Never serialize an entry or its context into an HTTP response. */
export type AuctionGearSearchEntry = {
  id: string;
  owner: string;
  context: AuctionGearContext;
  createdAt: number;
  touchedAt: number;
  expiresAt: number;
  busy: boolean;
  searchCheckpoint?: AuctionGearSearchCheckpoint;
  assemblyCheckpoint?: AuctionGearAssemblyCheckpoint;
  allowedKey?: string;
  latestSearchResult?: AuctionGearSearchResult & Partial<AuctionGearRunMetadata>;
  latestAssemblyResult?: AuctionGearAssemblyResult & AuctionGearRunMetadata;
  excludedOptionIds?: string[];
  /** Stable ownership validation includes previously discovered, now sold lots. */
  knownOptionIds: Set<string>;
  retainedSimulationCache?: AuctionGearSimulationCache;
  retainedBaseline?: GearPlanSimulation;
  retainedIncumbents?: AuctionGearIncumbent[];
};
const retention = 30 * 60_000;
const state = globalThis as typeof globalThis & { __gildraAuctionGearSearches?: Map<string, AuctionGearSearchEntry> };
const entries = state.__gildraAuctionGearSearches ??= new Map<string, AuctionGearSearchEntry>();

function cleanup(now: number) {
  for (const [id, entry] of entries) if (!entry.busy && entry.expiresAt <= now) entries.delete(id);
}

export function touchAuctionGearSearch(entry: AuctionGearSearchEntry) {
  const now = Date.now();
  cleanup(now);
  if (entries.get(entry.id) !== entry) throw new Error("search_expired");
  entry.touchedAt = now;
  entry.expiresAt = now + retention;
  // Map order records recency even when several accesses share a millisecond.
  entries.delete(entry.id);
  entries.set(entry.id, entry);
}

export function createAuctionGearSearch(owner: string, context: AuctionGearContext): AuctionGearSearchEntry {
  const now = Date.now();
  cleanup(now);
  const owned = [...entries.values()].filter(entry => entry.owner === owner);
  if (owned.length >= 3) {
    const oldest = owned.find(entry => !entry.busy);
    if (!oldest) throw new Error("search_capacity");
    entries.delete(oldest.id);
  }
  if (entries.size >= 40) {
    const oldest = [...entries.values()].find(entry => !entry.busy);
    if (!oldest) throw new Error("search_capacity");
    entries.delete(oldest.id);
  }
  const entry: AuctionGearSearchEntry = { id: randomUUID(), owner, context, createdAt: now, touchedAt: now, expiresAt: now + retention,
    busy: false, knownOptionIds: new Set(context.options.map(option => option.id)) };
  entries.set(entry.id, entry);
  return entry;
}

export function getAuctionGearSearch(owner: string, id: string): AuctionGearSearchEntry | null {
  cleanup(Date.now());
  const entry = entries.get(id);
  if (!entry || entry.owner !== owner) return null;
  touchAuctionGearSearch(entry);
  return entry;
}

export function deleteAuctionGearSearch(owner: string, id: string): boolean {
  cleanup(Date.now());
  const entry = entries.get(id);
  return entry?.owner === owner ? entries.delete(id) : false;
}
