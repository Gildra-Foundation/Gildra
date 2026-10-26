import type { RouteText } from "./midnightRaidRoutes";
import type { RaidEncounterDiagram, RaidPull } from "./raidPullTypes";

export type VoidspireBossStage = { id: string; title: RouteText; call: RouteText; mechanicIds: string[]; roles: RaidPull["roles"]; npcIds: number[]; extraEnemies: RouteText[]; diagram: RaidEncounterDiagram };
type BossStages = { summary: RouteText; phases: VoidspireBossStage[] };
const text = (ru: string, en: string): RouteText => ({ ru, en });
/** Normal/Heroic source review: 26 Oct 2026. Diagram coordinates illustrate
 * mechanics, not surveyed placements. No fixture players or class cooldowns. */
export const voidspireBossStages: Record<string, BossStages> = {
  "imperator-averzian": {
    "summary": text("Управляйте полем 3×3 и подкреплениями из порталов.", "Control the 3×3 board and portal reinforcements."),
    "phases": [
      {
        "id": "grid",
        "title": text("Поле 3×3", "3×3 board"),
        "call": text("Назовите две клетки для замачиваний; не оставляйте три занятых клетки в ряд.", "Call two soak tiles; never leave three claimed tiles in a line."),
        "mechanicIds": ["umbral-collapse", "blackening-wounds"],
        "roles": {
          "tank": [
            text("Ведите босса по свободным клеткам и согласуйте танка для переходки.", "Move the boss through free tiles and agree who handles intermission adds.")
          ],
          "healer": [
            text("Распределите защиту и лечение между двумя последовательными замачиваниями.", "Split healing and mitigation between the two successive soaks.")
          ],
          "dps": [
            text("Следуйте меткам рейд-лидера; не тратьте урон на неуязвимого ваятеля.", "Follow the raid leader’s marks; do not waste damage on an immune Voidshaper.")
          ]
        },
        "npcIds": [240435, 252918],
        "extraEnemies": [],
        "diagram": {
          "layout": "grid",
          "markers": [
            {
              "kind": "boss",
              "x": 50,
              "y": 18,
              "label": text("Босс", "Boss")
            },
            {
              "kind": "add",
              "x": 17,
              "y": 50,
              "label": text("Ваятель", "Voidshaper")
            },
            {
              "kind": "add",
              "x": 83,
              "y": 50,
              "label": text("Ваятель", "Voidshaper")
            },
            {
              "kind": "group",
              "x": 50,
              "y": 80,
              "label": text("Рейд", "Raid")
            }
          ],
          "zones": [
            {
              "kind": "soak",
              "x": 2,
              "y": 34,
              "width": 29,
              "height": 29,
              "label": text("Выбранное замачивание", "Called soak")
            },
            {
              "kind": "soak",
              "x": 69,
              "y": 34,
              "width": 29,
              "height": 29,
              "label": text("Второе замачивание", "Second soak")
            },
            {
              "kind": "danger",
              "x": 35,
              "y": 1,
              "width": 30,
              "height": 30,
              "label": text("Пример занятой клетки", "Example claimed tile")
            }
          ]
        }
      },
      {
        "id": "reinforcements",
        "title": text("Подкрепления", "Reinforcements"),
        "call": text("Соберите прислужников, оставляя проход между опасными линиями.", "Gather the adds while preserving a lane through the hazards."),
        "mechanicIds": ["pitch-bulwark", "void-fall", "oblivions-wrath", "shadow-phalanx"],
        "roles": {
          "tank": [
            text("Танк с ослаблением принимает подкрепления, второй — босса.", "The weakened tank handles reinforcements; the other takes the boss.")
          ],
          "healer": [
            text("Поддерживайте танка прислужников во время массового урона.", "Support the add tank during raid damage.")
          ],
          "dps": [
            text("Сначала аннигилятор и защитники; распределите прерывания без наложений.", "Prioritize the Annihilator and Stalwarts; rotate interrupts without overlap.")
          ]
        },
        "npcIds": [240435, 256757, 251239],
        "extraEnemies": [],
        "diagram": {
          "layout": "grid",
          "markers": [
            {
              "kind": "boss",
              "x": 50,
              "y": 17,
              "label": text("Босс", "Boss")
            },
            {
              "kind": "add",
              "x": 50,
              "y": 51,
              "label": text("Подкрепления", "Reinforcements")
            },
            {
              "kind": "tank",
              "x": 35,
              "y": 67,
              "label": text("Танк", "Tank")
            },
            {
              "kind": "group",
              "x": 65,
              "y": 80,
              "label": text("Рейд", "Raid")
            }
          ],
          "zones": [
            {
              "kind": "danger",
              "x": 5,
              "y": 37,
              "width": 90,
              "height": 9,
              "label": text("Линия атаки", "Attack lane"),
              "rotate": 20
            },
            {
              "kind": "safe",
              "x": 20,
              "y": 62,
              "width": 60,
              "height": 30,
              "label": text("Свободный сектор", "Clear sector")
            }
          ]
        }
      }
    ]
  },
  "vorasius": {
    "summary": text("Открывайте проходы в стенах и заранее выбирайте сторону от дыхания.", "Open the walls and prepare the escape side before each breath."),
    "phases": [
      {
        "id": "slams",
        "title": text("Удары и кольца", "Slams and rings"),
        "call": text("Рейд держится в центре; круг удара принимает назначенный танк.", "Stay central; the assigned tank takes the Slam circle."),
        "mechanicIds": ["primordial-roar", "shadowclaw-slam", "aftershock"],
        "roles": {
          "tank": [
            text("Первый танк принимает два первых удара, второй — последующие.", "The first tank takes the first two Slams; the other takes subsequent hits.")
          ],
          "healer": [
            text("Запланируйте лечение отбрасывания и защиту танка на втором ударе.", "Plan knockback healing and tank support for the second Slam.")
          ],
          "dps": [
            text("Оставляйте круг танку и возвращайтесь к боссу через разрыв колец.", "Leave the circle to the tank and return through a gap in the rings.")
          ]
        },
        "npcIds": [240434],
        "extraEnemies": [],
        "diagram": {
          "layout": "lane",
          "markers": [
            {
              "kind": "boss",
              "x": 50,
              "y": 25,
              "label": text("Босс", "Boss")
            },
            {
              "kind": "tank",
              "x": 50,
              "y": 43,
              "label": text("Танк", "Tank")
            },
            {
              "kind": "group",
              "x": 50,
              "y": 75,
              "label": text("Рейд", "Raid")
            }
          ],
          "zones": [
            {
              "kind": "soak",
              "x": 38,
              "y": 30,
              "width": 24,
              "height": 24,
              "label": text("Удар принимает один танк", "One tank takes the hit")
            },
            {
              "kind": "safe",
              "x": 15,
              "y": 62,
              "width": 70,
              "height": 28,
              "label": text("Группа возвращается после удара", "Group returns after the hit")
            }
          ]
        }
      },
      {
        "id": "walls",
        "title": text("Стены и дыхание", "Walls and breath"),
        "call": text("Сначала откройте стены взрывами прислужников, затем уходите от дыхания.", "Open the walls with add explosions, then move away from the breath."),
        "mechanicIds": ["blisterburst", "void-breath"],
        "roles": {
          "tank": [
            text("Свободный танк помогает стороне, которой не хватает прислужников.", "The free tank helps the side that needs more adds.")
          ],
          "healer": [
            text("Держите фиксации в радиусе лечения по обе стороны арены.", "Keep fixated players within healing reach on both sides.")
          ],
          "dps": [
            text("Контролируйте убийство у стен, не в центре площадки.", "Control add deaths at the walls rather than in the middle.")
          ]
        },
        "npcIds": [240434],
        "extraEnemies": [
          text("Паразиты с фиксацией", "Blistercreeps")
        ],
        "diagram": {
          "layout": "lane",
          "markers": [
            {
              "kind": "boss",
              "x": 50,
              "y": 14,
              "label": text("Босс", "Boss")
            },
            {
              "kind": "add",
              "x": 22,
              "y": 47,
              "label": text("К стене", "To the wall")
            },
            {
              "kind": "add",
              "x": 78,
              "y": 47,
              "label": text("К стене", "To the wall")
            },
            {
              "kind": "group",
              "x": 50,
              "y": 80,
              "label": text("Рейд", "Raid")
            }
          ],
          "zones": [
            {
              "kind": "wall",
              "x": 1,
              "y": 25,
              "width": 12,
              "height": 52,
              "label": text("Открыть левую стену", "Open left wall")
            },
            {
              "kind": "wall",
              "x": 87,
              "y": 25,
              "width": 12,
              "height": 52,
              "label": text("Открыть правую стену", "Open right wall")
            }
          ]
        }
      }
    ]
  },
  "fallen-king-salhadaar": {
    "summary": text("Останавливайте проекции, уничтожайте сферы и сохраняйте место для лучей.", "Stop projections, kill orbs and preserve room for rotating beams."),
    "phases": [
      {
        "id": "control",
        "title": text("Сферы и проекции", "Orbs and projections"),
        "call": text("Сферы не должны дойти до босса; метки выносите от группы.", "Keep orbs away from the boss and take marks away from the group."),
        "mechanicIds": ["void-convergence", "shadow-fracture", "shattering-twilight", "despotic-command", "destabilizing-strikes"],
        "roles": {
          "tank": [
            text("Держите босса вдали от сфер, готовя свободное место к 100 энергии.", "Keep the boss clear of orbs and prepare space before 100 energy.")
          ],
          "healer": [
            text("Следите за метками и поглощением лечения после снятия приказа.", "Watch marked targets and the healing absorb after Command is removed.")
          ],
          "dps": [
            text("Заранее закрепите сектора контроля проекций и переключения на сферы.", "Preassign projection-control sectors and orb target switches.")
          ]
        },
        "npcIds": [240432, 251791],
        "extraEnemies": [
          text("Сконцентрированная Бездна", "Concentrated Void")
        ],
        "diagram": {
          "layout": "circle",
          "markers": [
            {
              "kind": "boss",
              "x": 50,
              "y": 40,
              "label": text("Босс", "Boss")
            },
            {
              "kind": "tank",
              "x": 35,
              "y": 58,
              "label": text("Танк", "Tank")
            },
            {
              "kind": "add",
              "x": 18,
              "y": 18,
              "label": text("Сфера", "Orb")
            },
            {
              "kind": "add",
              "x": 82,
              "y": 18,
              "label": text("Сфера", "Orb")
            },
            {
              "kind": "group",
              "x": 65,
              "y": 80,
              "label": text("Рейд", "Raid")
            }
          ],
          "zones": [
            {
              "kind": "danger",
              "x": 3,
              "y": 3,
              "width": 28,
              "height": 28,
              "label": text("Сфера не должна дойти до босса", "Keep the orb from reaching the boss")
            }
          ]
        }
      },
      {
        "id": "unraveling",
        "title": text("100 энергии", "100 energy"),
        "call": text("Двигайтесь между вращающимися лучами; это окно усиленного урона по боссу.", "Move between rotating beams; this is the increased-damage window."),
        "mechanicIds": ["entropic-unraveling"],
        "roles": {
          "tank": [
            text("Не перекрывайте группе следующий свободный сектор.", "Preserve the group’s next clear sector.")
          ],
          "healer": [
            text("Используйте назначенный рейдовый кулдаун на периодический урон.", "Use the assigned raid cooldown for periodic damage.")
          ],
          "dps": [
            text("Совместите атакующие кулдауны с этим окном, сохраняя движение.", "Align offensive cooldowns with this window while continuing to move.")
          ]
        },
        "npcIds": [240432],
        "extraEnemies": [],
        "diagram": {
          "layout": "circle",
          "markers": [
            {
              "kind": "boss",
              "x": 50,
              "y": 43,
              "label": text("Босс", "Boss")
            },
            {
              "kind": "group",
              "x": 75,
              "y": 76,
              "label": text("Рейд", "Raid")
            }
          ],
          "zones": [
            {
              "kind": "danger",
              "x": 10,
              "y": 42,
              "width": 80,
              "height": 8,
              "label": text("Вращающийся луч", "Rotating beam"),
              "rotate": 35
            },
            {
              "kind": "danger",
              "x": 10,
              "y": 42,
              "width": 80,
              "height": 8,
              "label": text("Вращающийся луч", "Rotating beam"),
              "rotate": -35
            }
          ]
        }
      }
    ]
  },
  "vaelgor-ezzorak": {
    "summary": text("Держите драконов раздельно, распределяйте замачивания и собирайтесь в барьер.", "Separate the dragons, assign soaks and regroup inside the barrier."),
    "phases": [
      {
        "id": "dragons",
        "title": text("Два дракона", "Twin dragons"),
        "call": text("Сохраняйте дистанцию между драконами; направления дыханий должны быть свободны.", "Keep the dragons separated and leave clear lanes for their breaths."),
        "mechanicIds": ["dread-breath", "nullbeam-nullzone", "gloom", "void-howl", "twilight-bond-rakfang"],
        "roles": {
          "tank": [
            text("Меняйтесь боссами после согласованного Мрака; не стойте за хвостами.", "Swap bosses after the agreed Gloom and avoid their tails.")
          ],
          "healer": [
            text("Поддерживайте танков у луча и быстро снимайте страх с задетых игроков.", "Support beam tanks and promptly remove fear from anyone hit.")
          ],
          "dps": [
            text("Подготовьте назначенную группу замачивания и контроль сфер.", "Prepare the assigned soak group and orb control.")
          ]
        },
        "npcIds": [242056, 244552],
        "extraEnemies": [],
        "diagram": {
          "layout": "split",
          "markers": [
            {
              "kind": "boss",
              "x": 25,
              "y": 32,
              "label": text("Ваэлгор", "Vaelgor")
            },
            {
              "kind": "boss",
              "x": 75,
              "y": 32,
              "label": text("Эззорак", "Ezzorak")
            },
            {
              "kind": "tank",
              "x": 25,
              "y": 14,
              "label": text("Танк", "Tank")
            },
            {
              "kind": "tank",
              "x": 75,
              "y": 14,
              "label": text("Танк", "Tank")
            },
            {
              "kind": "group",
              "x": 50,
              "y": 80,
              "label": text("Рейд", "Raid")
            }
          ],
          "zones": [
            {
              "kind": "danger",
              "x": 3,
              "y": 35,
              "width": 22,
              "height": 36,
              "label": text("Дыхание от рейда", "Breath away from raid")
            },
            {
              "kind": "soak",
              "x": 62,
              "y": 48,
              "width": 30,
              "height": 20,
              "label": text("Назначенная группа", "Assigned group")
            }
          ]
        }
      },
      {
        "id": "barrier",
        "title": text("Сияющий барьер", "Radiant Barrier"),
        "call": text("Все — внутрь защитного барьера.", "Everyone moves inside the protective barrier."),
        "mechanicIds": ["radiant-barrier-shadowmark"],
        "roles": {
          "tank": [
            text("Заранее подготовьте позиции драконов к возвращению основной фазы.", "Prepare dragon positions for the return to the main phase.")
          ],
          "healer": [
            text("Согласуйте защиту группы на урон переходки.", "Coordinate group mitigation for intermission damage.")
          ],
          "dps": [
            text("Уничтожайте Воплощение Полуночи, оставаясь в барьере.", "Kill the Manifestation of Midnight while staying inside the barrier.")
          ]
        },
        "npcIds": [],
        "extraEnemies": [
          text("Воплощение Полуночи", "Manifestation of Midnight")
        ],
        "diagram": {
          "layout": "split",
          "markers": [
            {
              "kind": "add",
              "x": 50,
              "y": 42,
              "label": text("Воплощение", "Manifestation")
            },
            {
              "kind": "group",
              "x": 50,
              "y": 70,
              "label": text("Рейд", "Raid")
            },
            {
              "kind": "objective",
              "x": 76,
              "y": 48,
              "label": text("Метка к краю", "Mark to edge")
            }
          ],
          "zones": [
            {
              "kind": "safe",
              "x": 20,
              "y": 18,
              "width": 60,
              "height": 68,
              "label": text("Оставаться внутри барьера", "Stay inside the barrier")
            }
          ]
        }
      }
    ]
  },
  "lightblinded-vanguard": {
    "summary": text("Контролируйте три цели и по очереди выводите активную ауру из группы боссов.", "Control three targets and move each active aura away from the other bosses."),
    "phases": [
      {
        "id": "council",
        "title": text("Совет", "Council"),
        "call": text("Начальный приоритет — Венел; не допускайте ранней гибели одного из боссов.", "Start with Venel as priority and avoid killing one boss too early."),
        "mechanicIds": ["avengers-shield", "sacred-shield-blinding-light", "divine-shield", "judgment-combo"],
        "roles": {
          "tank": [
            text("Согласуйте смены после Правосудия и отдельную угрозу всех трёх целей.", "Coordinate post-Judgment swaps and maintain threat on all three targets.")
          ],
          "healer": [
            text("Готовьте диспелы отмеченных щитом игроков после их расхождения.", "Prepare to dispel Shield targets once they have separated.")
          ],
          "dps": [
            text("Переключайтесь на щит Сенна и держите урон по совету сбалансированным.", "Switch to Senn’s shield and balance damage across the council.")
          ]
        },
        "npcIds": [240431, 240437, 240438],
        "extraEnemies": [],
        "diagram": {
          "layout": "split",
          "markers": [
            {
              "kind": "boss",
              "x": 20,
              "y": 25,
              "label": text("Беллами", "Bellamy")
            },
            {
              "kind": "boss",
              "x": 50,
              "y": 25,
              "label": text("Венел", "Venel")
            },
            {
              "kind": "boss",
              "x": 80,
              "y": 25,
              "label": text("Сенн", "Senn")
            },
            {
              "kind": "group",
              "x": 50,
              "y": 78,
              "label": text("Рейд", "Raid")
            }
          ],
          "zones": [
            {
              "kind": "safe",
              "x": 20,
              "y": 58,
              "width": 60,
              "height": 30,
              "label": text("Свободное место", "Clear space")
            }
          ]
        }
      },
      {
        "id": "bellamy",
        "title": text("Аура Беллами", "Bellamy’s aura"),
        "call": text("Выведите Беллами; остальные боссы должны остаться вне его ауры.", "Move Bellamy out; keep the other bosses outside his aura."),
        "mechanicIds": ["boss-auras", "divine-toll"],
        "roles": {
          "tank": [
            text("Переместите Беллами к краю до заполнения энергии.", "Move Bellamy to an edge before his energy fills.")
          ],
          "healer": [
            text("Сохраняйте дальность лечения до обеих групп целей.", "Keep both target groups within healing reach.")
          ],
          "dps": [
            text("Следите за проходами между движущимися щитами.", "Watch the gaps between moving shields.")
          ]
        },
        "npcIds": [240431, 240437, 240438],
        "extraEnemies": [],
        "diagram": {
          "layout": "split",
          "markers": [
            {
              "kind": "boss",
              "x": 22,
              "y": 22,
              "label": text("Беллами", "Bellamy")
            },
            {
              "kind": "boss",
              "x": 77,
              "y": 58,
              "label": text("Остальные", "Other bosses")
            },
            {
              "kind": "tank",
              "x": 22,
              "y": 48,
              "label": text("Танк", "Tank")
            },
            {
              "kind": "group",
              "x": 60,
              "y": 82,
              "label": text("Рейд", "Raid")
            }
          ],
          "zones": [
            {
              "kind": "danger",
              "x": 2,
              "y": 2,
              "width": 40,
              "height": 40,
              "label": text("Активная аура: разнести боссов", "Active aura: separate bosses")
            }
          ]
        }
      },
      {
        "id": "venel",
        "title": text("Аура Венела", "Venel’s aura"),
        "call": text("Выведите Венела и разделите группы под отмеченных игроков.", "Move Venel out and split the assigned groups around marked players."),
        "mechanicIds": ["boss-auras", "execution-sentence"],
        "roles": {
          "tank": [
            text("Удерживайте Венела отдельно от других боссов.", "Keep Venel separated from the other bosses.")
          ],
          "healer": [
            text("Подготовьте лечение разделяемых ударов.", "Prepare healing for the shared hits.")
          ],
          "dps": [
            text("Займите свою группу замачивания до срабатывания меток.", "Join your assigned soak group before the marks resolve.")
          ]
        },
        "npcIds": [240431, 240437, 240438],
        "extraEnemies": [],
        "diagram": {
          "layout": "split",
          "markers": [
            {
              "kind": "boss",
              "x": 22,
              "y": 22,
              "label": text("Венел", "Venel")
            },
            {
              "kind": "boss",
              "x": 77,
              "y": 58,
              "label": text("Остальные", "Other bosses")
            },
            {
              "kind": "tank",
              "x": 22,
              "y": 48,
              "label": text("Танк", "Tank")
            },
            {
              "kind": "group",
              "x": 60,
              "y": 82,
              "label": text("Рейд", "Raid")
            }
          ],
          "zones": [
            {
              "kind": "danger",
              "x": 2,
              "y": 2,
              "width": 40,
              "height": 40,
              "label": text("Активная аура: разнести боссов", "Active aura: separate bosses")
            }
          ]
        }
      },
      {
        "id": "senn",
        "title": text("Аура Сенна", "Senn’s aura"),
        "call": text("Выведите Сенна; ближайшие назначенные игроки принимают механику Гнева Тира.", "Move Senn out; assigned nearby players handle Tyr’s Wrath."),
        "mechanicIds": ["boss-auras", "tyrs-wrath"],
        "roles": {
          "tank": [
            text("Не заводите других боссов в ауру Сенна.", "Keep the other bosses outside Senn’s aura.")
          ],
          "healer": [
            text("Быстро снимайте поглощение лечения с назначенной группы.", "Quickly heal through the assigned group’s absorbs.")
          ],
          "dps": [
            text("Не занимайте место ближайших игроков, если вы не назначены.", "Leave the nearest positions to the assigned players.")
          ]
        },
        "npcIds": [240431, 240437, 240438],
        "extraEnemies": [],
        "diagram": {
          "layout": "split",
          "markers": [
            {
              "kind": "boss",
              "x": 22,
              "y": 22,
              "label": text("Сенн", "Senn")
            },
            {
              "kind": "boss",
              "x": 77,
              "y": 58,
              "label": text("Остальные", "Other bosses")
            },
            {
              "kind": "tank",
              "x": 22,
              "y": 48,
              "label": text("Танк", "Tank")
            },
            {
              "kind": "group",
              "x": 60,
              "y": 82,
              "label": text("Рейд", "Raid")
            }
          ],
          "zones": [
            {
              "kind": "danger",
              "x": 2,
              "y": 2,
              "width": 40,
              "height": 40,
              "label": text("Активная аура: разнести боссов", "Active aura: separate bosses")
            }
          ]
        }
      }
    ]
  },
  "crown-of-the-cosmos": {
    "summary": text("Три основные фазы и две переходки: полубоссы, Аллерия с двойником, затем разрушающиеся платформы.", "Three main phases and two intermissions: sentinels, Alleria and her clone, then collapsing platforms."),
    "phases": [
      {
        "id": "sentinels",
        "title": text("Полубоссы", "Undying Sentinels"),
        "call": text("Порядок целей — Demiar, Vorelus, Morium.", "Target order: Demiar, Vorelus, Morium."),
        "mechanicIds": ["grasp-of-emptiness", "void-expulsion", "void-droplets", "null-corona", "silverstrike-arrow"],
        "roles": {
          "tank": [
            text("Танкуйте назначенную цель без смены; учитывайте отбрасывание Мориума.", "Tank your assigned target without swapping; prepare for Morium’s knockback.")
          ],
          "healer": [
            text("Лечите поглощение Нуль-венца; обычный диспел переносит остаток на другого игрока.", "Heal through Null Corona; a normal dispel transfers the remaining absorb.")
          ],
          "dps": [
            text("Держите ближний контакт с полубоссами и подготовьте стрелы для снятия неуязвимости.", "Maintain melee contact on sentinels and prepare arrows to remove their immunity.")
          ]
        },
        "npcIds": [],
        "extraEnemies": [
          text("Demiar", "Demiar"),
          text("Vorelus", "Vorelus"),
          text("Morium", "Morium"),
          text("Капли Бездны", "Void Droplets")
        ],
        "diagram": {
          "layout": "circle",
          "markers": [
            {
              "kind": "add",
              "x": 20,
              "y": 24,
              "label": text("Demiar", "Demiar")
            },
            {
              "kind": "add",
              "x": 50,
              "y": 24,
              "label": text("Vorelus", "Vorelus")
            },
            {
              "kind": "add",
              "x": 80,
              "y": 24,
              "label": text("Morium", "Morium")
            },
            {
              "kind": "group",
              "x": 50,
              "y": 75,
              "label": text("Рейд", "Raid")
            }
          ],
          "zones": [
            {
              "kind": "danger",
              "x": 2,
              "y": 2,
              "width": 12,
              "height": 96,
              "label": text("Лужи у края", "Pools at the edge")
            }
          ]
        }
      },
      {
        "id": "singularity-one",
        "title": text("Первая переходка", "First intermission"),
        "call": text("Бегите против притяжения и снимайте замедление назначенной стрелой.", "Run against the pull and clear the slow with an assigned arrow."),
        "mechanicIds": ["silverstrike-barrage"],
        "roles": {
          "tank": [
            text("Согласуйте позицию следующей фазы до окончания притяжения.", "Agree the next phase’s positions before the pull ends.")
          ],
          "healer": [
            text("Поддерживайте группу на периодическом уроне переходки.", "Support the group through intermission damage.")
          ],
          "dps": [
            text("Сохраняйте движение от центра, не гонитесь за уроном.", "Keep moving away from the center rather than chasing damage.")
          ]
        },
        "npcIds": [240430],
        "extraEnemies": [],
        "diagram": {
          "layout": "ring",
          "markers": [
            {
              "kind": "objective",
              "x": 50,
              "y": 42,
              "label": text("От центра", "Away from center")
            },
            {
              "kind": "group",
              "x": 50,
              "y": 82,
              "label": text("Рейд", "Raid")
            }
          ],
          "zones": [
            {
              "kind": "danger",
              "x": 34,
              "y": 25,
              "width": 32,
              "height": 34,
              "label": text("Притяжение к центру", "Pull toward center")
            },
            {
              "kind": "soak",
              "x": 15,
              "y": 65,
              "width": 25,
              "height": 18,
              "label": text("Назначенная стрела", "Assigned arrow")
            }
          ]
        }
      },
      {
        "id": "alleria-clone",
        "title": text("Аллерия и двойник", "Alleria and her clone"),
        "call": text("Рикошет проведите через прислужников; затем переключайтесь в барьер двойника.", "Route the ricochet through adds, then switch to the clone’s barrier."),
        "mechanicIds": ["ricochet-barrier", "voidstalker-sting", "void-expulsion", "null-corona"],
        "roles": {
          "tank": [
            text("Меняйте цели провокацией с текущей позиции после рикошета и разбитого щита.", "Swap targets by taunting from position after the ricochet and shield break.")
          ],
          "healer": [
            text("Готовьте лечение при переходе через трещины и переносе поглощений.", "Prepare healing for fissure crossings and absorb targets.")
          ],
          "dps": [
            text("Заранее распределите контроль появляющихся прислужников.", "Preassign control for newly spawned adds.")
          ]
        },
        "npcIds": [240430, 245113],
        "extraEnemies": [
          text("Прислужники Бездны", "Voidspawn")
        ],
        "diagram": {
          "layout": "split",
          "markers": [
            {
              "kind": "boss",
              "x": 25,
              "y": 30,
              "label": text("Аллерия", "Alleria")
            },
            {
              "kind": "boss",
              "x": 75,
              "y": 30,
              "label": text("Двойник", "Simulacrum")
            },
            {
              "kind": "add",
              "x": 50,
              "y": 50,
              "label": text("Прислужники", "Adds")
            },
            {
              "kind": "group",
              "x": 50,
              "y": 80,
              "label": text("Рейд", "Raid")
            }
          ],
          "zones": [
            {
              "kind": "soak",
              "x": 16,
              "y": 46,
              "width": 68,
              "height": 12,
              "label": text("Провести рикошет через прислужников", "Route ricochet through the adds")
            }
          ]
        }
      },
      {
        "id": "singularity-two",
        "title": text("Вторая переходка", "Second intermission"),
        "call": text("Снимите замедление и завершите переходку вне разделяющей платформы трещины.", "Clear the slow and finish the intermission away from a dividing fissure."),
        "mechanicIds": ["silverstrike-barrage"],
        "roles": {
          "tank": [
            text("Займите стартовую позицию финальной платформы вместе с рейдом.", "Take the final platform’s starting position with the raid.")
          ],
          "healer": [
            text("Сохраните ресурс лечения для последовательных ударов финала.", "Preserve healing resources for the final phase’s successive hits.")
          ],
          "dps": [
            text("Не останавливайтесь на трещине между секциями.", "Do not stop on the fissure between sections.")
          ]
        },
        "npcIds": [240430],
        "extraEnemies": [],
        "diagram": {
          "layout": "ring",
          "markers": [
            {
              "kind": "objective",
              "x": 50,
              "y": 42,
              "label": text("От центра", "Away from center")
            },
            {
              "kind": "group",
              "x": 50,
              "y": 82,
              "label": text("Рейд", "Raid")
            }
          ],
          "zones": [
            {
              "kind": "danger",
              "x": 34,
              "y": 25,
              "width": 32,
              "height": 34,
              "label": text("Притяжение к центру", "Pull toward center")
            },
            {
              "kind": "soak",
              "x": 15,
              "y": 65,
              "width": 25,
              "height": 18,
              "label": text("Назначенная стрела", "Assigned arrow")
            }
          ]
        }
      },
      {
        "id": "platforms",
        "title": text("Разрушающиеся платформы", "Collapsing platforms"),
        "call": text("Снимайте связи по очереди: ближний боец, танк, дальний боец.", "Break tethers in order: melee, tank, ranged."),
        "mechanicIds": ["aspect-of-the-end", "grasp-of-emptiness", "voidstalker-sting", "null-corona"],
        "roles": {
          "tank": [
            text("Не обрывайте связь раньше ближнего бойца; затем верните босса в рабочую позицию.", "Do not break your tether before the melee player; then reset the boss position.")
          ],
          "healer": [
            text("Восстанавливайте здоровье между последовательными обрывами связей.", "Recover health between successive tether breaks.")
          ],
          "dps": [
            text("Следуйте движению группы и заранее подготовьте переход на следующую платформу.", "Follow the group and prepare the jump to the next platform early.")
          ]
        },
        "npcIds": [240430],
        "extraEnemies": [],
        "diagram": {
          "layout": "lane",
          "markers": [
            {
              "kind": "boss",
              "x": 50,
              "y": 20,
              "label": text("Босс", "Boss")
            },
            {
              "kind": "group",
              "x": 42,
              "y": 64,
              "label": text("Рейд", "Raid")
            },
            {
              "kind": "objective",
              "x": 82,
              "y": 70,
              "label": text("Дальше", "Next platform")
            }
          ],
          "zones": [
            {
              "kind": "danger",
              "x": 1,
              "y": 1,
              "width": 17,
              "height": 98,
              "label": text("Разрушение позади", "Destruction behind")
            },
            {
              "kind": "safe",
              "x": 25,
              "y": 45,
              "width": 46,
              "height": 40,
              "label": text("Движение группы", "Group movement")
            }
          ]
        }
      }
    ]
  }
};
