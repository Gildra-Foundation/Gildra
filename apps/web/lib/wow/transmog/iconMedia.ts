import "server-only";
import { apiInternalUrl } from "@/lib/env";

/**
 * Icons the CDNs do not serve by name. Newer game icons are published by
 * Blizzard only under their file id (render.worldofwarcraft.com/…/7876617.jpg),
 * and the item media API names that file. Answers are kept per process.
 */
const ICON_TTL = 24 * 60 * 60_000;
const MISS_TTL = 30 * 60_000;
const LIMIT = 4096;
const cache = new Map<string, { url: string | null; expiresAt: number }>();
const inflight = new Map<string, Promise<string | null>>();
let oauth: { token: string; expiresAt: number } | null = null;

async function appToken(): Promise<string | null> {
  if (oauth && oauth.expiresAt > Date.now()) return oauth.token;
  const id = process.env.BATTLENET_CLIENT_ID, secret = process.env.BATTLENET_CLIENT_SECRET;
  if (!id || !secret) return null;
  const response = await fetch("https://oauth.battle.net/token", {
    method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;
  const result = await response.json() as { access_token?: string; expires_in?: number };
  if (!result.access_token) return null;
  oauth = { token: result.access_token, expiresAt: Date.now() + Math.max(60, (result.expires_in ?? 3600) - 300) * 1000 };
  return oauth.token;
}

async function itemIconUrl(itemId: number): Promise<string | null> {
  const token = await appToken();
  if (!token) return null;
  const response = await fetch(`https://eu.api.blizzard.com/data/wow/media/item/${itemId}?namespace=static-eu`, {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return null;
  const payload = await response.json() as { assets?: Array<{ key?: string; value?: string }> };
  const url = payload.assets?.find((asset) => asset.key === "icon")?.value;
  return url && /^https:\/\/render\.worldofwarcraft\.com\//.test(url) ? url : null;
}

/** First item of a transmog set, from the Gildra API: a set's icon is its first piece's. */
async function setFirstItem(setId: number): Promise<number | null> {
  const response = await fetch(`${apiInternalUrl()}/v1/wow/transmog/sets/${setId}?locale=en_US`, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
  if (!response.ok) return null;
  const detail = await response.json() as { items?: Array<{ itemId?: number }> };
  const id = detail.items?.find((item) => Number.isSafeInteger(item.itemId) && (item.itemId ?? 0) > 0)?.itemId;
  return id ?? null;
}

export async function transmogIconUrl(kind: "item" | "set", id: number): Promise<string | null> {
  const key = `${kind}:${id}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.url;
  let pending = inflight.get(key);
  if (!pending) {
    pending = (async () => {
      const itemId = kind === "item" ? id : await setFirstItem(id);
      return itemId ? itemIconUrl(itemId) : null;
    })().catch(() => null).then((url) => {
      cache.delete(key);
      cache.set(key, { url, expiresAt: Date.now() + (url ? ICON_TTL : MISS_TTL) });
      while (cache.size > LIMIT) cache.delete(cache.keys().next().value!);
      inflight.delete(key);
      return url;
    });
    inflight.set(key, pending);
  }
  return pending;
}
