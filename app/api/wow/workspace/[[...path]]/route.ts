import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

const allowedKinds = new Set(["talent-builds", "rotation-studio", "trainer-settings", "gear-owned", "character-settings"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    return Boolean(host) && new URL(origin).host === host;
  } catch { return false; }
}

function reply(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

async function proxy(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  if (request.method !== "GET" && !sameOrigin(request)) return reply({ code: "cross_site_blocked" }, 403);
  const session = await auth();
  if (!session?.battleNetAccessToken) return reply({ code: "session_expired" }, 401);
  const { path = [] } = await context.params;
  const documentPath = path.length === 1 && allowedKinds.has(path[0]);
  const migrationPath = path.length === 1 && path[0] === "migrate";
  const historyPath = path.length === 1 && path[0] === "history";
  const shareCreatePath = path.length === 3 && path[0] === "history" && uuidPattern.test(path[1]) && path[2] === "share";
  const shareRevokePath = path.length === 2 && path[0] === "shares" && uuidPattern.test(path[1]);
  const rootList = path.length === 0 && request.method === "GET";
  const allowed = rootList
    || (documentPath && (request.method === "PUT" || request.method === "DELETE"))
    || (migrationPath && request.method === "POST")
    || (historyPath && (request.method === "GET" || request.method === "POST"))
    || (shareCreatePath && request.method === "POST")
    || (shareRevokePath && request.method === "DELETE");
  if (!allowed) return reply({ code: "workspace_path_not_found" }, 404);

  const upstreamBase = (process.env.API_INTERNAL_URL ?? "http://api:8080").replace(/\/$/, "");
  const upstreamURL = new URL(`${upstreamBase}/v1/wow/workspace${path.length ? `/${path.join("/")}` : ""}`);
  const sourceURL = new URL(request.url);
  for (const key of ["character", "specialization", "fingerprint"]) {
    const value = sourceURL.searchParams.get(key);
    if (value) upstreamURL.searchParams.set(key, value);
  }
  const body = request.method === "GET" ? undefined : await request.text();
  if (body && new TextEncoder().encode(body).byteLength > 300 * 1024) return reply({ code: "payload_too_large" }, 413);
  try {
    const response = await fetch(upstreamURL, {
      method: request.method,
      headers: {
        Authorization: `Bearer ${session.battleNetAccessToken}`,
        "X-BattleNet-Region": (process.env.BATTLENET_REGION ?? "eu").toLowerCase(),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const text = await response.text();
    return new NextResponse(text || null, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") ?? "application/json", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return reply({ code: "workspace_unavailable" }, 503);
  }
}

export const GET = proxy;
export const PUT = proxy;
export const POST = proxy;
export const DELETE = proxy;
