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
    title: text("Входные отряды", "Entrance enemies"),
    area: text("Перед Аверзианом", "Before Averzian"),
    danger: "medium",
    call: text("Сначала уберите дальнего заклинателя; не подтягивайте следующую группу до сбора текущей.", "Focus the ranged caster first; gather the current group before pulling more."),
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
        effect: text("Одиночный космический удар по текущей цели.", "A single-target Cosmic hit on the current target."),
        response: text("Назначьте основное и резервное прерывание на Пустотного зовущего.", "Assign a primary and a backup interrupt on the Abyssal Caller.")
      },
      {
        spellId: 1230690,
        casterNpcId: 240549,
        name: text("Космическое сминание", "Cosmic Crush"),
        action: "defensive",
        effect: text("Поднимает игроков, ненадолго оглушает и обрушивает на землю.", "Lifts players, briefly stuns them and slams them into the ground."),
        response: text("Восстановите здоровье перед срабатыванием; при низком здоровье используйте личную защиту.", "Top up before the impact; use a personal defensive if low on health.")
      },
      {
        spellId: 1228345,
        casterNpcId: 240545,
        name: text("Безумие Бездны", "Madness of the Void"),
        action: "dispel",
        effect: text("Магическое усиление скорости атак и передвижения Непокорного духа.", "A Magic buff increasing the Unbound Wraith’s haste and movement speed."),
        response: text("Снимите усиление способностью рассеивания с противника. Кража заклинания не работает.", "Remove the buff with an offensive dispel. Spellsteal does not work.")
      }
    ],
    roles: {
      tank: [
        text("Удерживайте заклинателя вместе с остальными врагами.", "Keep the caster grouped with the other enemies.")
      ],
      healer: [
        text("Следите за текущей целью Стрелы Бездны и подбросом группы.", "Watch the Void Bolt target and the group knock-up.")
      ],
      dps: [
        text("Не дублируйте назначенные прерывания и рассеивание.", "Avoid overlapping assigned interrupts and offensive dispels.")
      ]
    },
    direction: text("Зачистите входную часть рейда.", "Clear the entrance area."),
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
        response: text("Во время подготовки воя выходите из радиуса или используйте доступную защиту от страха.", "During the cast, move out of range or use an available fear counter.")
      },
      {
        spellId: 1236560,
        casterNpcId: 240864,
        name: text("Могучий топот", "Mighty Stomp"),
        action: "defensive",
        effect: text("Урон по группе и отбрасывание в радиусе 60 м.", "Group damage and a knockback within 60 yards."),
        response: text("Держите за спиной безопасный участок платформы; подготовьте защиту к удару.", "Keep safe platform space behind you and prepare mitigation for the hit.")
      },
      {
        spellId: 1258621,
        casterNpcId: 240864,
        name: text("Скачок", "Blink"),
        action: "move",
        effect: text("Телепортируется к случайному игроку.", "Teleports to a random player."),
        response: text("После скачка восстановите позицию, не убегая в соседнюю группу.", "Reset your position after the teleport without running into another group.")
      }
    ],
    roles: {
      tank: [
        text("Возвращайте Мигуна на безопасную часть площадки после скачка.", "Bring Blinky back to safe platform space after a teleport.")
      ],
      healer: [
        text("Поднимите здоровье группы перед топотом.", "Top up the group before Stomp.")
      ],
      dps: [
        text("Сохраняйте доступ к цели после телепорта, не цепляя соседних врагов.", "Stay in reach after teleports without pulling nearby enemies.")
      ]
    },
    direction: text("После Аверзиана — площадка у лестницы левого крыла.", "After Averzian: the platform by the left-wing stairs."),
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
        response: text("Переключайтесь на опасные призывы; не оставляйте их на лекарях.", "Switch to dangerous summons and keep them off healers.")
      }
    ],
    roles: {
      tank: [
        text("Подбирайте появляющиеся подкрепления.", "Pick up newly summoned reinforcements.")
      ],
      healer: [
        text("Следите за игроками, на которых вышли призывы.", "Watch players targeted by new summons.")
      ],
      dps: [
        text("Сочетайте урон по лейтенанту с быстрым уничтожением призывов.", "Damage the lieutenant while quickly clearing summons.")
      ]
    },
    direction: text("Левое крыло, снаружи у Ненасытникуса.", "Left wing, outside near Vorasius."),
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
    call: text("Дыхание направляйте от рейда, отмеченным взглядом оставьте свободные края.", "Aim the breath away from the raid and leave edge space for Gaze targets."),
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
        effect: text("Девятисекундное дыхание в направлении цели.", "A nine-second breath in the target’s direction."),
        response: text("Выйдите из направления дыхания до начала серии ударов.", "Leave the breath’s path before its repeated hits.")
      },
      {
        spellId: 1258656,
        casterNpcId: 252067,
        name: text("Проклятый взгляд", "Cursed Gaze"),
        action: "move",
        effect: text("Отмеченный игрок наносит урон союзникам в радиусе 7 м в течение 8 секунд.", "Marked players damage allies within 7 yards for 8 seconds."),
        response: text("Разойдитесь с метками и не пересекайте группу до окончания эффекта.", "Spread with the debuff and avoid crossing the group until it ends.")
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
        text("Сохраняйте место для выхода из дыхания и для меток.", "Preserve room to leave the breath and separate debuffs.")
      ]
    },
    direction: text("После Аверзиана — площадка наверху лестницы правого крыла.", "After Averzian: the platform atop the right-wing stairs."),
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
    call: text("На Heroic/Mythic сначала убейте обоих боссов крыльев: Сила в тенях отражает урон.", "On Heroic/Mythic, defeat both wing bosses first: Strength in Shadows reflects damage."),
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
        effect: text("Серия ударов конусом перед собой.", "Repeated strikes in a frontal cone."),
        response: text("На Резне переходите за спину, не разворачивая конус через рейд.", "Move behind for Slaughter without turning the cone through the raid.")
      },
      {
        spellId: 1281728,
        casterNpcId: 252066,
        name: text("Гнев забвения", "Oblivion's Wrath"),
        action: "move",
        effect: text("Разрывы Бездны наносят урон и отбрасывают на своей траектории.", "Void ruptures damage and knock back players in their path."),
        response: text("Переходите поперёк линии на свободный участок.", "Step sideways out of a rupture’s path into clear space.")
      }
    ],
    roles: {
      tank: [
        text("Удерживайте направление фронтальной серии.", "Keep the frontal strikes facing a fixed direction.")
      ],
      healer: [
        text("Восстанавливайте здоровье после попаданий разрывов.", "Recover health after rupture hits.")
      ],
      dps: [
        text("Атакуйте с безопасной стороны, сохраняя проход между линиями.", "Attack from a safe side and keep a lane through the ruptures.")
      ]
    },
    direction: text("Вернитесь в центр после зачистки обоих крыльев.", "Return to the center after clearing both wings."),
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
    call: text("Учитывайте отбрасывание и не стойте спиной к краю.", "Plan for knockbacks and keep your back away from the edge."),
    enemies: [
      {
        npcId: 256598,
        name: text("Небесный исполин", "Celestial Behemoth"),
        priority: "critical"
      }
    ],
    abilities: [
      {
        spellId: 1270212,
        casterNpcId: 256598,
        name: text("Мрачный выброс", "Umbral Ejection"),
        action: "move",
        effect: text("Космический выброс поражает и отбрасывает игроков в поле зрения.", "A Cosmic ejection hits and knocks back players in line of sight."),
        response: text("Перед выбросом используйте доступное укрытие, разрывающее видимость.", "Break line of sight behind available cover before the ejection.")
      },
      {
        spellId: 1247054,
        casterNpcId: 256598,
        name: text("Вспышка молнии", "Lightning Surge"),
        action: "move",
        effect: text("Урон от сил природы в радиусе 8 м.", "Nature damage within 8 yards."),
        response: text("Отойдите из области вспышки.", "Move out of the surge area.")
      },
      {
        spellId: 1247056,
        casterNpcId: 256598,
        name: text("Электрические щупальца", "Shocking Tendrils"),
        action: "defensive",
        effect: text("Щупальца добавляют урон от сил природы к атакам.", "Tendrils add Nature damage to attacks."),
        response: text("Активная цель готовит защиту; лекарь следит за входящими ударами.", "The active target prepares mitigation; healers watch incoming attacks.")
      }
    ],
    roles: {
      tank: [
        text("Ставьте исполина там, где группе доступно укрытие.", "Keep the Behemoth where the group can reach cover.")
      ],
      healer: [
        text("Поддерживайте танка между космическими выбросами.", "Support the tank between ejections.")
      ],
      dps: [
        text("Восстанавливайте урон только после занятия безопасной позиции.", "Resume damage after reaching a safe position.")
      ]
    },
    direction: text("Поднимитесь после драконов; исполин патрулирует кольцо.", "Climb after the dragons; the Behemoth patrols the ring."),
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
    call: text("До начала боя проверьте назначения по полной тактике босса.", "Review assignments in the full boss strategy before starting."),
    enemies: [],
    abilities: [],
    roles: {
      tank: [
        text("Согласуйте распределение целей между танками.", "Agree which tank handles each target.")
      ],
      healer: [
        text("Распределите рейдовую защиту по фазам.", "Assign raid cooldowns by phase.")
      ],
      dps: [
        text("Подтвердите цели и порядок выполнения механик.", "Confirm target priority and mechanic assignments.")
      ]
    },
    direction: text("После Авангарда продолжайте к финальному сражению.", "After the Vanguard, continue to the final encounter."),
    steps: [],
    next: text("Откройте полную тактику Короны космоса.", "Open the full Crown of the Cosmos strategy.")
  }
];
