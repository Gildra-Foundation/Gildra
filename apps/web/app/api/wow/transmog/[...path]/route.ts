import { NextResponse } from "next/server";
import { apiInternalUrl } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Allowed paths: appearances, sets, sets/{id}. */
const ALLOWED = /^(appearances|sets|sets\/\d{1,9})$/;
const PARAMS = new Set(["slot", "q", "armor", "locale", "cursor", "limit", "ids", "class"]);

/**
 * Same-origin door to /v1/wow/transmog/* for the studio in the browser: the
 * Go API is only on the internal network. Only known paths and query keys pass.
 */
export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const path = (await context.params).path.join("/");
  if (!ALLOWED.test(path)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const incoming = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of incoming) if (PARAMS.has(key) && value.length <= 400) query.set(key, value);
  let upstream: Response;
  try {
    upstream = await fetch(`${apiInternalUrl()}/v1/wow/transmog/${path}?${query}`, { cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(45_000)]) });
  } catch {
    return NextResponse.json({ error: "upstream_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
      "Cache-Control": upstream.ok ? (upstream.headers.get("Cache-Control") ?? "public, max-age=600") : "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
