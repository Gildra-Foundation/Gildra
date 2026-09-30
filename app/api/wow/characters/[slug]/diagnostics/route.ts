import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getRotationPreset } from "@/lib/platform/rotation/repository";
import { getTalentSpecTheme } from "@/lib/talentSpecThemes";
import { getMidnightTalentData } from "@/lib/talentCalculatorData";
import { decodeWoWTalentLoadout } from "@/lib/wowTalentLoadout";
import { toCharacterAuditSnapshot } from "@/lib/wow/battleNetAuditSnapshot";
import { getBattleNetCharacterDetails, getBattleNetSimulationSnapshot } from "@/lib/wow/battleNetCharacterDetails";
import { getBattleNetCharacterBySlug } from "@/lib/wow/battleNetCharacters";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ slug: string }> };
type Check = { id: string; label: string; status: "pass" | "fail" | "skip"; detail: string };
const workerURL = () => (process.env.ROTATION_WORKER_URL ?? "http://127.0.0.1:58082").replace(/\/$/, "");

function sameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    return Boolean(host) && new URL(origin).host === host;
  } catch { return false; }
}

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function POST(request: Request, { params }: RouteContext) {
  if (!sameOrigin(request)) return reply({ error: "cross_site_blocked" }, 403);
  const session = await auth();
  if (!session?.battleNetAccessToken) return reply({ error: "battle_net_session_required" }, 401);
  const body = await request.json().catch(() => ({})) as { locale?: string };
  const lang = body.locale === "en" ? "en" : "ru";
  const text = (ru: string, en: string) => lang === "ru" ? ru : en;
  const requested = decodeURIComponent((await params).slug).toLowerCase();
  const checks: Check[] = [{ id: "session", label: text("Battle.net-сессия", "Battle.net session"), status: "pass", detail: text("Авторизация активна", "Signed in") }];

  try {
    const character = await getBattleNetCharacterBySlug(session.battleNetAccessToken, lang, (await params).slug);
    if (!character) return reply({ error: "character_not_in_account", checks: [...checks, { id: "character", label: text("Персонаж аккаунта", "Account character"), status: "fail", detail: text("Персонаж не найден на подключённом аккаунте", "Character not found on the connected account") }] }, 404);
    checks.push({ id: "character", label: text("Персонаж аккаунта", "Account character"), status: "pass", detail: `${character.region.toUpperCase()} · ${character.realm.slug}` });

    const [details, armory] = await Promise.all([
      getBattleNetCharacterDetails(session.battleNetAccessToken, character, lang),
      getBattleNetSimulationSnapshot(session.battleNetAccessToken, character),
    ]);
    const snapshot = toCharacterAuditSnapshot(details, lang);
    const theme = getTalentSpecTheme(snapshot.specialization.slug);
    checks.push(
      { id: "equipment", label: text("Экипировка", "Equipment"), status: snapshot.gear.length ? "pass" : "fail", detail: `${snapshot.gear.length} ${text("предметов", "items")} · ${snapshot.character.itemLevel} ilvl` },
      { id: "specialization", label: text("Активная специализация", "Active specialization"), status: theme && armory.activeSpecializationId === theme.specId ? "pass" : "fail", detail: theme ? `${snapshot.specialization.specName} · ID ${armory.activeSpecializationId}` : `${text("Неизвестная специализация", "Unknown specialization")} ID ${armory.activeSpecializationId}` },
      { id: "loadout", label: text("Активный билд", "Active build"), status: armory.activeTalentLoadout ? "pass" : "fail", detail: armory.activeTalentLoadout ? `${text("Получен", "Imported")} · ${armory.activeTalentLoadout.length} ${text("символов", "characters")}` : text("Battle.net не вернул строку талантов", "Battle.net did not return a talent string") },
    );

    const [talentData, preset] = await Promise.all([
      getMidnightTalentData(snapshot.specialization.slug, snapshot.activeHeroTalentTreeId, lang),
      getRotationPreset(snapshot.specialization.slug, lang),
    ]);
    const decoded = decodeWoWTalentLoadout(talentData, armory.activeTalentLoadout);
    checks.push(
      { id: "talent-tree", label: text("Калькулятор талантов", "Talent calculator"), status: decoded ? "pass" : "fail", detail: decoded ? `${decoded.ranks.size} ${text("выбранных узлов распознано", "selected nodes recognized")}` : text("Активный билд не декодируется текущей версией дерева", "The active build could not be decoded with the current talent tree") },
      { id: "rotation-preset", label: text("Каталог способностей", "Ability catalog"), status: preset.abilities.length && preset.defaultRules.length ? "pass" : "fail", detail: `${preset.abilities.length} ${text("способностей", "abilities")} · ${preset.defaultRules.length} ${text("правил", "rules")}` },
    );

    let simulation: { status: "pass" | "fail" | "skip"; engine?: string; dps?: number; detail: string };
    if (theme?.role === "healer") {
      simulation = { status: "skip", detail: text("Для лекаря нужен отдельный HPS-движок", "Healers need a dedicated HPS engine") };
    } else if (!theme || armory.activeSpecializationId !== theme.specId || !decoded || !preset.defaultRules.length) {
      simulation = { status: "fail", detail: text("Предварительные проверки не пройдены", "Prerequisite checks failed") };
    } else {
      const response = await fetch(`${workerURL()}/v1/wow/rotation/simulations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          spec: snapshot.specialization.slug,
          scenario: "single-target",
          fightLengthSeconds: 30,
          targets: 1,
          rules: preset.defaultRules,
          talentLoadout: armory.activeTalentLoadout,
          armory: { profile: armory.profile, specializations: armory.specializations, equipment: armory.equipment },
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(55_000),
      });
      const payload = await response.json().catch(() => ({})) as { dps?: number; engine?: string; error?: string; code?: string };
      const passed = response.ok && Number.isFinite(payload.dps) && Boolean(payload.engine?.startsWith("SimulationCraft"));
      simulation = { status: passed ? "pass" : "fail", engine: payload.engine, dps: payload.dps, detail: passed ? `${Math.round(payload.dps!)} DPS · ${payload.engine}` : `${response.status} · ${payload.code ?? payload.error ?? "SimulationCraft не ответил"}` };
    }
    checks.push({ id: "simulation", label: text("Расчёт на шмоте персонажа", "Simulation with character equipment"), status: simulation.status, detail: simulation.detail });
    const failed = checks.filter((check) => check.status === "fail").length;
    return reply({
      reportId: createHash("sha256").update(`${requested}:${Date.now()}`).digest("hex").slice(0, 12),
      generatedAt: new Date().toISOString(),
      character: { region: character.region, realm: character.realm.slug, specialization: snapshot.specialization.slug, itemLevel: snapshot.character.itemLevel },
      status: failed ? "failed" : "passed",
      checks,
    }, failed ? 422 : 200);
  } catch (error) {
    return reply({ error: "diagnostic_failed", message: text("Диагностика временно недоступна. Повторите позже.", "Diagnostics temporarily unavailable. Try again later."), checks }, 503);
  }
}
