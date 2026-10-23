import type { RouteAbility, RouteEnemy, RouteStop } from "@/lib/data/wow/mythic/rubyLifePoolsData";
import { targetLabel, type RouteLocale } from "./mythicRouteCopy";

type EnemyRouteIntel = {
  summary: string;
  danger: string;
  mechanics: RouteAbility[];
};

type AbilityRouteIntel = {
  effect: string;
  failure: string;
};

const actionInstruction: Record<RouteAbility["action"], string> = {
  "Кик": "прервать до завершения применения",
  "Стоп": "остановить оглушением или другим контролем",
  "Диспел": "быстро снять негативный эффект",
  "Пурж": "снять усиление с противника",
  "Фокус": "немедленно переключить в неё основной урон",
  "Уклонение": "выйти из отмеченной области или линии атаки",
  "Защита": "заранее использовать назначенную защиту",
};

const failureByAction: Record<RouteAbility["action"], string> = {
  "Кик": "Если заклинание завершится, группа получит предотвращаемый урон или опасный эффект и потеряет контроль над боем.",
  "Стоп": "Без оглушения или другого контроля способность полностью сработает и создаст опасное окно для всей группы.",
  "Диспел": "Неснятый эффект продолжит наносить урон или ограничивать игрока, заметно увеличивая нагрузку на лекаря.",
  "Пурж": "Пока усиление активно, противник живёт дольше или наносит значительно больше урона.",
  "Фокус": "Если не переключиться сразу, дополнительная цель усилит бой, сорвёт тайминг или наложит следующую механику.",
  "Уклонение": "Игроки, оставшиеся в зоне поражения, получат тяжёлый урон и могут сорвать прохождение этого этапа.",
  "Защита": "Без личной или групповой защиты входящий урон может превысить доступное лечение.",
};

const actionInstructionEn: Record<RouteAbility["action"], string> = {
  "Кик": "interrupt it before the cast finishes",
  "Стоп": "stop it with a stun or other crowd control",
  "Диспел": "dispel the effect quickly",
  "Пурж": "purge the buff from the enemy",
  "Фокус": "switch main damage to it at once",
  "Уклонение": "step out of the marked area or line",
  "Защита": "use the assigned defensive in advance",
};

const failureByActionEn: Record<RouteAbility["action"], string> = {
  "Кик": "If the cast finishes, the party takes avoidable damage or a dangerous effect and loses control of the fight.",
  "Стоп": "Without a stun or other control the ability goes off in full and opens a dangerous window for the whole party.",
  "Диспел": "The effect keeps dealing damage or limiting the player and adds a lot of pressure on the healer.",
  "Пурж": "While the buff is active the enemy lives longer or deals much more damage.",
  "Фокус": "If damage does not switch at once, the extra target strengthens the fight, breaks the timing or applies the next mechanic.",
  "Уклонение": "Players left in the area take heavy damage and can break this part of the route.",
  "Защита": "Without a personal or party defensive the incoming damage can exceed the available healing.",
};

const priorityPhraseEn: Record<RouteEnemy["priority"], string> = {
  boss: "the key target of the fight",
  high: "a priority target for the party",
  medium: "the second target after the marked dangerous enemies",
  low: "a regular target that is easy to clear with area damage",
};

function normalized(value: string) {
  return value.toLocaleLowerCase("en-US").replaceAll("’", "'");
}

function belongsToEnemy(ability: RouteAbility, enemyName: string) {
  if (!ability.source) return false;
  const source = normalized(ability.source);
  const enemy = normalized(enemyName);
  return source.includes(enemy) || enemy.includes(source);
}

function matchingSentence(stop: RouteStop, ability: RouteAbility) {
  const needle = normalized(ability.name);
  const callout = stop.callouts.find((item) => normalized(item).includes(needle));
  if (callout) return callout;
  return stop.summary
    .split(/(?<=[.!?])\s+/)
    .find((item) => normalized(item).includes(needle)) ?? "";
}

export function enemyMechanics(enemyName: string, stop: RouteStop) {
  return stop.abilities.filter((ability) => belongsToEnemy(ability, enemyName));
}

export function routeEnemyIntel(enemy: RouteEnemy, stop: RouteStop, dungeonName: string, locale: RouteLocale = "ru"): EnemyRouteIntel {
  const mechanics = enemyMechanics(enemy.name, stop);
  if (locale === "en") {
    const names = mechanics.slice(0, 3).map((ability) => ability.name);
    return {
      summary: `${enemy.name} is ${priorityPhraseEn[enemy.priority]} on this step of ${dungeonName}. ${names.length ? `Watch for: ${names.join(", ")}.` : "Keep it with the pack and inside the party's area damage."}`,
      danger: mechanics.length
        ? mechanics.slice(0, 2).map((ability) => `${ability.name}: ${actionInstructionEn[ability.action]}`).join("; ") + "."
        : enemy.priority === "boss"
          ? "Handle the marked mechanics of this step and keep defensives for the dangerous casts."
          : `Left without crowd control and priority damage, ${enemy.name} makes this step take longer than planned and adds pressure on the party.`,
      mechanics,
    };
  }
  const priority = enemy.priority === "boss"
    ? "ключевая цель боя"
    : enemy.priority === "high"
      ? "приоритетная цель группы"
      : enemy.priority === "medium"
        ? "вторая цель после отмеченных опасных врагов"
        : "обычная цель, которую удобно забирать массовым уроном";
  const mechanicNames = mechanics.slice(0, 3).map((ability) => ability.name);
  const summary = `${enemy.name} — ${priority} на этапе «${stop.title}» в подземелье «${dungeonName}». ${mechanicNames.length ? `Следите за механиками: ${mechanicNames.join(", ")}.` : "Держите цель вместе с группой и не выводите её из общей зоны урона."}`;
  const danger = mechanics.length
    ? mechanics.slice(0, 2).map((ability) => `${ability.name} — ${actionInstruction[ability.action]}`).join("; ") + "."
    : enemy.priority === "boss"
      ? stop.summary
      : `Если оставить ${enemy.name} без контроля и приоритетного урона, этот этап займёт дольше запланированного и создаст лишнее давление на группу.`;
  return { summary, danger, mechanics };
}

export function routeAbilityIntel(ability: RouteAbility, stop: RouteStop, locale: RouteLocale = "ru"): AbilityRouteIntel {
  if (locale === "en") {
    return {
      effect: `${ability.name} is cast by ${ability.source ?? "a dangerous enemy"}. Party response: ${actionInstructionEn[ability.action]}; handled by ${targetLabel(ability.target, "en")}.`,
      failure: failureByActionEn[ability.action],
    };
  }
  const source = ability.source ?? "опасный противник";
  const routeNote = matchingSentence(stop, ability);
  const effect = routeNote
    ? `${routeNote} Применяет: ${source}; этап маршрута — «${stop.title}».`
    : `${ability.name} применяет ${source} на этапе «${stop.title}». Реакция группы: ${actionInstruction[ability.action]}; отвечает ${ability.target}.`;
  return { effect, failure: failureByAction[ability.action] };
}
