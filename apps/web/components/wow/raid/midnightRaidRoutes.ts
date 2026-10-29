import type { RaidSlug } from "@/lib/data/wow/raid/midnightRaidData";
import { voidspireReviewedPulls } from "./voidspireReviewedPulls";

export type RouteText = { ru: string; en: string };
export type RouteAction = "interrupt" | "move" | "defensive" | "dispel" | "focus" | "stop";

export type RaidRouteAbility = {
  spellId: number;
  casterNpcId?: number;
  name: RouteText;
  action: RouteAction;
  effect: RouteText;
  response: RouteText;
};

export type RaidRouteEnemy = {
  npcId?: number;
  name: RouteText;
  count?: number;
  priority: "critical" | "high" | "normal";
  note?: RouteText;
};

export type RaidRoutePull = {
  id: string;
  order: number;
  x: number;
  y: number;
  destinationBoss: number;
  title: RouteText;
  area: RouteText;
  danger: "low" | "medium" | "high";
  direction: RouteText;
  call: RouteText;
  enemies: RaidRouteEnemy[];
  abilities: RaidRouteAbility[];
  steps: RouteText[];
  next: RouteText;
  roles?: Record<"tank" | "healer" | "dps", RouteText[]>;
};

export type RaidRouteBossNode = {
  bossIndex: number;
  x: number;
  y: number;
};

export type RaidRouteGuide = {
  raid: RaidSlug;
  routePath: string;
  alternatePaths?: string[];
  entrance: { x: number; y: number };
  bosses: RaidRouteBossNode[];
  pulls: RaidRoutePull[];
  note: RouteText;
  source: string;
};

const ability = (
  spellId: number,
  nameRu: string,
  nameEn: string,
  action: RouteAction,
  effectRu: string,
  effectEn: string,
  responseRu: string,
  responseEn: string,
): RaidRouteAbility => ({
  spellId,
  name: { ru: nameRu, en: nameEn },
  action,
  effect: { ru: effectRu, en: effectEn },
  response: { ru: responseRu, en: responseEn },
});

const enemy = (
  npcId: number | undefined,
  nameRu: string,
  nameEn: string,
  count: number,
  priority: RaidRouteEnemy["priority"],
  noteRu: string,
  noteEn: string,
): RaidRouteEnemy => ({ npcId, name: { ru: nameRu, en: nameEn }, count, priority, note: { ru: noteRu, en: noteEn } });

export const midnightRaidRoutes: Record<RaidSlug, RaidRouteGuide> = {
  "the-voidspire": {
    raid: "the-voidspire",
    routePath: "M 50 95 L 50 86 L 50 75 L 50 67 L 29 65 L 24 48 L 19 43 L 24 48 L 29 65 L 50 67 L 69 57 L 81 43 L 69 57 L 50 57 L 50 39 L 50 31 L 50 21 L 50 15 L 50 7",
    alternatePaths: ["M 50 64 L 31 57 L 20 46", "M 50 64 L 69 57 L 80 46"],
    entrance: { x: 50, y: 95 },
    bosses: [
      { bossIndex: 0, x: 50, y: 75 },
      { bossIndex: 1, x: 19, y: 43 },
      { bossIndex: 2, x: 81, y: 43 },
      { bossIndex: 3, x: 50, y: 39 },
      { bossIndex: 4, x: 50, y: 21 },
      { bossIndex: 5, x: 50, y: 7 },
    ],
    note: {
      ru: "После Аверзиана рейд делится на левое и правое крыло. Слауроса на героической и выше оставьте до убийства Ненасытникуса и Салхадаара: его отражающий щит исчезнет только после обоих боссов.",
      en: "After Averzian, clear the left and right wings. On Heroic and above, leave Slauros until Vorasius and Salhadaar are dead; only then does his reflecting shield fall.",
    },
    source: "https://www.wowhead.com/news/all-lieutenant-enemies-that-drop-boes-in-midnight-season-1-raids-381260",
    pulls: voidspireReviewedPulls,
  },
  "the-dreamrift": {
    raid: "the-dreamrift",
    routePath: "M 50 94 C 47 75 53 56 50 18",
    entrance: { x: 50, y: 95 },
    bosses: [{ bossIndex: 0, x: 50, y: 18 }],
    note: {
      ru: "В Провале снов нет маршрута по обычным врагам: после входа вы сразу попадаете к Химерию. Карта показывает точку сбора и направление первого захода на арену.",
      en: "The Dreamrift has no trash route: zoning in takes you directly to Chimaerus. The map marks the rally point and first entry into the arena.",
    },
    source: "https://conquestcapped.com/guides/wow/dreamrift-raid-guide/",
    pulls: [
      {
        id: "dreamrift-01",
        order: 1,
        x: 50,
        y: 55,
        destinationBoss: 0,
        title: { ru: "Прямой вход на арену", en: "Direct arena entry" },
        area: { ru: "Вход → Химерий", en: "Entrance → Chimaerus" },
        danger: "low",
        direction: { ru: "Соберите двадцать игроков у входной кромки и заходите одной группой по центральной линии.", en: "Rally all twenty players at the threshold and enter together along the center line." },
        call: { ru: "Обычных врагов нет. До начала боя проверьте две группы: 1 танк, 2 лекаря и 7 бойцов в каждой.", en: "There are no trash enemies. Before the pull, verify two groups with one tank, two healers, and seven damage players each." },
        enemies: [],
        abilities: [],
        steps: [
          { ru: "Назначьте две равные группы до пересечения границы арены.", en: "Assign two balanced groups before crossing the arena boundary." },
          { ru: "Проверьте прерывания на Призрачную сущность внутри боя.", en: "Confirm the interrupt rotation for Haunting Essence during the fight." },
          { ru: "По команде заходите вместе и начинайте бой с центральной позиции.", en: "Enter together on the call and begin from center." },
        ],
        next: { ru: "Нажмите на портрет Химерия на карте, чтобы открыть его боевую схему.", en: "Select Chimaerus on the map to open the encounter plan." },
      },
    ],
  },
  "march-on-queldanas": {
    raid: "march-on-queldanas",
    routePath: "M 50 94 L 50 79 L 37 68 L 50 57 L 50 43 L 64 31 L 50 19 L 50 8",
    entrance: { x: 50, y: 95 },
    bosses: [
      { bossIndex: 0, x: 50, y: 57 },
      { bossIndex: 1, x: 50, y: 8 },
    ],
    note: {
      ru: "Марш идет через двор к Бело'рену, затем через вход в Темный Колодец к финалу. Троггара можно убить до любого босса; Моринас появляется на пути после Бело'рена.",
      en: "The march crosses the courtyard to Belo'ren, then passes through the Darkwell entrance to the finale. Throggar is available before any boss; Morinas is encountered after Belo'ren.",
    },
    source: "https://www.wowhead.com/news/all-lieutenant-enemies-that-drop-boes-in-midnight-season-1-raids-381260",
    pulls: [
      {
        id: "queldanas-01",
        order: 1,
        x: 43,
        y: 72,
        destinationBoss: 0,
        title: { ru: "Двор Троггара", en: "Throggar courtyard" },
        area: { ru: "Вход → внешний двор", en: "Entrance → outer courtyard" },
        danger: "high",
        direction: { ru: "Держитесь левой стены и вытяните Троггара из центра двора на входную арку. Не стойте рядом с точкой его прыжка.", en: "Hug the left wall and drag Throggar from the courtyard center to the entry arch. Keep clear of his leap target." },
        call: { ru: "Пять целей. Сначала Троггар, скитальцев собираем под ним. Выходим из вихря и разбиваем щит.", en: "Five targets. Focus Throggar and stack the drifters under him. Leave the whirlwind and break the shield." },
        enemies: [
          enemy(250802, "Разрушитель Бездны Троггар", "Voidbreaker Throggar", 1, "critical", "Лейтенант в центральном дворе до Бело'рена.", "Lieutenant in the central courtyard before Belo'ren."),
          enemy(250778, "Темный скиталец", "Dark Drifter", 4, "normal", "Сводятся под Троггара; танку нужен активный блок урона.", "Stack beneath Throggar; tank needs active mitigation."),
        ],
        abilities: [
          ability(1281525, "Пеплопад", "Cinderfall", "move", "Вихрь тени и пламени каждую секунду поражает всех рядом.", "A shadowflame whirlwind damages nearby players every second.", "Немедленно отойдите от Троггара; танк ведет его по краю двора.", "Move away from Throggar immediately while the tank walks him along the edge."),
          ability(1281528, "Пепельная завеса", "Ashen Veil", "focus", "Создает огромный поглощающий щит на самом Троггаре.", "Creates a massive absorb shield on Throggar.", "Все бойцы переключаются в щит; сильные способности не сохранять.", "All damage swaps to the shield; do not hold major cooldowns."),
          ability(1281532, "Рывок забвения", "Oblivion Rush", "move", "Прыгает к игроку, наносит урон и отбрасывает всех в радиусе 10 метров.", "Leaps to a player, damaging and knocking back everyone within ten yards.", "Цель уходит в пустой угол, остальные освобождают круг вокруг нее.", "Target moves to an empty corner while everyone else clears a ten-yard circle."),
        ],
        steps: [
          { ru: "Танк вытягивает Троггара к входной арке; скитальцы следуют за ним.", en: "Tank pulls Throggar to the entry arch with drifters following." },
          { ru: "На рывке цель уходит влево, рейд остается справа.", en: "Leap target moves left while the raid holds right." },
          { ru: "Завесу разбить всем рейдом до следующего Пеплопада.", en: "Break Ashen Veil as a raid before the next Cinderfall." },
        ],
        next: { ru: "После двора идите по центральной дорожке к Бело'рену.", en: "After the courtyard, take the center path to Belo'ren." },
      },
      {
        id: "queldanas-02",
        order: 2,
        x: 56,
        y: 37,
        destinationBoss: 1,
        title: { ru: "Врата Темного Колодца", en: "Darkwell gate" },
        area: { ru: "После Бело'рена", en: "After Belo'ren" },
        danger: "medium",
        direction: { ru: "После Бело'рена двигайтесь к входу в Темный Колодец. Моринаса держите в центре прохода, рейд — полукругом у дальней стены.", en: "After Belo'ren, move to the Darkwell entrance. Hold Morinas in the center of the passage with the raid in a semicircle at the far wall." },
        call: { ru: "Одна цель. Разрывы оставляем по краям, центр прохода сохраняем свободным.", en: "Single target. Drop ruptures at the edges and keep the center lane clear." },
        enemies: [
          enemy(250803, "Гладий Моринас", "Gladius Morinas", 1, "critical", "Лейтенант, охраняющий вход в Темный Колодец после Бело'рена.", "Lieutenant guarding the Darkwell entrance after Belo'ren."),
        ],
        abilities: [
          ability(1281453, "Разрывы Бездны", "Void Ruptures", "move", "Периодически выпускает разрушительную энергию вокруг себя.", "Periodically releases devouring void energy around the caster.", "Игроки с эффектом уходят к краям. Не перекрывайте центральный путь к финальной арене.", "Targets move to the edges. Never block the center path to the final arena."),
          ability(1283465, "Разрыв Бездны", "Void Rupture", "defensive", "Разрыв каждые три секунды наносит теневой урон ближайшим игрокам.", "The rupture pulses Shadow damage into nearby players every three seconds.", "Отойдите от активного разрыва; лекарям подготовить групповую защиту на второй цикл.", "Move away from active ruptures; healers prepare a raid defensive for the second cycle."),
        ],
        steps: [
          { ru: "Поставьте Моринаса в центре, не разворачивайте к входящему рейду.", en: "Place Morinas in center and keep him faced away from the entering raid." },
          { ru: "Первый разрыв — левый край, второй — правый край.", en: "Drop the first rupture left and the second right." },
          { ru: "После смерти соберитесь в центре перед входом в Колодец.", en: "After the kill, regroup in center before entering the Darkwell." },
        ],
        next: { ru: "Проходите через Темный Колодец к Торжеству Полуночи.", en: "Pass through the Darkwell toward Midnight Falls." },
      },
      {
        id: "queldanas-03",
        order: 3,
        x: 50,
        y: 23,
        destinationBoss: 1,
        title: { ru: "Темный переход", en: "Darkwell passage" },
        area: { ru: "Моринас → Солнечный Колодец", en: "Morinas → Sunwell" },
        danger: "low",
        direction: { ru: "После Моринаса держитесь центральной линии. Четырех скитальцев соберите у первой опоры, не тащите их до арены.", en: "After Morinas, stay on the center line. Stack four drifters at the first support and do not drag them into the arena." },
        call: { ru: "Четыре цели. Одна компактная остановка перед финальным боссом; фронтальные атаки направить в стену.", en: "Four targets. Make one compact stop before the final boss and face attacks into the wall." },
        enemies: [
          enemy(250778, "Темный скиталец", "Dark Drifter", 4, "high", "Последняя группа обычных врагов перед финальной ареной.", "Final regular-enemy group before the last arena."),
        ],
        abilities: [
          ability(1272971, "Космические щупальца", "Cosmic Tendrils", "defensive", "Удары скитальцев дополнительно наносят теневой урон.", "Drifter attacks deal additional Shadow damage.", "Танк использует активную защиту, лекарь заранее дает внешний сейв.", "Tank maintains active mitigation and healer pre-casts an external."),
        ],
        steps: [
          { ru: "Соберите всех четырех у первой опоры.", en: "Stack all four at the first support." },
          { ru: "Оглушите одновременно и убейте массовым уроном.", en: "AoE stun together and burn with cleave." },
          { ru: "Восстановите здоровье и ресурсы до пересечения границы арены.", en: "Restore health and resources before crossing the arena boundary." },
        ],
        next: { ru: "Финальная арена прямо впереди. Нажмите портрет босса для его боевой схемы.", en: "The final arena is straight ahead. Select the boss portrait for its encounter plan." },
      },
    ],
  },
};

export function getMidnightRaidRoute(slug: RaidSlug) {
  return midnightRaidRoutes[slug];
}
