import { apiInternalUrl } from "@/lib/env";

/**
 * The console's panel session: 200 with the user when signed in, 401 for a guest.
 * Reachable as /api/api-console/session and as /api-console/session — the second
 * is the one the console calls, because nginx sends /api/* on gildra.net to the Go
 * API and rewrites it into console pages on api.gildra.net.
 */
export async function GET(request: Request) {
  const api = apiInternalUrl();
  const cookie = request.headers.get("cookie") ?? "";
  const guest = () => Response.json({ user: null }, { status: 401, headers: { "Cache-Control": "no-store" } });

  try {
    const response = await fetch(`${api}/v1/auth/me`, {
      cache: "no-store",
      headers: cookie ? { cookie } : undefined,
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return guest();
    const body = await response.json() as { user?: unknown };
    if (!body?.user) return guest();
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return guest();
  }
}
