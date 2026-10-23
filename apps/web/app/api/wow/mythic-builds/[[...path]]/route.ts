import { auth, isBattleNetAuthConfigured } from "@/auth";
import { apiInternalUrl } from "@/lib/env";
import { readBuildBody, sameBuildOrigin, validBuildPath, validateBuildBody } from "@/lib/wow/mythicBuildsProxy";

export const dynamic = "force-dynamic";
const headers = { "Content-Type": "application/json", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Vary": "Cookie" };
function reply(code: string, status: number) { return Response.json({ code }, { status, headers }); }
async function proxy(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  if (!validBuildPath(request.method, path)) return reply("not_found", 404);
  if (request.method !== "GET" && !sameBuildOrigin(request, process.env.SITE_PUBLIC_ORIGIN ?? new URL(request.url).origin)) return reply("cross_site_blocked", 403);
  const session = isBattleNetAuthConfigured ? await auth() : null;
  if (!session?.battleNetAccessToken) return reply("session_expired", 401);
  const accountKey = request.headers.get("x-mythic-account") ?? "";
  if (request.method !== "GET" && !/^[0-9a-f]{64}$/.test(accountKey)) return reply("account_changed", 409);
  let body: string | undefined;
  if (request.method !== "GET") {
    try { body = JSON.stringify(validateBuildBody(request.method, await readBuildBody(request))); }
    catch (error) { return reply(error instanceof Error && error.message === "large" ? "payload_too_large" : "invalid", error instanceof Error && error.message === "large" ? 413 : 400); }
  }
  try {
    const upstream = await fetch(`${apiInternalUrl()}/v1/wow/mythic-builds${path.length ? `/${path.join("/")}` : ""}`, {
      method: request.method, cache: "no-store", signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${session.battleNetAccessToken}`, "X-BattleNet-Region": (process.env.BATTLENET_REGION ?? "eu").toLowerCase(), "X-Mythic-Account": accountKey, ...(body ? { "Content-Type": "application/json" } : {}) }, body,
    });
    const payload: unknown = await upstream.json().catch(() => null);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return reply("unavailable", 503);
    return Response.json({ ...payload, accountName: session.user?.name?.slice(0, 128) ?? null }, { status: upstream.status, headers });
  } catch { return reply("unavailable", 503); }
}
export const GET = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const POST = proxy;
