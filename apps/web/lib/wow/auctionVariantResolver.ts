import "server-only";
import { auctionVariantChange, auctionVariantKey, type ResolvedAuctionVariant } from "./auctionItemVariant";
import type { AuctionOffer } from "./auctionMarket";
export async function resolveAuctionVariants(input: {
  offers: Array<{
    offer: AuctionOffer;
    slot: string;
  }>;
  spec: string;
  characterLevel: number;
  signal: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
}) {
  const unique = [...new Map(input.offers.map(v => [auctionVariantKey(v.offer), v])).values()];
  const resolved = new Map<string, ResolvedAuctionVariant>();
  let engine = "";
  for (let offset = 0; offset < unique.length; offset += 16) {
    input.signal.throwIfAborted();
    const variants = unique.slice(offset, offset + 16).map(v => ({
      key: auctionVariantKey(v.offer),
      change: auctionVariantChange(v.offer, v.slot)
    }));
    const response = await fetch(`${(process.env.ROTATION_WORKER_URL ?? "http://127.0.0.1:58082").replace(/\/$/, "")}/v1/wow/gear/variants`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      cache: "no-store",
      signal: AbortSignal.any([input.signal, AbortSignal.timeout(65000)]),
      body: JSON.stringify({
        spec: input.spec,
        characterLevel: input.characterLevel,
        variants
      })
    });
    const payload = (await response.json()) as {
      engine?: string;
      variants?: ResolvedAuctionVariant[];
      code?: string;
    };
    if (!response.ok || response.headers.get("x-gildra-engine") !== "simulationcraft") throw new Error(payload.code === "variant_metadata_worker_upgrade_required" ? payload.code : "variant_resolution_unavailable");
    if (!Array.isArray(payload.variants) || payload.variants.length !== variants.length) throw new Error("invalid_variant_resolution");
    const expected = new Map(variants.map(v => [v.key, v.change.itemId]));
    const seen = new Set<string>();
    for (const item of payload.variants) {
      if (expected.get(item.key) !== item.itemId || seen.has(item.key)) throw new Error("invalid_variant_resolution");
      seen.add(item.key);
      resolved.set(item.key, item);
    }
    if (payload.engine) {
      if (!payload.engine.startsWith("SimulationCraft") || engine && engine !== payload.engine) throw new Error("simulation_version_changed");
      engine = payload.engine;
    }
    input.onProgress?.(Math.min(offset + 16, unique.length), unique.length);
  }
  return {
    engine,
    variants: resolved
  };
}
