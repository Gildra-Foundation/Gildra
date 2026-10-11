// Shared CMS contract, mirrored in riftden-platform/apps/lol/src/lib/cms; keep both copies identical.
/**
 * Receiver side of the CMS `revalidateSite` job (cms/src/jobs/revalidateSite.ts):
 *
 *   POST <site>/api/cms/revalidate
 *   x-gildra-timestamp: <unix seconds>
 *   x-gildra-signature: sha256=<hex HMAC-SHA256(secret, "<timestamp>.<raw body>")>
 *   body: {"action":"change|unpublish|delete","collection":"guides|pages|…","id":"…",
 *          "previousSlug":null|"…","site":"<slug>","slug":null|"…"}
 *
 * Pure functions (no Next imports) so the protocol is unit-testable.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const MAX_BODY_BYTES = 16 * 1024;
export const MAX_SKEW_SECONDS = 300;

/** Cache tags shared by the fetchers (lib/cms/client) and this receiver. */
export const cmsTags = {
  articles: (site: string) => `cms:${site}:articles`,
  article: (site: string, slug: string) => `cms:${site}:article:${slug}`,
  pages: (site: string) => `cms:${site}:pages`,
  page: (site: string, slug: string) => `cms:${site}:page:${slug}`,
  settings: (site: string) => `cms:${site}:settings`,
  taxonomy: (site: string) => `cms:${site}:taxonomy`,
};

export type RevalidationAction = "change" | "unpublish" | "delete";
export type RevalidationBody = {
  action: RevalidationAction;
  collection: string;
  id: string;
  previousSlug: string | null;
  site: string;
  slug: string | null;
};

/** `max` = stale-while-revalidate; `expire` = gone now (Next: `{ expire: 0 }`). */
export type TagPlan = { tag: string; mode: "max" | "expire" }[];

const SLUG = /^[a-z0-9][a-z0-9/-]{0,159}$/;
const ACTIONS = new Set(["change", "unpublish", "delete"]);
const COLLECTIONS = new Set(["guides", "pages", "categories", "tags", "site-settings"]);

/** Remembers accepted signatures for the skew window so a captured request cannot be replayed. */
export function createReplayGuard(windowSeconds = MAX_SKEW_SECONDS, maxEntries = 5000) {
  const seen = new Map<string, number>();
  return {
    /** True the first time a signature is seen inside the window. */
    accept(signature: string, nowSeconds: number): boolean {
      for (const [sig, expires] of seen) if (expires < nowSeconds) seen.delete(sig);
      if (seen.has(signature)) return false;
      if (seen.size >= maxEntries) seen.delete(seen.keys().next().value!);
      seen.set(signature, nowSeconds + windowSeconds * 2);
      return true;
    },
  };
}
export type ReplayGuard = ReturnType<typeof createReplayGuard>;

export type VerifyResult =
  | { ok: true; body: RevalidationBody }
  | { ok: false; status: 400 | 401 | 403 | 409 | 413 | 503; reason: string };

export function verifyRevalidation(input: {
  secret: string | undefined;
  site: string;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
  nowSeconds: number;
  replay: ReplayGuard;
}): VerifyResult {
  if (!input.secret) return { ok: false, status: 503, reason: "not-configured" };
  if (Buffer.byteLength(input.rawBody, "utf8") > MAX_BODY_BYTES) return { ok: false, status: 413, reason: "too-large" };
  const ts = input.timestamp ?? "";
  if (!/^\d{1,12}$/.test(ts) || Math.abs(input.nowSeconds - Number(ts)) > MAX_SKEW_SECONDS) {
    return { ok: false, status: 401, reason: "stale-or-missing-timestamp" };
  }
  const header = input.signature ?? "";
  if (!/^sha256=[0-9a-f]{64}$/.test(header)) return { ok: false, status: 401, reason: "bad-signature" };
  const expected = createHmac("sha256", input.secret).update(`${ts}.${input.rawBody}`).digest();
  const given = Buffer.from(header.slice(7), "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, status: 401, reason: "bad-signature" };

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(input.rawBody);
  } catch {
    return { ok: false, status: 400, reason: "invalid-json" };
  }
  if (!parsed || typeof parsed !== "object") return { ok: false, status: 400, reason: "invalid-json" };
  if (parsed.site !== input.site) return { ok: false, status: 403, reason: "wrong-site" };
  if (!ACTIONS.has(String(parsed.action)) || !COLLECTIONS.has(String(parsed.collection))) {
    return { ok: false, status: 400, reason: "unsupported" };
  }
  const slug = parsed.slug ?? null;
  const previousSlug = parsed.previousSlug ?? null;
  for (const value of [slug, previousSlug]) {
    if (value !== null && (typeof value !== "string" || !SLUG.test(value))) return { ok: false, status: 400, reason: "bad-slug" };
  }
  // Only after the signature is valid: a replay of an accepted request is refused.
  if (!input.replay.accept(header, input.nowSeconds)) return { ok: false, status: 409, reason: "replayed" };
  return {
    ok: true,
    body: {
      action: parsed.action as RevalidationAction,
      collection: String(parsed.collection),
      id: String(parsed.id ?? ""),
      previousSlug: previousSlug as string | null,
      site: input.site,
      slug: slug as string | null,
    },
  };
}

/**
 * Tags to invalidate. Removals (unpublish/delete) and renamed slugs expire
 * immediately so a removed article is never served stale; edits use
 * stale-while-revalidate.
 */
export function planInvalidation(body: RevalidationBody): TagPlan {
  const removed = body.action !== "change";
  const mode = removed ? "expire" : "max";
  const site = body.site;
  const plan: TagPlan = [];
  const add = (tag: string, m: "max" | "expire" = mode) => {
    if (!plan.some((p) => p.tag === tag && p.mode === m)) plan.push({ tag, mode: m });
  };
  switch (body.collection) {
    case "guides":
      add(cmsTags.articles(site));
      if (body.slug) add(cmsTags.article(site, body.slug));
      if (body.previousSlug && body.previousSlug !== body.slug) add(cmsTags.article(site, body.previousSlug), "expire");
      break;
    case "pages":
      add(cmsTags.pages(site));
      if (body.slug) add(cmsTags.page(site, body.slug));
      if (body.previousSlug && body.previousSlug !== body.slug) add(cmsTags.page(site, body.previousSlug), "expire");
      break;
    case "categories":
    case "tags":
      add(cmsTags.taxonomy(site));
      add(cmsTags.articles(site));
      break;
    case "site-settings":
      add(cmsTags.settings(site));
      break;
  }
  return plan;
}
