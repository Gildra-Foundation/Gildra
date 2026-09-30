import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { toCharacterAuditSnapshot } from "@/lib/wow/battleNetAuditSnapshot";
import { BattleNetCharacterDataError, characterSlug, getBattleNetCharacterDetails } from "@/lib/wow/battleNetCharacterDetails";
import { BattleNetProfileError, getBattleNetCharacters, isBattleNetRegion } from "@/lib/wow/battleNetCharacters";
import { characterProfileFingerprint } from "@/lib/wow/characterProfileFingerprint";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ slug: string }> };
type Locale = "en" | "ru";

function sameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    return Boolean(host) && new URL(origin).host === host;
  } catch { return false; }
}

function reply(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", ...extraHeaders } });
}

function errorResponse(error: unknown) {
  if (error instanceof BattleNetProfileError) {
    const status = [401, 403, 429].includes(error.status) ? error.status : 503;
    const code = status === 401 ? "session_expired" : status === 403 ? "access_forbidden" : status === 429 ? "rate_limited" : "battle_net_unavailable";
    return reply({ error: code }, status, status === 429 ? { "Retry-After": "60" } : {});
  }
  if (error instanceof BattleNetCharacterDataError) {
    const code = error.code === "expired" ? "session_expired"
      : error.code === "forbidden" ? "access_forbidden"
      : error.code === "rate_limited" ? "rate_limited"
      : error.code === "not_found" ? "character_not_found"
      : error.code === "incomplete" ? "incomplete_profile"
      : "battle_net_unavailable";
    return reply({ error: code, endpoint: error.endpoint }, error.status, error.status === 429 ? { "Retry-After": "60" } : {});
  }
  return reply({ error: "battle_net_unavailable" }, 503);
}

export async function GET(_request: Request, { params }: RouteContext) {
  await params;
  return reply({ error: "method_not_allowed", allowed: ["POST"] }, 405, { Allow: "POST" });
}

export async function POST(request: Request, { params }: RouteContext) {
  if (!sameOrigin(request)) return reply({ error: "cross_site_blocked" }, 403);
  const session = await auth();
  if (!session?.battleNetAccessToken) return reply({ error: "session_expired" }, 401);

  const body = await request.json().catch(() => ({})) as { locale?: string };
  const locale: Locale = body.locale === "en" ? "en" : "ru";
  const requested = decodeURIComponent((await params).slug).toLowerCase();
  const requestedRegion = requested.split("--", 1)[0];

  try {
    const character = (await getBattleNetCharacters(session.battleNetAccessToken, locale, isBattleNetRegion(requestedRegion) ? requestedRegion : undefined))
      .find((entry) => decodeURIComponent(characterSlug(entry)).toLowerCase() === requested);
    if (!character) return reply({ error: "character_not_found" }, 404);

    const details = await getBattleNetCharacterDetails(session.battleNetAccessToken, character, locale);
    const snapshot = toCharacterAuditSnapshot(details, locale);
    const fingerprint = characterProfileFingerprint(snapshot);

    if (!snapshot.activeTalentLoadout) {
      return reply({ error: "incomplete_profile", reason: "active_loadout_missing", snapshot, fingerprint }, 422);
    }
    return reply({ snapshot, fingerprint, refreshedAt: new Date().toISOString() });
  } catch (error) {
    return errorResponse(error);
  }
}
