import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { goldToCopper } from "@/lib/wow/auctionMarket";
import { runAuctionGearPlan } from "@/lib/wow/auctionGearRunner";
import { enqueueAuctionGearJob, getAuctionGearJob, cancelAuctionGearJob } from "@/lib/wow/auctionGearJobs";
import type { GearSimulationScenario } from "@/lib/wow/gearSimulation";
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
  const job = getAuctionGearJob(user.id, new URL(request.url).searchParams.get("id") ?? "");
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
  const job = cancelAuctionGearJob(user.id, new URL(request.url).searchParams.get("id") ?? "");
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
  const text = await request.text();
  if (text.length > 2048) return reply({
    error: "request_too_large"
  }, 413);
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
    scenario = "single-target",
    locale = "ru"
  } = body;
  if (typeof characterSlug !== "string" || !characterSlug || characterSlug.length > 180 || typeof scenario !== "string" || !["single-target", "aoe", "execute"].includes(scenario) || !["ru", "en"].includes(String(locale))) return reply({
    error: "invalid_plan_request"
  }, 400);
  let budgetCopper: number;
  try {
    budgetCopper = goldToCopper(body.budgetGold);
  } catch {
    return reply({
      error: "invalid_budget"
    }, 400);
  }
  try {
    return reply(enqueueAuctionGearJob(user.id, (signal, progress) => runAuctionGearPlan({
      characterSlug,
      budgetCopper,
      scenario: scenario as GearSimulationScenario,
      locale: locale as "ru" | "en"
    }, user.token, signal, progress)), 202);
  } catch (error) {
    const code = error instanceof Error ? error.message : "plan_queue_full";
    return reply({
      error: code
    }, code === "plan_already_running" ? 409 : code === "plan_rate_limited" ? 429 : 503);
  }
}
