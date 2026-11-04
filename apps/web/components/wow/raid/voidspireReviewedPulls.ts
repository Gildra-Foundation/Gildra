import type { RaidRoutePull, RouteText } from "./midnightRaidRoutes";

/** NPC ownership and EN/RU identities checked against Wowhead records, 26 Oct 2026.
 * Counts, satellite packs, exact trash coordinates and unsupported control claims
 * are omitted. The final point is a rally, not an invented trash group. */
const text = (ru: string, en: string): RouteText => ({ ru, en });

export const voidspireReviewedPulls: RaidRoutePull[] = [
  {
    id: "voidspire-01",
    order: 1,
    x: 50,
    y: 86,
    destinationBoss: 0,
    title: text("Группы у входа", "Entrance packs"),
    area: text("Перед Аверзианом", "Before Averzian"),
    danger: "medium",
    call: text("Сначала убейте заклинателя. Не приводите новых врагов, пока танк не собрал текущую группу.", "Focus the ranged caster first; gather the current group before pulling more."),
    enemies: [
      {
        npcId: 240548,
        name: text("Пустотный зовущий", "Abyssal Caller"),
        priority: "critical"
      },
      {
        npcId: 240549,
        name: text("Обскурион-уничтожитель", "Obscurion Obliterator"),
        priority: "high"
      },
      {
        npcId: 240545,
        name: text("Непокорный дух", "Unbound Wraith"),
        priority: "normal"
      }
    ],
    abilities: [
      {
        spellId: 1228330,
        casterNpcId: 240548,
        name: text("Стрела Бездны", "Void Bolt"),
        action: "interrupt",
        effect: text("Наносит космический урон текущей цели.", "Deals Cosmic damage to the current target."),
        response: text("Один игрок прерывает Пустотного зовущего, второй страхует его. Не используйте оба прерывания одновременно.", "Assign one player to interrupt the Abyssal Caller and another as backup. Do not use both interrupts at once.")
      },
      {
        spellId: 1230690,
        casterNpcId: 240549,
        name: text("Космическое сминание", "Cosmic Crush"),
        action: "defensive",
        effect: text("Поднимает игроков, ненадолго оглушает и обрушивает на землю.", "Lifts players, briefly stuns them and slams them into the ground."),
        response: text("Перед ударом восстановите здоровье. Если здоровья мало, заранее используйте защитную способность.", "Heal up before the impact. If your health is low, use a defensive ability before it hits.")
      },
      {
        spellId: 1228345,
        casterNpcId: 240545,
        name: text("Безумие Бездны", "Madness of the Void"),
        action: "dispel",
        effect: text("Ускоряет атаки и передвижение Непокорного духа. Это магическое усиление.", "Increases the Unbound Wraith’s haste and movement speed. This is a Magic buff."),
        response: text("Снимите магическое усиление с врага. Кража заклинания здесь не работает.", "Remove the buff with an offensive dispel. Spellsteal does not work.")
      }
    ],
    roles: {
      tank: [
        text("Удерживайте заклинателя вместе с остальными врагами.", "Keep the caster grouped with the other enemies.")
      ],
      healer: [
        text("Лечите цель Стрелы Бездны и готовьтесь восстановить здоровье группы после подброса.", "Heal the Void Bolt target and be ready to heal the group after the knock-up.")
      ],
      dps: [
        text("Следуйте очереди прерываний. Не тратьте способность, если другой игрок уже остановил заклинание или снял усиление.", "Follow the assigned interrupt order. Save your ability if another player has already stopped the cast or removed the buff.")
      ]
    },
    direction: text("От входа двигайтесь к Аверзиану. Разбирайте группы у входа по одной: зовущего собирайте с ближайшими духами, уничтожителя не добавляйте к ещё живой группе.", "Advance from the entrance to Averzian. Clear entrance packs one at a time: gather a Caller with nearby Wraiths and keep the Obliterator out of an unfinished pull."),
    steps: [],
    next: text("Далее — Император Аверзиан.", "Next: Imperator Averzian.")
  },
  {
    id: "voidspire-02",
    order: 2,
    x: 36,
    y: 59,
    destinationBoss: 1,
    title: text("Патруль Мигуна", "Blinky patrol"),
    area: text("Левое крыло", "Left wing"),
    danger: "medium",
    call: text("Не стойте у внешнего края: топот отбрасывает игроков.", "Stay away from the outer edge: Stomp knocks players back."),
    enemies: [
      {
        npcId: 240864,
        name: text("Мигун", "Blinky"),
        priority: "critical"
      }
    ],
    abilities: [
      {
        spellId: 1258624,
        casterNpcId: 240864,
        name: text("Ужасающий вой", "Fearsome Howl"),
        action: "move",
        effect: text("Вой поражает игроков в радиусе 30 м и вызывает страх на 6 секунд.", "The howl hits players within 30 yards and fears them for 6 seconds."),
        response: text("Пока Мигун готовит вой, выйдите за его радиус или используйте способность, защищающую от страха.", "While Blinky casts the howl, move out of range or use an ability that protects against fear.")
      },
      {
        spellId: 1236560,
        casterNpcId: 240864,
        name: text("Могучий топот", "Mighty Stomp"),
        action: "defensive",
        effect: text("Урон по группе и отбрасывание в радиусе 60 м.", "Group damage and a knockback within 60 yards."),
        response: text("Встаньте так, чтобы отбрасывание не сбросило вас с платформы. Перед ударом используйте защиту.", "Leave enough platform behind you to survive the knockback. Use a defensive ability before the hit.")
      },
      {
        spellId: 1258621,
        casterNpcId: 240864,
        name: text("Скачок", "Blink"),
        action: "move",
        effect: text("Телепортируется к случайному игроку.", "Teleports to a random player."),
        response: text("После телепорта снова займите безопасное место. Не подбегайте к соседним врагам.", "Move back to a safe position after the teleport. Avoid nearby enemies.")
      }
    ],
    roles: {
      tank: [
        text("Возвращайте Мигуна на безопасную часть площадки после скачка.", "Bring Blinky back to safe platform space after a teleport.")
      ],
      healer: [
        text("Вылечите группу до того, как начнётся топот.", "Top up the group before Stomp.")
      ],
      dps: [
        text("После телепорта подойдите на расстояние атаки, не задевая соседние группы.", "Stay in reach after teleports without pulling nearby enemies.")
      ]
    },
    direction: text("После Аверзиана идите в левое крыло. Остановитесь на площадке за верхом лестницы и дождитесь патруля Мигуна; соседних врагов не привлекайте.", "After Averzian, take the left wing. Stop on the platform behind the top of the stairs and wait for Blinky’s patrol; keep nearby packs separate."),
    steps: [],
    next: text("Продолжайте к Мракозарии.", "Continue to Voidlight Everdawn.")
  },
  {
    id: "voidspire-03",
    order: 3,
    x: 24,
    y: 48,
    destinationBoss: 1,
    title: text("Мракозария Вечный Рассвет", "Voidlight Everdawn"),
    area: text("Перед Ненасытникусом", "Before Vorasius"),
    danger: "medium",
    call: text("Собирайте появляющихся существ рядом с основной целью.", "Gather summoned creatures beside the main target."),
    enemies: [
      {
        npcId: 240831,
        name: text("Мракозария Вечный Рассвет", "Voidlight Everdawn"),
        priority: "critical"
      }
    ],
    abilities: [
      {
        spellId: 1251405,
        casterNpcId: 240831,
        name: text("Зов Бездны", "Call of the Void"),
        action: "focus",
        effect: text("Призывает существ Бездны по мере потери здоровья.", "Summons Void creatures as health decreases."),
        response: text("Сразу атакуйте опасных призванных врагов. Не давайте им бить целителей.", "Switch to dangerous summoned enemies immediately. Keep them off healers.")
      }
    ],
    roles: {
      tank: [
        text("Забирайте на себя появляющихся врагов.", "Take control of newly summoned enemies.")
      ],
      healer: [
        text("Лечите игроков, которых атакуют призванные враги.", "Heal players attacked by summoned enemies.")
      ],
      dps: [
        text("Бейте Мракозарию, но быстро переключайтесь на призванных врагов.", "Attack Everdawn, but switch quickly to summoned enemies.")
      ]
    },
    direction: text("От Мигуна продолжайте по левому крылу на внешнюю площадку. Убейте Мракозарию и призванных врагов, затем Ненасытникуса. Вернитесь через центр к правой лестнице.", "Continue from Blinky along the left wing to the outside platform. Defeat Everdawn and her summons, then Vorasius. Return through the center to the right-hand stairs."),
    steps: [],
    next: text("Далее — Ненасытникус.", "Next: Vorasius.")
  },
  {
    id: "voidspire-04",
    order: 4,
    x: 69,
    y: 57,
    destinationBoss: 2,
    title: text("Дозорный террасы", "Terrace Watcher"),
    area: text("Правое крыло", "Right wing"),
    danger: "medium",
    call: text("Направляйте дыхание в сторону от рейда. Оставьте у края место для игроков с Проклятым взглядом.", "Aim the breath away from the raid and leave edge space for Gaze targets."),
    enemies: [
      {
        npcId: 252067,
        name: text("Дозорный террасы", "Terrace Watcher"),
        priority: "critical"
      }
    ],
    abilities: [
      {
        spellId: 1236497,
        casterNpcId: 252067,
        name: text("Космическое дыхание", "Cosmic Breath"),
        action: "move",
        effect: text("Дышит в сторону выбранной цели в течение 9 секунд.", "Breathes toward its target for 9 seconds."),
        response: text("Отойдите с пути дыхания до первого удара.", "Move out of the breath’s path before the first hit.")
      },
      {
        spellId: 1258656,
        casterNpcId: 252067,
        name: text("Проклятый взгляд", "Cursed Gaze"),
        action: "move",
        effect: text("Отмеченный игрок наносит урон союзникам в радиусе 7 м в течение 8 секунд.", "Marked players damage allies within 7 yards for 8 seconds."),
        response: text("С меткой отойдите от других игроков. Не возвращайтесь через группу, пока эффект не закончится.", "With the debuff, move away from other players. Do not run through the group until it ends.")
      }
    ],
    roles: {
      tank: [
        text("Следите за направлением Дозорного при смене цели.", "Watch the Watcher’s facing when its target changes.")
      ],
      healer: [
        text("Поддерживайте игроков с Проклятым взглядом.", "Spot-heal players with Cursed Gaze.")
      ],
      dps: [
        text("Не занимайте путь отхода от дыхания и места для игроков с метками.", "Preserve room to leave the breath and separate debuffs.")
      ]
    },
    direction: text("После Ненасытникуса вернитесь в центр и поднимитесь по правой лестнице. Возьмите Дозорного на верхней площадке отдельно, затем идите к Салхадаару.", "After Vorasius, return to the center and climb the right-hand stairs. Pull the Watcher separately on the upper platform, then continue to Salhadaar."),
    steps: [],
    next: text("Далее — Павший король Салхадаар.", "Next: Fallen-King Salhadaar.")
  },
  {
    id: "voidspire-05",
    order: 5,
    x: 50,
    y: 57,
    destinationBoss: 3,
    title: text("Гладий Слаурос", "Gladius Slauros"),
    area: text("Центральная лестница", "Central staircase"),
    danger: "medium",
    call: text("На героической и эпохальной сложности сначала убейте боссов обоих крыльев. Иначе Сила в тенях будет отражать ваш урон.", "On Heroic/Mythic, defeat both wing bosses first: Strength in Shadows reflects damage."),
    enemies: [
      {
        npcId: 252066,
        name: text("Гладий Слаурос", "Gladius Slauros"),
        priority: "critical"
      }
    ],
    abilities: [
      {
        spellId: 1258601,
        casterNpcId: 252066,
        name: text("Резня!", "Slaughter!"),
        action: "move",
        effect: text("Несколько раз бьёт по области перед собой.", "Repeated strikes in a frontal cone."),
        response: text("Во время Резни уходите за спину Слауросу. Танк не должен разворачивать его удары в сторону рейда.", "Move behind Slauros during Slaughter. The tank must keep the strikes facing away from the raid.")
      },
      {
        spellId: 1281728,
        casterNpcId: 252066,
        name: text("Гнев забвения", "Oblivion's Wrath"),
        action: "move",
        effect: text("Разрывы Бездны наносят урон и отбрасывают на своей траектории.", "Void ruptures damage and knock back players in their path."),
        response: text("Уйдите в сторону с пути разрыва, на свободный участок пола.", "Step sideways out of a rupture’s path into clear space.")
      }
    ],
    roles: {
      tank: [
        text("Держите Слауроса лицом в одну сторону, пока он наносит удары перед собой.", "Keep Slauros facing one direction while he attacks in front of him.")
      ],
      healer: [
        text("Восстанавливайте здоровье после попаданий разрывов.", "Recover health after rupture hits.")
      ],
      dps: [
        text("Атакуйте с безопасной стороны, сохраняя проход между линиями.", "Attack from a safe side and keep a lane through the ruptures.")
      ]
    },
    direction: text("После Ненасытникуса и Салхадаара вернитесь к центральной лестнице. Дождитесь снятия отражающего щита на героической и выше, убейте Слауроса, затем идите к драконам.", "After Vorasius and Salhadaar, return to the central stairs. On Heroic and above, wait for the reflecting shield to drop; defeat Slauros, then proceed to the dragons."),
    steps: [],
    next: text("Далее — Ваэлгор и Эззорак.", "Next: Vaelgor and Ezzorak.")
  },
  {
    id: "voidspire-06",
    order: 6,
    x: 50,
    y: 31,
    destinationBoss: 4,
    title: text("Небесный исполин", "Celestial Behemoth"),
    area: text("После Ваэлгора и Эззорака", "After Vaelgor and Ezzorak"),
    danger: "medium",
    call: text("Сначала убейте мелких медуз, затем исполина. Следите за накоплением Космического вливания и уроном Небесной зоны.", "Clear the small jellyfish before the Behemoth. On the Behemoth, watch Cosmic Injection stacks and Celestial Zone damage."),
    enemies: [
      {
        npcId: 252070,
        name: text("Небесный исполин", "Celestial Behemoth"),
        priority: "critical"
      }
    ],
    abilities: [
      {
        spellId: 1259291,
        casterNpcId: 252070,
        name: text("Космическое вливание", "Cosmic Injection"),
        action: "defensive",
        effect: text("Наносит космический урон и снижает все характеристики цели. Эффект суммируется.", "Deals Cosmic damage and reduces all of the target’s stats. The effect stacks."),
        response: text("Следите за числом наложений эффекта: он всё сильнее снижает характеристики. Лечите поражённого игрока.", "Watch how many stacks the target has: each one reduces their stats further. Keep that player healed.")
      },
      {
        spellId: 1259328,
        casterNpcId: 252070,
        name: text("Небесная зона", "Celestial Zone"),
        action: "move",
        effect: text("Зона наносит периодический космический урон и повышает скорость всех существ внутри.", "The zone deals periodic Cosmic damage and increases the haste of all units inside."),
        response: text("В зоне идёт постоянный урон — следите за здоровьем. Не заводите туда соседние группы врагов.", "The zone deals ongoing damage, so watch your health. Do not bring nearby enemy groups into it.")
      }
    ],
    roles: {
      tank: [
        text("Следите, сколько раз на вас наложено Космическое вливание: эффект снижает характеристики.", "Track the stat-reduction stacks from Cosmic Injection.")
      ],
      healer: [
        text("Поддерживайте цель Космического вливания и игроков в Небесной зоне.", "Support the Cosmic Injection target and players in Celestial Zone.")
      ],
      dps: [
        text("Следите за уроном Небесной зоны при выборе позиции.", "Watch Celestial Zone damage when choosing your position.")
      ]
    },
    direction: text("После драконов поднимитесь на кольцо. Сначала зачистите охраняющих его мелких медуз, затем дождитесь исполина на свободном участке и возьмите его отдельно. Далее — Авангард.", "After the dragons, climb to the ring. Clear the guarding small jellyfish first, then wait for the Behemoth in cleared space and pull it separately. Continue to the Vanguard."),
    steps: [],
    next: text("Далее — Ослеплённый авангард.", "Next: Lightblinded Vanguard.")
  },
  {
    id: "voidspire-07",
    order: 7,
    x: 50,
    y: 15,
    destinationBoss: 5,
    title: text("Перед финалом", "Before the final encounter"),
    area: text("Корона космоса", "Crown of the Cosmos"),
    danger: "medium",
    call: text("До начала боя распределите цели и защитные способности на основные фазы.", "Before starting, assign targets and defensive abilities for the main phases."),
    enemies: [],
    abilities: [],
    roles: {
      tank: [
        text("Согласуйте распределение целей между танками.", "Agree which tank handles each target.")
      ],
      healer: [
        text("Договоритесь, кто и в какой фазе использует защиту группы.", "Agree who uses each group defensive ability and in which phase.")
      ],
      dps: [
        text("Подтвердите цели и порядок выполнения механик.", "Confirm target priority and mechanic assignments.")
      ]
    },
    direction: text("После Авангарда продолжайте к финальному сражению.", "After the Vanguard, continue to the final encounter."),
    steps: [],
    next: text("Далее — Корона космоса.", "Next: Crown of the Cosmos.")
  }
];
