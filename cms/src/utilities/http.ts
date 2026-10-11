import type { PayloadRequest } from "payload";

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
}

export async function readJson(req: PayloadRequest): Promise<Record<string, unknown>> {
  try {
    const body = typeof req.json === "function" ? await req.json() : undefined;
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function clientKey(req: PayloadRequest): string {
  const forwarded = req.headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers?.get("x-real-ip") || "local";
}

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

/**
 * Small fixed-window limiter for unauthenticated member endpoints. Process
 * local by design (single CMS instance); the reverse proxy should add its own.
 */
export function rateLimited(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
      if (buckets.size >= MAX_BUCKETS) buckets.delete(buckets.keys().next().value!);
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit;
}

export function resetRateLimits(): void {
  buckets.clear();
}

export const LOCALES = ["en", "ru"] as const;
export type Locale = (typeof LOCALES)[number];

export function parseLocale(value: unknown): Locale {
  return value === "ru" ? "ru" : "en";
}
