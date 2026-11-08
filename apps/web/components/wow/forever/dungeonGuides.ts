import returningGuides from "./returningGuides.json";
import type { InstanceMap } from "./InstanceMaps";
import type { Lang } from "@/lib/i18n-paths";
type Localized = Record<Lang, string>;
export type DungeonGuide = {
  entrance: Localized;
  preparation?: Localized[];
  route?: { title: Localized; description: Localized; bosses: string[] }[];
  map: string;
  maps?: InstanceMap[];
  viewBox?: string;
  bosses: { name: string; portrait?: string; mechanics?: { name: string; response: Localized; icon?: string; audience?: Localized }[] }[];
  trash?: { name: string; portrait?: string; ability: string; response: Localized }[];
  sources: string[][];
};
/** Observed encounters and client rosters are reconciled in docs/forever/OTHER-DUNGEONS.md. No inferred pack positions. */
export const dungeonGuides: Record<string, DungeonGuide> = {
  ...returningGuides,
  "ruins-of-lordaeron": {
    "entrance": {
      "en": "Enter through the ruined courtyard above Undercity, in Tirisfal Glades.",
      "ru": "Вход находится в разрушенном дворе над Подгородом, в Тирисфальских лесах."
    },
    "map": "/images/wow/forever/ruins-of-lordaeron/2.webp",
    "bosses": [
      {
        "name": "Witherfang",
        "mechanics": [
          {
            "name": "Leech Poison",
            "icon": "/images/wow/forever/icons/136067.webp",
            "response": {
              "en": "Clear the patrol path before pulling the spider and its escorts.",
              "ru": "Зачистите путь патруля перед пулом паука со свитой."
            }
          }
        ]
      },
      {
        "name": "The Baron",
        "mechanics": [
          {
            "name": "Knockout",
            "icon": "/images/wow/forever/icons/132939.webp",
            "response": {
              "en": "Keep the tank healed through the stun.",
              "ru": "Поддерживайте здоровье танка перед оглушением."
            }
          }
        ]
      },
      {
        "name": "Viktor the Vile",
        "mechanics": [
          {
            "name": "Leech Poison",
            "icon": "/images/wow/forever/icons/136067.webp",
            "response": {
              "en": "The chimney starts five waves before the boss. Save mana.",
              "ru": "Дымоход запускает пять волн перед боссом. Берегите ману."
            }
          }
        ]
      },
      {
        "name": "The Abandoned",
        "mechanics": [
          {
            "name": "Life Drain",
            "response": {
              "en": "The statue starts three waves. Stun the boss during the drain.",
              "ru": "Статуя запускает три волны. Оглушайте босса во время вытягивания жизни."
            }
          }
        ]
      },
      {
        "name": "Bjork",
        "mechanics": [
          {
            "name": "Anti-Magic Shield",
            "icon": "/images/wow/forever/icons/136120.webp",
            "response": {
              "en": "Wait out the shield before spending major spells.",
              "ru": "Переждите щит, прежде чем тратить мощные заклинания."
            }
          }
        ]
      },
      {
        "name": "Rath’mael",
        "mechanics": [
          {
            "name": "Flamestrike",
            "response": {
              "en": "Leave the impact area.",
              "ru": "Выходите из области удара."
            }
          }
        ]
      }
    ],
    "sources": [
      [
        "Method — Ruins of Lordaeron",
        "https://www.method.gg/wow-forever/dungeons/ruins-of-lordaeron"
      ],
      [
        "ForeverDB — map",
        "https://foreverdb.net/dungeon/2999-ruins-of-lordaeron"
      ],
      [
        "Phylactery — encounter names",
        "https://phylactery.io/instance/2999"
      ]
    ],
    "trash": [
      {
        "name": "Broodwidow · Venom Lurker",
        "ability": "Patrol",
        "response": {
          "en": "Pull back from approaching spider patrols.",
          "ru": "Оттягивайте бой от приближающихся паучьих патрулей."
        }
      },
      {
        "name": "Flesh Golem",
        "ability": "Knockback",
        "response": {
          "en": "Fight away from uncleared packs.",
          "ru": "Держитесь подальше от незачищенных групп."
        }
      }
    ],
    "viewBox": "670 940 760 820"
  },
  "excavation-site": {
    "entrance": {
      "en": "In Wetlands, head west after leaving Dun Algaz; follow the uphill path by the meeting stone.",
      "ru": "В Болотине после выхода из Дун Альгаза идите на запад, затем вверх по тропе у камня встреч."
    },
    "map": "/images/wow/forever/excavation-site/1.webp",
    "bosses": [
      {
        "name": "Saltspine",
        "mechanics": [
          {
            "name": "Dust Storm · Tendon Rip",
            "response": {
              "en": "Keep ranged players outside the dust cloud. The tank is slowed by Tendon Rip.",
              "ru": "Дальним бойцам держаться вне пыльного облака. Tendon Rip замедляет танка."
            }
          }
        ]
      },
      {
        "name": "Shadetooth",
        "mechanics": [
          {
            "name": "Terrifying Roar · Enrage",
            "icon": "/images/wow/forever/icons/132111.webp",
            "response": {
              "en": "Clear the nearby bushes first. Control the two Thicket Hunters; save defensive cooldowns for the final enrage.",
              "ru": "Сначала зачистите кусты рядом. Контролируйте двух Thicket Hunters; оставьте защитные способности на финальное исступление."
            }
          }
        ]
      },
      {
        "name": "Highland Horror",
        "mechanics": [
          {
            "name": "Entangling Roots · Wild Regeneration",
            "icon": "/images/wow/forever/icons/136100.webp",
            "response": {
              "en": "Interrupt regeneration; fight apart from nearby slimes.",
              "ru": "Прерывайте регенерацию; отделите бой от соседних слизней."
            }
          }
        ]
      },
      {
        "name": "Relic Guardian",
        "mechanics": [
          {
            "name": "Thunderclap · Knockback",
            "response": {
              "en": "Use the Archival Panel to activate the guardian. Keep the tank clear of additional enemies.",
              "ru": "Активируйте стража через Archival Panel. Выберите для танка место, где отбрасывание не привлечёт новых врагов."
            }
          }
        ]
      }
    ],
    "sources": [
      [
        "Icy Veins — Excavation Site",
        "https://www.icy-veins.com/wow-forever/excavation-site-wetlands-guide/"
      ],
      [
        "ForeverDB — map and bosses",
        "https://foreverdb.net/dungeon/2998-excavation-site-wetlands"
      ],
      [
        "Method — Excavation Site",
        "https://www.method.gg/wow-forever/dungeons/excavation-site-wetlands"
      ]
    ],
    "trash": [
      {
        "name": "Thicket Hunter",
        "ability": "Infected Wound",
        "response": {
          "en": "Remove the healing reduction; control or kill the escorts before Shadetooth.",
          "ru": "Снимайте эффект снижения лечения; контролируйте или убейте свиту перед Shadetooth."
        }
      }
    ]
  },
  "city-of-dalaran": {
    "preparation": [
      {
        "en": "Complete the attunement before entering. Alliance: An Alarming Request from Emissary Jacques in Southshore. Horde: Key to the City and Prison Break-In from Magus Wordeen Voidglare in Tarren Mill.",
        "ru": "Перед входом выполните цепочку допуска. Альянс: An Alarming Request у Emissary Jacques в Южнобережье. Орда: Key to the City и Prison Break-In у Magus Wordeen Voidglare в Мельнице Таррен."
      },
      {
        "en": "To summon Lyn, take the Black Tome upstairs in Arugal’s room in Shadowfang Keep. Use Ambermill’s Leyline Focus in the town hall to make the Tome of Dalaran. In Dalaran, pass Atrexis and enter the side chamber before the ramp to the streets; use the tome at its summoning circle.",
        "ru": "Для призыва Lyn возьмите Black Tome наверху комнаты Аругала в Крепости Темного Клыка. Превратите его в Tome of Dalaran у Leyline Focus в ратуше Янтарной Мельницы. В Даларане после Atrexis зайдите в боковую комнату перед подъёмом на улицы и используйте том у круга призыва."
      }
    ],
    "entrance": {
      "en": "The sewer approach is outside the northwestern gate. Bring the Tome of Dalaran for Lyn the Ignored.",
      "ru": "Проход в канализацию находится снаружи у северо-западных ворот. Для Lyn the Ignored возьмите Tome of Dalaran."
    },
    "map": "/images/wow/forever/city-of-dalaran/2.webp",
    "bosses": [
      {
        "name": "Atrexis the Grave Knight",
        "mechanics": [
          {
            "name": "Raise Dead",
            "response": {
              "en": "Clear the patrolling necromancers first.",
              "ru": "Сначала зачистите патруль некромантов."
            }
          },
          {
            "name": "Unholy Frenzy",
            "response": {
              "en": "Purge the frenzy; collect summoned skeletons.",
              "ru": "Рассеивайте бешенство; собирайте призванных скелетов."
            },
            "audience": {
              "en": "Tank and dispels",
              "ru": "Танк и рассеивание"
            }
          }
        ]
      },
      {
        "name": "Lyn the Ignored",
        "mechanics": [
          {
            "name": "Curse of Thorns",
            "icon": "/images/wow/forever/icons/136121.webp",
            "response": {
              "en": "Remove the curse from the tank.",
              "ru": "Снимайте проклятие с танка."
            }
          }
        ]
      },
      {
        "name": "Arcane Anomaly",
        "mechanics": [
          {
            "name": "Focal Blast",
            "icon": "/images/wow/forever/icons/4667417.webp",
            "response": {
              "en": "Move away from the rotating beam.",
              "ru": "Уходите от вращающегося луча."
            }
          }
        ]
      },
      {
        "name": "Arcanic Enigma",
        "mechanics": [
          {
            "name": "Manamorph",
            "icon": "/images/wow/forever/icons/136116.webp",
            "response": {
              "en": "Dispel the transformation; kill the two Mana Phantoms first.",
              "ru": "Рассеивайте превращение; сначала убейте двух Mana Phantoms."
            }
          },
          {
            "name": "Silence · Summon Manaling",
            "response": {
              "en": "Casters stay back; tank the summoned manalings.",
              "ru": "Заклинатели держатся вдали; танк подбирает призванных элементалей."
            },
            "audience": {
              "en": "Party",
              "ru": "Группа"
            }
          }
        ]
      },
      {
        "name": "Unstable Sentinel",
        "mechanics": [
          {
            "name": "Arcing Smash · Malfunction",
            "icon": "/images/wow/forever/icons/132338.webp",
            "response": {
              "en": "Face away from the party; ranged players stay beyond 25 yards.",
              "ru": "Отверните от группы; дальним бойцам держаться дальше 25 метров."
            }
          }
        ]
      },
      {
        "name": "Fel Ancient",
        "mechanics": [
          {
            "name": "Entangle · Fel Timbers",
            "response": {
              "en": "Break roots and leave the green pools.",
              "ru": "Снимайте корни и выходите из зелёных луж."
            }
          }
        ]
      },
      {
        "name": "Mana Devourer",
        "mechanics": [
          {
            "name": "Debilitate",
            "response": {
              "en": "Clear the whole room before engaging.",
              "ru": "Зачистите всю комнату перед пулом."
            }
          },
          {
            "name": "Drain Vitality",
            "response": {
              "en": "Heal the tank’s persistent damage alongside Debilitate’s group damage.",
              "ru": "Лечите периодический урон танку и групповой урон Debilitate."
            },
            "audience": {
              "en": "Healer",
              "ru": "Лекарь"
            }
          }
        ]
      },
      {
        "name": "Shade of the Archmage",
        "mechanics": [
          {
            "name": "Bounding Mana · Arcane Explosion",
            "icon": "/images/wow/forever/icons/236222.webp",
            "response": {
              "en": "Reposition for the returning sphere; leave the explosion radius.",
              "ru": "Смещайтесь от возвращающейся сферы; выходите из радиуса взрыва."
            }
          },
          {
            "name": "Mass Polymorph · Evocation",
            "response": {
              "en": "At empty mana, the boss polymorphs the party and regenerates. Break control if possible.",
              "ru": "Исчерпав ману, босс превращает группу и восстанавливается. По возможности снимайте контроль."
            },
            "audience": {
              "en": "Party",
              "ru": "Группа"
            }
          }
        ]
      }
    ],
    "sources": [
      [
        "Blizzard — dungeon overview",
        "https://news.blizzard.com/en-us/article/24301455/explore-the-new-dungeons-of-world-of-warcraft-forever"
      ],
      [
        "Method — City of Dalaran",
        "https://www.method.gg/wow-forever/dungeons/city-of-dalaran"
      ],
      [
        "ForeverDB — map",
        "https://foreverdb.net/dungeon/2959-city-of-dalaran"
      ],
      [
        "Warcraft Tavern — City of Dalaran",
        "https://www.warcrafttavern.com/forever/guides/city-of-dalaran/"
      ],
      [
        "Warcraft Tavern — Tome of Dalaran",
        "https://www.warcrafttavern.com/forever/news/tome-of-dalaran-mystery-solved-in-wow-forever/"
      ],
      [
        "Wowhead — Drape of Shifting Energy",
        "https://www.wowhead.com/forever/item=273045/drape-of-shifting-energy"
      ]
    ],
    "trash": [
      {
        "name": "Mana Phantom",
        "ability": "Mana Burn",
        "response": {
          "en": "Interrupt.",
          "ru": "Прерывайте."
        }
      },
      {
        "name": "Phantasm",
        "ability": "Reflection Field",
        "response": {
          "en": "Stop magic damage during reflection.",
          "ru": "Остановите магический урон на время отражения."
        }
      },
      {
        "name": "Mindless Horror",
        "ability": "Fear",
        "response": {
          "en": "Stop fear; fight clear of nearby packs.",
          "ru": "Останавливайте страх; деритесь вдали от соседних паков."
        }
      },
      {
        "name": "Kirin Tor Necromancer",
        "ability": "Unholy Frenzy · Skeletons",
        "response": {
          "en": "Purge frenzy; pick up skeleton pairs.",
          "ru": "Рассеивайте бешенство; подбирайте пары скелетов."
        }
      },
      {
        "name": "Saturated Remnant",
        "ability": "Mana Leak",
        "response": {
          "en": "Mana users regroup in its field after death.",
          "ru": "После смерти врага восстановите ману в оставшемся поле."
        }
      },
      {
        "name": "Mana Fiend",
        "ability": "Explosion",
        "response": {
          "en": "Spread out before it dies.",
          "ru": "Разойдитесь перед его смертью."
        }
      }
    ],
    "viewBox": "740 760 560 620"
  },
  "the-drowned-city": {
    "entrance": {
      "en": "Dive into the Sunken Hollow beneath the Vile Reef in Stranglethorn Vale.",
      "ru": "Ныряйте в Sunken Hollow под Vile Reef в Тернистой долине."
    },
    "map": "/images/wow/forever/the-drowned-city/1.jpg",
    "bosses": [
      {
        "name": "Zul’Alai",
        "mechanics": [
          {
            "name": "Enrage",
            "audience": {
              "en": "Tank",
              "ru": "Танк"
            },
            "response": {
              "en": "Keep a defensive for the low-health enrage.",
              "ru": "Сохраните защитную способность на исступление при низком здоровье босса."
            }
          },
          {
            "name": "Area damage",
            "audience": {
              "en": "Healer",
              "ru": "Лекарь"
            },
            "response": {
              "en": "Keep the party healthy and reserve mana for the final part of the fight.",
              "ru": "Поддерживайте здоровье группы и оставьте ману на конец боя."
            }
          }
        ]
      },
      {
        "name": "Var’Taka",
        "mechanics": [
          {
            "name": "Harpoon · Arcing Smash",
            "response": {
              "en": "Control the two Brinescale Priestesses. Face the boss away from the party after a pull.",
              "ru": "Контролируйте двух Brinescale Priestesses. После притягивания отворачивайте босса от группы."
            }
          }
        ]
      },
      {
        "name": "Captain Dreadrise",
        "mechanics": [
          {
            "name": "Embrine · Waterbolt Volley",
            "response": {
              "en": "Destroy the bubble trapping a player; interrupt the volley.",
              "ru": "Разбейте пузырь с пленённым игроком; прерывайте залп."
            }
          }
        ]
      },
      {
        "name": "Deathless Guardians"
      },
      {
        "name": "Primeval Elemental"
      },
      {
        "name": "Min’loth the Serpent",
        "mechanics": [
          {
            "name": "Transform",
            "response": {
              "en": "The serpent phase restores the boss to full health. Keep resources for it.",
              "ru": "В фазе змея босс полностью восстанавливает здоровье. Оставьте на неё ресурсы."
            }
          },
          {
            "name": "Fear · Poison",
            "icon": "/images/wow/forever/icons/136183.webp",
            "response": {
              "en": "In serpent form, remove poison promptly and leave room for feared players.",
              "ru": "В облике змея сразу снимайте яд; оставьте место для игроков под страхом."
            }
          }
        ]
      }
    ],
    "sources": [
      [
        "Wowhead — The Drowned City",
        "https://www.wowhead.com/forever/guide/the-drowned-city-dungeon-overview-location-rewards"
      ],
      [
        "Raiddex — bosses",
        "https://raiddex.com/en/wow-forever/dungeons-and-raids/the-drowned-city"
      ],
      [
        "Rexas — client maps and spells",
        "https://forever.rexas.tools/news/five-new-dungeons-wow-forever"
      ],
      [
        "Warcraft Tavern — Drowned City hands-on",
        "https://www.warcrafttavern.com/forever/news/the-drowned-city-dungeon-preview-in-wow-forever"
      ]
    ],
    "trash": [
      {
        "name": "Brinescale Sorceror",
        "ability": "Fear",
        "response": {
          "en": "Prioritize fear interrupts; pull around corners.",
          "ru": "Приоритет — прерывание страха; вытягивайте за угол."
        }
      },
      {
        "name": "Profane Necro",
        "ability": "Conjure Spirit",
        "response": {
          "en": "Focus before more spirits appear.",
          "ru": "Убейте до появления новых духов."
        }
      }
    ]
  },
  "kroldok-stronghold": {
    "entrance": {
      "en": "An ogre stronghold in Riverglades.",
      "ru": "Крепость огров в Riverglades."
    },
    "map": "/images/wow/forever/kroldok-stronghold/1.jpg",
    "bosses": [
      {
        "name": "Slavecrusher Grox",
        "mechanics": [
          {
            "name": "Approach",
            "response": {
              "en": "Wait for the long patrol to pass before pulling the boss.",
              "ru": "Перед пулом босса дождитесь, пока пройдёт дальний патруль."
            }
          }
        ]
      },
      {
        "name": "Twilight Commander Zarmok",
        "mechanics": [
          {
            "name": "Bleed",
            "response": {
              "en": "Keep the tank healthy through the bleed; his death opens the gate.",
              "ru": "Поддерживайте здоровье танка при кровотечении; смерть босса открывает ворота."
            }
          }
        ]
      },
      {
        "name": "Handler Ashka",
        "mechanics": [
          {
            "name": "Command: Kill",
            "response": {
              "en": "Snarlfang and Terrorhowl accompany Ashka. Watch for the command targeting a party member.",
              "ru": "Ashka сопровождают Snarlfang и Terrorhowl. Следите за командой атаковать участника группы."
            }
          }
        ]
      },
      {
        "name": "Nar’gurk",
        "mechanics": [
          {
            "name": "Convert",
            "response": {
              "en": "Control lasts up to 20 seconds, or until the victim falls below half health.",
              "ru": "Контроль длится до 20 секунд или пока здоровье жертвы не упадёт ниже половины."
            }
          }
        ]
      },
      {
        "name": "Overseer Mugg",
        "mechanics": [
          {
            "name": "Mugg’s Fury",
            "response": {
              "en": "Attack speed rises until Mugg changes weapons. Watch the tank during long weapon phases.",
              "ru": "Скорость атак растёт до смены оружия. Следите за танком, если фаза оружия затягивается."
            }
          }
        ]
      }
    ],
    "sources": [
      [
        "Raiddex — bosses",
        "https://raiddex.com/en/wow-forever/dungeons-and-raids/kroldok-stronghold"
      ],
      [
        "Rexas — client maps and spells",
        "https://forever.rexas.tools/news/five-new-dungeons-wow-forever"
      ],
      [
        "ConquestCapped — Krol’dok Stronghold",
        "https://conquestcapped.com/guides/wow-forever/wow-forever-kroldok-stronghold-guide/"
      ]
    ]
  },
  "alcaz-prison": {
    "preparation": [
      {
        "en": "Defeat Overseer Wrex and loot his keyring before descending: it opens the lower floor.",
        "ru": "Перед спуском победите Overseer Wrex и заберите связку ключей: она открывает нижний этаж."
      }
    ],
    "entrance": {
      "en": "Explore the prison on Alcaz Island, off the coast of Dustwallow Marsh.",
      "ru": "Тюрьма на острове Алькац у побережья Пылевых топей."
    },
    "map": "/images/wow/forever/alcaz-prison/1.jpg",
    "bosses": [
      {
        "name": "Overseer Wrex",
        "mechanics": [
          {
            "name": "Reinforcements",
            "response": {
              "en": "Pull into the corridor; control the jailers called from the room.",
              "ru": "Оттяните в коридор; контролируйте тюремщиков из комнаты."
            }
          }
        ]
      },
      {
        "name": "Tidemistress Ca’zass",
        "mechanics": [
          {
            "name": "Blizzard · Polymorph",
            "icon": "/images/wow/forever/icons/135857.webp",
            "response": {
              "en": "Leave Blizzard; interrupt the accompanying enchantresses.",
              "ru": "Выходите из метели; прерывайте заклинания сопровождающих чаровниц."
            }
          }
        ]
      },
      {
        "name": "Katerina the Cleaner",
        "mechanics": [
          {
            "name": "Alcaz Chaplains",
            "response": {
              "en": "Start with full healer mana; control the two chaplains. Avoid chained prisoners.",
              "ru": "Перед пулом восстановите ману лекаря; контролируйте двух капелланов. Не трогайте прикованных пленников."
            }
          }
        ]
      },
      {
        "name": "The Questioner"
      },
      {
        "name": "Blazeroar",
        "mechanics": [
          {
            "name": "Fire immunity",
            "response": {
              "en": "Use another damage school after Zarla transforms.",
              "ru": "После превращения Зарлы используйте другую школу урона."
            }
          }
        ]
      }
    ],
    "sources": [
      [
        "ConquestCapped — Alcaz Prison",
        "https://conquestcapped.com/guides/wow-forever/wow-forever-alcaz-prison-guide/"
      ],
      [
        "Raiddex — bosses",
        "https://raiddex.com/en/wow-forever/dungeons-and-raids/alcaz-prison"
      ],
      [
        "Rexas — client maps",
        "https://forever.rexas.tools/news/five-new-dungeons-wow-forever"
      ]
    ],
    "trash": [
      {
        "name": "Strashaz Enchantress",
        "ability": "Polymorph",
        "response": {
          "en": "Assign an interrupt before pulling Ca’zass.",
          "ru": "Назначьте прерывание перед пулом Ка’засс."
        }
      }
    ]
  },
  "blackmaw-hold": {
    "entrance": {
      "en": "Enter the furbolg tunnel in northern Azshara near 38.4, 32.6; follow it to the instance portal.",
      "ru": "Войдите в туннель фурболгов на севере Азшары, примерно в точке 38.4, 32.6, и следуйте до портала."
    },
    "preparation": [
      {
        "en": "For Claws That Rend, Tusks that Gore, visit both Withermaw and Bonesnout the Unbroken: the quest needs drops from two separate branches.",
        "ru": "Для Claws That Rend, Tusks that Gore нужны предметы с Withermaw и Bonesnout the Unbroken. Пройдите обе ветки подземелья."
      },
      {
        "en": "Moontouched Wanderer is a rare encounter; it does not appear in every run.",
        "ru": "Moontouched Wanderer — редкий противник, который появляется не в каждом прохождении."
      }
    ],
    "map": "/images/wow/forever/blackmaw-hold/1.jpg",
    "bosses": [
      {
        "name": "Withermaw",
        "mechanics": [
          {
            "name": "Writhing Mass",
            "icon": "/images/wow/forever/icons/236553.webp",
            "response": {
              "en": "Summons Flesh Maggots repeatedly. Collect the adds and kill them before they overwhelm the party.",
              "ru": "Регулярно призывает Flesh Maggots. Собирайте и убивайте их, пока они не заполонили группу."
            }
          }
        ]
      },
      {
        "name": "Impaan the Imprisoner"
      },
      {
        "name": "Elder Shaman Bloodmane"
      },
      {
        "name": "Bonesnout the Unbroken",
        "mechanics": [
          {
            "name": "Profane Bulwark",
            "icon": "/images/wow/forever/icons/237180.webp",
            "response": {
              "en": "Satyr rituals stack damage reduction on Bonesnout. Deal with the ritualists before committing damage cooldowns to the boss.",
              "ru": "Ритуалы сатиров накапливают снижение урона по Bonesnout. Разберитесь с ритуалистами, прежде чем тратить атакующие способности на босса."
            }
          }
        ]
      },
      {
        "name": "Varrox Bleakhoof",
        "mechanics": [
          {
            "name": "Crimson Wrest",
            "response": {
              "en": "Forces players toward Varrox and prevents actions for six seconds. Reposition as soon as control returns.",
              "ru": "Заставляет игроков идти к Варроксу и лишает возможности действовать на шесть секунд. Восстановите позиции, как только вернётся управление."
            }
          }
        ]
      },
      {
        "name": "Blackmaw Behemoth"
      },
      {
        "name": "Unbound Spirit",
        "mechanics": [
          {
            "name": "Profane Protection",
            "icon": "/images/wow/forever/icons/1357807.webp",
            "response": {
              "en": "Profane totems shield the spirit from all damage. Destroy the protecting totems before attacking the spirit.",
              "ru": "Нечестивые тотемы полностью защищают духа от урона. Уничтожьте защищающие тотемы, прежде чем атаковать духа."
            }
          }
        ]
      },
      {
        "name": "Moontouched Wanderer"
      }
    ],
    "sources": [
      [
        "ForeverDB — Crimson Wrest",
        "https://foreverdb.net/spell/1246456"
      ],
      [
        "ConquestCapped — Blackmaw Hold",
        "https://conquestcapped.com/guides/wow-forever/wow-forever-blackmaw-hold-guide/"
      ],
      [
        "Raiddex — bosses",
        "https://raiddex.com/en/wow-forever/dungeons-and-raids/blackmaw-hold"
      ],
      [
        "Rexas — client maps",
        "https://forever.rexas.tools/news/five-new-dungeons-wow-forever"
      ],
      [
        "ForeverDB — Writhing Mass",
        "https://foreverdb.net/spell/1302780"
      ],
      [
        "ForeverDB — Profane Bulwark",
        "https://foreverdb.net/spell/1277406"
      ],
      [
        "ForeverDB — Profane Protection",
        "https://foreverdb.net/spell/1247237"
      ]
    ]
  },
  "shapers-terrace": {
    "entrance": {
      "en": "Travel to the titan terrace above Un’Goro Crater.",
      "ru": "Терраса титанов над кратером Ун’Горо."
    },
    "preparation": [
      {
        "en": "Bring power crystals gathered in Un’Goro: the consoles inside the terrace use them.",
        "ru": "Возьмите с собой кристаллы силы из Ун’Горо: они используются в консолях внутри террасы."
      }
    ],
    "map": "/images/wow/forever/shapers-terrace/1.jpg",
    "bosses": [
      {
        "name": "Titanosaur"
      },
      {
        "name": "Ravasaur Hunters"
      },
      {
        "name": "Thunderhoof"
      },
      {
        "name": "Venomridge"
      },
      {
        "name": "Direhorn Matriarch"
      },
      {
        "name": "Cinder"
      },
      {
        "name": "King Op"
      },
      {
        "name": "Snowtalon"
      },
      {
        "name": "Bolt"
      },
      {
        "name": "Vitrix"
      },
      {
        "name": "Nanaya",
        "mechanics": [
          {
            "name": "Powerful Slam",
            "response": {
              "en": "Keep clear of the 15-yard slam that stuns nearby targets.",
              "ru": "Держитесь вне 15-метрового радиуса удара, оглушающего ближайшие цели."
            }
          }
        ]
      }
    ],
    "sources": [
      [
        "Blizzard — dungeon overview",
        "https://news.blizzard.com/en-us/article/24301455/explore-the-new-dungeons-of-world-of-warcraft-forever"
      ],
      [
        "Raiddex — bosses",
        "https://raiddex.com/en/wow-forever/dungeons-and-raids/the-shapers-terrace"
      ],
      [
        "Rexas — client maps and spells",
        "https://forever.rexas.tools/news/five-new-dungeons-wow-forever"
      ]
    ]
  }
};
