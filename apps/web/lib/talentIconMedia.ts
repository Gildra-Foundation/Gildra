import "server-only";

/**
 * Icon of a talent spell from Blizzard's spell media (/data/wow/media/spell/<id>). Newer icons live on the
 * render CDN only under their file id, so a node whose icon name is refused falls back to this. Answers are
 * kept per process (a day; misses half an hour).
 */
const ICON_TTL = 24 * 60 * 60_000;
const MISS_TTL = 30 * 60_000;
const LIMIT = 2048;
const cache = new Map<number, { url: string | null; expiresAt: number }>();
const inflight = new Map<number, Promise<string | null>>();
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

async function fetchSpellIcon(spellId: number): Promise<string | null> {
  const token = await appToken();
  if (!token) return null;
  const response = await fetch(`https://us.api.blizzard.com/data/wow/media/spell/${spellId}?namespace=static-us`, {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return null;
  const payload = await response.json() as { assets?: Array<{ key?: string; value?: string }> };
  const url = payload.assets?.find((asset) => asset.key === "icon")?.value;
  return url && /^https:\/\/render\.worldofwarcraft\.com\//.test(url) ? url : null;
}

export function talentSpellIconUrl(spellId: number): Promise<string | null> {
  const hit = cache.get(spellId);
  if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.url);
  let pending = inflight.get(spellId);
  if (!pending) {
    pending = fetchSpellIcon(spellId).catch(() => null).then((url) => {
      cache.delete(spellId);
      cache.set(spellId, { url, expiresAt: Date.now() + (url ? ICON_TTL : MISS_TTL) });
      while (cache.size > LIMIT) cache.delete(cache.keys().next().value!);
      inflight.delete(spellId);
      return url;
    });
    inflight.set(spellId, pending);
  }
  return pending;
}
