import type { Catalog, ContentContext, Edition, ModulePayloads, PublishedContent } from "./types";

type FetchJSON = (url: string) => Promise<unknown>;
export class PublicationNotFound extends Error {}
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sameContext = (value: unknown, expected: ContentContext) => object(value) && Object.entries(expected).every(([field, item]) => value[field] === item);

function validateCatalog(value: unknown, edition: Edition): Catalog {
  if (!object(value) || value.schemaVersion !== 1 || typeof value.releaseId !== "string" || !uuid.test(value.releaseId)
    || !Number.isSafeInteger(value.generation) || Number(value.generation) < 1 || !object(value.modules)
    || !object(value.context) || value.context.game !== "wow" || value.context.edition !== edition
    || value.context.channel !== "live" || value.context.region !== "global" || value.context.progressionKind !== "none" || value.context.progressionId !== null) {
    throw new Error("Incompatible game content catalog");
  }
  return value as Catalog;
}

function validatePayload<K extends keyof ModulePayloads>(value: unknown, kind: K, edition: Edition): ModulePayloads[K] {
  if (!object(value) || value.edition !== edition || !object(value.catalog) || !object(value.catalog.season)) throw new Error("Invalid content payload");
  if (kind === "raids") {
    if (!Array.isArray(value.catalog.entries) || !value.catalog.entries.length || !object(value.legacyRaids) || !object(value.manifest) || !Array.isArray(value.venomousBosses) || !object(value.strategies) || !object(value.venomousIntel) || !Array.isArray(value.difficulties) || !Array.isArray(value.reviews) || !Array.isArray(value.spellIdentities)) throw new Error("Incomplete raid projection");
  } else {
    if (!object(value.dungeons) || !Object.keys(value.dungeons).length || !object(value.combatIntel) || !object(value.verification)) throw new Error("Incomplete dungeon projection");
    const dungeons = value.dungeons;
    const order = value.catalog.dungeonOrder;
    if (!Array.isArray(order) || order.length !== Object.keys(dungeons).length || new Set(order).size !== order.length || order.some((slug) => typeof slug !== "string" || !Object.hasOwn(dungeons, slug))) throw new Error("Invalid dungeon order");
    for (const [slug, dungeon] of Object.entries(value.dungeons)) {
      if (!object(dungeon) || dungeon.slug !== slug || !Number.isSafeInteger(dungeon.timerSeconds) || Number(dungeon.timerSeconds) < 1 || !Number.isSafeInteger(dungeon.bossCount) || Number(dungeon.bossCount) < 1 || !object(value.combatIntel[slug])) throw new Error("Invalid dungeon projection");
    }
  }
  return value as ModulePayloads[K];
}

/** The fallback stores a whole previously read release/module pair. A failed
 * fetch never mixes a new catalog with a module from another release/edition. */
export function createGameContentReader(baseURL: string, fetchJSON: FetchJSON) {
  const base = new URL(baseURL);
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error("Invalid game content API URL");
  const lastGood = new Map<string, PublishedContent<keyof ModulePayloads>>();
  return async function read<K extends keyof ModulePayloads>(edition: Edition, kind: K): Promise<PublishedContent<K>> {
    const key = `${edition}/${kind}`;
    try {
      const release = validateCatalog(await fetchJSON(new URL(`/v1/game-content/wow/${edition}/catalog`, base).href), edition);
      const cached = lastGood.get(key);
      if (cached?.release.releaseId === release.releaseId && cached.release.modules[kind] === release.modules[kind]) {
        const result = { release, payload: cached.payload, stale: false } as PublishedContent<K>;
        lastGood.set(key, result);
        return result;
      }
      const snapshot = await fetchJSON(new URL(`/v1/game-content/releases/${release.releaseId}/${kind}`, base).href);
      if (!object(snapshot) || snapshot.schemaVersion !== 1 || snapshot.releaseId !== release.releaseId || snapshot.snapshotId !== release.modules[kind]
        || snapshot.moduleId !== kind || !sameContext(snapshot.context, release.context)) throw new Error("Snapshot does not belong to the pinned release");
      const payload = validatePayload(snapshot.payload, kind, edition);
      const result: PublishedContent<K> = { release, payload, stale: false };
      lastGood.set(key, result);
      return result;
    } catch (error) {
      // A successful authoritative 404 can revoke a publication. It must not
      // be treated as an outage and keep showing a formerly public version.
      if (error instanceof PublicationNotFound) { lastGood.delete(key); throw error; }
      const previous = lastGood.get(key);
      if (previous) return { ...previous, stale: true } as PublishedContent<K>;
      throw error;
    }
  };
}
