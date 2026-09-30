import type { RaidSlug } from "./midnightRaidData";

export type RouteText = { ru: string; en: string };
export type RouteAction = "interrupt" | "move" | "defensive" | "dispel" | "focus" | "stop";

export type RaidRouteAbility = {
  spellId: number;
  name: RouteText;
  action: RouteAction;
  effect: RouteText;
  response: RouteText;
};

export type RaidRouteEnemy = {
  npcId?: number;
  name: RouteText;
  count: number;
  priority: "critical" | "high" | "normal";
  note: RouteText;
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
    routePath: "M 50 94 L 50 84 L 50 73 L 50 64 L 31 57 L 20 46 L 31 57 L 50 64 L 69 57 L 80 46 L 69 57 L 50 64 L 50 48 L 50 37 L 50 24 L 50 9",
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
    pulls: [
      {
        id: "voidspire-01",
        order: 1,
        x: 50,
        y: 86,
        destinationBoss: 0,
        title: { ru: "Передовой дозор", en: "Forward guard" },
        area: { ru: "Вход → лестница Аверзиана", en: "Entrance → Averzian stairs" },
        danger: "medium",
        direction: { ru: "Идите по центру и остановитесь у основания лестницы. Не цепляйте второй ряд до сборки первого.", en: "Take the center lane and stop at the stair base. Do not tag the second row until the first pack is stacked." },
        call: { ru: "Танк собирает пятерых у правой колонны. Все прерывания — в Призывателя, Облитератора разворачиваем от рейда.", en: "Tank stacks all five at the right pillar. Put every interrupt into the Caller and face the Obliterator away." },
        enemies: [
          enemy(240548, "Призыватель Бездны", "Abyssal Caller", 1, "critical", "Первый фокус: опасный дальний кастер.", "First focus: dangerous ranged caster."),
          enemy(240549, "Обскурион-облитератор", "Obscurion Obliterator", 2, "high", "Фронтальные удары; держать спиной к рейду.", "Frontal attacks; keep them faced away."),
          enemy(240545, "Освобожденный призрак", "Unbound Wraith", 2, "normal", "Добивать после кастеров.", "Cleave down after the casters."),
        ],
        abilities: [
          ability(1228330, "Стрела Бездны", "Void Bolt", "interrupt", "Сильный одиночный космический удар по текущей цели.", "Heavy single-target Cosmic hit on the current target.", "Прерывать по ротации. Первый кик — ближний боец, второй — дальний.", "Rotate interrupts. Melee takes the first, ranged takes the second."),
          ability(1230690, "Космическое сокрушение", "Cosmic Crush", "move", "Поднимает игроков в теневой пузырь и обрушивает на землю.", "Lifts players in a shadow bubble before slamming them down.", "Разойдитесь на 6 метров и не стойте перед Облитератором.", "Spread six yards and stay out of the Obliterator's front."),
          ability(1228345, "Безумие Бездны", "Madness of the Void", "dispel", "Ускоряет цель и резко повышает скорость передвижения.", "Greatly increases the target's haste and movement speed.", "Снимите усиление с призрака или дайте контроль до окончания эффекта.", "Purge the Wraith or hard-control it until the buff ends."),
        ],
        steps: [
          { ru: "Метка черепа — Призыватель Бездны.", en: "Skull the Abyssal Caller." },
          { ru: "Танк ставит пак у правой колонны и отворачивает фронтали.", en: "Tank stacks at the right pillar and turns frontals away." },
          { ru: "После смерти Призывателя добивайте двух Облитераторов одновременно.", en: "Once the Caller dies, cleave both Obliterators together." },
        ],
        next: { ru: "Поднимитесь прямо к арене Императора Аверзиана.", en: "Continue straight up to Imperator Averzian's arena." },
      },
      {
        id: "voidspire-02",
        order: 2,
        x: 36,
        y: 59,
        destinationBoss: 1,
        title: { ru: "Патруль Блинки", en: "Blinky patrol" },
        area: { ru: "Развилка → левое крыло", en: "Crossroads → left wing" },
        danger: "high",
        direction: { ru: "После Аверзиана поверните налево. Дождитесь, пока Блинки зайдет на ближнюю половину платформы, и тяните назад в коридор.", en: "Turn left after Averzian. Wait for Blinky to patrol onto the near half, then pull back into the corridor." },
        call: { ru: "Не совмещайте вой с топотом. Рейд стоит за спиной, дальние держат 8 метров.", en: "Do not overlap Howl with Stomp. Raid stays behind and ranged hold eight yards." },
        enemies: [
          enemy(240864, "Блинки", "Blinky", 1, "critical", "Лейтенант. Контролируйте вой и заранее прожимайте защиту на топот.", "Lieutenant. Stop the howl and pre-use defensives for stomp."),
          enemy(240554, "Ловец Бездны", "Voidstalker", 2, "normal", "Прыгают между целями; собрать рядом с Блинки.", "Warps between targets; keep them stacked on Blinky."),
        ],
        abilities: [
          ability(1258624, "Ужасающий вой", "Fearsome Howl", "stop", "Наносит урон в радиусе 30 метров и заставляет рейд бежать в страхе 6 секунд.", "Damages players within 30 yards and fears them for six seconds.", "Сбейте оглушением или массовым контролем. Это главный стоп пака.", "Stop it with a stun or hard crowd control. This is the pull's top priority."),
          ability(1236560, "Могучий топот", "Mighty Stomp", "defensive", "Ударяет весь рейд в радиусе 60 метров и отбрасывает.", "Hits the raid within 60 yards and knocks everyone back.", "Встаньте спиной к внутренней стене и используйте личную защиту.", "Put your back to the inner wall and use a personal defensive."),
          ability(1258621, "Скачок", "Blink", "move", "Блинки резко меняет позицию на платформе.", "Blinky rapidly changes position across the platform.", "Не преследуйте поодиночке — танк возвращает босса в отмеченную точку.", "Do not chase alone; let the tank return him to the marked position."),
        ],
        steps: [
          { ru: "Пулл назад в коридор, чтобы не зацепить следующую площадку.", en: "Pull back into the corridor to avoid the next platform." },
          { ru: "Стоп №1 — танк, стоп №2 — назначенный боец.", en: "Tank handles stop one; assigned damage player handles stop two." },
          { ru: "На топоте прижмитесь к внутренней стене.", en: "Hug the inner wall for Mighty Stomp." },
        ],
        next: { ru: "После Блинки идите по внешнему левому мосту к Мракозарии.", en: "After Blinky, follow the outer-left bridge to Voidlight Everdawn." },
      },
      {
        id: "voidspire-03",
        order: 3,
        x: 24,
        y: 48,
        destinationBoss: 1,
        title: { ru: "Жертвенный круг", en: "Sacrificial circle" },
        area: { ru: "Площадка Ненасытникуса", en: "Vorasius platform" },
        danger: "high",
        direction: { ru: "Остановитесь перед внешним кругом. Танк заходит первым и уводит призванных существ к левой стене.", en: "Stop before the outer ring. Tank enters first and drags summoned creatures to the left wall." },
        call: { ru: "Весь урон в Мракозарию. Призывы сводим под нее и быстро уничтожаем массовым уроном.", en: "All damage into Everdawn. Stack every summon beneath her and burn them with cleave." },
        enemies: [
          enemy(240831, "Мракозария Вечный Рассвет", "Voidlight Everdawn", 1, "critical", "Лейтенант перед Ненасытникусом; призывает подкрепления по мере потери здоровья.", "Lieutenant before Vorasius; summons reinforcements as health drops."),
          enemy(240857, "Темное порождение", "Darkspawn", 3, "high", "Появляются волнами; не отпускать к лекарям.", "Arrive in waves; keep them off healers."),
        ],
        abilities: [
          ability(1251405, "Зов Бездны", "Call of the Void", "focus", "По мере потери здоровья вызывает существ Бездны.", "Summons creatures of the Void as the caster loses health.", "Сохраните массовые оглушения на 70% и 40% здоровья; все призывы сводите в босса.", "Save AoE stops for roughly 70% and 40% health and stack summons into the lieutenant."),
        ],
        steps: [
          { ru: "Танк заводит лейтенанта к левой стене, рейд остается у входа.", en: "Tank moves the lieutenant to the left wall; raid stays near the entrance." },
          { ru: "На появлении существ — массовый контроль и приоритет ближайшему к лекарям.", en: "On summons, use AoE control and focus anything closest to healers." },
          { ru: "После пака не разбегайтесь: арена Ненасытникуса начинается сразу дальше.", en: "Stay grouped after the pull; Vorasius begins immediately ahead." },
        ],
        next: { ru: "Убейте Ненасытникуса и вернитесь к центральной развилке.", en: "Defeat Vorasius, then return to the central crossroads." },
      },
      {
        id: "voidspire-04",
        order: 4,
        x: 69,
        y: 57,
        destinationBoss: 2,
        title: { ru: "Страж правой террасы", en: "Right terrace guard" },
        area: { ru: "Развилка → правое крыло", en: "Crossroads → right wing" },
        danger: "high",
        direction: { ru: "От центра идите направо. Поймайте Стража на верхней площадке и разверните лицом к наружному краю.", en: "Take the right wing. Catch the Watcher on the upper platform and face it toward the outer edge." },
        call: { ru: "Луч — строго в стену. На Проклятом взоре игроки расходятся; щиты со Стойких снимаем сразу.", en: "Aim the breath into the wall. Spread for Cursed Gaze and purge the Stalwart shields immediately." },
        enemies: [
          enemy(252067, "Страж террасы", "Terrace Watcher", 1, "critical", "Лейтенант с длинной фронталью и персональным проклятием.", "Lieutenant with a long frontal and personal curse."),
          enemy(251239, "Стойкий темный страж", "Shadowguard Stalwart", 2, "high", "Накладывает большой поглощающий щит на союзников.", "Applies a large absorb shield to allies."),
        ],
        abilities: [
          ability(1236497, "Космическое дыхание", "Cosmic Breath", "move", "Длинный девятисекундный луч в направлении цели.", "A long nine-second breath in the target's direction.", "Танк фиксирует направление в стену; никто не пересекает голову Стража.", "Tank locks the boss toward the wall; nobody crosses its head."),
          ability(1258656, "Проклятый взор", "Cursed Gaze", "move", "Отмеченные игроки наносят урон союзникам в радиусе 7 метров в течение 8 секунд.", "Marked players damage allies within seven yards for eight seconds.", "Отмеченные расходятся по краям платформы; лекари готовят точечное лечение.", "Marked players fan out along the platform edge; healers spot-heal them."),
          ability(1255702, "Смоляной бастион", "Pitch Bulwark", "dispel", "Дает союзникам мощный поглощающий щит.", "Grants allies a powerful absorb shield.", "Снимите магическое усиление или быстро разбейте щит до следующего дыхания.", "Purge the magic buff or break the shield before the next breath."),
        ],
        steps: [
          { ru: "Череп — Страж террасы, кресты — два Стойких.", en: "Skull the Watcher; cross-mark both Stalwarts." },
          { ru: "Танк держит голову к наружному краю до конца дыхания.", en: "Tank holds the head toward the outer edge through the full breath." },
          { ru: "Игроки со Взором занимают свободные углы и не пересекают центр.", en: "Gaze targets take empty corners and never cross through center." },
        ],
        next: { ru: "Спускайтесь по правому мосту к Павшему королю Салхадаару.", en: "Descend the right bridge toward Fallen-King Salhadaar." },
      },
      {
        id: "voidspire-05",
        order: 5,
        x: 50,
        y: 57,
        destinationBoss: 3,
        title: { ru: "Гладий Слаурос", en: "Gladius Slauros" },
        area: { ru: "Центральная лестница", en: "Central staircase" },
        danger: "high",
        direction: { ru: "Возвращайтесь сюда только после убийства обоих боссов крыльев. Слаурос стоит наверху центральной лестницы.", en: "Return only after both wing bosses are dead. Slauros waits at the top of the central stairs." },
        call: { ru: "После снятия щита стойте полукругом за спиной. Уходите из разрывов и не заходите в конус Убойного натиска.", en: "Once the shield is gone, form a semicircle behind him. Dodge ruptures and never enter the Slaughter cone." },
        enemies: [
          enemy(252066, "Гладий Слаурос", "Gladius Slauros", 1, "critical", "Лейтенант. На героической+ отражает урон, пока живы боссы обоих крыльев.", "Lieutenant. On Heroic+, reflects damage while either wing boss remains alive."),
        ],
        abilities: [
          ability(1282201, "Сила в тенях", "Strength in Shadows", "focus", "Отражает 50% наносимого урона, пока его усиливают боссы крыльев.", "Reflects 50% of incoming damage while empowered by the wing bosses.", "Не атакуйте до убийства Ненасытникуса и Салхадаара. После их смерти щит исчезнет.", "Do not engage until Vorasius and Salhadaar are dead. The shield then drops."),
          ability(1258601, "Убойный натиск", "Slaughter!", "move", "Несколько раз поражает всех в широком конусе перед собой.", "Repeatedly strikes everyone in a wide frontal cone.", "Танк не вращает цель; весь рейд мгновенно проходит за спину.", "Tank holds the boss still; the raid immediately crosses behind."),
          ability(1281728, "Гнев забвения", "Oblivion's Wrath", "move", "Пускает линии разрывов Бездны, которые отбрасывают игроков.", "Sends void ruptures along lanes that damage and knock players back.", "Смотрите под ноги и переходите на свободную дорожку, не бегите вдоль линии.", "Watch the floor and sidestep into a clear lane; never run along a rupture."),
        ],
        steps: [
          { ru: "Проверьте: Ненасытникус и Салхадаар мертвы, щита на Слауросе нет.", en: "Confirm Vorasius and Salhadaar are dead and Slauros has no shield." },
          { ru: "Танк ставит цель у верхней ступени лицом от рейда.", en: "Tank places him on the upper step, facing away from the raid." },
          { ru: "Сначала движение из линий, потом возврат в полукруг.", en: "Dodge rupture lanes first, then reform the semicircle." },
        ],
        next: { ru: "Поднимитесь через освобожденный центр к Ваэлгору и Эззораку.", en: "Push through the cleared center toward Vaelgor and Ezzorak." },
      },
      {
        id: "voidspire-06",
        order: 6,
        x: 50,
        y: 31,
        destinationBoss: 4,
        title: { ru: "Кольцо исполина", en: "Behemoth ring" },
        area: { ru: "После драконов → внешний круг", en: "After the dragons → outer ring" },
        danger: "high",
        direction: { ru: "После Ваэлгора и Эззорака поднимитесь по лестнице. Дождитесь, пока большой исполин уйдет от следующего пака, и заберите его с малыми медузами внутрь кольца.", en: "After Vaelgor and Ezzorak, climb the stairs. Wait for the behemoth to separate from the next pack, then pull it with the small jellyfish into the inner ring." },
        call: { ru: "Пять целей. Малых существ собираем под исполином; на выбросе прячемся за внутренними колоннами.", en: "Five targets. Stack the small creatures under the behemoth and line-of-sight the ejection behind inner pillars." },
        enemies: [
          enemy(256598, "Небесный исполин", "Celestial Behemoth", 1, "critical", "Крупный патрулирующий лейтенант после драконов.", "Large patrolling lieutenant after the dragons."),
          enemy(243827, "Капля Бездны", "Void Droplet", 4, "normal", "Малые медузы; собрать под основной целью.", "Small jellyfish; stack under the main target."),
        ],
        abilities: [
          ability(1270212, "Мрачный выброс", "Umbral Ejection", "move", "Взрывает область и отбрасывает всех игроков в поле зрения.", "Detonates the area and knocks back every player in line of sight.", "По команде спрячьтесь за внутреннюю колонну; не стойте спиной к внешнему краю.", "Hide behind an inner pillar on the call; never put the outer edge behind you."),
          ability(1247054, "Грозовой всплеск", "Lightning Surge", "move", "Поражает игроков молнией в радиусе 8 метров.", "Strikes players with lightning in an eight-yard area.", "Дальние расходятся веером, ближние оставляют свободный сектор танку.", "Ranged fan out; melee leave a clear sector for the tank."),
          ability(1247056, "Шоковые щупальца", "Shocking Tendrils", "defensive", "Атаки исполина дополнительно наносят природный урон.", "The behemoth's attacks deal additional Nature damage.", "Танк чередует защиту; лекарь держит внешнюю способность на вторую половину боя.", "Tank rotates mitigation; healer saves an external for the second half."),
        ],
        steps: [
          { ru: "Поймайте патруль отдельно от следующей группы.", en: "Catch the patrol separately from the next group." },
          { ru: "Сведите четырех Капель под Исполина и оглушите одновременно.", en: "Stack all four Droplets under the Behemoth and stun together." },
          { ru: "На Мрачном выбросе весь рейд ломает линию видимости.", en: "Break line of sight as a raid for Umbral Ejection." },
        ],
        next: { ru: "Продолжайте по кольцу к Ослепленному авангарду.", en: "Continue around the ring toward the Lightblinded Vanguard." },
      },
      {
        id: "voidspire-07",
        order: 7,
        x: 50,
        y: 15,
        destinationBoss: 5,
        title: { ru: "Последний заслон", en: "Final blockade" },
        area: { ru: "Авангард → вершина Шпиля", en: "Vanguard → spire summit" },
        danger: "medium",
        direction: { ru: "После Авангарда держитесь внутренней стороны подъема. Заберите ближнего призывателя отдельно, затем подтяните остальных в его точку.", en: "After the Vanguard, hug the inside of the ascent. Pull the nearest caller alone, then drag the rest onto its position." },
        call: { ru: "Пять целей. Темного заклинателя убить первым, щиты снять, залп пережить личной защитой.", en: "Five targets. Kill the Darkcaller first, purge shields, and personal-defensive the barrage." },
        enemies: [
          enemy(259918, "Пожирающий темный заклинатель", "Devouring Darkcaller", 1, "critical", "Призывает существ и усиливает весь заслон.", "Summons creatures and empowers the entire blockade."),
          enemy(240548, "Призыватель Бездны", "Abyssal Caller", 2, "high", "Ротация прерываний по двум целям.", "Split the interrupt rotation across both targets."),
          enemy(251239, "Стойкий темный страж", "Shadowguard Stalwart", 2, "normal", "Снимаемые щиты на союзниках.", "Purgeable shields on allies."),
        ],
        abilities: [
          ability(1282010, "Зов тьмы", "Darkness Calls", "interrupt", "Призывает на помощь существ Бездны.", "Calls creatures of the Void to aid the caster.", "Это первый приоритет прерывания; назначьте два резервных кика.", "This is the first interrupt priority; assign two backups."),
          ability(1274846, "Темный залп", "Dark Barrage", "defensive", "Поражает темной энергией нескольких игроков одновременно.", "Hurls dark energy at several players at once.", "Разойдитесь и используйте личную защиту, если совпало со щитами.", "Spread and use a personal defensive if it overlaps with shields."),
          ability(1255702, "Смоляной бастион", "Pitch Bulwark", "dispel", "Закрывает союзников мощным поглощающим щитом.", "Covers allies with a powerful absorb shield.", "Снять усиление со Стража сразу после применения.", "Purge the Stalwart immediately after the cast."),
        ],
        steps: [
          { ru: "Череп — Темный заклинатель; два Призывателя получают отдельные метки.", en: "Skull the Darkcaller and put distinct marks on both Callers." },
          { ru: "Не тратьте все прерывания одновременно — соблюдайте очередь.", en: "Do not overlap interrupts; follow the assigned order." },
          { ru: "После пака восстановитесь до входа на вершину.", en: "Recover before entering the summit." },
        ],
        next: { ru: "Поднимайтесь прямо к Короне космоса — дальше обычных врагов нет.", en: "Climb straight to Crown of the Cosmos; no regular enemies remain." },
      },
    ],
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
