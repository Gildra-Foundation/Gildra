import "server-only";
import type { AuctionEnhancementStageState, AuctionEnhancementStageResult } from "./auctionGearEnhancementStage";
import type { AuctionGearExhaustiveEnhancementState } from "./auctionGearExhaustiveEnhancements";
import { randomUUID } from "node:crypto";
import type { AuctionGearContext, AuctionGearRunMetadata } from "./auctionGearRunner";
import { restoreAuctionGearContext, snapshotAuctionGearContext } from "./auctionGearRunner";
import { auctionPersistenceEnabled, listAuctionStateHeaders, readAuctionState, removeAuctionState, touchAuctionState, writeAuctionState, writeAuctionStateAsync } from "./auctionGearPersistence";
import { getActiveAuctionGearJob } from "./auctionGearJobs";
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
  nextSearchPhase?: "discovery" | "simulation";
  nextAssemblyPhase?: "discovery" | "simulation";
  /** A migrated proof must bootstrap a new search before any saved assembly. */
  metadataRebuildRequired?: boolean;
  /** Refresh raw market exactly once; later bootstrap turns keep their cursor. */
  metadataMarketRefreshRequired?: boolean;
  enhancementState?: AuctionEnhancementStageState;
  enhancementPreview?: { leader: string; stage: AuctionEnhancementStageState; retryAt: number;
    result?: AuctionEnhancementStageResult; validUntil?: number };
  exhaustiveEnhancementState?: AuctionGearExhaustiveEnhancementState;
  /** Persisted logical order preserves recency when wall-clock timestamps tie. */
  recency: number;
  searchCheckpoint?: AuctionGearSearchCheckpoint;
  assemblyCheckpoint?: AuctionGearAssemblyCheckpoint;
  allowedKey?: string;
  latestSearchResult?: AuctionGearSearchResult & Partial<AuctionGearRunMetadata>;
  latestAssemblyResult?: AuctionGearAssemblyResult & AuctionGearRunMetadata;
  excludedOptionIds?: string[];
  excludedVariantKeys?: string[];
  knownVariantKeys?: Set<string>;
  /** Stable ownership validation includes previously discovered, now sold lots. */
  knownOptionIds: Set<string>;
  retainedSimulationCache?: AuctionGearSimulationCache;
  retainedBaseline?: GearPlanSimulation;
  retainedIncumbents?: AuctionGearIncumbent[];
};
const retention = 30 * 60_000;
type SearchMetadata = { owner: string; createdAt: number; touchedAt: number; recency: number };
type SearchIndex = SearchMetadata & { id: string; expiresAt: number };
const state = globalThis as typeof globalThis & {
  __gildraAuctionGearSearches?: Map<string, AuctionGearSearchEntry>;
  __gildraAuctionSearchIndex?: Map<string, SearchIndex>;
  __gildraAuctionPendingSearchRemovals?: Set<string>;
  __gildraAuctionSearchRecency?: number;
  __gildraAuctionGearReservations?: WeakMap<AuctionGearSearchEntry, number>;
  __gildraAuctionSearchesRestored?: boolean;
  __gildraAuctionSearchSaveQueues?: WeakMap<AuctionGearSearchEntry, SaveQueue>;
};
const entries = state.__gildraAuctionGearSearches ??= new Map<string, AuctionGearSearchEntry>();
const index = state.__gildraAuctionSearchIndex ??= new Map<string, SearchIndex>();
const pendingRemovals = state.__gildraAuctionPendingSearchRemovals ??= new Set<string>();
const reservations = state.__gildraAuctionGearReservations ??= new WeakMap<AuctionGearSearchEntry, number>();
type StoredEntry = Omit<AuctionGearSearchEntry, "context"> & { context: ReturnType<typeof snapshotAuctionGearContext> };
const metadata = (entry: SearchMetadata): SearchMetadata => ({ owner: entry.owner, createdAt: entry.createdAt, touchedAt: entry.touchedAt, recency: entry.recency });
const indexed = (entry: AuctionGearSearchEntry): SearchIndex => ({ ...metadata(entry), id: entry.id, expiresAt: entry.expiresAt });
function nextRecency() {
  state.__gildraAuctionSearchRecency = (state.__gildraAuctionSearchRecency ?? 0) + 1;
  return state.__gildraAuctionSearchRecency;
}
function active(record: SearchIndex) {
  const entry = entries.get(record.id);
  return Boolean(entry && (entry.busy || (reservations.get(entry) ?? 0) > 0)) || Boolean(getActiveAuctionGearJob(record.owner, record.id));
}
function validMetadata(value: SearchMetadata) {
  return value && typeof value.owner === "string" && Boolean(value.owner) && Number.isFinite(value.createdAt) &&
    Number.isFinite(value.touchedAt) && Number.isSafeInteger(value.recency) && value.recency > 0;
}
function restore() {
  if (state.__gildraAuctionSearchesRestored || !auctionPersistenceEnabled()) return;
  for (const record of listAuctionStateHeaders<SearchMetadata>("search").reverse()) {
    if (!validMetadata(record.metadata)) { removeAuctionState("search", record.id); continue; }
    index.set(record.id, { ...record.metadata, id: record.id, expiresAt: record.expiresAt });
    state.__gildraAuctionSearchRecency = Math.max(state.__gildraAuctionSearchRecency ?? 0, record.metadata.recency);
  }
  state.__gildraAuctionSearchesRestored = true;
}
function load(id: string) {
  const present = entries.get(id);
  if (present) return present;
  const record = readAuctionState<StoredEntry, SearchMetadata>("search", id);
  if (!record) { index.delete(id); return null; }
  const data = record.data;
  try {
    if (!data || data.id !== id || data.owner !== record.metadata.owner || data.expiresAt > record.expiresAt ||
        data.recency > record.metadata.recency || data.createdAt !== record.metadata.createdAt ||
        !(data.knownOptionIds instanceof Set)) throw new Error();
    const context = restoreAuctionGearContext(data.context);
    const reset = context.discovery !== data.context.discovery || (data.context.discovery?.socketMetadataRevision !== 3 && context.discovery?.socketMetadataRevision === 3) ||
      (data.context.discovery?.equippedReferenceRevision !== 1 && context.discovery?.equippedReferenceRevision === 1);
    // Preserve the user's selection, including formerly available lots. Rebuild
    // all results and cursors together when the underlying variant proof changed.
    const restored = reset ? {
      id: data.id, knownOptionIds: data.knownOptionIds, knownVariantKeys: data.knownVariantKeys,
      excludedOptionIds: data.excludedOptionIds, excludedVariantKeys: data.excludedVariantKeys,
      metadataRebuildRequired: true,
      metadataMarketRefreshRequired: true,
    } : data;
    const entry = { ...restored, ...record.metadata, expiresAt: record.expiresAt, context, busy: false };
    entries.set(id, entry);
    return entry;
  } catch { remove(id); return null; }
}
function storedEntry(entry: AuctionGearSearchEntry): StoredEntry {
  return {
    id: entry.id, owner: entry.owner, context: snapshotAuctionGearContext(entry.context),
    createdAt: entry.createdAt, touchedAt: entry.touchedAt, expiresAt: entry.expiresAt, busy: false, recency: entry.recency,
    nextSearchPhase: entry.nextSearchPhase, nextAssemblyPhase: entry.nextAssemblyPhase,
    metadataRebuildRequired: entry.metadataRebuildRequired,
    metadataMarketRefreshRequired: entry.metadataMarketRefreshRequired,
    enhancementState: entry.enhancementState, enhancementPreview: entry.enhancementPreview,
    exhaustiveEnhancementState: entry.exhaustiveEnhancementState,
    knownOptionIds: entry.knownOptionIds, searchCheckpoint: entry.searchCheckpoint,
    assemblyCheckpoint: entry.assemblyCheckpoint, allowedKey: entry.allowedKey,
    latestSearchResult: entry.latestSearchResult, latestAssemblyResult: entry.latestAssemblyResult,
    excludedOptionIds: entry.excludedOptionIds, excludedVariantKeys: entry.excludedVariantKeys, knownVariantKeys: entry.knownVariantKeys,
    retainedSimulationCache: entry.retainedSimulationCache,
    retainedBaseline: entry.retainedBaseline, retainedIncumbents: entry.retainedIncumbents,
  };
}
export function saveAuctionGearSearch(entry: AuctionGearSearchEntry, replaceId?: string) {
  if (!auctionPersistenceEnabled()) return;
  if (entries.get(entry.id) !== entry) throw new Error("search_expired");
  writeAuctionState("search", entry.id, entry.expiresAt, storedEntry(entry), { replaceId, metadata: metadata(entry) });
  const queue = saveQueues.get(entry);
  if (queue) queue.committedRevision = queue.revision;
}
type SaveQueue = { revision: number; committedRevision: number; running?: Promise<Error | undefined>; expedite?: () => void; error?: Error };
const saveQueues = state.__gildraAuctionSearchSaveQueues ??= new WeakMap<AuctionGearSearchEntry, SaveQueue>();
function refreshSearchLifecycle(entry: AuctionGearSearchEntry) {
  if (entries.get(entry.id) !== entry) throw new Error("search_expired");
  const now = Date.now();
  entry.touchedAt = now; entry.expiresAt = Math.max(entry.expiresAt, now + retention); entry.recency = nextRecency();
  entries.delete(entry.id); entries.set(entry.id, entry);
  index.delete(entry.id); index.set(entry.id, indexed(entry));
}
function consumeSaveError(queue: SaveQueue) {
  if (!queue.error) return;
  const error = queue.error; queue.error = undefined;
  throw error;
}
function startSearchSave(entry: AuctionGearSearchEntry, queue: SaveQueue) {
  if (queue.running || queue.revision === queue.committedRevision) return;
  const current = queue;
  // Cached catalog traversal also yields between batches. The bounded window
  // covers measured metadata/network turns; publication expedites this wait.
  // Cold native work still checkpoints during its much longer network calls.
  current.running = new Promise<void>(resolve => {
    const timer = setTimeout(resolve, 500);
    current.expedite = () => { clearTimeout(timer); resolve(); };
  }).then(async () => {
    current.expedite = undefined;
    while (current.revision > current.committedRevision && entries.get(entry.id) === entry) {
      const revision = current.revision;
      const committed = await writeAuctionStateAsync("search", entry.id, entry.expiresAt, storedEntry(entry), { metadata: metadata(entry) });
      if (committed) current.committedRevision = Math.max(current.committedRevision, revision);
    }
    return undefined;
  }).catch(error => {
    current.error = error instanceof Error ? error : new Error("auction_storage_unavailable");
    // Every waiter must observe the same failure, even if another waiter has
    // already consumed the retained background error before it resumes.
    return current.error;
  }).finally(() => {
    current.running = undefined;
    if (current.revision > current.committedRevision && !current.error && entries.get(entry.id) === entry) startSearchSave(entry, current);
  });
}
/** Mark a mutation. No cloning, compression or disk work occurs in this callback. */
export function scheduleAuctionGearSearchSave(entry: AuctionGearSearchEntry) {
  if (!auctionPersistenceEnabled()) return;
  refreshSearchLifecycle(entry);
  let queue = saveQueues.get(entry);
  if (!queue) { queue = { revision: 0, committedRevision: 0 }; saveQueues.set(entry, queue); }
  queue.revision++;
  consumeSaveError(queue);
  startSearchSave(entry, queue);
}
/** Await explicitly marked mutations without serializing a clean checkpoint.
 * Callers must schedule every mutation before using this publication barrier. */
export async function flushPendingAuctionGearSearch(entry: AuctionGearSearchEntry) {
  if (!auctionPersistenceEnabled()) return;
  if (entries.get(entry.id) !== entry) throw new Error("search_expired");
  const queue = saveQueues.get(entry);
  if (queue) {
    consumeSaveError(queue);
    startSearchSave(entry, queue);
    while (queue.running) {
      queue.expedite?.();
      const error = await queue.running;
      if (error) {
        if (queue.error === error) queue.error = undefined;
        throw error;
      }
    }
  }
  if (entries.get(entry.id) !== entry) throw new Error("search_expired");
}
/** Force a current snapshot, including direct mutations not explicitly marked. */
export async function flushAuctionGearSearch(entry: AuctionGearSearchEntry) {
  if (!auctionPersistenceEnabled()) return;
  const previous = saveQueues.get(entry);
  if (previous) consumeSaveError(previous);
  scheduleAuctionGearSearchSave(entry);
  await flushPendingAuctionGearSearch(entry);
}

function remove(id: string) {
  removeAuctionState("search", id);
  index.delete(id);
  return entries.delete(id);
}
function cleanup(now: number) {
  restore();
  // A committed replacement remains accepted if obsolete-file deletion has a
  // transient failure. Retry before allowing another replacement to accumulate.
  for (const id of pendingRemovals) {
    try { removeAuctionState("search", id); pendingRemovals.delete(id); }
    catch { /* Existing owned records remain readable during storage failure. */ }
  }
  for (const [id, record] of index) if (!active(record) && record.expiresAt <= now) remove(id);
}
/** Queued work owns its context until it is cancelled or its task settles. */
export function reserveAuctionGearSearch(entry: AuctionGearSearchEntry) {
  touchAuctionGearSearch(entry);
  reservations.set(entry, (reservations.get(entry) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const remaining = (reservations.get(entry) ?? 1) - 1;
    if (remaining) reservations.set(entry, remaining); else reservations.delete(entry);
  };
}
export function touchAuctionGearSearch(entry: AuctionGearSearchEntry) {
  const now = Date.now();
  cleanup(now);
  if (entries.get(entry.id) !== entry) throw new Error("search_expired");
  const expiresAt = Math.max(entry.expiresAt, now + retention), recency = nextRecency();
  touchAuctionState("search", entry.id, expiresAt, { touchedAt: now, recency });
  entry.touchedAt = now; entry.expiresAt = expiresAt; entry.recency = recency;
  entries.delete(entry.id); entries.set(entry.id, entry);
  index.delete(entry.id); index.set(entry.id, indexed(entry));
}
export function createAuctionGearSearch(owner: string, context: AuctionGearContext): AuctionGearSearchEntry {
  const now = Date.now();
  cleanup(now);
  if (pendingRemovals.size) throw new Error("auction_storage_unavailable");
  const owned = [...index.values()].filter(record => record.owner === owner);
  let replaced: SearchIndex | undefined;
  if (owned.length >= 3) {
    replaced = owned.find(record => !active(record));
    if (!replaced) throw new Error("search_capacity");
  }
  if (index.size >= 40) {
    replaced ??= [...index.values()].find(record => !active(record));
    if (!replaced) throw new Error("search_capacity");
  }
  const entry: AuctionGearSearchEntry = { id: randomUUID(), owner, context, createdAt: now, touchedAt: now, expiresAt: now + retention,
    busy: false, recency: nextRecency(), knownOptionIds: new Set(context.options.map(option => option.id)) };
  entries.set(entry.id, entry);
  try { saveAuctionGearSearch(entry, replaced?.id); }
  catch (error) { entries.delete(entry.id); throw error; }
  index.set(entry.id, indexed(entry));
  if (replaced) {
    try { remove(replaced.id); }
    catch {
      // The new durable file is the commit point. Keep only one obsolete disk
      // record pending; startup's header index also prunes it by logical order.
      entries.delete(replaced.id); index.delete(replaced.id); pendingRemovals.add(replaced.id);
    }
  }
  return entry;
}
export function getAuctionGearSearch(owner: string, id: string): AuctionGearSearchEntry | null {
  cleanup(Date.now());
  if (index.get(id)?.owner !== owner) return null;
  const entry = load(id);
  if (!entry) return null;
  touchAuctionGearSearch(entry);
  return entry;
}
export function deleteAuctionGearSearch(owner: string, id: string): boolean {
  cleanup(Date.now());
  if (index.get(id)?.owner !== owner) return false;
  remove(id);
  return true;
}
