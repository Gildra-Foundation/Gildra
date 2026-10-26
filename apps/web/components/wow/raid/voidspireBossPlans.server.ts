import "server-only";
import type { RaidBoss } from "@/lib/data/wow/raid/midnightRaidData";
import { getVoidspireMechanicGuide, type VoidspireMechanic } from "@/lib/data/wow/raid/voidspireMechanicGuide";
import mapManifest from "../../../public/assets/wow/raids/maps/manifest.json";
import { localizePlan } from "./raidPullPlans.server";
import { voidspireBossStages } from "./voidspireBossStages";
import records from "./voidspireBossRecords.json";
import type { RaidMapAtlas, RaidPullAbility, RaidPullEnemy, RaidPullPlan, RaidPullRole } from "./raidPullTypes";
import type { RouteText } from "./midnightRaidRoutes";

const text = (ru: string, en: string): RouteText => ({ ru, en });
const everyone: RaidPullRole[] = ["tank", "healer", "dps"];
// Link the actual encounter cast rather than a shared damage-effect variant.
const castIds: Record<number, number> = { 1281735: 1260712, 1260046: 1260052, 1244012: 1241692, 1241864: 1256855, 1243982: 1235617 };
const spellRecords: Record<string, { name: RouteText; icon: string }> = records.spells;
const npcRecords: Record<string, RouteText> = records.npcs;
const tankMechanics = new Set(["blackening-wounds", "shadowclaw-slam", "destabilizing-strikes", "twilight-bond-rakfang", "judgment-combo"]);
const stopMechanics = new Set(["pitch-bulwark", "shadow-fracture"]);
const bossNpcs = new Set([240435, 240434, 240432, 242056, 244552, 240431, 240437, 240438, 240430, 245113]);

const responses: Record<string, RouteText> = {
  "pitch-bulwark": text("Прерывайте Непроницаемый оплот у защитников и аннигиляторов, не накладывая кики друг на друга.", "Interrupt Stalwart and Annihilator Pitch Bulwark casts without overlapping kicks."),
  "blisterburst": text("Доведите прислужника до нужной стены и убейте у неё. Выйдите из области взрыва.", "Bring the add to the required wall and kill it there. Leave its explosion area."),
  "void-convergence": text("Уничтожайте сферы до контакта с боссом; танк держит его на расстоянии от них.", "Destroy orbs before they touch the boss; the tank keeps him away from them."),
  "nullbeam-nullzone": text("Помогите танку разделить луч, чтобы уменьшить зону. Выходите из неё в согласованном порядке.", "Help the tank share the beam to reduce the zone. Leave it in the agreed order."),
  "radiant-barrier-shadowmark": text("Войдите в Сияющий барьер и уничтожайте Воплощение Полуночи, оставаясь внутри.", "Enter Radiant Barrier and kill the Manifestation of Midnight while staying inside."),
  "boss-auras": text("Заранее отведите активного босса к краю и оставьте других боссов вне его ауры. Порядок: Беллами → Венел → Сенн.", "Move the active boss to an edge in advance and keep the other bosses outside the aura. Order: Bellamy → Venel → Senn."),
  "null-corona": text("Вылечите поглощение напрямую. Обычный диспел переносит оставшееся поглощение на другого игрока.", "Heal the absorb directly. A normal dispel transfers the remaining absorb to another player."),
  "silverstrike-barrage": text("Примите назначенную стрелу, чтобы снять замедление, и продолжайте бежать от центра.", "Take the assigned arrow to clear the slow and keep running away from the center."),
  "despotic-command": text("Отмеченный отходит от группы. Лекарь снимает приказ после расхождения и вылечивает оставшееся поглощение.", "The marked player leaves the group. A healer dispels Command once separated and heals the remaining absorb."),
};
const heroicNotes: Record<string, RouteText> = {
  "pitch-bulwark": text("Держите прислужников не ближе 10 м к боссу: усиление действует и на них.", "Keep adds at least 10 yards from the boss: the empowerment also affects them."),
  "blisterburst": text("Для разрушения одной стены нужны два взрыва.", "Two explosions are needed to break a wall."),
  "void-convergence": text("Дождитесь окончания рейдового периодического урона, прежде чем убивать следующую сферу.", "Wait for the raid damage-over-time effect to end before killing the next orb."),
  "shattering-twilight": text("Кроме танка отмечаются другие игроки; их линии не должны пересекать группу.", "Additional players are marked alongside the tank; keep their lines away from the group."),
  "nullbeam-nullzone": text("Выход последнего игрока из зоны вызывает сильный рейдовый удар.", "The last player leaving the zone triggers a heavy raid hit."),
  "gloom": text("Чередуйте группы замачивания из-за ослабления после попадания.", "Rotate soak teams because the hit leaves a vulnerability."),
  "radiant-barrier-shadowmark": text("Игроки с Темной меткой отходят к краю барьера, остальные остаются в центре.", "Players with Shadowmark move to the barrier’s edge; everyone else stays central."),
  "boss-auras": text("После каждой серии остаётся постоянное Освящение; сохраняйте место для следующих аур.", "Each cycle leaves permanent Consecration; preserve space for later auras."),
  "grasp-of-emptiness": text("Одновременно отмечаются два игрока; направления стрел согласуются отдельно.", "Two players are marked at once; coordinate their arrow directions separately."),
  "void-expulsion": text("После первых меток появляются дополнительные цели. Не перекрывайте группе дальнейший путь.", "Additional targets follow the first marks. Keep the group’s onward path clear."),
  "silverstrike-barrage": text("Не принимайте две стрелы подряд: после попадания остаётся уязвимость.", "Do not take consecutive arrows: each hit leaves a vulnerability."),
};

function mechanicRoles(id: string): RaidPullRole[] {
  if (tankMechanics.has(id)) return ["tank"];
  if (stopMechanics.has(id)) return ["tank", "dps"];
  if (id === "null-corona") return ["healer"];
  if (id === "divine-shield") return ["healer", "dps"];
  return everyone;
}

function mechanicAction(mechanic: VoidspireMechanic): RaidPullAbility["action"] {
  if (tankMechanics.has(mechanic.id) || mechanic.id === "null-corona") return "defensive";
  if (stopMechanics.has(mechanic.id)) return "interrupt";
  if (mechanic.id === "divine-shield") return "dispel";
  if (mechanic.id === "sacred-shield-blinding-light") return "focus";
  if (mechanic.tags.some(tag => ["MOVE", "DODGE", "SPREAD", "STACK", "SOAK"].includes(tag))) return "move";
  return "focus";
}

function projectMechanic(mechanic: VoidspireMechanic): RaidPullAbility {
  if (!mechanic.spell) throw new Error(`Missing source spell: ${mechanic.id}`);
  const spellId = castIds[mechanic.spell.id] ?? mechanic.spell.id;
  const record = spellRecords[spellId];
  if (!record) throw new Error(`Missing checked spell record: ${spellId}`);
  const combined = mechanic.preserveName || /\s(?:and|\/)\s|→/.test(mechanic.name.en) || mechanic.id === "boss-auras";
  return { spellId, name: combined ? mechanic.name : record.name, icon: mechanic.spell.icon,
    roles: mechanicRoles(mechanic.id), action: mechanicAction(mechanic),
    response: responses[mechanic.id] ?? mechanic.action, heroic: heroicNotes[mechanic.id] };
}

/** One source-checked projection; never publish fixture assignments or Mythic-only mechanics here. */
export function getVoidspireBossPlan(boss: RaidBoss): RaidPullPlan {
  const definition = voidspireBossStages[boss.slug];
  const guide = getVoidspireMechanicGuide(boss.slug);
  if (!definition || !guide) throw new Error(`Missing reviewed encounter: ${boss.slug}`);
  const atlas = mapManifest.raids["the-voidspire"] as RaidMapAtlas;
  const mechanics = new Map(guide.mechanics.map(mechanic => [mechanic.id, mechanic]));
  const pulls = definition.phases.map(phase => ({
    id: `${boss.slug}-${phase.id}`, kind: "boss" as const, title: phase.title, x: 50, y: 50,
    call: phase.call, steps: [], roles: phase.roles, bossSlug: boss.slug,
    enemies: [
      ...phase.npcIds.map((npcId): RaidPullEnemy => ({ npcId, name: npcRecords[npcId], priority: bossNpcs.has(npcId) ? "boss" : "high", artwork: phase.npcIds.length === 1 ? boss.artwork : undefined })),
      ...phase.extraEnemies.map(name => ({ name, priority: "high" as const })),
    ],
    abilities: phase.mechanicIds.map(id => {
      const mechanic = mechanics.get(id);
      if (!mechanic) throw new Error(`Missing reviewed mechanic: ${boss.slug}/${id}`);
      return projectMechanic(mechanic);
    }),
  }));
  return localizePlan({
    slug: "the-voidspire", name: text(boss.nameRu, boss.nameEn), artwork: "/assets/wow/raids/midnight/backgrounds/the-voidspire-scene.webp",
    encounter: { bossSlug: boss.slug, summary: definition.summary, diagrams: Object.fromEntries(definition.phases.map((phase, i) => [pulls[i].id, phase.diagram])) },
    coverage: "encounters", note: definition.summary, entrance: { x: 50, y: 95 }, routePath: "", pulls,
    bosses: [{ slug: boss.slug, name: text(boss.nameRu, boss.nameEn), artwork: boss.artwork, x: 50, y: 50 }],
    atlas: { ...atlas, progression: undefined, floors: atlas.floors.filter(f => f.pins.some(pin => pin.bossSlug === boss.slug)).map(f => ({ ...f, pins: f.pins.filter(pin => pin.bossSlug === boss.slug) })), arenas: { [boss.slug]: atlas.arenas[boss.slug] } },
    sources: [{ title: "Icy Veins — Normal / Heroic", url: guide.sourceUrl }, { title: "Wowhead — spell and NPC records", url: "https://www.wowhead.com/zone=16340/the-voidspire" }],
  });
}
