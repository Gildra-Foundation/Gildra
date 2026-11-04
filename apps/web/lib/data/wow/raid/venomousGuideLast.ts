import type { VenomousGuideBoss } from './venomousGuide.types';

// Current journal and Blizzard hotfixes reviewed 2026-11-04; see research-last.md.
export const venomousGuideLast: VenomousGuideBoss[] = [
  {
    "id": "sszorak",
    "name": {
      "ru": "Ссзорак",
      "en": "Sszorak"
    },
    "raidName": {
      "ru": "Отравленная бездна",
      "en": "The Venomous Abyss"
    },
    "reviewedAt": "2026-11-04",
    "goal": {
      "ru": "Различайте два конуса: танковый удар принимает один танк, ядовитый — группа. Заранее оставляйте кисты напротив ветра, чтобы пережить переход.",
      "en": "Distinguish the two cones: one tank takes Ravage; a group shares Mutilate. Prepare cysts opposite the winds before the intermission."
    },
    "priorities": [
      {
        "id": "mutilate",
        "title": {
          "ru": "Разделите ядовитый конус",
          "en": "Share the venom cone"
        },
        "body": {
          "ru": "При «Расправе» войдите назначенной группой перед боссом. При танковом «Терзании» это место должны освободить все остальные.",
          "en": "For Mutilate, the assigned group enters the front. For Ravage, everyone except the active tank leaves it."
        }
      },
      {
        "id": "surge",
        "title": {
          "ru": "Кисту — напротив нужного ветра",
          "en": "Place cysts opposite the wind"
        },
        "body": {
          "ru": "Отнесите метку далеко от рейда к согласованному месту. Не наступайте на готовую кисту раньше перехода.",
          "en": "Take your mark away from the raid to the assigned spot. Do not burst a prepared cyst before the intermission."
        }
      },
      {
        "id": "maelstrom",
        "title": {
          "ru": "Порыв — к одной общей кисте",
          "en": "Ride each gust into one cyst"
        },
        "body": {
          "ru": "Соберитесь вместе: ветер несёт группу к кисте, её взрыв отбрасывает обратно и помогает удержаться.",
          "en": "Stay together: the wind carries everyone into a cyst; its burst pushes you back and helps you resist the gale."
        }
      }
    ],
    "flow": [
      {
        "id": "prepare",
        "title": {
          "ru": "Проверьте ветер",
          "en": "Read the winds"
        },
        "body": {
          "ru": "До начала отметьте тоннели с одной, двумя и тремя частицами ветра: это порядок порывов.",
          "en": "Before pulling, identify tunnels with one, two and three wind motes: they show gust order."
        }
      },
      {
        "id": "fight",
        "title": {
          "ru": "Конусы и кисты",
          "en": "Cones and cysts"
        },
        "body": {
          "ru": "Танки меняются на опасных ударах, группа делит «Расправа», отмеченные игроки готовят кисты.",
          "en": "Tanks trade dangerous strikes, the group shares Mutilate, and marked players prepare cysts."
        }
      },
      {
        "id": "cross",
        "title": {
          "ru": "Парные стрелки",
          "en": "Pair the arrows"
        },
        "body": {
          "ru": "Игроки со встречными направлениями готовятся столкнуться в воздухе после отбрасывания.",
          "en": "Players with opposite arrows prepare to collide in the air after the knockback."
        }
      },
      {
        "id": "wind",
        "title": {
          "ru": "Три порыва",
          "en": "Three gusts"
        },
        "body": {
          "ru": "Двигайтесь общей группой через подготовленные кисты. Атакуйте босса во время его уязвимости, не теряя позицию.",
          "en": "Travel together through prepared cysts. Damage the vulnerable boss without losing the group."
        }
      },
      {
        "id": "reset",
        "title": {
          "ru": "Подготовьте следующий цикл",
          "en": "Prepare the next cycle"
        },
        "body": {
          "ru": "После ветра согласованно уберите оставшиеся кисты и заново подготовьте безопасные места.",
          "en": "After the winds, clear remaining cysts together and prepare fresh safe positions."
        }
      }
    ],
    "roles": {
      "tank": {
        "position": {
          "ru": "Лицом к свободной стороне; группу впускайте перед боссом только для «Расправы».",
          "en": "Face a clear side; let the group enter the front only for Mutilate."
        },
        "actions": [
          {
            "ru": "Меняйтесь после «Терзания»: провокация работает даже во время серии «Сверххищник».",
            "en": "Swap after Ravage: taunts work during the Apex Predator sequence."
          },
          {
            "ru": "Не ведите босса через подготовленные кисты; перед ветром держитесь с группой.",
            "en": "Keep the boss away from prepared cysts; join the group before the winds."
          }
        ]
      },
      "healer": {
        "position": {
          "ru": "Позади или сбоку босса, в пределах лечения группы и обоих танков.",
          "en": "Stay behind or beside the boss within range of the group and both tanks."
        },
        "actions": [
          {
            "ru": "Сохраните сильное лечение на общий конус и последовательные взрывы кист.",
            "en": "Reserve strong healing for shared cones and successive cyst bursts."
          },
          {
            "ru": "Следите за здоровьем отмеченных игроков, пока они относят кисты далеко.",
            "en": "Keep marked players healthy while they carry cysts away."
          }
        ]
      },
      "melee": {
        "position": {
          "ru": "Сбоку или за спиной; перед боссом стойте только для назначенного общего конуса.",
          "en": "Attack from the side or rear; enter the front only for your shared cone."
        },
        "actions": [
          {
            "ru": "Не преследуйте босса через кисту. После начала ветра двигайтесь вместе с рейдом.",
            "en": "Do not chase through a cyst. Move with the raid when the winds begin."
          },
          {
            "ru": "Сильные атаки используйте во время «Воющего вихря», когда босс получает больше урона.",
            "en": "Use strong attacks during Howling Maelstrom, when the boss takes extra damage."
          }
        ]
      },
      "ranged": {
        "position": {
          "ru": "За группой на безопасной дистанции, оставляя маршруты к местам кист свободными.",
          "en": "Stand behind the group, keeping routes to cyst positions clear."
        },
        "actions": [
          {
            "ru": "С меткой сразу отходите к назначенному месту напротив тоннеля; возвращайтесь после появления кисты.",
            "en": "With a mark, move to the assigned spot opposite a tunnel; return after the cyst forms."
          },
          {
            "ru": "Со встречной стрелкой найдите партнёра заранее, чтобы столкнуться после подбрасывания.",
            "en": "With an opposite arrow, find your partner before the launch."
          }
        ]
      }
    },
    "mechanics": [
      {
        "id": "apex",
        "spellId": 1277025,
        "name": {
          "ru": "Сверххищник",
          "en": "Apex Predator"
        },
        "signal": {
          "ru": "Начинается серия атак; порядок ударов меняется.",
          "en": "A sequence of attacks begins; their order varies."
        },
        "response": {
          "ru": "Следите за названием каждого удара. «Терзание» — танку в стороне от рейда; «Расправа» — назначенной группе. Танки меняются после своего опасного удара.",
          "en": "Read each cast. Ravage belongs to a tank away from the raid; Mutilate belongs to the assigned group. Tanks trade after their dangerous strike."
        },
        "counters": [
          "defend"
        ],
        "counterRoles": [
          "tank"
        ],
        "spellIcon": "/assets/wow/raids/venomous-abyss/spells/1277025.jpg"
      },
      {
        "id": "mutilate",
        "spellId": 1277027,
        "name": {
          "ru": "Расправа",
          "en": "Mutilate"
        },
        "signal": {
          "ru": "Босс готовит общий ядовитый конус.",
          "en": "The boss prepares a shared venom cone."
        },
        "response": {
          "ru": "Войдите перед боссом всей назначенной группой и используйте личную защиту. Это общий удар; один танк его не заменяет.",
          "en": "The entire assigned group enters the front and uses personal mitigation. This is a shared hit, not a solo tank hit."
        },
        "counters": [
          "defend",
          "aoe"
        ],
        "counterRoles": [
          "tank",
          "healer",
          "melee",
          "ranged"
        ],
        "heroic": {
          "ru": "Разделитесь на две группы: следующую атаку принимает другая группа, пока предыдущая уязвима.",
          "en": "Use two groups: the other group takes the next cone while the first remains vulnerable."
        }
      },
      {
        "id": "tempest",
        "spellId": 1287072,
        "name": {
          "ru": "Буря",
          "en": "Tempest"
        },
        "signal": {
          "ru": "Во время серии по площадке движутся ядовитые вихри.",
          "en": "Poisonous vortices move around the platform during the sequence."
        },
        "response": {
          "ru": "Обойдите вихрь сбоку, не пересекая подготовленные кисты и танковый конус. При попадании выйдите из вихря и поддержите здоровье личной защитой.",
          "en": "Step around each vortex without crossing prepared cysts or the tank cone. If hit, leave it and use personal mitigation."
        },
        "counters": [
          "defend"
        ],
        "counterRoles": [
          "tank",
          "healer",
          "melee",
          "ranged"
        ]
      },
      {
        "id": "surge",
        "spellId": 1305959,
        "name": {
          "ru": "Ядовитый поток",
          "en": "Venomous Surge"
        },
        "signal": {
          "ru": "На игроке метка, после которой остаётся киста.",
          "en": "A marked player will leave a cyst."
        },
        "response": {
          "ru": "Отнесите метку далеко от остальных, напротив заранее отмеченного ветрового тоннеля. Урон взрыва меньше на расстоянии. Не накладывайте кисты друг на друга.",
          "en": "Take the mark away from others, opposite an assigned wind tunnel. Distance reduces the explosion damage. Keep cysts separate."
        },
        "counters": [],
        "counterRoles": [],
        "spellIcon": "/assets/wow/raids/venomous-abyss/spells/1305959.jpg"
      },
      {
        "id": "crosswinds",
        "spellId": 1285419,
        "name": {
          "ru": "Яростные завихрения",
          "en": "Raging Crosswinds"
        },
        "signal": {
          "ru": "Над игроками появляются стрелки отбрасывания.",
          "en": "Players receive knockback arrows."
        },
        "response": {
          "ru": "Найдите игрока со встречной стрелкой и встаньте так, чтобы встретиться в воздухе. Остальные отходят от отмеченных игроков; столкновение двух поднятых игроков прекращает полёт.",
          "en": "Pair with an opposite arrow and line up to meet in the air. Others leave marked players room; colliding airborne players ends the flight."
        },
        "counters": [],
        "counterRoles": [],
        "spellIcon": "/assets/wow/raids/venomous-abyss/spells/1285419.jpg"
      },
      {
        "id": "maelstrom",
        "spellId": 1285732,
        "name": {
          "ru": "Воющий вихрь",
          "en": "Howling Maelstrom"
        },
        "signal": {
          "ru": "На 100 энергии начинаются порывы из тоннелей.",
          "en": "At 100 energy, the tunnels begin their gusts."
        },
        "response": {
          "ru": "Соберитесь и дайте ветру довести группу до одной подготовленной кисты. Её взрыв возвращает вас к центру; затем вместе переходите к следующей. Не взрывайте две сразу.",
          "en": "Group up and let the gust carry you into one prepared cyst. Its burst returns you toward the centre; move together to the next. Never burst two at once."
        },
        "counters": [
          "defend",
          "aoe"
        ],
        "counterRoles": [
          "tank",
          "healer",
          "melee",
          "ranged"
        ],
        "spellIcon": "/assets/wow/raids/venomous-abyss/spells/1285732.jpg"
      },
      {
        "id": "claws",
        "spellId": 1305998,
        "name": {
          "ru": "Едкие когти",
          "en": "Caustic Claws"
        },
        "signal": {
          "ru": "На земле видны точки падения яда.",
          "en": "Venom impact markers appear on the floor."
        },
        "response": {
          "ru": "Выйдите из отмеченных кругов, сохраняя проход к кистам. После попадания на героической сложности постоянная лужа не остаётся.",
          "en": "Leave the marked circles while preserving access to cysts. On Heroic, these impacts no longer leave lasting pools."
        },
        "counters": [],
        "counterRoles": [],
        "heroicOnly": true
      }
    ],
    "adds": [],
    "diagram": {
      "title": {
        "ru": "Позиции и задачи",
        "en": "Positions and jobs"
      },
      "caption": {
        "ru": "Тоннель задаёт направление движения; киста должна встретить группу на противоположной стороне.",
        "en": "The tunnel determines movement; a cyst catches the group on the opposite side."
      },
      "heroicCaption": {
        "ru": "Две группы чередуются в общем конусе, но переход с ветром проходят вместе.",
        "en": "Two groups alternate shared cones, then travel together through the winds."
      },
      "steps": [
        {
          "id": "wind",
          "title": {
            "ru": "Тоннель с ветром",
            "en": "Wind tunnel"
          },
          "body": {
            "ru": "Число частиц показывает очередь порыва. Не ставьте кисту у самого источника ветра.",
            "en": "The mote count shows gust order. Do not put the cyst beside the wind source."
          }
        },
        {
          "id": "raid",
          "title": {
            "ru": "Общая группа",
            "en": "Raid together"
          },
          "body": {
            "ru": "Во время порыва группа движется одной линией к выбранной кисте.",
            "en": "During a gust, everyone travels together toward the chosen cyst."
          }
        },
        {
          "id": "cyst",
          "title": {
            "ru": "Киста напротив",
            "en": "Opposite cyst"
          },
          "body": {
            "ru": "Встречает группу после сноса и отбрасывает обратно к безопасному центру.",
            "en": "Catches the group after the push and sends everyone back toward the safe centre."
          }
        }
      ]
    },
    "sources": [
      {
        "title": "Игровой журнал / Encounter journal",
        "url": "https://www.wowhead.com/dungeon-journal/the-venomous-abyss/sszorak"
      },
      {
        "title": "Method — Heroic",
        "url": "https://www.method.gg/guides/the-venomous-abyss/sszorak-heroic"
      },
      {
        "title": "Blizzard — актуальные исправления / live hotfixes",
        "url": "https://news.blizzard.com/en-gb/article/24296142/hotfixes-october-6-2026"
      }
    ]
  },
  {
    "id": "the-twin-fangs",
    "name": {
      "ru": "Два Клыка",
      "en": "The Twin Fangs"
    },
    "raidName": {
      "ru": "Отравленная бездна",
      "en": "The Venomous Abyss"
    },
    "reviewedAt": "2026-11-04",
    "goal": {
      "ru": "Убирайте шары яда, снижайте накопленный яд общими укусами Итраза и равномерно убивайте обеих змей.",
      "en": "Collect venom globules, reduce accumulated venom through Ithraz’s shared bites, and defeat both snakes together."
    },
    "priorities": [
      {
        "id": "globules",
        "title": {
          "ru": "Не оставляйте шары яда",
          "en": "Leave no globules"
        },
        "body": {
          "ru": "Сначала выйдите из места падения, затем игрок с малым количеством яда подбирает готовый шар.",
          "en": "Dodge the impact first; a player with low venom then collects the formed globule."
        }
      },
      {
        "id": "feast",
        "title": {
          "ru": "Входите в свою очередь пожирания",
          "en": "Take your assigned Feast"
        },
        "body": {
          "ru": "Общий укус снимает яд. Не оставляйте конус пустым; на Heroic три группы принимают по одному удару.",
          "en": "The shared bite removes venom. Never leave the cone empty; on Heroic, three groups take one strike each."
        }
      },
      {
        "id": "flood",
        "title": {
          "ru": "Двигайтесь за вращающимся лучом",
          "en": "Follow behind the rotating beam"
        },
        "body": {
          "ru": "На переходе следите за направлением луча и местами падения крови, сохраняя свободный путь.",
          "en": "During the transition, track the beam direction and blood impacts while keeping an escape route."
        }
      }
    ],
    "flow": [
      {
        "id": "tanks",
        "title": {
          "ru": "По танку у каждой змеи",
          "en": "One tank per snake"
        },
        "body": {
          "ru": "Вексул и Итраз стоят раздельно; каждой цели постоянно нужен танк рядом.",
          "en": "Vexhul and Ithraz stay apart; each must always have a tank nearby."
        }
      },
      {
        "id": "venom",
        "title": {
          "ru": "Шары и прислужники",
          "en": "Globules and adds"
        },
        "body": {
          "ru": "Игроки с малым количеством яда собирают шары, остальные быстро убивают порождения.",
          "en": "Low-venom players collect globules while others quickly kill the spawns."
        }
      },
      {
        "id": "feast",
        "title": {
          "ru": "Снимайте яд",
          "en": "Reduce venom"
        },
        "body": {
          "ru": "Группа входит перед Итразом на общий укус, затем освобождает место следующей группе.",
          "en": "The assigned group enters Ithraz’s cone, then leaves room for the next group."
        }
      },
      {
        "id": "submerge",
        "title": {
          "ru": "Змеи меняют позиции",
          "en": "The snakes change positions"
        },
        "body": {
          "ru": "После погружения найдите новые головы. Обойдите вращающийся луч, уклоняясь от крови.",
          "en": "After submerging, locate both heads again. Move around the rotating beam and dodge blood."
        }
      },
      {
        "id": "finish",
        "title": {
          "ru": "Убейте обеих одновременно",
          "en": "Finish both together"
        },
        "body": {
          "ru": "Переключайте урон на более здоровую змею, сохраняя приоритет прислужников.",
          "en": "Switch damage to the healthier snake while retaining add priority."
        }
      }
    ],
    "roles": {
      "tank": {
        "position": {
          "ru": "По одному танку в ближнем бою у каждой головы.",
          "en": "Keep one tank in melee range of each head."
        },
        "actions": [
          {
            "ru": "При «Едком наводнении» двигайтесь против отталкивания и используйте защиту. Не покидайте голову.",
            "en": "During Caustic Deluge, push against the knockback with mitigation. Do not abandon the head."
          },
          {
            "ru": "Танк Итраза принимает все три удара «Крушителя камня»; после серии обменяйтесь боссами.",
            "en": "Ithraz’s tank covers all three Stone Breaker impacts; swap bosses after the sequence."
          }
        ]
      },
      "healer": {
        "position": {
          "ru": "Между зонами двух голов, в пределах лечения танков и очередной группы пожирания.",
          "en": "Stay between the heads within range of both tanks and the next Feast group."
        },
        "actions": [
          {
            "ru": "Перед общим укусом поднимите здоровье группы; следите за игроками с большим количеством яда.",
            "en": "Top the group before a shared bite; watch players with high venom."
          },
          {
            "ru": "На переходе двигайтесь вместе с безопасной зоной луча, не задерживаясь ради лечения на месте.",
            "en": "Move with the beam’s safe space during the transition instead of standing still to heal."
          }
        ]
      },
      "melee": {
        "position": {
          "ru": "У назначенной головы сбоку; перед Итразом — только в очередь своей группы.",
          "en": "Attack beside your assigned head; enter Ithraz’s front only for your group’s turn."
        },
        "actions": [
          {
            "ru": "Сразу переключайтесь на порождения Вексула и выходите из их линий плевка.",
            "en": "Switch immediately to Vexhul’s spawns and leave their spit lines."
          },
          {
            "ru": "Сравнивайте здоровье обеих змей и помогайте более здоровой.",
            "en": "Compare both health bars and damage the healthier snake."
          }
        ]
      },
      "ranged": {
        "position": {
          "ru": "Между головами, оставляя прямые линии плевков и путь к Итразу свободными.",
          "en": "Stand between the heads, keeping spit lines and the route to Ithraz clear."
        },
        "actions": [
          {
            "ru": "Подбирайте шары только при малом количестве яда. Не забирайте несколько подряд без необходимости.",
            "en": "Collect globules only with low venom; avoid taking several in succession."
          },
          {
            "ru": "Если порождение целится в вас, направьте линию от группы и не водите её через союзников.",
            "en": "If a spawn targets you, aim its line away from the group and avoid sweeping allies."
          }
        ]
      }
    },
    "mechanics": [
      {
        "id": "venom",
        "spellId": 1290336,
        "name": {
          "ru": "Вечный яд",
          "en": "Eternal Venom"
        },
        "signal": {
          "ru": "На игроках накапливается постоянный яд.",
          "en": "Permanent venom stacks accumulate on players."
        },
        "response": {
          "ru": "Избегайте лишних попаданий. Подбирайте шары при малом количестве яда и вовремя входите в общий укус Итраза, который снимает один эффект за попадание.",
          "en": "Avoid unnecessary hits. Collect globules at low venom and take Ithraz’s shared bite on time; each hit removes one stack."
        },
        "counters": [],
        "counterRoles": [],
        "spellIcon": "/assets/wow/raids/venomous-abyss/spells/1290336.jpg",
        "heroic": {
          "ru": "10 эффектов убивают. Договаривайтесь о подборе шаров заранее; не собирайте очередной шар на опасном количестве.",
          "en": "10 stacks kill. Assign collectors before globules appear; never collect another at a dangerous count."
        }
      },
      {
        "id": "deluge",
        "spellId": 1289192,
        "name": {
          "ru": "Едкое наводнение",
          "en": "Caustic Deluge"
        },
        "signal": {
          "ru": "Вексул направляет поток в танка и отталкивает его.",
          "en": "Vexhul channels a stream into her tank and pushes them back."
        },
        "response": {
          "ru": "Танк удерживается рядом с головой под защитой. Остальные выходят из мест падения кислоты; после падения там останутся шары.",
          "en": "The tank stays beside the head with mitigation. Others dodge acid impacts, which leave globules."
        },
        "counters": [
          "defend"
        ],
        "counterRoles": [
          "tank"
        ],
        "spellIcon": "/assets/wow/raids/venomous-abyss/spells/1289192.png"
      },
      {
        "id": "globules",
        "spellId": 1289993,
        "name": {
          "ru": "Едкий комок",
          "en": "Caustic Globule"
        },
        "signal": {
          "ru": "После падения кислоты остаются шары.",
          "en": "Acid impacts leave globules."
        },
        "response": {
          "ru": "Назначенные игроки с малым количеством яда подбирают каждый шар до взрыва. Один подбор заражает одного игрока; пропущенный шар заражает весь рейд.",
          "en": "Assigned low-venom players collect every globule before it bursts. A pickup affects one player; an ignored globule affects the entire raid."
        },
        "counters": [],
        "counterRoles": [],
        "spellIcon": "/assets/wow/raids/venomous-abyss/spells/1289993.png"
      },
      {
        "id": "spawns",
        "spellId": 1291404,
        "name": {
          "ru": "Ядовитое появление",
          "en": "Venomous Emergence"
        },
        "signal": {
          "ru": "Из воды появляются порождения Вексула.",
          "en": "Vexhul’s spawns emerge from the water."
        },
        "response": {
          "ru": "Быстро убейте порождения. Игрок, на которого направлен плевок, держит линию в стороне от рейда; остальные выходят из линии.",
          "en": "Kill the spawns quickly. The spit target keeps its line away from the raid; everyone else leaves the line."
        },
        "counters": [],
        "counterRoles": [],
        "spellIcon": "/assets/wow/raids/venomous-abyss/spells/1291404.jpg"
      },
      {
        "id": "feast",
        "spellId": 1290516,
        "name": {
          "ru": "Яростное пожирание",
          "en": "Ravenous Feast"
        },
        "signal": {
          "ru": "Итраз готовит три общих укуса подряд.",
          "en": "Ithraz prepares three shared bites in succession."
        },
        "response": {
          "ru": "Войдите назначенной группой в конус перед Итразом; удар делится и снимает яд. После попадания уступите место следующей группе: пока действует эффект пожирания, повторное попадание не снимет ещё один эффект яда.",
          "en": "Enter Ithraz’s cone with the assigned group; the strike shares damage and removes venom. Afterward, leave room for the next group: while Feasted remains, another hit cannot remove another venom stack."
        },
        "counters": [
          "defend",
          "aoe"
        ],
        "counterRoles": [
          "tank",
          "healer",
          "melee",
          "ranged"
        ],
        "spellIcon": "/assets/wow/raids/venomous-abyss/spells/1290516.jpg",
        "heroic": {
          "ru": "Назначьте три группы по очереди: каждая принимает один укус. Уязвимость после укуса не позволяет одной группе закрыть все три.",
          "en": "Assign three groups in order, one bite each. The post-bite vulnerability prevents one group from taking all three."
        }
      },
      {
        "id": "stone",
        "spellId": 1288538,
        "name": {
          "ru": "Крушитель камня",
          "en": "Stone Breaker"
        },
        "signal": {
          "ru": "Итраз отбрасывает танка и отмечает последовательные удары.",
          "en": "Ithraz knocks the tank back and marks successive impacts."
        },
        "response": {
          "ru": "Танк закрывает все три места удара и только после этого меняется с танком Вексула. Пустое попадание бьёт весь рейд; остальные не подменяют танка.",
          "en": "The tank covers all three impacts before swapping with Vexhul’s tank. An empty impact hits the entire raid; other players do not replace the tank."
        },
        "counters": [
          "defend"
        ],
        "counterRoles": [
          "tank"
        ],
        "spellIcon": "/assets/wow/raids/venomous-abyss/spells/1288538.jpg"
      },
      {
        "id": "flood",
        "spellId": 1293749,
        "name": {
          "ru": "Гнусный потоп",
          "en": "Vile Flood"
        },
        "signal": {
          "ru": "После погружения Вексул вращает поток яда.",
          "en": "After submerging, Vexhul rotates a venom beam."
        },
        "response": {
          "ru": "Найдите начало и направление луча, двигайтесь за ним по безопасной стороне. Не пересекайте луч ради урона и не стойте у края без пути отхода.",
          "en": "Locate the beam’s starting point and direction, then follow behind it on the safe side. Do not cross it for damage or trap yourself at the edge."
        },
        "counters": [],
        "counterRoles": [],
        "spellIcon": "/assets/wow/raids/venomous-abyss/spells/1293749.jpg"
      },
      {
        "id": "storm",
        "spellId": 1306872,
        "name": {
          "ru": "Кровавая буря",
          "en": "Sanguine Storm"
        },
        "signal": {
          "ru": "Во время перехода появляются места падения крови.",
          "en": "Blood impact markers appear during the transition."
        },
        "response": {
          "ru": "Выходите из кругов, одновременно следя за ядовитым лучом. Пользуйтесь личной защитой, если движение совпало с большим количеством яда.",
          "en": "Leave the circles while tracking the venom beam. Use personal mitigation when movement overlaps high venom."
        },
        "counters": [
          "defend"
        ],
        "counterRoles": [
          "tank",
          "healer",
          "melee",
          "ranged"
        ],
        "spellIcon": "/assets/wow/raids/venomous-abyss/spells/1306872.jpg"
      }
    ],
    "adds": [
      {
        "id": "spawn-vexhul",
        "npcId": 264023,
        "name": {
          "ru": "Порождение Вексул",
          "en": "Spawn of Vexhul"
        },
        "description": {
          "ru": "Прислужник Вексула, направляющий плевки в игроков.",
          "en": "Vexhul’s add aims spits at players."
        },
        "action": {
          "ru": "Убейте первым. Цель плевка держит линию вдали от группы; остальные выходят из неё.",
          "en": "Kill it first. Its target holds the line away from the group; others leave the line."
        },
        "death": {
          "ru": "После смерти прекращает создавать новые линии плевка.",
          "en": "Its death stops further spit lines."
        },
        "portrait": "/assets/wow/raids/venomous-abyss/enemies/264023.webp"
      }
    ],
    "diagram": {
      "title": {
        "ru": "Позиции и задачи",
        "en": "Positions and jobs"
      },
      "caption": {
        "ru": "Два неподвижных босса, отдельные танки и общий путь к конусу Итраза.",
        "en": "Two stationary bosses, separate tanks and a shared route into Ithraz’s cone."
      },
      "heroicCaption": {
        "ru": "Три группы чередуются в пожирании; игроки с большим количеством яда не собирают новые шары.",
        "en": "Three groups alternate Feast; high-venom players leave new globules to others."
      },
      "steps": [
        {
          "id": "vexhul",
          "title": {
            "ru": "Вексул + танк",
            "en": "Vexhul + tank"
          },
          "body": {
            "ru": "Поток направлен в танка; рейд не стоит в местах падения кислоты.",
            "en": "The stream targets the tank; the raid avoids acid impacts."
          }
        },
        {
          "id": "middle",
          "title": {
            "ru": "Путь между головами",
            "en": "Route between heads"
          },
          "body": {
            "ru": "Здесь убивают порождения и оставляют проход группе пожирания.",
            "en": "Kill spawns here while leaving the Feast group a clear route."
          }
        },
        {
          "id": "ithraz",
          "title": {
            "ru": "Итраз + очередь групп",
            "en": "Ithraz + assigned groups"
          },
          "body": {
            "ru": "Танк остаётся у головы; назначенная группа входит в общий конус по сигналу.",
            "en": "The tank stays at the head; the assigned group enters the shared cone on cue."
          }
        }
      ]
    },
    "sources": [
      {
        "title": "Игровой журнал / Encounter journal",
        "url": "https://www.wowhead.com/dungeon-journal/the-venomous-abyss/the-twin-fangs"
      },
      {
        "title": "Method — Heroic",
        "url": "https://www.method.gg/guides/the-venomous-abyss/the-twin-fangs-heroic"
      },
      {
        "title": "Blizzard — актуальные исправления / live hotfixes",
        "url": "https://news.blizzard.com/en-gb/article/24296142/hotfixes-october-6-2026"
      }
    ]
  },
  {
    "id": "the-coiled-altar",
    "name": {
      "ru": "Спиральный алтарь",
      "en": "The Coiled Altar"
    },
    "raidName": {
      "ru": "Отравленная бездна",
      "en": "The Venomous Abyss"
    },
    "reviewedAt": "2026-11-04",
    "goal": {
      "ru": "Собирайте яд и призраков в места, которые танк очищает конусом. Освобождайте союзников из контроля, разрушайте щит Малакрасса и в финале добивайте обоих боссов вместе.",
      "en": "Gather venom and ghosts where a tank can clear them with a cone. Free controlled allies, break Malacrass’s shield, and finish both bosses together."
    },
    "priorities": [
      {
        "id": "sever",
        "title": {
          "ru": "Конус очищает опасные объекты",
          "en": "Use the cone to clear hazards"
        },
        "body": {
          "ru": "Танк направляет удар через яд или призраков; остальные стоят за спиной босса и не пересекают конус.",
          "en": "The tank aims through venom or ghosts; everyone else stays behind the boss and outside the cone."
        }
      },
      {
        "id": "dreadmarch",
        "title": {
          "ru": "Освободите союзников",
          "en": "Free controlled allies"
        },
        "body": {
          "ru": "Атакуйте щит на захваченном игроке до его падения с края. После освобождения цель призрака поворачивается к нему лицом.",
          "en": "Damage a controlled player’s shield before they walk off the edge. Once freed, the ghost’s target faces it."
        }
      },
      {
        "id": "nightfall",
        "title": {
          "ru": "Разрушьте щит Малакрасса",
          "en": "Break Malacrass’s shield"
        },
        "body": {
          "ru": "При «Вечной полночи» весь урон идёт в щит: именно разрушение щита прекращает опасный канал.",
          "en": "During Eternal Nightfall, everyone damages the shield: breaking it ends the dangerous channel."
        }
      }
    ],
    "flow": [
      {
        "id": "zuljan",
        "title": {
          "ru": "Зул’джан: соберите яд",
          "en": "Zul’jan: gather venom"
        },
        "body": {
          "ru": "Переносите шары в общую зону; танк очищает её «Рассечением». Делите «Гильотину», затем быстро уходите от топора.",
          "en": "Carry globules into a shared zone; the tank clears them with Sever. Share Guillotine, then quickly leave the axe."
        }
      },
      {
        "id": "malacrass",
        "title": {
          "ru": "Малакрасс: спасайте игроков",
          "en": "Malacrass: rescue players"
        },
        "body": {
          "ru": "Разбивайте щиты контроля. Призраков сводите в конус, а после взрывов собирайте собственные фрагменты души.",
          "en": "Break control shields. Bring ghosts into the cone, then collect your own soul fragments after explosions."
        }
      },
      {
        "id": "shield",
        "title": {
          "ru": "Щит и отбрасывание",
          "en": "Shield and knockback"
        },
        "body": {
          "ru": "Уничтожайте щит «Вечной полночи». К завершению фазы стойте ближе к центру, чтобы не улететь с платформы.",
          "en": "Destroy Eternal Nightfall’s shield. Stay toward the centre as the phase ends to survive the knockback."
        }
      },
      {
        "id": "binding",
        "title": {
          "ru": "Связь душ: бейте Зул’джана",
          "en": "Soulbinding: attack Zul’jan"
        },
        "body": {
          "ru": "Сильные атаки используйте по уязвимому Зул’джану. Перехватывайте фрагменты, летящие к Малакрассу, с паузами на лечение.",
          "en": "Use major attacks on vulnerable Zul’jan. Intercept fragments returning to Malacrass, allowing healing between hits."
        }
      },
      {
        "id": "both",
        "title": {
          "ru": "Оба босса вместе",
          "en": "Both bosses together"
        },
        "body": {
          "ru": "Повторяйте очистку яда и призраков, сохраняйте общие группы и выравнивайте здоровье боссов.",
          "en": "Continue clearing venom and ghosts, retain shared-hit groups, and keep boss health even."
        }
      }
    ],
    "roles": {
      "tank": {
        "position": {
          "ru": "Босс смотрит в зону собранного яда или призраков; рейд — за его спиной.",
          "en": "Face the boss toward gathered venom or ghosts, with the raid behind him."
        },
        "actions": [
          {
            "ru": "Меняйтесь после каждого «Рассечения» или «Отделения души». Второй танк не стоит в конусе.",
            "en": "Swap after each Sever or Soul Sever. The other tank stays outside the cone."
          },
          {
            "ru": "После «Отделения души» соберите свои фрагменты до окончания эффекта; в финале держите боссов рядом.",
            "en": "After Soul Sever, collect your fragments before the effect expires; keep the bosses together in the finale."
          }
        ]
      },
      "healer": {
        "position": {
          "ru": "За боссом рядом с рейдом, сохраняя обзор носителей яда и отбежавших игроков.",
          "en": "Stay behind the boss with the raid, keeping carriers and spread players in range."
        },
        "actions": [
          {
            "ru": "Согласуйте очистку шаров с танком: каждый уничтоженный шар наносит рейду урон.",
            "en": "Coordinate globule clearing with the tank: every destroyed globule damages the raid."
          },
          {
            "ru": "«Ядовитый клык» снимается рассеиванием яда, если оно есть у вашего класса. Щиты поглощения лечения нужно вылечить.",
            "en": "Remove Venomfang with a poison dispel if your class has one. Healing absorbs must be healed through."
          }
        ]
      },
      "melee": {
        "position": {
          "ru": "За спиной активного босса, вне зоны танкового конуса.",
          "en": "Attack behind the active boss, outside the tank cone."
        },
        "actions": [
          {
            "ru": "Сразу бейте щит захваченного союзника и щит «Вечной полночи». Это не задачи для обычного прерывания.",
            "en": "Immediately damage controlled allies’ shields and Eternal Nightfall’s shield. These are not ordinary interrupt jobs."
          },
          {
            "ru": "В финале переключайтесь на более здорового босса.",
            "en": "In the finale, switch to the healthier boss."
          }
        ]
      },
      "ranged": {
        "position": {
          "ru": "С общей группой за боссом; для меток отходите в свободную сторону, не в склад яда.",
          "en": "Stay with the group behind the boss; take marks to clear space away from the venom pile."
        },
        "actions": [
          {
            "ru": "По назначению переносите шары в одну зону. Если призрак преследует вас, подведите его туда, где танк сможет очистить его.",
            "en": "Carry globules to one zone when assigned. If a ghost follows you, bring it where the tank can clear it."
          },
          {
            "ru": "На Heroic помогайте быстро убивать душителя душ и прерывать его вопль по очереди.",
            "en": "On Heroic, help quickly kill the Soulcoiler and take turns interrupting its wail."
          }
        ]
      }
    },
    "mechanics": [
      {
        "id": "venom",
        "spellId": 1282403,
        "name": {
          "ru": "Сгустившийся яд",
          "en": "Coalesced Venom"
        },
        "signal": {
          "ru": "По комнате появляются шары, постоянно наносящие рейду урон.",
          "en": "Globules appear around the room and continually damage the raid."
        },
        "response": {
          "ru": "Назначенные носители касаются шара и через 5 секунд оставляют его в общей зоне очистки, вдали от группы и топоров. Танку нужен свободный конус через эту зону.",
          "en": "Assigned carriers touch a globule and leave it in the shared clearing zone after 5 seconds, away from the group and axes. Keep the tank’s cone through this zone clear."
        },
        "counters": [],
        "counterRoles": [],
        "spellIcon": "/assets/wow/raids/venomous-abyss/spells/1282403.png"
      },
      {
        "id": "sever",
        "spellId": 1299680,
        "name": {
          "ru": "Рассечение",
          "en": "Sever"
        },
        "signal": {
          "ru": "Зул’джан готовит конус в своего танка.",
          "en": "Zul’jan prepares a cone toward his tank."
        },
        "response": {
          "ru": "Танк направляет конус через собранные шары и использует защиту. Остальные выходят из конуса. После удара второй танк забирает босса.",
          "en": "The tank aims through gathered globules and uses mitigation. Others leave the cone. The second tank takes over afterward."
        },
        "counters": [
          "defend"
        ],
        "counterRoles": [
          "tank"
        ],
        "spellIcon": "/assets/wow/raids/venomous-abyss/spells/1299680.jpg",
        "heroic": {
          "ru": "Уничтожение шаров оставляет складывающийся урон по рейду: размер очистки согласуйте с лекарями.",
          "en": "Destroyed globules leave stacking raid damage; coordinate how many to clear with healers."
        }
      },
      {
        "id": "guillotine",
        "spellId": 1283489,
        "name": {
          "ru": "Гильотина",
          "en": "Guillotine"
        },
        "signal": {
          "ru": "Игрок отмечен большим общим ударом топора.",
          "en": "A player is marked for a shared axe strike."
        },
        "response": {
          "ru": "Назначенная группа собирается в круге отмеченного игрока. Сразу после удара все быстро отходят от оставшегося топора за границу опасной области.",
          "en": "The assigned group joins the marked player’s circle. Immediately after the hit, everyone moves beyond the axe’s dangerous area."
        },
        "counters": [
          "defend",
          "aoe"
        ],
        "counterRoles": [
          "tank",
          "healer",
          "melee",
          "ranged"
        ],
        "heroic": {
          "ru": "Две группы чередуются: получившие удар остаются уязвимы к следующей «Гильотине».",
          "en": "Alternate two groups: players who took the strike remain vulnerable to the next Guillotine."
        }
      },
      {
        "id": "axes",
        "spellId": 1283832,
        "name": {
          "ru": "Рубящие топоры",
          "en": "Axegrinder"
        },
        "signal": {
          "ru": "Топоры падают, затем перемещаются по площадке.",
          "en": "Axes land and then roam the platform."
        },
        "response": {
          "ru": "Выйдите из места падения и следите за движущимися топорами. Не складывайте яд на их пути и не отступайте от них к самому краю.",
          "en": "Leave impact spots and track the roaming axes. Keep the venom pile out of their path and avoid retreating to the edge."
        },
        "counters": [],
        "counterRoles": []
      },
      {
        "id": "poison",
        "spellId": 1282287,
        "name": {
          "ru": "Ядовитый клык",
          "en": "Venomfang"
        },
        "signal": {
          "ru": "На игроках появляется болезненный яд.",
          "en": "Players receive a damaging poison."
        },
        "response": {
          "ru": "Лекари поддерживают здоровье цели; игрок с доступным рассеиванием яда снимает эффект. Обычное рассеивание магии его не заменяет.",
          "en": "Healers support the target; a player with a poison dispel removes it. An ordinary magic dispel cannot replace it."
        },
        "counters": [
          "defend"
        ],
        "counterRoles": [
          "tank",
          "healer",
          "melee",
          "ranged"
        ]
      },
      {
        "id": "dreadmarch",
        "spellId": 1285643,
        "name": {
          "ru": "Марш ужаса",
          "en": "Dreadmarch"
        },
        "signal": {
          "ru": "Союзник под контролем идёт к краю платформы.",
          "en": "A controlled ally walks toward the platform edge."
        },
        "response": {
          "ru": "Атакуйте его щит до разрушения. Появившийся призрак преследует выбранного игрока: цель поворачивается к нему лицом, останавливая его, и подводит в зону следующего танкового конуса.",
          "en": "Damage their shield until it breaks. The resulting ghost follows a chosen player: that player faces it to stop it, then positions it for the next tank cone."
        },
        "counters": [],
        "counterRoles": [],
        "spellIcon": "/assets/wow/raids/venomous-abyss/spells/1285643.jpg"
      },
      {
        "id": "soul-sever",
        "spellId": 1286620,
        "name": {
          "ru": "Отделение души",
          "en": "Soul Sever"
        },
        "signal": {
          "ru": "Малакрасс готовит конус; после попадания остаются фрагменты души.",
          "en": "Malacrass prepares a cone; players hit leave soul fragments."
        },
        "response": {
          "ru": "Танк направляет удар через призраков. Остальные отходят. Танк меняется и подбирает собственные фрагменты до окончания эффекта души.",
          "en": "The tank aims through ghosts while others leave the cone. Swap tanks, then collect your own fragments before Gravebound expires."
        },
        "counters": [
          "defend"
        ],
        "counterRoles": [
          "tank"
        ],
        "spellIcon": "/assets/wow/raids/venomous-abyss/spells/1286620.jpg"
      },
      {
        "id": "gloombomb",
        "spellId": 1286895,
        "name": {
          "ru": "Мракобомба",
          "en": "Gloombomb"
        },
        "signal": {
          "ru": "Игроки получают взрывающиеся метки.",
          "en": "Players receive exploding marks."
        },
        "response": {
          "ru": "Разойдитесь от группы и друг от друга. После взрыва немедленно соберите все свои фрагменты души; чужие фрагменты вашу задачу не заменяют.",
          "en": "Spread away from the group and each other. After the explosion, immediately collect all your own soul fragments; other players’ fragments do not count."
        },
        "counters": [],
        "counterRoles": []
      },
      {
        "id": "nightfall",
        "spellId": 1286918,
        "name": {
          "ru": "Вечная полночь",
          "en": "Eternal Nightfall"
        },
        "signal": {
          "ru": "Малакрасс закрывается щитом и начинает опасный канал.",
          "en": "Malacrass gains a shield and begins a dangerous channel."
        },
        "response": {
          "ru": "Все атакуют щит, пока он не разрушится: это прекращает канал. Лекари закрывают урон и поглощение лечения; одного обычного прерывания недостаточно.",
          "en": "Everyone attacks the shield until it breaks, ending the channel. Healers cover damage and healing absorbs; an ordinary interrupt is not the solution."
        },
        "counters": [
          "defend",
          "aoe"
        ],
        "counterRoles": [
          "tank",
          "healer",
          "melee",
          "ranged"
        ]
      },
      {
        "id": "wail",
        "spellId": 1286399,
        "name": {
          "ru": "Вопль ужаса",
          "en": "Wail of Terror"
        },
        "signal": {
          "ru": "Душитель душ начинает «Вопль ужаса».",
          "en": "A Soulcoiler begins Wail of Terror."
        },
        "response": {
          "ru": "Назначьте очередь прерываний. Сбивайте до завершения, сохраняя группе время атаковать цель до её перемещения. Убейте её до 100 энергии: затем прерывания перестанут работать.",
          "en": "Assign an interrupt order. Stop the cast before completion while allowing damage before its relocation. Kill it before 100 energy, when it becomes immune to interrupts."
        },
        "counters": [
          "interrupt"
        ],
        "counterRoles": [
          "tank",
          "healer",
          "melee",
          "ranged"
        ],
        "targetId": "soulcoiler",
        "heroicOnly": true
      },
      {
        "id": "binding",
        "spellId": 1304032,
        "name": {
          "ru": "Связь душ",
          "en": "Soulbinding"
        },
        "signal": {
          "ru": "Малакрасс восстанавливает Зул’джана; к нему летят фрагменты.",
          "en": "Malacrass restores Zul’jan while fragments travel toward him."
        },
        "response": {
          "ru": "Атакуйте уязвимого Зул’джана сильными способностями. Перехватывайте фрагменты до Малакрасса, но делайте паузы, если здоровье рейда низкое. В финале выравнивайте здоровье обеих целей.",
          "en": "Use major attacks on vulnerable Zul’jan. Intercept fragments before they reach Malacrass, pausing if raid health is low. In the finale, keep both targets’ health even."
        },
        "counters": [
          "defend",
          "aoe"
        ],
        "counterRoles": [
          "tank",
          "healer",
          "melee",
          "ranged"
        ],
        "spellIcon": "/assets/wow/raids/venomous-abyss/spells/1304032.jpg"
      },
      {
        "id": "blighted-sever",
        "spellId": 1307279,
        "name": {
          "ru": "Чумное рассечение",
          "en": "Blighted Sever"
        },
        "signal": {
          "ru": "В финале оба босса активны, а конус очищает и яд, и призраков.",
          "en": "In the finale both bosses are active, and the cone clears both venom and ghosts."
        },
        "response": {
          "ru": "Танк направляет конус через общую зону очистки, затем меняется и собирает свои фрагменты души. Рейд остаётся сзади, продолжает делить удары топора и убивает боссов одновременно.",
          "en": "The tank aims through the shared clearing zone, swaps afterward and collects their soul fragments. The raid stays behind, continues sharing axe strikes and finishes both bosses together."
        },
        "counters": [
          "defend"
        ],
        "counterRoles": [
          "tank"
        ]
      }
    ],
    "adds": [
      {
        "id": "soulcoiler",
        "npcId": 261521,
        "name": {
          "ru": "Злопамятный душитель душ",
          "en": "Spiteful Soulcoiler"
        },
        "description": {
          "ru": "Призрачный прислужник Малакрасса, появляющийся на Heroic.",
          "en": "Malacrass’s spectral servant appears on Heroic."
        },
        "action": {
          "ru": "Сразу атакуйте и назначьте очередь прерываний до 100 энергии. После прерывания найдите его новую позицию.",
          "en": "Attack immediately and assign interrupts before 100 energy. Locate its new position after an interrupt."
        },
        "death": {
          "ru": "После смерти перестаёт накладывать страх и наносить случайный урон.",
          "en": "Its death stops further fears and random damage."
        },
        "portrait": "/assets/wow/raids/venomous-abyss/enemies/261521.webp",
        "heroicOnly": true,
        "cast": {
          "spellId": 1286399,
          "name": {
            "ru": "Вопль ужаса",
            "en": "Wail of Terror"
          },
          "description": {
            "ru": "Завершённый вопль пугает всех игроков.",
            "en": "A completed wail fears every player."
          },
          "action": {
            "ru": "Прервите до окончания полосы; на Heroic базовый канал длится 12 секунд.",
            "en": "Interrupt before the cast completes; the Heroic base cast lasts 12 seconds."
          }
        }
      }
    ],
    "diagram": {
      "title": {
        "ru": "Позиции и задачи",
        "en": "Positions and jobs"
      },
      "caption": {
        "ru": "Рейд остаётся за боссом; опасные объекты собираются с другой стороны для танкового конуса.",
        "en": "The raid stays behind the boss; hazards gather on the opposite side for the tank cone."
      },
      "heroicCaption": {
        "ru": "Отдельная очередь на «Гильотину» и прерывания душителя душ.",
        "en": "Separate rotations handle Guillotine and Soulcoiler interrupts."
      },
      "steps": [
        {
          "id": "raid",
          "title": {
            "ru": "Безопасный тыл",
            "en": "Safe rear"
          },
          "body": {
            "ru": "Рейд стоит вместе; отмеченные взрывом игроки отходят в свободные стороны.",
            "en": "The raid groups here; players with explosions move into clear space."
          }
        },
        {
          "id": "tank",
          "title": {
            "ru": "Босс и активный танк",
            "en": "Boss and active tank"
          },
          "body": {
            "ru": "Танк разворачивает конус от рейда через подготовленную зону.",
            "en": "The tank directs the cone away from the raid through the prepared zone."
          }
        },
        {
          "id": "pile",
          "title": {
            "ru": "Яд или призраки",
            "en": "Venom or ghosts"
          },
          "body": {
            "ru": "Носители и цели призраков собирают объекты в зоне будущей очистки.",
            "en": "Carriers and ghost targets gather hazards where the next cone can clear them."
          }
        }
      ]
    },
    "sources": [
      {
        "title": "Игровой журнал / Encounter journal",
        "url": "https://www.wowhead.com/dungeon-journal/the-venomous-abyss/the-coiled-altar"
      },
      {
        "title": "Method — Heroic",
        "url": "https://www.method.gg/guides/the-venomous-abyss/the-coiled-altar-heroic"
      },
      {
        "title": "Blizzard — актуальные исправления / live hotfixes",
        "url": "https://news.blizzard.com/en-gb/article/24296142/hotfixes-october-6-2026"
      }
    ]
  },
  {
    "id": "ulatek",
    "name": {
      "ru": "Ула’тек",
      "en": "Ula’tek"
    },
    "raidName": {
      "ru": "Отравленная бездна",
      "en": "The Venomous Abyss"
    },
    "reviewedAt": "2026-11-04",
    "goal": {
      "ru": "Сохраняйте яйца чистыми, разделяйте удары хвостов и вовремя меняйте платформы. В коридорах убивайте стражей, а в финале помогайте отмеченным ядом игрокам.",
      "en": "Keep eggs clean, share tail impacts, and change platforms on time. Kill the corridor wardens, then help venom-marked players in the finale."
    },
    "priorities": [
      {
        "id": "waves",
        "title": {
          "ru": "Не несите яйца в яд",
          "en": "Keep eggs out of venom"
        },
        "body": {
          "ru": "Подберите яйцо и уходите от волн. Чистое яйцо безопаснее раскрывать общим ударом хвоста, а не отравлять.",
          "en": "Pick up an egg and dodge waves. A shared tail impact produces a safer hatch than venom does."
        }
      },
      {
        "id": "coils",
        "title": {
          "ru": "Разделяйте удар хвоста",
          "en": "Share the tail impact"
        },
        "body": {
          "ru": "Входите группой в отмеченное место хвоста. На Heroic две группы чередуются, не принимая соседние удары подряд.",
          "en": "Group inside the marked tail impact. On Heroic, two groups alternate rather than taking consecutive strikes."
        }
      },
      {
        "id": "bite",
        "title": {
          "ru": "Помогите цели укуса",
          "en": "Help the Bite target"
        },
        "body": {
          "ru": "Подойдите назначенными помощниками к отмеченному игроку и дождитесь снятия яда. Затем разойдитесь для собственных взрывов.",
          "en": "Assigned helpers join the marked player until the venom is removed. Then spread for your own explosions."
        }
      }
    ],
    "flow": [
      {
        "id": "eggs",
        "title": {
          "ru": "Начало: яйца и волны",
          "en": "Opening: eggs and waves"
        },
        "body": {
          "ru": "Держите яйца вне яда, закрывайте хвосты и атакуйте открывшееся сердце сильными способностями.",
          "en": "Keep eggs out of venom, share tail impacts, and use strong attacks on the exposed heart."
        }
      },
      {
        "id": "corridors",
        "title": {
          "ru": "Два коридора",
          "en": "Two corridors"
        },
        "body": {
          "ru": "Разделитесь на равные группы с танком и лекарями. Убейте стража, прерывайте его канал и разбивайте кладки.",
          "en": "Split evenly with a tank and healers on each side. Kill the warden, interrupt its channel, and destroy clutches."
        }
      },
      {
        "id": "cauldron",
        "title": {
          "ru": "Маленькие яйца, затем большое",
          "en": "Small eggs, then the large egg"
        },
        "body": {
          "ru": "После смерти стража отнесите яйца в котёл. Большое яйцо доставьте последним; убейте ослабевшего злочешуйника и вернитесь к сердцу.",
          "en": "After the warden dies, bring eggs to the cauldron. Deliver the large egg last; kill the Weakened Doomscale and return to the heart."
        }
      },
      {
        "id": "shatter",
        "title": {
          "ru": "Переход по хвостам",
          "en": "Follow the tail impacts"
        },
        "body": {
          "ru": "Подбирайте яйца и следуйте очереди ударов хвоста. Перед разрушением центра выйдите на сохранившуюся часть площадки.",
          "en": "Collect eggs and follow the tail sequence. Leave the centre before it breaks."
        }
      },
      {
        "id": "platforms",
        "title": {
          "ru": "Финал: соседние платформы",
          "en": "Finale: neighbouring platforms"
        },
        "body": {
          "ru": "Ближние остаются у босса, дальние и лекари — на следующей платформе против часовой стрелки. После разрушения двигайтесь дальше вместе.",
          "en": "Melee stay with the boss; ranged and healers use the next platform counterclockwise. Advance together as platforms break."
        }
      }
    ],
    "roles": {
      "tank": {
        "position": {
          "ru": "В начале один танк у головы, второй у хвоста; в коридорах по танку на сторону.",
          "en": "Start with one tank at the head and one at the tail; take one tank into each corridor."
        },
        "actions": [
          {
            "ru": "После отбрасывания «Гнева матери» вернитесь в зону головы: иначе урон получит рейд. Меняйтесь в безопасное окно между волнами.",
            "en": "Return to the head after Mother’s Wrath knocks you back or the raid takes the damage. Swap during a safe window between waves."
          },
          {
            "ru": "Подбирайте стражей и змей; конус ослабевшего злочешуйника направляйте от группы. В финале приводите визгуна к боссу.",
            "en": "Pick up wardens and snakes; face the Weakened Doomscale’s cone away from the group. Bring Shriekers to the boss in the finale."
          }
        ]
      },
      "healer": {
        "position": {
          "ru": "В своей группе; в финале на соседней платформе против часовой стрелки от босса.",
          "en": "Stay with your assigned group; in the finale, use the next platform counterclockwise from the boss."
        },
        "actions": [
          {
            "ru": "Планируйте сильное лечение на хвосты, сердце и разрушение платформ. Разрыв пут на обоих коридорах согласуйте, чтобы не наложить весь урон сразу.",
            "en": "Plan strong healing for tails, the heart and platform breaks. Coordinate tether breaks across both corridors to avoid simultaneous damage."
          },
          {
            "ru": "При «Змеином укусе» оставайтесь с помощниками до снятия яда, затем разойдитесь.",
            "en": "For Serpent’s Bite, stay with your helpers until venom is removed, then spread."
          }
        ]
      },
      "melee": {
        "position": {
          "ru": "У головы босса или приоритетного прислужника, вне чужих конусов.",
          "en": "Stay at the boss’s head or priority add, outside hostile cones."
        },
        "actions": [
          {
            "ru": "В коридоре бейте стража и кладки рядом с ним. Прерывайте «Злобу» и «Крик страдания» по очереди.",
            "en": "In the corridor, damage the warden and nearby clutches. Take turns interrupting Malice and Anguished Cry."
          },
          {
            "ru": "Перед «Обвиванием добычи» уходите с разрушающейся платформы; не задерживайтесь ради последнего удара.",
            "en": "Leave the collapsing platform before Circling Prey; do not stay for one more attack."
          }
        ]
      },
      "ranged": {
        "position": {
          "ru": "В начале с общей группой; в финале на платформе против часовой стрелки от ближних.",
          "en": "Start with the group; in the finale, use the platform counterclockwise from melee."
        },
        "actions": [
          {
            "ru": "Уничтожайте дальние кладки до вылупления, а не только атакуйте босса. Поддерживайте прерывания визгунов.",
            "en": "Destroy distant clutches before they hatch instead of only damaging the boss. Help interrupt Shriekers."
          },
          {
            "ru": "С яйцом обходите яд; с укусом дайте помощникам подойти и разойдитесь только после очищения.",
            "en": "Carry eggs around venom; with Bite, let helpers reach you and spread only after the venom clears."
          }
        ]
      }
    },
    "mechanics": [
      {
        "id": "eggs",
        "spellId": 1295360,
        "name": {
          "ru": "Тлетворная оболочка",
          "en": "Malignant Shell"
        },
        "signal": {
          "ru": "На полу лежат яйца; прикосновение позволяет переносить их.",
          "en": "Eggs lie on the floor; touching one lets you carry it."
        },
        "response": {
          "ru": "Переносите яйца вне яда и волн. Подставьте чистое яйцо под назначенный общий удар хвоста: выйдет слабый змеёныш. От яда рождается гораздо опаснее гадюка.",
          "en": "Carry eggs away from venom and waves. Bring a clean egg into your assigned shared tail impact to hatch a weak Rawling. Venom produces a much more dangerous Viper."
        },
        "counters": [],
        "counterRoles": []
      },
      {
        "id": "waves",
        "spellId": 1292403,
        "name": {
          "ru": "Едкие волны",
          "en": "Caustic Waves"
        },
        "signal": {
          "ru": "Босс отводит крыло и посылает волну через площадку.",
          "en": "The boss draws a wing back and sends a wave across the platform."
        },
        "response": {
          "ru": "Двигайтесь в сторону, противоположную отведённому крылу, и следите за следующей волной. Не допускайте контакта волны с яйцом или его носителем.",
          "en": "Move opposite the drawn-back wing and watch the next wave. Keep the wave away from eggs and their carriers."
        },
        "counters": [],
        "counterRoles": [],
        "spellIcon": "/assets/wow/raids/venomous-abyss/spells/1292403.jpg"
      },
      {
        "id": "coils",
        "spellId": 1287265,
        "name": {
          "ru": "Призрачные кольца",
          "en": "Spectral Coils"
        },
        "signal": {
          "ru": "Хвост отмечает место общего удара.",
          "en": "A tail marks a shared impact."
        },
        "response": {
          "ru": "Назначенная группа входит в место удара, чтобы уменьшить урон всему рейду. Носители чистых яиц идут вместе с ней; после удара убейте появившихся змеёнышей.",
          "en": "The assigned group enters the impact to reduce raid damage. Clean-egg carriers join them; kill the resulting Rawlings afterward."
        },
        "counters": [
          "defend",
          "aoe"
        ],
        "counterRoles": [
          "tank",
          "healer",
          "melee",
          "ranged"
        ],
        "spellIcon": "/assets/wow/raids/venomous-abyss/spells/1287265.jpg",
        "heroic": {
          "ru": "Чередуйте две группы. На длинном переходе первая принимает удары 1/3/5, вторая — 2/4/6.",
          "en": "Alternate two groups. During the long transition, group one takes 1/3/5 and group two takes 2/4/6."
        }
      },
      {
        "id": "wrath",
        "spellId": 1298367,
        "name": {
          "ru": "Гнев матери",
          "en": "Mother's Wrath"
        },
        "signal": {
          "ru": "Танка отбрасывает от головы; хвост тоже требует цель рядом.",
          "en": "The head tank is knocked back; the tail also needs a nearby target."
        },
        "response": {
          "ru": "Танк головы быстро возвращается в зону атаки под защитой. Второй танк остаётся у хвоста; не оставляйте ни одну сторону без цели. Меняйтесь в согласованное безопасное окно.",
          "en": "The head tank promptly returns into attack range with mitigation. The other tank stays at the tail; leave neither side unattended. Swap in an agreed safe window."
        },
        "counters": [
          "defend"
        ],
        "counterRoles": [
          "tank"
        ]
      },
      {
        "id": "heart",
        "spellId": 1286860,
        "name": {
          "ru": "Ярость пленницы",
          "en": "Rage of the Shackled"
        },
        "signal": {
          "ru": "Босс открывает уязвимое сердце; сверху падают обломки.",
          "en": "The boss exposes a vulnerable heart while debris falls."
        },
        "response": {
          "ru": "Переключитесь на сердце и используйте сильные атакующие способности. Выходите из мест падения обломков; лекари закрывают постоянный урон рейду.",
          "en": "Switch to the heart and use major offensive abilities. Leave debris impacts while healers cover sustained raid damage."
        },
        "counters": [
          "defend",
          "aoe"
        ],
        "counterRoles": [
          "tank",
          "healer",
          "melee",
          "ranged"
        ],
        "spellIcon": "/assets/wow/raids/venomous-abyss/spells/1286860.png"
      },
      {
        "id": "warden",
        "spellId": 1290779,
        "name": {
          "ru": "Злоба",
          "en": "Malice"
        },
        "signal": {
          "ru": "Страж в коридоре начинает канал «Злоба».",
          "en": "A corridor warden begins channeling Malice."
        },
        "response": {
          "ru": "Прервите канал сразу по своей очереди. Убейте стража, одновременно разбивая ближайшие кладки; танк держит его рядом с ними и от группы.",
          "en": "Interrupt the channel immediately on your turn. Kill the warden while destroying nearby clutches; the tank positions it near them and away from the group."
        },
        "counters": [
          "interrupt"
        ],
        "counterRoles": [
          "tank",
          "healer",
          "melee",
          "ranged"
        ],
        "targetId": "warden"
      },
      {
        "id": "fangs",
        "spellId": 1301117,
        "name": {
          "ru": "Хватающие клыки",
          "en": "Grasping Fangs"
        },
        "signal": {
          "ru": "Игроки связаны клыками со стражем.",
          "en": "Players are tethered to the warden by fangs."
        },
        "response": {
          "ru": "Отойдите, чтобы порвать связь, по команде: не разрывайте все путы сразу. Оба коридора согласуют небольшие порции разрывов, затем ждут окончания урона и восстановления здоровья.",
          "en": "Move away to break your tether on cue; never break them all together. Both corridors coordinate small batches, then wait for the damage to end and health to recover."
        },
        "counters": [
          "defend"
        ],
        "counterRoles": [
          "tank",
          "healer",
          "melee",
          "ranged"
        ],
        "heroic": {
          "ru": "Урон от разрыва действует на весь рейд 4 секунды и складывается. Учитывайте разрывы второй стороны.",
          "en": "Blight Vein from each break affects the entire raid for 4 seconds and stacks. Include the other corridor’s breaks in the plan."
        }
      },
      {
        "id": "cauldron",
        "spellId": 1313355,
        "name": {
          "ru": "Злочешуйный котел",
          "en": "Doomscale Cauldron"
        },
        "signal": {
          "ru": "Страж погиб; яйца можно отнести в котёл.",
          "en": "The warden dies, allowing eggs to be taken to the cauldron."
        },
        "response": {
          "ru": "Сначала перенесите маленькие яйца, затем большое. Носитель большого яйца не задерживается; танк готов подобрать вышедшую змею. После её смерти вернитесь к центру.",
          "en": "Deliver the small eggs first, then the large one. The large-egg carrier moves promptly; the tank picks up the resulting snake. Return to the centre after it dies."
        },
        "counters": [],
        "counterRoles": []
      },
      {
        "id": "cry",
        "spellId": 1305650,
        "name": {
          "ru": "Крик страдания",
          "en": "Anguished Cry"
        },
        "signal": {
          "ru": "Ослабевший злочешуйник начинает кричать.",
          "en": "A Weakened Doomscale starts its cry."
        },
        "response": {
          "ru": "Прервите «Крик страдания» до завершения: он наносит урон и оглушает группу. Танк отворачивает другие атаки змеи; весь урон идёт в неё до возвращения к боссу.",
          "en": "Interrupt Anguished Cry before it completes: it damages and stuns the group. The tank faces its other attacks away; kill it before returning to the boss."
        },
        "counters": [
          "interrupt"
        ],
        "counterRoles": [
          "tank",
          "healer",
          "melee",
          "ranged"
        ],
        "targetId": "weakened"
      },
      {
        "id": "clutches",
        "spellId": 1290990,
        "name": {
          "ru": "Извивающееся порождение",
          "en": "Writhing Gestation"
        },
        "signal": {
          "ru": "На площадках появляются растущие кладки.",
          "en": "Growing clutches appear on the platforms."
        },
        "response": {
          "ru": "Быстро уничтожайте кладки до вылупления. В коридоре ставьте стража рядом, чтобы атаковать обе цели; в финале дальние игроки закрывают удалённые кладки.",
          "en": "Destroy clutches before they hatch. In corridors, position the warden nearby to damage both; in the finale, ranged players handle distant clutches."
        },
        "counters": [],
        "counterRoles": [],
        "spellIcon": "/assets/wow/raids/venomous-abyss/spells/1290990.jpg"
      },
      {
        "id": "bite",
        "spellId": 1295905,
        "name": {
          "ru": "Змеиный укус",
          "en": "Serpent's Bite"
        },
        "signal": {
          "ru": "В финале игроки получают метку змеиного яда.",
          "en": "In the finale, players receive a venom mark."
        },
        "response": {
          "ru": "К каждой цели подходят назначенные помощники — достаточно не более трёх. Оставайтесь рядом до полного снятия яда, затем разойдитесь: у помощников будет собственный взрыв.",
          "en": "Assigned helpers join each target; no more than three are needed. Stay until the venom is fully removed, then spread for the helpers’ own explosions."
        },
        "counters": [
          "defend"
        ],
        "counterRoles": [
          "tank",
          "healer",
          "melee",
          "ranged"
        ],
        "heroic": {
          "ru": "Провал оставляет окаменевшую цель, которая также наносит огромный урон рейду. Не уходите от цели раньше очищения.",
          "en": "Failure leaves a petrified target that also inflicts severe raid damage. Do not leave before the venom clears."
        }
      },
      {
        "id": "echoes",
        "spellId": 1310764,
        "name": {
          "ru": "Жестокие отголоски",
          "en": "Vicious Echoes"
        },
        "signal": {
          "ru": "Морочешуйчатый визгун появляется и готовит крик.",
          "en": "A Blightscale Shrieker appears and prepares its scream."
        },
        "response": {
          "ru": "Танк подбирает визгуна, рейд быстро убивает его. Прерывайте «Жестокие отголоски» по очереди: завершённый крик оглушает и наносит тяжёлый урон.",
          "en": "The tank picks up the Shrieker and the raid kills it quickly. Rotate interrupts on Vicious Echoes: a completed scream stuns and deals heavy damage."
        },
        "counters": [
          "interrupt"
        ],
        "counterRoles": [
          "tank",
          "healer",
          "melee",
          "ranged"
        ],
        "targetId": "shrieker"
      },
      {
        "id": "platform",
        "spellId": 1301510,
        "name": {
          "ru": "Обвивание добычи",
          "en": "Circling Prey"
        },
        "signal": {
          "ru": "Босс обвивает и готовится разрушить текущую платформу.",
          "en": "The boss coils around the current platform before destroying it."
        },
        "response": {
          "ru": "До разрушения перейдите на следующую сохранившуюся платформу против часовой стрелки. Ближние идут к боссу, дальние и лекари держат соседнюю безопасную часть; используйте защиту на разрушении.",
          "en": "Before the break, move to the next surviving platform counterclockwise. Melee follow the boss; ranged and healers use the adjacent safe section. Use mitigation for the collapse."
        },
        "counters": [
          "defend",
          "aoe"
        ],
        "counterRoles": [
          "tank",
          "healer",
          "melee",
          "ranged"
        ],
        "spellIcon": "/assets/wow/raids/venomous-abyss/spells/1301510.png"
      }
    ],
    "adds": [
      {
        "id": "warden",
        "npcId": 264045,
        "name": {
          "ru": "Злочешуйный страж",
          "en": "Doomscale Warden"
        },
        "description": {
          "ru": "Страж коридора управляет яйцами и связывает игроков клыками.",
          "en": "A corridor warden controls eggs and tethers players with fangs."
        },
        "action": {
          "ru": "Прерывайте канал, убивайте стража и кладки рядом. Разрывы связей согласуйте с другой группой.",
          "en": "Interrupt its channel, kill the warden and nearby clutches, and coordinate tether breaks with the other group."
        },
        "death": {
          "ru": "После смерти можно переносить защищённые им яйца.",
          "en": "Its death allows protected eggs to be carried."
        },
        "portrait": "/assets/wow/raids/venomous-abyss/enemies/264045.webp",
        "cast": {
          "spellId": 1290779,
          "name": {
            "ru": "Злоба",
            "en": "Malice"
          },
          "description": {
            "ru": "Канал многократно наносит тяжёлый урон всем игрокам.",
            "en": "The channel repeatedly deals heavy damage to every player."
          },
          "action": {
            "ru": "Назначенный игрок прерывает сразу после начала канала.",
            "en": "The assigned player interrupts as soon as the channel starts."
          }
        }
      },
      {
        "id": "weakened",
        "npcId": 269200,
        "name": {
          "ru": "Ослабевший злочешуйник",
          "en": "Weakened Doomscale"
        },
        "description": {
          "ru": "Змея появляется после обработки большого яйца в котле.",
          "en": "This snake appears after the large egg is treated in the cauldron."
        },
        "action": {
          "ru": "Танк отворачивает конус, остальные быстро убивают и прерывают крик.",
          "en": "The tank faces its cone away; everyone else kills it quickly and interrupts its cry."
        },
        "death": {
          "ru": "После убийства группа возвращается к боссу.",
          "en": "After killing it, the group returns to the boss."
        },
        "portrait": "/assets/wow/raids/venomous-abyss/enemies/269200.webp",
        "cast": {
          "spellId": 1305650,
          "name": {
            "ru": "Крик страдания",
            "en": "Anguished Cry"
          },
          "description": {
            "ru": "Завершённый крик наносит урон и оглушает игроков рядом.",
            "en": "A completed cry damages and stuns nearby players."
          },
          "action": {
            "ru": "Прервите до конца полосы; следующий крик закрывает следующий назначенный игрок.",
            "en": "Interrupt before completion; the next assigned player handles the next cry."
          }
        }
      },
      {
        "id": "shrieker",
        "npcId": 273577,
        "name": {
          "ru": "Морочешуйчатый визгун",
          "en": "Blightscale Shrieker"
        },
        "description": {
          "ru": "Летающий змей появляется в финальной фазе.",
          "en": "This flying serpent appears during the final phase."
        },
        "action": {
          "ru": "Подберите танком, быстро убейте и постоянно прерывайте опасный крик.",
          "en": "Pick it up with a tank, kill it quickly and keep interrupting its dangerous scream."
        },
        "death": {
          "ru": "После смерти прекращает создавать новые крики и наращивать давление на рейд.",
          "en": "Its death stops further screams and increasing pressure on the raid."
        },
        "portrait": "/assets/wow/raids/venomous-abyss/enemies/273577.webp",
        "cast": {
          "spellId": 1310764,
          "name": {
            "ru": "Жестокие отголоски",
            "en": "Vicious Echoes"
          },
          "description": {
            "ru": "Крик оглушает игроков и накладывает тяжёлый периодический урон.",
            "en": "The scream stuns players and applies heavy damage over time."
          },
          "action": {
            "ru": "Прервите до завершения, сохраняя следующего прерывающего для повторного крика.",
            "en": "Interrupt before completion and retain the next interrupter for another scream."
          }
        }
      }
    ],
    "diagram": {
      "title": {
        "ru": "Позиции и задачи",
        "en": "Positions and jobs"
      },
      "caption": {
        "ru": "Путь меняется по фазам: общая площадка → два коридора → соседние сохранившиеся платформы.",
        "en": "The route changes by phase: shared platform → two corridors → neighbouring surviving platforms."
      },
      "heroicCaption": {
        "ru": "Группы чередуют хвосты и согласуют разрывы пут между обоими коридорами.",
        "en": "Groups alternate tail impacts and coordinate tether breaks across both corridors."
      },
      "steps": [
        {
          "id": "start",
          "title": {
            "ru": "Яйца и хвосты",
            "en": "Eggs and tails"
          },
          "body": {
            "ru": "Чистые яйца несут в общий удар хвоста, обходя волны яда.",
            "en": "Carry clean eggs into shared tail impacts while avoiding venom waves."
          }
        },
        {
          "id": "sides",
          "title": {
            "ru": "Два коридора с котлами",
            "en": "Two corridors with cauldrons"
          },
          "body": {
            "ru": "По танку и лекарям на сторону; маленькие яйца в котёл раньше большого.",
            "en": "A tank and healers go to each side; small eggs enter the cauldron before the large one."
          }
        },
        {
          "id": "final",
          "title": {
            "ru": "Ближние → дальние",
            "en": "Melee → ranged"
          },
          "body": {
            "ru": "Ближние у босса; дальние с лекарями на следующей платформе против часовой стрелки.",
            "en": "Melee stay with the boss; ranged and healers take the next platform counterclockwise."
          }
        }
      ]
    },
    "sources": [
      {
        "title": "Игровой журнал / Encounter journal",
        "url": "https://www.wowhead.com/dungeon-journal/the-venomous-abyss/ulatek"
      },
      {
        "title": "Method — Heroic",
        "url": "https://www.method.gg/guides/the-venomous-abyss/ulatek-heroic"
      },
      {
        "title": "Blizzard — актуальные исправления / live hotfixes",
        "url": "https://news.blizzard.com/en-gb/article/24296142/hotfixes-october-6-2026"
      }
    ]
  }
];
