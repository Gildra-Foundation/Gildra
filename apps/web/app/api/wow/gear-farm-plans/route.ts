import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { runGearFarmPlan } from "@/lib/wow/gearFarm/runner";
import { enqueueGearFarmJob, getGearFarmJob, cancelGearFarmJob } from "@/lib/wow/gearFarm/jobs";
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
export async function GET(request: Request) {
  if (!sameOrigin(request)) return reply({
    error: "cross_site_blocked"
  }, 403);
  const user = await owner();
  if (!user) return reply({
    error: "session_expired"
  }, 401);
  const job = getGearFarmJob(user.id, new URL(request.url).searchParams.get("id") ?? "");
  return job ? reply(job) : reply({
    error: "plan_not_found"
  }, 404);
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return reply({
    error: "cross_site_blocked"
  }, 403);
  const user = await owner();
  if (!user) return reply({
    error: "session_expired"
  }, 401);
  const job = cancelGearFarmJob(user.id, new URL(request.url).searchParams.get("id") ?? "");
  return job ? reply(job) : reply({
    error: "plan_not_found"
  }, 404);
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
  const {
    characterSlug,
    locale = "ru"
  } = body;
  if (typeof characterSlug !== "string" || !characterSlug || characterSlug.length > 180 || typeof locale !== "string" || !["ru", "en"].includes(locale)) return reply({
    error: "invalid_plan_request"
  }, 400);
  try {
    return reply(enqueueGearFarmJob(user.id, (signal, progress) => runGearFarmPlan({
      characterSlug,
      locale: locale as "ru" | "en"
    }, user.token, signal, progress)), 202);
  } catch (error) {
    const code = error instanceof Error ? error.message : "plan_queue_full";
    return reply({
      error: code
    }, code === "plan_already_running" ? 409 : code === "plan_rate_limited" ? 429 : 503);
  }
}
