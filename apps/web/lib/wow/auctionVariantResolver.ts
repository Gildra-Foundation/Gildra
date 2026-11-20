import "server-only";
import { auctionVariantChange, auctionVariantKey, type ResolvedAuctionVariant } from "./auctionItemVariant";
import type { AuctionOffer } from "./auctionMarket";
type VariantResolutionInput = {
  offers: Array<{
    offer: AuctionOffer;
    slot: string;
  }>;
  batchLimit?: 16 | 64;
  parallelBatches?: boolean;
  spec: string;
  characterLevel: number;
  signal: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
};

export async function resolveAuctionVariants(input: VariantResolutionInput) {
  const unique = [...new Map(input.offers.map(v => [auctionVariantKey(v.offer), v])).values()];
  if (!input.parallelBatches || input.batchLimit !== 64 || unique.length <= 64) return resolveVariantPages(input, unique);
  // Each worker request owns its own response validation and legacy fallback.
  // Publish progress only after both pages agree on the native engine.
  const controller = new AbortController();
  const signal = AbortSignal.any([input.signal, controller.signal]);
  const variants = new Map<string, ResolvedAuctionVariant>();
  let engine = "";
  let batchLimit: 16 | 64 = 64;
  try {
    for (let offset = 0; offset < unique.length; offset += 128) {
      const pages = [unique.slice(offset, offset + 64), unique.slice(offset + 64, offset + 128)].filter(page => page.length);
      const requests = pages.map(page => resolveVariantPages({ ...input, signal, batchLimit, onProgress: undefined }, page));
      const results = await Promise.all(requests);
      for (const result of results) {
        if (engine && result.engine && engine !== result.engine) throw new Error("simulation_version_changed");
        engine ||= result.engine;
        if (result.batchLimit === 16) batchLimit = 16;
        for (const [key, item] of result.variants) variants.set(key, item);
      }
      input.onProgress?.(variants.size, unique.length);
    }
    return { engine, batchLimit, variants };
  } finally {
    controller.abort();
  }
}

async function resolveVariantPages(input: VariantResolutionInput, unique: VariantResolutionInput["offers"]) {
  const resolved = new Map<string, ResolvedAuctionVariant>();
  let engine = "";
  let batchLimit = input.batchLimit ?? 16;
  let advertisedLimit: 16 | 64 = 16;
  for (let offset = 0; offset < unique.length;) {
    input.signal.throwIfAborted();
    const variants = unique.slice(offset, offset + batchLimit).map(v => ({
      key: auctionVariantKey(v.offer),
      change: auctionVariantChange(v.offer, v.slot)
    }));
    const signal = AbortSignal.any([input.signal, AbortSignal.timeout(65000)]);
    const request = () => fetch(`${(process.env.ROTATION_WORKER_URL ?? "http://127.0.0.1:58082").replace(/\/$/, "")}/v1/wow/gear/variants`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      cache: "no-store",
      signal,
      body: JSON.stringify({
        spec: input.spec,
        characterLevel: input.characterLevel,
        variants
      })
    });
    // A dropped connection can leave this read-only lookup without a response.
    // Keep the second attempt under the same deadline as the first.
    const response = await request().catch((error: unknown) => {
      signal.throwIfAborted();
      if (!(error instanceof TypeError) || error.message !== "fetch failed") throw error;
      return request();
    });
    const payload = (await response.json()) as {
      engine?: string;
      variants?: ResolvedAuctionVariant[];
      code?: string;
    };
    if (variants.length > 16 && response.status === 400 && payload.code === "invalid_variant_request") {
      batchLimit = 16;
      continue;
    }
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
    advertisedLimit = response.headers.get("x-gildra-variant-batch-limit") === "64" ? 64 : 16;
    batchLimit = Math.min(batchLimit, advertisedLimit) as 16 | 64;
    offset += variants.length;
    input.onProgress?.(offset, unique.length);
  }
  return {
    engine,
    batchLimit: advertisedLimit,
    variants: resolved
  };
}
