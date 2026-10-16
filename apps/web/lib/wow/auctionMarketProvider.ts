import "server-only";
import { createHash } from "node:crypto";
import { assertFreshMarket, parseAuctionOffers, type AuctionSnapshot } from "./auctionMarket";
import type { BattleNetCharacter } from "./battleNetCharacters";
type Entry = {
  value?: AuctionSnapshot;
  checkedAt: number;
  pending?: Promise<AuctionSnapshot>;
};
const globalState = globalThis as typeof globalThis & {
  __gildraAuctionMarkets?: Map<string, Entry>;
};
const markets = globalState.__gildraAuctionMarkets ??= new Map<string, Entry>();
/** The upstream request is shared; cancelling one waiter must not cancel others. */
function awaitMarket(pending: Promise<AuctionSnapshot>, signal?: AbortSignal) {
  if (!signal) return pending;
  return new Promise<AuctionSnapshot>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", aborted);
    const aborted = () => { cleanup(); reject(signal.reason); };
    signal.addEventListener("abort", aborted, { once: true });
    // Both handlers remain attached after cancellation, so an abandoned shared
    // request cannot produce an unhandled rejection when its timeout expires.
    pending.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    if (signal.aborted) aborted();
  });
}
async function readJSON(response: Response) {
  if (!response.ok) throw new Error(response.status === 429 ? "market_rate_limited" : "market_unavailable");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("invalid_market_response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const {
      value,
      done
    } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 64 * 1024 * 1024) {
      await reader.cancel();
      throw new Error("market_response_too_large");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}
export async function getCharacterAuctionMarket(character: BattleNetCharacter, accessToken: string, options: { refresh?: boolean; signal?: AbortSignal } = {}) {
  options.signal?.throwIfAborted();
  if (!["eu", "us", "kr", "tw"].includes(character.region)) throw new Error("market_region_unsupported");
  const root = `https://${character.region}.api.blizzard.com`;
  const namespace = `dynamic-${character.region}`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json"
  };
  const realmResponse = await fetch(`${root}/data/wow/realm/${encodeURIComponent(character.realm.slug)}?namespace=${namespace}`, {
    headers,
    cache: "no-store",
    signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000)
  });
  const realm = (await readJSON(realmResponse)) as {
    connected_realm?: {
      href?: string;
    };
  };
  const href = realm.connected_realm?.href;
  options.signal?.throwIfAborted();
  if (!href) throw new Error("connected_realm_unresolved");
  const connected = new URL(href);
  const match = connected.pathname.match(/^\/data\/wow\/connected-realm\/(\d+)$/);
  if (connected.origin !== root || !match) throw new Error("connected_realm_unresolved");
  const connectedRealmId = Number(match[1]);
  const key = `${character.region}:${connectedRealmId}`;
  const existing = markets.get(key);
  if (existing?.pending) return awaitMarket(existing.pending, options.signal);
  if (!options.refresh && existing?.value && Date.now() - existing.checkedAt < 5 * 60_000) {
    assertFreshMarket(existing.value);
    return existing.value;
  }
  if (!existing && [...markets.values()].filter(e => e.pending).length >= 4) throw new Error("market_busy");
  const entry: Entry = existing ?? {
    checkedAt: 0
  };
  const pending = (async () => {
    const response = await fetch(`${root}/data/wow/connected-realm/${connectedRealmId}/auctions?namespace=${namespace}`, {
      headers: {
        ...headers,
        ...(entry.value ? {
          "If-Modified-Since": entry.value.sourceUpdatedAt
        } : {})
      },
      cache: "no-store",
      signal: AbortSignal.timeout(30000)
    });
    if (response.status === 304 && entry.value) {
      assertFreshMarket(entry.value);
      entry.checkedAt = Date.now();
      return entry.value;
    }
    const payload = await readJSON(response);
    const sourceUpdatedAt = response.headers.get("last-modified") ?? "";
    assertFreshMarket({
      sourceUpdatedAt
    });
    const offers = parseAuctionOffers(payload);
    const value: AuctionSnapshot = {
      id: createHash("sha256").update(JSON.stringify([key, sourceUpdatedAt, offers])).digest("hex"),
      region: character.region,
      connectedRealmId,
      sourceUpdatedAt,
      fetchedAt: new Date().toISOString(),
      offers
    };
    entry.value = value;
    entry.checkedAt = Date.now();
    return value;
  })();
  entry.pending = pending;
  const settled = () => { if (entry.pending === pending) delete entry.pending; };
  // Cleanup belongs to the request, not a waiter that may cancel sooner.
  void pending.then(settled, settled);
  markets.set(key, entry);
  while (markets.size > 4) {
    const evict = [...markets].find(([id, e]) => id !== key && !e.pending)?.[0];
    if (!evict) break;
    markets.delete(evict);
  }
  return awaitMarket(pending, options.signal);
}
