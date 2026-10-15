import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { goldToCopper } from "@/lib/wow/auctionMarket";
import { startAuctionGearSearch, continueAuctionGearSearch, assembleAuctionGearSearch, selectedAuctionGearOptions, verifyAuctionGearSearch } from "@/lib/wow/auctionGearRunner";
import { enqueueAuctionGearJob, getAuctionGearJob, cancelAuctionGearJob } from "@/lib/wow/auctionGearJobs";
import { getAuctionGearSearch } from "@/lib/wow/auctionGearSearchStore";
import { auctionGearSlots, parseAuctionGearSlots } from "@/lib/wow/auctionGearSelection";
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
  const reader = request.body?.getReader(), chunks: Uint8Array[] = [];
  let bytes = 0;
  if (reader) for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 512 * 1024) {
      await reader.cancel();
      return reply({ error: "request_too_large" }, 413);
    }
    chunks.push(value);
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch {
    return reply({
      error: "invalid_plan_request"
    }, 400);
  }
  const action = body.action ?? "search";
  if (action !== "search" && action !== "resume" && action !== "assemble") return reply({ error: "invalid_plan_request" }, 400);
  if (action !== "search") {
    const keys = action === "resume" ? ["action", "searchId"] : ["action", "searchId", "allowedOptionIds"];
    if (Object.keys(body).some(key => !keys.includes(key)) || typeof body.searchId !== "string" || body.searchId.length > 100) return reply({ error: "invalid_plan_request" }, 400);
    const entry = getAuctionGearSearch(user.id, body.searchId);
    if (!entry) return reply({ error: "search_not_found" }, 404);
    try {
      if (action === "assemble") selectedAuctionGearOptions(entry, body.allowedOptionIds);
      return reply(enqueueAuctionGearJob(user.id, async (signal, progress) => {
        entry.busy = true;
        try {
          await verifyAuctionGearSearch(entry, user.token, signal);
          return action === "resume" ? await continueAuctionGearSearch(entry, signal, progress)
            : await assembleAuctionGearSearch(entry, body.allowedOptionIds, signal, progress);
        } finally { entry.busy = false; }
      }, { continuation: true }), 202);
    } catch (error) {
      const code = error instanceof Error ? error.message : "plan_queue_full";
      return reply({ error: code }, code === "invalid_auction_selection" ? 400 : code === "plan_already_running" ? 409 : code === "plan_rate_limited" ? 429 : 503);
    }
  }
  if (Object.keys(body).some(key => !["action", "characterSlug", "budgetGold", "selectedSlots", "scenario", "locale"].includes(key))) return reply({ error: "invalid_plan_request" }, 400);
  const {
    characterSlug,
    scenario = "single-target",
    locale = "ru"
  } = body;
  if (typeof characterSlug !== "string" || !characterSlug || characterSlug.length > 180 || typeof scenario !== "string" || !["single-target", "aoe", "execute"].includes(scenario) || typeof locale !== "string" || !["ru", "en"].includes(locale)) return reply({
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
  let selectedSlots;
  try { selectedSlots = parseAuctionGearSlots(body.selectedSlots ?? [...auctionGearSlots]); }
  catch { return reply({ error: "invalid_equipment_slots" }, 400); }
  try {
    return reply(enqueueAuctionGearJob(user.id, (signal, progress) => startAuctionGearSearch({
      characterSlug,
      budgetCopper,
      selectedSlots,
      scenario: scenario as GearSimulationScenario,
      locale: locale as "ru" | "en"
    }, user.id, user.token, signal, progress)), 202);
  } catch (error) {
    const code = error instanceof Error ? error.message : "plan_queue_full";
    return reply({
      error: code
    }, code === "plan_already_running" ? 409 : code === "plan_rate_limited" ? 429 : 503);
  }
}
