import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { runGearFarmPlan } from "@/lib/wow/gearFarm/runner";
import { enqueueGearFarmJob, getGearFarmJob, cancelGearFarmJob, discoverGearFarmJob, cancelGearFarmRequest } from "@/lib/wow/gearFarm/jobs";
import { parseFarmScope, isFarmRequestId, farmJobActive, type GearFarmScope } from "@/lib/wow/gearFarm/recovery";
export const dynamic = "force-dynamic";
function reply(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
function sameOrigin(r: Request) {
  if (r.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = r.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === (r.headers.get("x-forwarded-host") ?? r.headers.get("host"));
  } catch {
    return false;
  }
}
async function owner() {
  const session = await auth();
  const token = session?.battleNetAccessToken;
  return token ? {
    id: createHash("sha256").update(`battle-net:${token}`).digest("hex"),
    token
  } : null;
}
function scopeFromQuery(params: URLSearchParams) {
  const value: Record<string, unknown> = Object.fromEntries(params);
  if (params.has("mythicKeyLevel")) {
    const key = params.get("mythicKeyLevel")!;
    if (!/^\d{1,2}$/.test(key)) throw new Error("invalid_farm_settings");
    value.mythicKeyLevel = Number(key);
  }
  return parseFarmScope(value);
}
function failure(error: unknown, userId?: string, scope?: GearFarmScope) {
  const code = error instanceof Error ? error.message : "farm_plan_unavailable";
  if (["invalid_plan_request", "invalid_farm_settings"].includes(code)) return reply({ error: code }, 400);
  if (code === "plan_request_expired") return reply({ error: code }, 410);
  if (code === "plan_request_conflict") return reply({ error: code }, 409);
  if (code === "plan_already_running") {
    const matching = userId && scope ? discoverGearFarmJob(userId, scope) : null;
    return reply({ error: code, job: farmJobActive(matching) ? matching : null }, 409);
  }
  return reply({ error: code === "plan_rate_limited" ? code : "farm_plan_unavailable" }, code === "plan_rate_limited" ? 429 : 503);
}
export async function GET(request: Request) {
  if (!sameOrigin(request)) return reply({ error: "cross_site_blocked" }, 403);
  const user = await owner();
  if (!user) return reply({ error: "session_expired" }, 401);
  try {
    const params = new URL(request.url).searchParams, scope = scopeFromQuery(params);
    const id = params.get("id"), clientRequestId = params.get("clientRequestId");
    if (id && clientRequestId || clientRequestId && !isFarmRequestId(clientRequestId)) throw new Error("invalid_plan_request");
    const job = id ? getGearFarmJob(user.id, id, scope) : discoverGearFarmJob(user.id, scope, clientRequestId ?? undefined);
    if (!id && !clientRequestId) return reply({ job });
    return job ? reply(job) : reply({ error: "plan_not_found" }, 404);
  } catch (error) { return failure(error); }
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return reply({ error: "cross_site_blocked" }, 403);
  const user = await owner();
  if (!user) return reply({ error: "session_expired" }, 401);
  try {
    const params = new URL(request.url).searchParams, scope = scopeFromQuery(params);
    const id = params.get("id"), clientRequestId = params.get("clientRequestId");
    if (Boolean(id) === Boolean(clientRequestId) || clientRequestId && !isFarmRequestId(clientRequestId)) throw new Error("invalid_plan_request");
    const job = id ? cancelGearFarmJob(user.id, id, scope) : cancelGearFarmRequest(user.id, { scope, clientRequestId: clientRequestId! });
    return job ? reply(job) : reply({ error: "plan_not_found" }, 404);
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({
    error: "cross_site_blocked"
  }, 403);
  const user = await owner();
  if (!user) return reply({
    error: "session_expired"
  }, 401);
  const reader = request.body?.getReader();
  if (!reader) return reply({
    error: "invalid_plan_request"
  }, 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const {
        value,
        done
      } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) {
        await reader.cancel();
        return reply({
          error: "request_too_large"
        }, 413);
      }
      chunks.push(value);
    }
  } catch {
    return reply({
      error: "invalid_plan_request"
    }, 400);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch {
    return reply({
      error: "invalid_plan_request"
    }, 400);
  }
  let scope: GearFarmScope | undefined;
  try {
    scope = parseFarmScope(body);
    if (!isFarmRequestId(body.clientRequestId)) throw new Error("invalid_plan_request");
    const { profileKey: _profileKey, ...input } = scope;
    return reply(enqueueGearFarmJob(user.id, (signal, progress) => runGearFarmPlan(input, user.token, signal, progress),
      { scope, clientRequestId: body.clientRequestId }), 202);
  } catch (error) { return failure(error, user.id, scope); }
}
