import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { goldToCopper } from "@/lib/wow/auctionMarket";
import { startAuctionGearSearch, continueAuctionGearSearch, assembleAuctionGearSearch, selectedAuctionGearAssemblyOptions, verifyAuctionGearSearch } from "@/lib/wow/auctionGearRunner";
import { enqueueAuctionGearJob, getAuctionGearJob, getAuctionGearJobByRequest, validAuctionGearClientRequestId, cancelAuctionGearJob } from "@/lib/wow/auctionGearJobs";
import { getAuctionGearSearch } from "@/lib/wow/auctionGearSearchStore";
import { recoverAuctionGearSearch } from "@/lib/wow/auctionGearRecovery";
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
  const params = new URL(request.url).searchParams;
  if (params.has("clientRequestId")) {
    const clientRequestId = params.get("clientRequestId"), characterSlug = params.get("characterSlug") ?? "", locale = params.get("locale");
    if (params.has("id") || params.has("searchId") || !validAuctionGearClientRequestId(clientRequestId) ||
        !characterSlug || characterSlug.length > 180 || (locale !== "en" && locale !== "ru")) return reply({ error: "invalid_plan_request" }, 400);
    const job = getAuctionGearJobByRequest(user.id, clientRequestId, { characterSlug, locale });
    return job ? reply(job) : reply({ error: "plan_not_found" }, 404);
  }
  if (params.has("searchId")) {
    const searchId = params.get("searchId") ?? "", characterSlug = params.get("characterSlug") ?? "", locale = params.get("locale");
    if (params.has("id") || !searchId || searchId.length > 100 || !characterSlug || characterSlug.length > 180 ||
        (locale !== "en" && locale !== "ru")) return reply({ error: "invalid_plan_request" }, 400);
    const recovered = recoverAuctionGearSearch(user.id, searchId, characterSlug, locale);
    return recovered ? reply(recovered) : reply({ error: "search_not_found" }, 404);
  }
  const job = getAuctionGearJob(user.id, params.get("id") ?? "");
  if (job && (params.has("characterSlug") || params.has("locale")) &&
      (!job.scope || params.get("characterSlug") !== job.scope.characterSlug || params.get("locale") !== job.scope.locale)) {
    return reply({ error: "plan_not_found" }, 404);
  }
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
    const keys = action === "resume" ? ["action", "searchId"] : ["action", "searchId", "allowedOptionIds", "excludedOptionIds"];
    if (Object.keys(body).some(key => !keys.includes(key)) || typeof body.searchId !== "string" || body.searchId.length > 100) return reply({ error: "invalid_plan_request" }, 400);
    const hasAllowed = Object.hasOwn(body, "allowedOptionIds"), hasExcluded = Object.hasOwn(body, "excludedOptionIds");
    if (hasAllowed && hasExcluded) return reply({ error: "invalid_auction_selection" }, 400);
    // Only IDs cross the boundary. Prices, item effects and budget stay server-owned.
    const selection = hasAllowed ? body.allowedOptionIds : hasExcluded ? { excludedOptionIds: body.excludedOptionIds } : undefined;
    const entry = getAuctionGearSearch(user.id, body.searchId);
    if (!entry) return reply({ error: "search_not_found" }, 404);
    try {
      const allowed = action === "assemble" ? selectedAuctionGearAssemblyOptions(entry, selection) : null;
      const job = enqueueAuctionGearJob(user.id, async (signal, progress) => {
        entry.busy = true;
        try {
          await verifyAuctionGearSearch(entry, user.token, signal);
          return action === "resume" ? await continueAuctionGearSearch(entry, signal, progress, user.token)
            : await assembleAuctionGearSearch(entry, selection, signal, progress, user.token);
        } finally { entry.busy = false; }
      }, { continuation: true, searchId: entry.id, scope: { characterSlug: entry.context.input.characterSlug, locale: entry.context.input.locale } });
      if (allowed) {
        const ids = new Set(allowed.map(option => option.id));
        entry.excludedOptionIds = hasExcluded ? [...body.excludedOptionIds as string[]]
          : entry.context.options.filter(option => !ids.has(option.id)).map(option => option.id);
      }
      return reply(job, 202);
    } catch (error) {
      const code = error instanceof Error ? error.message : "plan_queue_full";
      return reply({ error: code }, code === "invalid_auction_selection" ? 400 : code === "plan_already_running" ? 409 : code === "plan_rate_limited" ? 429 : 503);
    }
  }
  if (Object.keys(body).some(key => !["action", "characterSlug", "budgetGold", "selectedSlots", "scenario", "locale", "clientRequestId"].includes(key))) return reply({ error: "invalid_plan_request" }, 400);
  let clientRequestId: string | undefined;
  if (Object.hasOwn(body, "clientRequestId")) {
    if (!validAuctionGearClientRequestId(body.clientRequestId)) return reply({ error: "invalid_plan_request" }, 400);
    clientRequestId = body.clientRequestId;
  }
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
  const requestFingerprint = clientRequestId ? createHash("sha256").update(JSON.stringify({
    characterSlug, locale, budgetCopper, selectedSlots, scenario,
  })).digest("hex") : undefined;
  try {
    return reply(enqueueAuctionGearJob(user.id, (signal, progress) => startAuctionGearSearch({
      characterSlug,
      budgetCopper,
      selectedSlots,
      scenario: scenario as GearSimulationScenario,
      locale: locale as "ru" | "en"
    }, user.id, user.token, signal, progress), { scope: { characterSlug, locale: locale as "ru" | "en" },
      ...(clientRequestId ? { clientRequestId, requestFingerprint } : {}) }), 202);
  } catch (error) {
    const code = error instanceof Error ? error.message : "plan_queue_full";
    return reply({
      error: code
    }, code === "invalid_plan_request" ? 400 : code === "plan_already_running" ? 409 : code === "plan_rate_limited" ? 429 : 503);
  }
}
