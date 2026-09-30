import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getMidnightTalentData } from "@/lib/talentCalculatorData";
import { getTalentSpecTheme } from "@/lib/talentSpecThemes";
import { createTopologyTestSelection, generateTalentCandidates, validateTalentSelection } from "@/lib/wow/talentCandidateGenerator";
import { FURY_REFERENCE_LOADOUT, decodeWoWTalentLoadout, encodeWoWTalentLoadout } from "@/lib/wowTalentLoadout";
import { getBattleNetSimulationSnapshot } from "@/lib/wow/battleNetCharacterDetails";
import { getBattleNetCharacterBySlug } from "@/lib/wow/battleNetCharacters";

export const dynamic = "force-dynamic";
type RequestBody = { characterSlug?: string; spec?: string; dataMode?: "fixture" | "battle-net"; maxCandidates?: number; topologyTest?: boolean };

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
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
  if (Number(request.headers.get("content-length") ?? 0) > 2_048) return reply({ error: "request_too_large" }, 413);
  const body = await request.json().catch(() => null) as RequestBody | null;
  if (!body?.spec || !body.characterSlug || !getTalentSpecTheme(body.spec)) return reply({ error: "invalid_character_or_specialization" }, 400);

  try {
    const topologyTest = process.env.NODE_ENV !== "production" && body.topologyTest === true && request.headers.get("x-gildra-qa-mode") === "talent-candidates";
    let baselineLoadout: string;
    let activeHeroTalentTreeId: number | undefined;
    if (topologyTest) {
      const preliminary = await getMidnightTalentData(body.spec);
      const selection = createTopologyTestSelection(preliminary);
      baselineLoadout = encodeWoWTalentLoadout(preliminary, selection.ranks, selection.choices);
      activeHeroTalentTreeId = preliminary.heroSubtreeId;
    } else if (body.dataMode === "fixture" && body.characterSlug === "furybar" && body.spec === "fury-warrior") {
      baselineLoadout = FURY_REFERENCE_LOADOUT;
    } else {
      const session = await auth();
      if (!session?.battleNetAccessToken) return reply({ error: "battle_net_session_required" }, 401);
      const character = await getBattleNetCharacterBySlug(session.battleNetAccessToken, "ru", body.characterSlug);
      if (!character) return reply({ error: "character_not_found" }, 404);
      const armory = await getBattleNetSimulationSnapshot(session.battleNetAccessToken, character);
      const theme = getTalentSpecTheme(body.spec)!;
      if (armory.activeSpecializationId !== theme.specId) return reply({ error: "active_specialization_changed" }, 409);
      baselineLoadout = armory.activeTalentLoadout;
      activeHeroTalentTreeId = armory.activeHeroTalentTreeId;
    }

    const data = await getMidnightTalentData(body.spec, activeHeroTalentTreeId);
    const maxCandidates = Number.isInteger(body.maxCandidates) ? Math.max(1, Math.min(128, Number(body.maxCandidates))) : 64;
    const candidates = generateTalentCandidates(data, baselineLoadout, { maxCandidates });
    const baseline = decodeWoWTalentLoadout(data, baselineLoadout);
    const baselineValidation = baseline ? validateTalentSelection(data, baseline) : null;
    return reply({
      spec: body.spec,
      specId: data.specId,
      buildVersion: data.buildVersion,
      heroSubtreeId: data.heroSubtreeId,
      baselineValid: baselineValidation?.valid === true,
      candidateCount: candidates.length,
      candidates,
    });
  } catch (error) {
    return reply({ error: "candidate_generation_failed", detail: error instanceof Error ? error.message : "Unknown error" }, 422);
  }
}
