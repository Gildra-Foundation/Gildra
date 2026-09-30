import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { talentSpecThemes } from "@/lib/talentSpecThemes";
import { BattleNetCharacterDataError, getBattleNetCharacterDetails } from "@/lib/wow/battleNetCharacterDetails";
import { BattleNetProfileError, getBattleNetCharacterBySlug } from "@/lib/wow/battleNetCharacters";
import { getGearCandidatesForEquippedItem } from "@/lib/wow/gearCandidateRepository";

export const dynamic = "force-dynamic";
type Body = { characterSlug?: string; slotType?: string; locale?: "en" | "ru" };

function reply(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", ...headers } });
}

function sameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    return Boolean(host) && new URL(origin).host === host;
  } catch { return false; }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ error: "cross_site_blocked" }, 403);
  const session = await auth();
  if (!session?.battleNetAccessToken) return reply({ error: "session_expired" }, 401);
  const body = await request.json().catch(() => null) as Body | null;
  const requested = body?.characterSlug ?? "";
  const slotType = body?.slotType?.toUpperCase() ?? "";
  if (!requested || !/^[A-Z0-9_]{2,24}$/.test(slotType)) return reply({ error: "invalid_character_or_slot" }, 400);
  const locale = body?.locale === "en" ? "en" : "ru";
  try {
    const character = await getBattleNetCharacterBySlug(session.battleNetAccessToken, locale, requested);
    if (!character) return reply({ error: "character_not_found" }, 404);
    const details = await getBattleNetCharacterDetails(session.battleNetAccessToken, character, locale);
    const equipped = details.equipment.find((item) => item.slotType === slotType);
    if (!equipped) return reply({ error: "equipped_slot_missing" }, 404);
    const active = details.activeSpec?.toLocaleLowerCase("en-US") ?? "";
    const theme = talentSpecThemes.find((candidate) => candidate.classId === character.playableClass.id
      && [candidate.specName.toLowerCase(), candidate.specNameRu.toLocaleLowerCase("ru-RU")].includes(active));
    if (!theme) return reply({ error: "specialization_unresolved" }, 422);
    const pool = await getGearCandidatesForEquippedItem({
      itemId: equipped.id, itemName: equipped.name, itemLevel: equipped.itemLevel, slotType,
      classId: character.playableClass.id, specId: theme.specId, characterLevel: character.level, locale,
    });
    return reply({
      character: { slug: body!.characterSlug, name: character.name, classId: character.playableClass.id, specId: theme.specId },
      anchor: pool.anchor, season: pool.context.season, catalogCount: pool.catalogCount,
      candidates: pool.candidates,
      rejectedByReason: pool.rejectedByReason,
      rejectedSample: pool.rejected.slice(0, 12).map((candidate) => ({ itemId: candidate.itemId, name: candidate.name, reasons: candidate.rejectionReasons })),
    });
  } catch (error) {
    if (error instanceof BattleNetProfileError) return reply({ error: error.status === 429 ? "rate_limited" : "battle_net_unavailable" }, error.status === 429 ? 429 : 503, error.status === 429 ? { "Retry-After": "60" } : {});
    if (error instanceof BattleNetCharacterDataError) return reply({ error: error.code, endpoint: error.endpoint }, error.status);
    const code = error instanceof Error ? error.message : "gear_catalog_unavailable";
    const status = ["equipped_item_not_in_catalog", "equipped_item_details_missing"].includes(code) ? 424 : code === "unsupported_equipment_slot" ? 400 : 503;
    return reply({ error: code }, status);
  }
}
