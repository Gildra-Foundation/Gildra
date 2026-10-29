import "server-only";

import { venomousAbyss } from "@/lib/data/wow";
import { getRaidReview, getReviewedSpellIdentities } from "@/lib/data/raidReviews";
import { getMidnightRaid } from "@/lib/data/wow/raid/midnightRaidData";
import { wowGuideText } from "@/lib/wow/sourceLocale";
import { getMidnightRaidRoute, type RaidRoutePull, type RouteAction, type RouteText } from "./midnightRaidRoutes";
import { raidHubEntries } from "./raidHubData";
import mapManifest from "../../../public/assets/wow/raids/maps/manifest.json";
import { getRaidProgression } from "./raidProgression";
import type { RaidMapAtlas, RaidPull, RaidPullAbility, RaidPullPlan, RaidPullRole } from "./raidPullTypes";

const tx = (ru: string, en: string): RouteText => ({ ru, en });
// Translate the small serializable projection on the server. The full name
// dictionary must never enter the interactive map's browser bundle.
export function localizePlan<T>(value: T): T {
  if (Array.isArray(value)) return value.map(localizePlan) as T;
  if (!value || typeof value !== "object") return value;
  const fields = value as Record<string, unknown>;
  if (typeof fields.ru === "string" && typeof fields.en === "string") return { ...fields, ru: wowGuideText(fields.ru, "ru") } as T;
  return Object.fromEntries(Object.entries(fields).map(([key, entry]) => [key, localizePlan(entry)])) as T;
}
const allRoles: RaidPullRole[] = ["tank", "healer", "dps"];
const actionRoles: Record<RouteAction, RaidPullRole[]> = {
  interrupt: ["tank", "dps"], stop: ["tank", "dps"], dispel: ["healer", "dps"],
  move: allRoles, defensive: allRoles, focus: ["dps"],
};
const generalRoles = {
  tank: [tx("Соберите отмеченных врагов, разверните фронтальные атаки от рейда и держите запас защиты.", "Gather the marked enemies, face frontal attacks away from the raid and keep mitigation ready.")],
  healer: [tx("Подготовьте лечение к массовому урону; согласуйте внешнюю защиту с танком и проверьте эффекты для снятия.", "Prepare for raid damage, agree on external mitigation with the tank and check removable effects.")],
  dps: [tx("Следуйте указанному приоритету целей; заранее распределите прерывания и контроль, чтобы не дублировать их.", "Follow the listed target priority and pre-assign interrupts and crowd control to avoid overlap.")],
};
const rallyRoles = {
  tank: [tx("Согласуйте начало боя и распределение танков между группами до входа на арену.", "Agree on the pull and tank distribution between groups before entering the arena.")],
  healer: [tx("Распределите лекарей между группами и согласуйте порядок рейдовой защиты.", "Distribute healers between groups and agree on raid cooldown order.")],
  dps: [tx("Проверьте свою группу и очередь прерываний на прислужниках внутри боя.", "Confirm your group and the interrupt rotation for adds during the encounter.")],
};

// Explicit draft caster bindings; never infer NPC ownership from array order.
const draftCasters: Record<number, number> = {
  1228330: 240548, 1230690: 240549, 1228345: 240545,
  1258624: 240864, 1236560: 240864, 1258621: 240864,
  1251405: 240831, 1236497: 252067, 1258656: 252067, 1255702: 251239,
  1259291: 252070, 1259328: 252070, 1282010: 259918,
};
// Existing official trash icons, checked and stored with midnight/SOURCE.md.
const trashSpellIcons = new Set([1228330, 1228345, 1230690, 1236497, 1236560, 1247054, 1247056, 1251405, 1255702, 1258601, 1258621, 1258624, 1258656, 1259291, 1259328, 1270212, 1272971, 1274846, 1281453, 1281525, 1281528, 1281532, 1281728, 1282010, 1282201, 1283465]);

function trashPull(pull: RaidRoutePull, bossSlug?: string): RaidPull {
  const abilities: RaidPullAbility[] = pull.abilities.map((ability) => ({
    ...ability, roles: actionRoles[ability.action],
    icon: trashSpellIcons.has(ability.spellId) ? `/assets/wow/raids/midnight/trash-spells/${ability.spellId}.jpg` : undefined,
    caster: pull.enemies.find((enemy) => enemy.npcId === (ability.casterNpcId ?? draftCasters[ability.spellId]))?.name,
  }));
  return {
    ...pull, kind: pull.enemies.length ? "trash" : "rally", bossSlug,
    roles: pull.roles ?? (!pull.enemies.length ? rallyRoles : Object.fromEntries(allRoles.map((role) => [role, [
      ...generalRoles[role],
      ...abilities.filter((ability) => ability.roles.includes(role) && ability.response).map((ability) => ability.response!),
    ]])) as RaidPull["roles"]),
    abilities,
  };
}

// Adds named in the existing, source-tracked encounter reviews. Wave sizes are
// intentionally absent: the reviews do not establish fixed spawn counts.
const encounterAdds: Record<string, string[]> = {
  "nekzali-the-soulcoiler": ["Restless Amani", "Echo of Jawae"],
  "entombed-sentinels": ["Venom Coagulation"],
  "ulatek": ["Warden", "Shriekers"],
  "rotmire": ["Shroomling", "Fungling", "Sporecap"],
};

export function getRaidPullPlan(slug: string): RaidPullPlan | undefined {
  const hub = raidHubEntries.find((entry) => entry.slug === slug);
  if (!hub) return undefined;
  const sourceAtlas = (mapManifest.raids as Record<string, RaidMapAtlas>)[slug];
  const atlas = { ...sourceAtlas, progression: getRaidProgression(slug) };
  const midnight = getMidnightRaid(slug);
  if (midnight) {
    const route = getMidnightRaidRoute(midnight.slug);
    return localizePlan({
      slug, name: hub.names, artwork: hub.artwork, atlas, routePath: route.routePath, entrance: route.entrance,
      coverage: "route-draft", note: route.note,
      sources: [{ title: new URL(route.source).hostname, url: route.source }, ...(slug === "the-voidspire" ? [
        { title: "Wowhead — NPC and spell records · 26 Oct 2026", url: "https://www.wowhead.com/zone=16340/the-voidspire" },
      ] : [])],
      pulls: route.pulls.map((pull) => trashPull(pull, midnight.bosses[pull.destinationBoss]?.slug)),
      bosses: route.bosses.map((node) => {
        const boss = midnight.bosses[node.bossIndex];
        return { ...node, slug: boss.slug, name: tx(boss.nameRu, boss.nameEn), artwork: boss.artwork };
      }),
    });
  }

  const review = getRaidReview(slug);
  if (!review) return undefined;
  const pulls = hub.bosses.map((boss, index): RaidPull => {
    const entry = review.bosses.find((candidate) => candidate.slug === boss.slug);
    const guide = venomousAbyss.find((candidate) => slug === "venomous-abyss" && candidate.slug === boss.slug);
    const tips = entry?.tipsEn.map((en, i) => tx(entry.tipsRu[i], en)) ?? [];
    const abilities: RaidPullAbility[] = (guide?.journalAbilities ?? []).filter((ability) => ability.description).map((ability) => ({
      spellId: ability.spellId, name: ability.name, icon: ability.iconUrl, effect: ability.description!, roles: allRoles,
    }));
    // Sporefall has reviewed identities without publication-safe spell descriptions.
    // Keep those identities as references; do not manufacture descriptions or kicks.
    if (!guide) for (const identity of getReviewedSpellIdentities(undefined, slug, boss.slug)) {
      abilities.push({ spellId: identity.spellId, name: tx(identity.nameRu, identity.nameEn), icon: identity.iconUrl, roles: allRoles });
    }
    // Each reviewed tip goes to one role, and the role heading replaces a "Tanks:" / "Healers:" lead-in.
    const roleTip = (i: number) => {
      const tip = tips[i];
      const lead = (text: string, prefix: RegExp) => { const rest = text.replace(prefix, ""); return rest.charAt(0).toLocaleUpperCase() + rest.slice(1); };
      return tip && tx(lead(tip.ru, /^(Танки|Целители|Лекари): /), lead(tip.en, /^(Tanks|Healers): /));
    };
    const roleTips = guide?.roles ?? {
      tank: [3].map(roleTip).filter(Boolean),
      healer: [1, 6].map(roleTip).filter(Boolean),
      dps: [0, 4, 5].map(roleTip).filter(Boolean),
    } as RaidPull["roles"];
    return {
      id: `${slug}-${boss.slug}`, kind: "boss", title: boss.names,
      x: hub.bosses.length === 1 ? 50 : index % 2 === 0 ? 34 : 66,
      y: hub.bosses.length === 1 ? 45 : 85 - index * 10,
      call: entry ? tx(entry.summaryRu, entry.summaryEn) : guide?.summary ?? boss.names,
      direction: guide?.positioning, steps: tips, bossSlug: boss.slug,
      enemies: [
        { name: boss.names, priority: "boss", artwork: boss.artwork },
        ...(encounterAdds[boss.slug] ?? []).map((name) => ({ name: tx(name, name), priority: "high" as const })),
      ],
      abilities, roles: roleTips,
    };
  });
  return localizePlan({
    slug, name: hub.names, artwork: hub.artwork, atlas, entrance: { x: 50, y: 95 },
    routePath: `M 50 95 ${pulls.map((pull) => `L ${pull.x} ${pull.y}`).join(" ")}`,
    pulls, bosses: [], coverage: "encounters",
    note: tx("Порядок встреч показан по каталогу рейда. Линия соединяет бои на схеме и не задаёт путь по этажам.", "Encounters follow the raid catalog order. The line connects fights on a schematic; it does not describe a path through floors."),
    sources: review.sources,
  });
}
