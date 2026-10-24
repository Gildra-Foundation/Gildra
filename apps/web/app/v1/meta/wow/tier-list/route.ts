import { apiInternalUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

const queryKeys = ["activity", "role", "limit", "selectionType", "selectionId", "addon", "keyType", "difficulty"];
const responseHeaders = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

/** Keep browser refreshes on the same runtime API as the server-rendered ratings.
 * Next's external rewrites capture their destination when the image is built. */
export async function GET(request: Request) {
  const upstream = new URL(`${apiInternalUrl()}/v1/meta/wow/tier-list`);
  const query = new URL(request.url).searchParams;
  for (const key of queryKeys) {
    const value = query.get(key);
    if (value !== null) upstream.searchParams.set(key, value);
  }
  try {
    const response = await fetch(upstream, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
    });
    const body: unknown = await response.json();
    const headers = new Headers(responseHeaders);
    const retryAfter = response.headers.get("retry-after");
    if (retryAfter) headers.set("Retry-After", retryAfter);
    return Response.json(body, { status: response.status, headers });
  } catch {
    return Response.json({ code: "tier_ranking_unavailable" }, { status: 503, headers: responseHeaders });
  }
}
