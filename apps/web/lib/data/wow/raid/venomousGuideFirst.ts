import type { VenomousGuideBoss } from './venomousGuide.types';

// Current journal flags override older article difficulty descriptions.
// RU spell names are localized game strings; four unavailable NPC names use editorial translations.
// Evidence: gildra-venomous-guide-20261104/research-first.md, 2026-11-04.
export const venomousGuideFirst: VenomousGuideBoss[] = [
  {
    "id": "nekzali-the-soulcoiler",
    "name": {
      "en": "Nek'zali the Soulcoiler",
      "ru": "Нек'зали Душительница Душ"
    },
    "raidName": {
      "en": "The Venomous Abyss",
      "ru": "Отравленная бездна"
    },
    "reviewedAt": "2026-11-04",
    "goal": {
      "ru": "Не пускайте скелетов к колодцу. На 50% здоровья убейте эхо, затем добейте Нек'зали до заполнения энергии.",
      "en": "Stop skeletons reaching the well. At 50% health kill the echoes, then finish Nek’zali before her energy fills."
    },
    "priorities": [
      {
        "id": "amani",
        "title": {
          "ru": "Сначала щиты скелетов",
          "en": "Break the skeleton shields first"
        },
        "body": {
          "ru": "Магическим уроном снимите щиты, затем убейте скелетов на пути к колодцу.",
          "en": "Use magic damage to remove their shields, then kill them on the way to the well."
        }
      },
      {
        "id": "rend",
        "title": {
          "ru": "Снятие эффекта — у края",
          "en": "Get dispelled at the edge"
        },
        "body": {
          "ru": "С меткой выйдите из группы. Целитель снимает её, когда оставшаяся опасная зона не перекроет путь.",
          "en": "Leave the group with the debuff. Your healer dispels once the resulting hazard will not block the route."
        }
      },
      {
        "id": "pyre",
        "title": {
          "ru": "Разделите большой круг",
          "en": "Share the large circle"
        },
        "body": {
          "ru": "На переходной фазе помогите танку принять «Алчущий костер»; не встречайте этот удар в одиночку.",
          "en": "During intermission join the tank for Hungering Pyre; do not take it alone."
        }
      }
    ],
    "flow": [
      {
        "id": "opening",
        "title": {
          "ru": "Колодец и скелеты",
          "en": "Well and skeletons"
        },
        "body": {
          "ru": "Танк подводит босса к стороне с появляющимися скелетами. Группа разбивает их щиты и убивает до колодца.",
          "en": "The tank moves the boss toward incoming skeletons. Break their shields and kill them before the well."
        }
      },
      {
        "id": "transition",
        "title": {
          "ru": "50% здоровья: эхо",
          "en": "50% health: echoes"
        },
        "body": {
          "ru": "Нек'зали становится невосприимчивой. Выходите из места появления эхо и убивайте активное эхо по очереди.",
          "en": "Nek’zali becomes immune. Leave each echo’s spawn impact and kill the active echoes in sequence."
        }
      },
      {
        "id": "echoes",
        "title": {
          "ru": "Круги и пламя",
          "en": "Circles and flames"
        },
        "body": {
          "ru": "Разделяйте большой круг с танком. Игроки вне круга получают «Скользящее пламя» и держатся отдельно.",
          "en": "Share the tank’s large circle. Players outside it receive Slithering Flame and stay apart."
        },
        "heroicBody": {
          "ru": "Основная группа делит круг. Назначенные игроки остаются снаружи и подводят «Скользящее пламя» к телам скелетов: его взрыв сжигает тела.",
          "en": "The main group shares the circle. Assigned players stay outside and take Slithering Flame to skeleton corpses; its explosion burns them."
        }
      },
      {
        "id": "finish",
        "title": {
          "ru": "Последняя фаза",
          "en": "Final phase"
        },
        "body": {
          "ru": "После гибели эхо снова бейте Нек'зали. Используйте сильные атакующие способности и освобождайте место при перемещении призраков.",
          "en": "After the echoes die, attack Nek’zali again. Use major offensive abilities and move clear when the spirits relocate."
        }
      }
    ],
    "roles": {
      "tank": {
        "position": {
          "ru": "Между боссом и стороной появления скелетов; оставьте проход к внешнему краю.",
          "en": "Between the boss and the spawning skeletons; keep a route to the outer edge."
        },
        "actions": [
          {
            "ru": "После снятия щита соберите скелетов рядом с боссом.",
            "en": "Collect skeletons beside the boss after their shields break."
          },
          {
            "ru": "На «Одержимый обстрел» отойдите от босса; второй танк принимает его после удара. Следите за снижением получаемого лечения.",
            "en": "Move away for Possession Barrage; the other tank takes over after the hit. Watch the stacking healing reduction."
          }
        ]
      },
      "healer": {
        "position": {
          "ru": "С основной группой, в пределах лечения удаляющегося танка.",
          "en": "With the main group, in healing range of the tank moving out."
        },
        "actions": [
          {
            "ru": "«Раздирание сущности» снимайте после выхода цели к краю.",
            "en": "Dispel Essence Rend once its target reaches the edge."
          },
          {
            "ru": "Сильное лечение сохраняйте для «Поджигание плененных душ», общего круга и последней фазы.",
            "en": "Save strong healing for Soulcoil Ignition, the shared circle and the final phase."
          }
        ]
      },
      "melee": {
        "position": {
          "ru": "Сбоку от босса, рядом со скелетами после снятия их щитов.",
          "en": "Beside the boss and skeletons whose shields have broken."
        },
        "actions": [
          {
            "ru": "Переключайтесь на скелетов; физический урон не снимает их защиту.",
            "en": "Switch to skeletons; physical damage does not remove their shield."
          },
          {
            "ru": "Освобождайте линию от босса к танку на «Одержимый обстрел». На переходке помогайте разделять круг.",
            "en": "Clear the boss-to-tank line for Possession Barrage. Help share the intermission circle."
          }
        ]
      },
      "ranged": {
        "position": {
          "ru": "Так, чтобы доставать дальних скелетов и не перекрывать отход танка.",
          "en": "Within reach of distant skeletons, clear of the tank’s retreat."
        },
        "actions": [
          {
            "ru": "Магическими атаками быстро разбивайте дальние щиты.",
            "en": "Use magic attacks to break distant shields quickly."
          },
          {
            "ru": "Не стойте в колодце и оставленных зонах. С личной меткой уходите к внешнему краю.",
            "en": "Avoid the well and persistent hazards. Take your personal debuff to the outer edge."
          }
        ],
        "heroic": {
          "ru": "Если назначены на «Скользящее пламя», оставайтесь вне общего круга и сжигайте тела его взрывом.",
          "en": "If assigned Slithering Flame, stay outside the shared circle and burn corpses with its explosion."
        }
      }
    },
    "mechanics": [
      {
        "id": "amani",
        "spellId": 1287533,
        "name": {
          "ru": "Наступление умертвия",
          "en": "Gravebound Advance"
        },
        "signal": {
          "ru": "Скелеты выходят из гробниц и идут к колодцу под щитами.",
          "en": "Shielded skeletons leave the tombs and walk toward the well."
        },
        "response": {
          "ru": "Разбейте щит магическим уроном, затем соберите и убейте скелетов. Каждый дошедший до колодца усиливает урон по группе и приближает поражение.",
          "en": "Break the shield with magic damage, then gather and kill the skeletons. Each arrival at the well increases raid damage and brings the enrage closer."
        },
        "counters": [],
        "counterRoles": []
      },
      {
        "id": "rend",
        "spellId": 1287426,
        "name": {
          "ru": "Раздирание сущности",
          "en": "Essence Rend"
        },
        "signal": {
          "ru": "На игроке «Раздирание сущности».",
          "en": "A player has Essence Rend."
        },
        "response": {
          "ru": "Цель выходит к краю, затем целитель снимает магический эффект. На месте снятия останется опасная зона.",
          "en": "The target moves to the edge, then a healer dispels the magic effect. A hazard remains where it was removed."
        },
        "counters": [
          "magic"
        ],
        "counterRoles": [
          "healer"
        ]
      },
      {
        "id": "barrage",
        "spellId": 1284103,
        "name": {
          "ru": "Одержимый обстрел",
          "en": "Possession Barrage"
        },
        "signal": {
          "ru": "Босс направляет «Одержимый обстрел» в текущего танка.",
          "en": "The boss aims Possession Barrage at the current tank."
        },
        "response": {
          "ru": "Танк отходит дальше от босса, снижая урон взрыва. Остальные освобождают линию выстрела: раннее столкновение опасно для всей группы.",
          "en": "The tank moves farther away to reduce the explosion. Everyone else clears its line; intercepting it early endangers the raid."
        },
        "counters": [
          "defend"
        ],
        "counterRoles": [
          "tank"
        ]
      },
      {
        "id": "strikes",
        "spellId": 1284110,
        "name": {
          "ru": "Опустошающие удары",
          "en": "Hollowing Strikes"
        },
        "signal": {
          "ru": "На танке растёт эффект «Опустошающие удары».",
          "en": "Hollowing Strikes builds on the tank."
        },
        "response": {
          "ru": "Чередуйте танков, не позволяя снижению получаемого лечения накопиться. Подготовьте защиту к ударам и согласуйте смену после «Одержимый обстрел».",
          "en": "Trade tanks before the healing reduction becomes overwhelming. Prepare mitigation and coordinate the swap after Barrage."
        },
        "counters": [
          "defend"
        ],
        "counterRoles": [
          "tank"
        ]
      },
      {
        "id": "ignition",
        "spellId": 1285681,
        "name": {
          "ru": "Поджигание плененных душ",
          "en": "Soulcoil Ignition"
        },
        "signal": {
          "ru": "Колодец вспыхивает; по комнате идут снаряды.",
          "en": "The well ignites and projectiles cross the room."
        },
        "response": {
          "ru": "Уклоняйтесь от снарядов. Целители перекрывают серию урона лечением; при низком здоровье используйте личную защиту.",
          "en": "Dodge the projectiles. Healers cover the damage sequence; use a personal defensive when your health is low."
        },
        "counters": [
          "aoe"
        ],
        "counterRoles": [
          "tank",
          "healer",
          "melee",
          "ranged"
        ],
        "heroic": {
          "ru": "«Ритуальный ожог» усиливает следующий урон обряда: распределите сильные защитные и лечебные способности по сериям.",
          "en": "Ritual Burn increases the next rite’s damage; spread strong healing and defensives across successive sets."
        }
      },
      {
        "id": "pyre",
        "spellId": 1289855,
        "name": {
          "ru": "Алчущий костер",
          "en": "Hungering Pyre"
        },
        "signal": {
          "ru": "На переходке эхо готовит большой круг вокруг танка.",
          "en": "During intermission an echo prepares a large circle around the tank."
        },
        "response": {
          "ru": "Основная группа входит в круг и делит удар. На игроков снаружи направляется «Скользящее пламя» — не приводите его в группу.",
          "en": "The main group enters and shares the hit. Slithering Flame seeks players outside; keep it away from the group."
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
        "id": "cremation",
        "spellId": 1289875,
        "name": {
          "ru": "Кремация",
          "en": "Cremation"
        },
        "signal": {
          "ru": "На игроке вне общего круга «Скользящее пламя»; рядом лежат тела скелетов.",
          "en": "A player outside the shared circle has Slithering Flame; skeleton corpses are nearby."
        },
        "response": {
          "ru": "Назначенная цель подводит пламя к телам: взрыв сжигает тела и скелетов в пределах 4 м. Остальные отходят от места взрыва.",
          "en": "The assigned target takes the flame to corpses; its explosion burns corpses and skeletons within 4 yards. Everyone else leaves the blast area."
        },
        "counters": [],
        "counterRoles": [],
        "heroicOnly": true
      },
      {
        "id": "finish",
        "spellId": 1290003,
        "name": {
          "ru": "Расплетение",
          "en": "Uncoiling"
        },
        "signal": {
          "ru": "Эхо погибли, Нек'зали вернулась в бой.",
          "en": "The echoes are dead and Nek’zali returns."
        },
        "response": {
          "ru": "Используйте основные атакующие способности и убейте босса до 100 энергии. Постоянный урон усиливает нагрузку на целителей; выходите из зон переместившихся призраков.",
          "en": "Use major offensive abilities and kill the boss before 100 energy. Constant damage pressures healers; leave the relocated spirits’ hazards."
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
        "spellIcon": "/assets/wow/raids/venomous-abyss/spells/1290003.png"
      }
    ],
    "adds": [
      {
        "id": "amani",
        "npcId": 261509,
        "name": {
          "ru": "Неупокоенный тролль из племени Амани",
          "en": "Restless Amani"
        },
        "portrait": "/assets/wow/raids/venomous-abyss/enemies/261509.webp",
        "description": {
          "ru": "Скелет под щитом, идущий к центральному колодцу.",
          "en": "A shielded skeleton walking toward the central well."
        },
        "action": {
          "ru": "Снимите щит магическим уроном, затем убейте до колодца.",
          "en": "Break its shield with magic damage, then kill it before the well."
        },
        "death": {
          "ru": "В героическом режиме тело нужно сжечь «Скользящее пламя» на переходке.",
          "en": "On Heroic, burn its corpse with Slithering Flame during intermission."
        }
      },
      {
        "id": "jawae",
        "npcId": 271337,
        "name": {
          "ru": "Эхо Джаваэ",
          "en": "Echo of Jawae"
        },
        "portrait": "/assets/wow/raids/venomous-abyss/enemies/271337.webp",
        "description": {
          "ru": "Эхо появляется на переходной фазе при 50% здоровья босса.",
          "en": "An echo appearing in the boss’s 50% intermission."
        },
        "action": {
          "ru": "Бейте активное эхо; большой круг делите с группой.",
          "en": "Attack the active echo and share its large circle."
        },
        "death": {
          "ru": "После гибели всех эхо Нек'зали возвращается в бой.",
          "en": "Once all echoes die, Nek’zali returns to the fight."
        }
      }
    ],
    "diagram": {
      "title": {
        "ru": "Где стоять и куда двигаться",
        "en": "Where to stand and move"
      },
      "caption": {
        "ru": "Перехватывайте скелетов до колодца; личную метку относите в сторону от группы.",
        "en": "Intercept skeletons before the well; take your personal debuff away from the group."
      },
      "heroicCaption": {
        "ru": "На переходке назначенные цели пламени направляют его взрыв в тела скелетов.",
        "en": "During intermission assigned flame targets place its explosion on skeleton corpses."
      },
      "steps": [
        {
          "id": "intercept",
          "title": {
            "ru": "Гробницы → колодец",
            "en": "Tombs → well"
          },
          "body": {
            "ru": "Встречайте скелетов между гробницами и колодцем; танк подводит босса к этой стороне.",
            "en": "Intercept skeletons between their tombs and the well; the tank brings the boss toward that side."
          }
        },
        {
          "id": "edge",
          "title": {
            "ru": "Метка → внешний край",
            "en": "Debuff → outer edge"
          },
          "body": {
            "ru": "Оставляйте зоны «Раздирание сущности» снаружи, сохраняя путь для танка и группы.",
            "en": "Leave Essence Rend hazards outside, keeping a route for the tank and group."
          }
        },
        {
          "id": "share",
          "title": {
            "ru": "Эхо → общий круг",
            "en": "Echo → shared circle"
          },
          "body": {
            "ru": "Основная группа стоит в круге танка; цели «Скользящее пламя» остаются отдельно.",
            "en": "The main group joins the tank’s circle; Slithering Flame targets stay apart."
          }
        }
      ]
    },
    "sources": [
      {
        "title": "Encounter journal · Normal / Heroic",
        "url": "https://www.wowhead.com/npc=271337"
      },
      {
        "title": "Icy Veins · Panthea",
        "url": "https://www.icy-veins.com/wow/nekzali-raid-guide/"
      },
      {
        "title": "Method · Purke · Heroic",
        "url": "https://www.method.gg/guides/the-venomous-abyss/nekzali-the-soulcoiler-heroic"
      }
    ]
  },
  {
    "id": "entombed-sentinels",
    "name": {
      "en": "Entombed Sentinels",
      "ru": "Погребенные стражи"
    },
    "raidName": {
      "en": "The Venomous Abyss",
      "ru": "Отравленная бездна"
    },
    "reviewedAt": "2026-11-04",
    "goal": {
      "ru": "Разделитесь на две группы, держите здоровье големов одинаковым и на переходке соединяйте метки ровно до четырёх.",
      "en": "Split into two groups, keep the golems’ health even and combine intermission marks to exactly four."
    },
    "priorities": [
      {
        "id": "balance",
        "title": {
          "ru": "Бейте големов равномерно",
          "en": "Keep both health bars even"
        },
        "body": {
          "ru": "На 100 энергии голем с меньшим здоровьем вылечится до второго. Переключайте урон заранее.",
          "en": "At 100 energy the weaker golem heals up to the other. Adjust damage beforehand."
        }
      },
      {
        "id": "toxins",
        "title": {
          "ru": "1 + 3 или 2 + 2",
          "en": "1 + 3 or 2 + 2"
        },
        "body": {
          "ru": "На переходке найдите одного партнёра, чтобы сумма зелёных меток была ровно четыре.",
          "en": "During intermission find one partner so your combined green marks total exactly four."
        }
      },
      {
        "id": "miasma",
        "title": {
          "ru": "На красной стороне делите круг",
          "en": "Share the red side’s circle"
        },
        "body": {
          "ru": "Входите своей группой в круг «Нестабильные миазмы». Не оставляйте отмеченного игрока одного.",
          "en": "Your group joins the Unstable Miasma circle. Do not leave its target alone."
        }
      }
    ],
    "flow": [
      {
        "id": "split",
        "title": {
          "ru": "Две отдельные стороны",
          "en": "Two separate sides"
        },
        "body": {
          "ru": "Разделите танков, целителей и бойцов между големами. Начните на расстоянии более 40 м между големами.",
          "en": "Split tanks, healers and damage dealers between the golems. Start with the golems over 40 yards apart."
        }
      },
      {
        "id": "jobs",
        "title": {
          "ru": "Зелёный: слизь. Красный: общий круг.",
          "en": "Green: slime. Red: shared circle."
        },
        "body": {
          "ru": "Зелёная группа убивает сгусток и собирает капли; красная делит круг и снимает «Зачумленная кровь».",
          "en": "The green group kills the slime and collects droplets; the red group shares its circle and dispels Blighted Blood."
        },
        "heroicBody": {
          "ru": "Зелёная группа убивает сгусток, собирает капли и уклоняется от возвратных струй. Красная делит круг, затем уходит к краю оставлять лужи.",
          "en": "The green group kills the slime, collects droplets and dodges returning streams. The red group shares its circle, then goes to the edge to drop pools."
        }
      },
      {
        "id": "meet",
        "title": {
          "ru": "100 энергии: найдите пару",
          "en": "100 energy: find your partner"
        },
        "body": {
          "ru": "Големы сходятся в центре и почти не получают урон. Соедините метки до четырёх, не пробегая через случайных игроков.",
          "en": "The golems meet in the centre and take almost no damage. Combine marks to four without running through other players."
        }
      },
      {
        "id": "trade",
        "title": {
          "ru": "Смените голема",
          "en": "Switch golems"
        },
        "body": {
          "ru": "После переходки каждый танк забирает другого голема на свою сторону. Группы остаются на своих сторонах и теперь бьют другого голема, пока прежние метки спадают.",
          "en": "After intermission each tank takes the other golem back to their side. Groups stay on their sides and fight the other golem while their previous marks expire."
        }
      }
    ],
    "roles": {
      "tank": {
        "position": {
          "ru": "По одному голему на каждой стороне; не сближайте их в обычной фазе.",
          "en": "One golem on each side; keep them apart outside intermission."
        },
        "actions": [
          {
            "ru": "После переходки меняйтесь големами: это сбрасывает усиление ударов по одному танку.",
            "en": "Trade golems after intermission to reset attacks ramping on the same tank."
          },
          {
            "ru": "Перед «Усиливающее сокрушение» и «Доза ядовитой крови» используйте защиту.",
            "en": "Use mitigation for Empowering Slam and Bloodvenom Injection."
          }
        ],
        "heroic": {
          "ru": "Перед окончанием кровавого эффекта оставьте место для большой лужи у края.",
          "en": "Before the blood debuff expires, make room for its large pool near the edge."
        }
      },
      "healer": {
        "position": {
          "ru": "Со своей половиной группы, не между обоими големами.",
          "en": "With your assigned half of the raid, not between both golems."
        },
        "actions": [
          {
            "ru": "Снимайте «Зачумленная кровь» и поддерживайте игроков после сбора капель.",
            "en": "Dispel Blighted Blood and heal players collecting droplets."
          },
          {
            "ru": "Подготовьте лечение к общему кругу и переходке.",
            "en": "Prepare healing for the shared circle and intermission."
          }
        ],
        "heroic": {
          "ru": "Согласуйте снятие кровавого эффекта у края: лужи не должны перекрывать группу.",
          "en": "Coordinate blood-debuff removal near the edge so pools do not cover the group."
        }
      },
      "melee": {
        "position": {
          "ru": "У своего голема; на переходке отойдите для поиска пары.",
          "en": "At your assigned golem; move out to find a partner during intermission."
        },
        "actions": [
          {
            "ru": "Сразу переключайтесь на «Сгущающийся яд», если вы на зелёной стороне.",
            "en": "Immediately switch to Venom Coagulation on the green side."
          },
          {
            "ru": "На красной стороне помогайте делить круг. Не перебегайте к другому голему ради урона.",
            "en": "On the red side help share the circle. Do not cross to the other golem for extra damage."
          }
        ]
      },
      "ranged": {
        "position": {
          "ru": "За своей группой, подальше от зоны второго голема.",
          "en": "Behind your assigned group, away from the other golem’s area."
        },
        "actions": [
          {
            "ru": "Распределите сбор капель между игроками; не подбирайте всю серию в одиночку.",
            "en": "Share droplet collection between players; do not collect the whole set alone."
          },
          {
            "ru": "Снижайте урон по голему, который теряет здоровье быстрее.",
            "en": "Ease damage on the golem losing health faster."
          }
        ]
      }
    },
    "mechanics": [
      {
        "id": "balance",
        "spellId": 1284588,
        "name": {
          "ru": "Агрессивный стазис",
          "en": "Vitriolic Stasis"
        },
        "signal": {
          "ru": "При 100 энергии големы сходятся и восстанавливают здоровье.",
          "en": "At 100 energy the golems converge and restore health."
        },
        "response": {
          "ru": "Заранее выровняйте их здоровье: более слабый голем вылечится до более здорового. Во время стазиса решайте метки, не тратьте сильные атаки.",
          "en": "Even their health beforehand; the weaker golem heals to the healthier one. Solve marks during stasis instead of spending major offensive abilities."
        },
        "counters": [],
        "counterRoles": [],
        "spellIcon": "/assets/wow/raids/venomous-abyss/spells/1284588.jpg"
      },
      {
        "id": "separate",
        "spellId": 1290193,
        "name": {
          "ru": "Господство Ула'тек",
          "en": "Ula'tek's Dominance"
        },
        "signal": {
          "ru": "Големы сближаются, на игроках накапливаются метки кислоты или крови.",
          "en": "The golems approach each other; acid or blood marks accumulate on players."
        },
        "response": {
          "ru": "Держите големов на отдельных сторонах, более чем в 40 м друг от друга, и не стойте между ними. После каждой переходки меняйте голема, с которым сражается ваша группа.",
          "en": "Keep the golems on separate sides, over 40 yards apart, and stay out of the space between them. After each intermission change which golem your group fights."
        },
        "counters": [],
        "counterRoles": []
      },
      {
        "id": "toxins",
        "spellId": 1284590,
        "name": {
          "ru": "Спиральный токсин",
          "en": "Helical Toxins"
        },
        "signal": {
          "ru": "Над игроками зелёные и красные метки.",
          "en": "Green and red marks appear above players."
        },
        "response": {
          "ru": "Посчитайте зелёные метки и коснитесь одного подходящего партнёра: 1 + 3 или 2 + 2. Сумма ровно четыре снимает эффект; случайные столкновения и ожидание до конца опасны.",
          "en": "Count your green marks and touch one matching partner: 1 + 3 or 2 + 2. Exactly four clears the effect; accidental collisions or letting it expire are dangerous."
        },
        "counters": [],
        "counterRoles": [],
        "spellIcon": "/assets/wow/raids/venomous-abyss/spells/1284590.png"
      },
      {
        "id": "coagulation",
        "spellId": 1284257,
        "name": {
          "ru": "Отравление",
          "en": "Contaminate"
        },
        "signal": {
          "ru": "У зелёного голема появляется большой сгусток.",
          "en": "A large slime appears beside the green golem."
        },
        "response": {
          "ru": "Вся зелёная группа сразу убивает сгусток: он постоянно наносит урон всем. Прерывание заклинания не заменяет его убийство.",
          "en": "The green group kills the slime immediately; it continuously damages everyone. An interrupt does not replace killing it."
        },
        "counters": [],
        "counterRoles": []
      },
      {
        "id": "droplets",
        "spellId": 1284434,
        "name": {
          "ru": "Отравляющие капли",
          "en": "Toxic Droplets"
        },
        "signal": {
          "ru": "Перед зелёным големом появляются капли.",
          "en": "Droplets appear in front of the green golem."
        },
        "response": {
          "ru": "Наступайте на капли до их взрыва, распределяя их между игроками. После подбора восстановите здоровье, прежде чем брать следующую.",
          "en": "Step on droplets before they explode, sharing them between players. Recover health before collecting another."
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
        "id": "return",
        "spellId": 1284207,
        "name": {
          "ru": "Живой яд",
          "en": "Living Venom"
        },
        "signal": {
          "ru": "Зелёная слизь летит обратно к голему.",
          "en": "Green slime travels back toward its golem."
        },
        "response": {
          "ru": "Освободите путь между приземлившейся слизью и големом. Следите за обратным движением, даже если уже избежали первого удара.",
          "en": "Clear the path between landed slime and the golem. Watch its return even after avoiding the outgoing hit."
        },
        "counters": [],
        "counterRoles": [],
        "heroicOnly": true
      },
      {
        "id": "miasma",
        "spellId": 1288232,
        "name": {
          "ru": "Нестабильные миазмы",
          "en": "Unstable Miasma"
        },
        "signal": {
          "ru": "На красной стороне отмечен игрок с большим кругом.",
          "en": "A player on the red side is marked with a large circle."
        },
        "response": {
          "ru": "Войдите своей группой в круг и разделите удар. После взрыва восстановите здоровье и выйдите из опасных зон.",
          "en": "Join the circle with your assigned group and share the hit. Recover health afterward and leave dangerous ground."
        },
        "counters": [],
        "counterRoles": [],
        "heroic": {
          "ru": "После общего удара переместитесь к выбранному краю: кровавые эффекты оставляют лужи при окончании.",
          "en": "After the shared hit move toward the chosen edge; blood effects leave pools when they end."
        }
      },
      {
        "id": "blood",
        "spellId": 1284471,
        "name": {
          "ru": "Зачумленная кровь",
          "en": "Blighted Blood"
        },
        "signal": {
          "ru": "На игроке «Зачумленная кровь».",
          "en": "A player has Blighted Blood."
        },
        "response": {
          "ru": "Целитель снимает магический эффект, а группа продолжает выполнять общий круг.",
          "en": "A healer dispels the magic effect while the group continues handling the shared circle."
        },
        "counters": [
          "magic"
        ],
        "counterRoles": [
          "healer"
        ],
        "heroic": {
          "ru": "Перед снятием цель выходит к краю, чтобы оставшаяся лужа не заняла место группы.",
          "en": "Before removal the target moves to the edge so the resulting pool does not cover the group."
        }
      },
      {
        "id": "tank",
        "spellId": 1284458,
        "name": {
          "ru": "Усиливающее сокрушение",
          "en": "Empowering Slam"
        },
        "signal": {
          "ru": "Зелёный голем усиливает удары по одному танку; красный накладывает «Доза ядовитой крови».",
          "en": "The green golem ramps attacks on one tank; the red applies Bloodvenom Injection."
        },
        "response": {
          "ru": "Используйте защиту перед ударами. На каждой переходке меняйтесь големами, чтобы прежние эффекты успевали спадать.",
          "en": "Use mitigation before the hits. Trade golems at every intermission so previous effects can expire."
        },
        "counters": [
          "defend"
        ],
        "counterRoles": [
          "tank"
        ],
        "heroic": {
          "ru": "Танк с истекающим кровавым эффектом оставляет большую лужу у края.",
          "en": "The tank’s expiring blood debuff leaves a large pool; place it at the edge."
        }
      }
    ],
    "adds": [
      {
        "id": "coagulation",
        "npcId": 260766,
        "name": {
          "ru": "Сгущающийся яд",
          "en": "Venom Coagulation"
        },
        "portrait": "/assets/wow/raids/venomous-abyss/enemies/260766.webp",
        "description": {
          "ru": "Большой сгусток у зелёного голема; постоянно ранит всю группу.",
          "en": "A large slime beside the green golem, continuously damaging the raid."
        },
        "action": {
          "ru": "Немедленно переключитесь и убейте.",
          "en": "Switch to it and kill it immediately."
        },
        "death": {
          "ru": "Постоянный урон прекращается после смерти сгустка.",
          "en": "Its constant damage stops when it dies."
        }
      }
    ],
    "diagram": {
      "title": {
        "ru": "Где стоять и куда двигаться",
        "en": "Where to stand and move"
      },
      "caption": {
        "ru": "Группы держатся раздельно и встречаются только для безопасного соединения меток.",
        "en": "Groups stay separate and meet only to combine their marks safely."
      },
      "heroicCaption": {
        "ru": "Лужи красной стороны оставляйте вдоль края; не перекрывайте место встречи на переходке.",
        "en": "Place red-side pools along the edge; keep the intermission meeting area open."
      },
      "steps": [
        {
          "id": "sides",
          "title": {
            "ru": "Две стороны",
            "en": "Two sides"
          },
          "body": {
            "ru": "Зелёный и красный големы стоят раздельно. У каждого свой танк, целители и бойцы.",
            "en": "Green and red golems stand apart, each with a tank, healers and damage dealers."
          }
        },
        {
          "id": "pairs",
          "title": {
            "ru": "Пара: 1 + 3 или 2 + 2",
            "en": "Pairs: 1 + 3 or 2 + 2"
          },
          "body": {
            "ru": "На переходке найдите подходящего партнёра; не пересекайте чужие пары.",
            "en": "During intermission find a matching partner; do not cross other pairs."
          }
        },
        {
          "id": "swap",
          "title": {
            "ru": "Та же сторона, другой голем",
            "en": "Same side, other golem"
          },
          "body": {
            "ru": "Танки приводят на свои стороны другого голема. Группа остаётся на месте и снимает прежние накопления.",
            "en": "Tanks bring the other golem to their sides. The group stays put and lets its previous stacks expire."
          }
        }
      ]
    },
    "sources": [
      {
        "title": "Encounter journal · Normal / Heroic",
        "url": "https://www.wowhead.com/npc=258557"
      },
      {
        "title": "Icy Veins · Panthea",
        "url": "https://www.icy-veins.com/wow/entombed-sentinels-raid-guide/"
      },
      {
        "title": "Method · Purke · Heroic",
        "url": "https://www.method.gg/guides/the-venomous-abyss/entombed-sentinels-heroic"
      }
    ]
  },
  {
    "id": "the-lost-explorers",
    "name": {
      "en": "The Lost Explorers",
      "ru": "Потерявшиеся исследователи"
    },
    "raidName": {
      "en": "The Venomous Abyss",
      "ru": "Отравленная бездна"
    },
    "reviewedAt": "2026-11-04",
    "goal": {
      "ru": "Находите рыбу в ящиках и используйте её до конца «Последнее вознесение». Выполняйте усиленную механику текущего исследователя и добивайте всех троих почти одновременно.",
      "en": "Find fish in crates and use them before Final Ascension completes. Handle the currently empowered explorer and finish all three close together."
    },
    "priorities": [
      {
        "id": "fish",
        "title": {
          "ru": "Ящики дают рыбу",
          "en": "Crates provide fish"
        },
        "body": {
          "ru": "Разбейте ящики после приземления. Рыбу используйте дополнительной кнопкой вблизи нужного исследователя, прежде чем Мор'захи завершит «Последнее вознесение».",
          "en": "Break landed crates. Use the fish’s extra-action button beside the chosen explorer before Mor’zahi finishes Final Ascension."
        }
      },
      {
        "id": "flames",
        "title": {
          "ru": "Прерывайте заклинание Ику",
          "en": "Interrupt Iku’s cast"
        },
        "body": {
          "ru": "«Замерзшие огни» нужно прерывать. Если оно прошло, целитель снимает оставшийся магический эффект.",
          "en": "Interrupt Icebound Flames. If it gets through, a healer dispels the remaining magic effect."
        }
      },
      {
        "id": "balance",
        "title": {
          "ru": "Убейте троих вместе",
          "en": "Finish all three together"
        },
        "body": {
          "ru": "Не добивайте одного задолго до остальных: после смерти союзника оставшиеся получают опасные усиления.",
          "en": "Do not kill one far ahead of the others; survivors gain dangerous abilities when an ally dies."
        }
      }
    ],
    "flow": [
      {
        "id": "start",
        "title": {
          "ru": "Три полоски здоровья",
          "en": "Three health bars"
        },
        "body": {
          "ru": "Два танка принимают Ику и Наму. Распределите урон между всеми тремя исследователями; назначьте игроков на ящики и прерывания Ику.",
          "en": "Two tanks handle Iku and Nama. Balance damage across all three explorers; assign crate collectors and Iku interrupts."
        },
        "heroicBody": {
          "ru": "Держите вместе не больше двух исследователей, третий — дальше 30 м. Назначьте игроков на ящики и прерывания Ику; выравнивайте здоровье всех троих.",
          "en": "Keep at most two explorers together, with the third over 30 yards away. Assign crate collectors and Iku interrupts; balance all three health bars."
        }
      },
      {
        "id": "fish",
        "title": {
          "ru": "Рыба откладывает поражение",
          "en": "Fish delays the wipe"
        },
        "body": {
          "ru": "Откройте ящики, найдите рыбу и примените её до завершения «Последнее вознесение». Заранее согласуйте порядок целей: например, Геббо → Нама → Ику.",
          "en": "Open crates, find the fish and use it before Final Ascension completes. Agree a target order beforehand, for example Gebbo → Nama → Iku."
        }
      },
      {
        "id": "abilities",
        "title": {
          "ru": "Следите за текущим усилением",
          "en": "Watch the current empowerment"
        },
        "body": {
          "ru": "У Геббо перепрыгивайте волну на грибах; у Намы разделяйте три прыжка; у Ику снимайте огонь холодной зоной, а холод — огненной.",
          "en": "For Gebbo, use mushrooms to jump the wave; for Nama, share three leaps; for Iku, clear fire in a frost patch and frost in a fire patch."
        }
      },
      {
        "id": "finish",
        "title": {
          "ru": "Ровное здоровье → общее добивание",
          "en": "Even health → close kills"
        },
        "body": {
          "ru": "Сохраняйте цели близко по здоровью. В конце быстро убейте оставшихся: смерть союзника резко усложняет их атаки.",
          "en": "Keep the health bars close. Quickly finish the survivors; an ally’s death makes their attacks much more dangerous."
        }
      }
    ],
    "roles": {
      "tank": {
        "position": {
          "ru": "Ику и Нама у разных танков; Геббо перемещается самостоятельно.",
          "en": "Iku and Nama on separate tanks; Gebbo moves independently."
        },
        "actions": [
          {
            "ru": "Меняйтесь после «Раздирающие осколки» Ику и следите за ростом ударов Намы.",
            "en": "Swap after Iku’s Shredding Shards and watch Nama’s ramping attacks."
          },
          {
            "ru": "Не разворачивайте «Крутящийся панцирь» в группу; после прыжков выводите цели из опасной земли.",
            "en": "Keep Shell Spin away from the group; move targets away from hazardous ground after leaps."
          }
        ],
        "heroic": {
          "ru": "При перемещениях Ику сохраняйте разделение: все трое не должны оказаться в пределах 30 м друг от друга.",
          "en": "As Iku moves, preserve separation; do not let all three come within 30 yards of one another."
        }
      },
      "healer": {
        "position": {
          "ru": "В пределах лечения обеих танкуемых целей и игроков с ящиками.",
          "en": "In healing range of both tanked targets and crate collectors."
        },
        "actions": [
          {
            "ru": "Снимайте остаток «Замерзшие огни», если прерывание пропущено. Лечите кровотечение после ящиков.",
            "en": "Dispel lingering Icebound Flames after a missed interrupt. Heal the bleed from crates."
          },
          {
            "ru": "Подготовьте лечение к использованию рыбы и общим прыжкам Намы.",
            "en": "Prepare healing for fish use and Nama’s shared leaps."
          }
        ]
      },
      "melee": {
        "position": {
          "ru": "Сбоку от текущей цели, вне направления летящих панцирей.",
          "en": "Beside your target, out of the spinning shells’ path."
        },
        "actions": [
          {
            "ru": "Прерывайте «Замерзшие огни» по очереди и помогайте выравнивать здоровье целей.",
            "en": "Rotate Icebound Flames interrupts and help balance target health."
          },
          {
            "ru": "С рыбой подойдите к согласованному исследователю и используйте дополнительную кнопку вовремя.",
            "en": "With a fish, approach the agreed explorer and use the extra-action button in time."
          }
        ]
      },
      "ranged": {
        "position": {
          "ru": "Разреженно между рабочей зоной и доступными ящиками, не занимая место для бомбы.",
          "en": "Spread between the working area and reachable crates, leaving space for the bomb."
        },
        "actions": [
          {
            "ru": "Разбивайте ящики после приземления; делите эту работу, чтобы не накапливать кровотечение на одном игроке.",
            "en": "Break crates after they land; share the job so one player does not accumulate every bleed."
          },
          {
            "ru": "С «Скачок-вспышка» уходите дальше от группы. Бомбу размещайте у внешнего края, сохраняя путь к грибу.",
            "en": "Take Blink Nova far from the group. Place the bomb at the outer edge, keeping access to a mushroom."
          }
        ]
      }
    },
    "mechanics": [
      {
        "id": "fish",
        "spellId": 1292780,
        "name": {
          "ru": "Последнее вознесение",
          "en": "Final Ascension"
        },
        "signal": {
          "ru": "Мор'захи набирает энергию; Геббо бросает ящики.",
          "en": "Mor’zahi gains energy while Gebbo throws crates."
        },
        "response": {
          "ru": "После приземления наступайте на ящики: неоткрытые взрываются. Найденную рыбу используйте дополнительной кнопкой рядом с согласованной целью до конца «Последнее вознесение». Обычное прерывание этот шаг не заменяет.",
          "en": "Step on landed crates; unopened crates explode. Use a found fish’s extra-action button beside the agreed target before Final Ascension completes. A normal interrupt does not replace this step."
        },
        "counters": [],
        "counterRoles": []
      },
      {
        "id": "flames",
        "spellId": 1286921,
        "name": {
          "ru": "Замерзшие огни",
          "en": "Icebound Flames"
        },
        "signal": {
          "ru": "Ику произносит «Замерзшие огни».",
          "en": "Iku casts Icebound Flames."
        },
        "response": {
          "ru": "Прервите заклинание Ику. Если оно прошло, целитель снимает оставшийся эффект с пострадавшего игрока.",
          "en": "Interrupt Iku. If the cast succeeds, a healer dispels its lingering effect from the affected player."
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
        "targetId": "iku"
      },
      {
        "id": "nova",
        "spellId": 1296025,
        "name": {
          "ru": "Скачок-вспышка",
          "en": "Blink Nova"
        },
        "signal": {
          "ru": "Ику выбирает игрока для «Скачок-вспышка».",
          "en": "Iku chooses a player for Blink Nova."
        },
        "response": {
          "ru": "Отмеченный игрок уходит далеко от остальных до телепортации Ику. Чем дальше группа от точки взрыва, тем меньше полученный урон.",
          "en": "The marked player moves far from everyone else before Iku teleports. Greater distance from the explosion reduces the group’s damage."
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
        "id": "shell",
        "spellId": 1296061,
        "name": {
          "ru": "Крутящийся панцирь",
          "en": "Shell Spin"
        },
        "signal": {
          "ru": "Нама выпускает три вращающихся панциря.",
          "en": "Nama releases three spinning shells."
        },
        "response": {
          "ru": "Выйдите из направления панцирей. Попадание оглушает и может помешать выполнить следующую механику.",
          "en": "Move out of the shells’ path. A hit stuns you and can prevent handling the next mechanic."
        },
        "counters": [],
        "counterRoles": []
      },
      {
        "id": "bomb",
        "spellId": 1305844,
        "name": {
          "ru": "Взрывная волна",
          "en": "Blast Wave"
        },
        "signal": {
          "ru": "У Геббо появилась бомба и расходящаяся от неё волна.",
          "en": "Gebbo’s bomb appears and sends out a wave."
        },
        "response": {
          "ru": "Размещайте бомбу у края, отдельно от грибов. Наступите на гриб перед подходом волны, чтобы пролететь над ней; после приземления отойдите от гриба.",
          "en": "Place the bomb at the edge, away from mushrooms. Step on a mushroom just before the wave reaches you to jump over it; move away from the mushroom after landing."
        },
        "counters": [],
        "counterRoles": []
      },
      {
        "id": "leaps",
        "spellId": 1296092,
        "name": {
          "ru": "Грохочущий скачок",
          "en": "Mighty Thud"
        },
        "signal": {
          "ru": "Нама отмечает трёх игроков для последовательных прыжков.",
          "en": "Nama marks three players for consecutive leaps."
        },
        "response": {
          "ru": "Разнесите три отмеченных круга и поставьте в каждый назначенную группу. Делите каждый удар, затем выходите из дрожащей земли. Пустой круг бьёт по всему рейду.",
          "en": "Separate the three marked circles and put an assigned group in each. Share every hit, then leave the shaking ground. An empty circle damages the entire raid."
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
        "id": "volley",
        "spellId": 1295893,
        "name": {
          "ru": "Залп ледяного огня",
          "en": "Frostfire Volley"
        },
        "signal": {
          "ru": "Ику отмечает игроков огненными или ледяными снарядами.",
          "en": "Iku marks players with fire or frost missiles."
        },
        "response": {
          "ru": "Разнесите отмеченные круги. После попадания снимите огненный эффект в холодной зоне, а ледяной — в огненной; успейте до следующей серии. Снаряд противоположной стихии по уже отмеченному игроку вызывает взрыв.",
          "en": "Spread the marked circles. After impact, clear a fire effect in a frost patch and a frost effect in a fire patch before the next set. An opposite-element missile hitting an already affected player causes an explosion."
        },
        "counters": [],
        "counterRoles": []
      },
      {
        "id": "tank",
        "spellId": 1295854,
        "name": {
          "ru": "Раздирающие осколки",
          "en": "Shredding Shards"
        },
        "signal": {
          "ru": "Ику направляет серию ледяных осколков в танка; у Намы нарастают удары.",
          "en": "Iku channels ice shards into her tank while Nama’s attacks ramp up."
        },
        "response": {
          "ru": "Танк использует защиту на серию осколков; после неё танки меняются целями. Следите и за «Размеренные удары» Намы, не дожидаясь смертельного урона.",
          "en": "The tank uses mitigation for the shard sequence; tanks trade targets afterward. Watch Nama’s Steady Strikes too, before their damage becomes lethal."
        },
        "counters": [
          "defend"
        ],
        "counterRoles": [
          "tank"
        ]
      },
      {
        "id": "balance",
        "spellId": 1291390,
        "name": {
          "ru": "Апокалиптическое заклятие",
          "en": "Cataclysmic Invocation"
        },
        "signal": {
          "ru": "Один исследователь погибает, остальные получают новые опасные атаки.",
          "en": "One explorer dies and the survivors gain dangerous attacks."
        },
        "response": {
          "ru": "Равномерно снижайте здоровье всех троих и добивайте почти одновременно. После первой смерти быстро завершайте бой.",
          "en": "Lower all three health bars evenly and finish them close together. End the fight quickly after the first death."
        },
        "counters": [],
        "counterRoles": []
      },
      {
        "id": "separation",
        "spellId": 1297646,
        "name": {
          "ru": "Сплоченная оборона",
          "en": "United Defense"
        },
        "signal": {
          "ru": "Все трое исследователей оказались рядом и почти не получают урон.",
          "en": "All three explorers are close together and take almost no damage."
        },
        "response": {
          "ru": "Оставьте рядом только двух, а третьего держите дальше 30 м. После «Скачок-вспышка» проверьте, не собрались ли все трое вместе.",
          "en": "Keep only two together and the third over 30 yards away. After Blink Nova check that all three have not gathered together."
        },
        "counters": [],
        "counterRoles": [],
        "heroicOnly": true
      }
    ],
    "adds": [
      {
        "id": "iku",
        "npcId": 262173,
        "name": {
          "ru": "Хранитель свитков Ику",
          "en": "Scrollsage Iku"
        },
        "portrait": "/assets/wow/raids/venomous-abyss/enemies/262173.webp",
        "description": {
          "ru": "Ику использует прерываемое «Замерзшие огни» и опасные ледяные атаки по танку.",
          "en": "Iku uses interruptible Icebound Flames and dangerous ice attacks on her tank."
        },
        "action": {
          "ru": "Назначьте порядок прерываний. Держите её здоровье близко к двум остальным.",
          "en": "Assign an interrupt rotation. Keep her health close to the other two."
        },
        "death": {
          "ru": "После смерти союзника её урон по рейду резко возрастает.",
          "en": "Her raid damage rises sharply after an ally dies."
        },
        "cast": {
          "spellId": 1286921,
          "name": {
            "ru": "Замерзшие огни",
            "en": "Icebound Flames"
          },
          "description": {
            "ru": "Удар, замедление и последующий магический урон по игроку.",
            "en": "A hit, slow and lingering magic damage on a player."
          },
          "action": {
            "ru": "Прервите «Замерзшие огни» у Ику. Если заклинание прошло, целитель снимает оставшийся эффект.",
            "en": "Interrupt Iku’s Icebound Flames. If it succeeds, a healer dispels the remaining effect."
          }
        }
      },
      {
        "id": "nama",
        "npcId": 262172,
        "name": {
          "ru": "Первый помощник Нама",
          "en": "First Mate Nama"
        },
        "portrait": "/assets/wow/raids/venomous-abyss/enemies/262172.webp",
        "description": {
          "ru": "Нама атакует танка, выпускает панцири и получает серию общих прыжков.",
          "en": "Nama attacks a tank, launches shells and gains a series of shared leaps."
        },
        "action": {
          "ru": "Уклоняйтесь от панцирей; при трёх метках помогайте своей группе разделить прыжок.",
          "en": "Dodge the shells; when three marks appear, help your assigned group share its leap."
        },
        "death": {
          "ru": "Не оставляйте Наму жить надолго после смерти другого исследователя.",
          "en": "Do not leave Nama alive long after another explorer dies."
        }
      },
      {
        "id": "gebbo",
        "npcId": 262174,
        "name": {
          "ru": "Торговец Геббо",
          "en": "Trader Gebbo"
        },
        "portrait": "/assets/wow/raids/venomous-abyss/enemies/262174.webp",
        "description": {
          "ru": "Геббо бросает ящики с рыбой, грибы и бомбы.",
          "en": "Gebbo throws fish crates, mushrooms and bombs."
        },
        "action": {
          "ru": "Разбирайте ящики после приземления. Грибы сохраняйте для прыжка через волну бомбы.",
          "en": "Clear crates after they land. Save mushrooms for jumping over the bomb wave."
        },
        "death": {
          "ru": "Планируйте его смерть близко к остальным: выжившие получают усиление.",
          "en": "Time his death close to the others; survivors gain empowered attacks."
        }
      }
    ],
    "diagram": {
      "title": {
        "ru": "Где стоять и куда двигаться",
        "en": "Where to stand and move"
      },
      "caption": {
        "ru": "Расположение меняется с усиленной способностью: ящики, волна бомбы или три общих круга.",
        "en": "Positioning changes with the empowered ability: crates, the bomb wave or three shared circles."
      },
      "heroicCaption": {
        "ru": "При любой механике сохраняйте разделение исследователей: рядом не должно быть всех троих.",
        "en": "During every mechanic keep the explorers separated; never gather all three together."
      },
      "steps": [
        {
          "id": "crates",
          "title": {
            "ru": "Ящики → рыба → цель",
            "en": "Crates → fish → target"
          },
          "body": {
            "ru": "Открывший ящик игрок несёт рыбу к согласованному исследователю; остальные не стоят в местах падения ящиков.",
            "en": "The crate collector carries the fish to the agreed explorer; everyone else avoids falling crates."
          }
        },
        {
          "id": "wave",
          "title": {
            "ru": "Бомба у края, грибы свободны",
            "en": "Bomb at the edge; mushrooms clear"
          },
          "body": {
            "ru": "Оставьте между бомбой и группой место для волны. Не закрывайте бомбой нужный гриб.",
            "en": "Leave room between the bomb and group for the wave. Do not cover the needed mushroom with the bomb."
          }
        },
        {
          "id": "leaps",
          "title": {
            "ru": "Три круга, три группы",
            "en": "Three circles, three groups"
          },
          "body": {
            "ru": "Отмеченные игроки разносят круги; помощники входят каждый в свой круг.",
            "en": "Marked players separate their circles; assigned helpers enter their own circle."
          }
        }
      ]
    },
    "sources": [
      {
        "title": "Encounter journal · Normal / Heroic",
        "url": "https://www.wowhead.com/npc=262173"
      },
      {
        "title": "Icy Veins · Panthea",
        "url": "https://www.icy-veins.com/wow/lost-explorers-raid-guide/"
      },
      {
        "title": "Method · Purke · Heroic",
        "url": "https://www.method.gg/guides/the-venomous-abyss/the-lost-explorers-heroic"
      }
    ]
  },
  {
    "id": "vashnik-the-malignant",
    "name": {
      "en": "Vashnik the Malignant",
      "ru": "Вашник Тлетворный"
    },
    "raidName": {
      "en": "The Venomous Abyss",
      "ru": "Отравленная бездна"
    },
    "reviewedAt": "2026-11-04",
    "goal": {
      "ru": "Убивайте слизней до центральной воронки. Танки выбирают два источника для каждого усиления, а группа выполняет механику полученной инфекции.",
      "en": "Kill slimes before they reach the central cavity. Tanks choose two fountains for each infusion; the raid handles the resulting infections."
    },
    "priorities": [
      {
        "id": "adds",
        "title": {
          "ru": "Слизни важнее босса",
          "en": "Slimes before boss damage"
        },
        "body": {
          "ru": "Перехватывайте слизней на пути от источников к центру. В первую очередь убивайте огненных.",
          "en": "Intercept slimes on their way from fountains to the centre. Kill burning slimes first."
        }
      },
      {
        "id": "froth",
        "title": {
          "ru": "Кресты — отдельно от группы",
          "en": "Keep crossing waves away from the group"
        },
        "body": {
          "ru": "С «Чумная пена» разойдитесь, чтобы расходящиеся волны не прошли через других игроков.",
          "en": "Spread with Plague Froth so its outgoing waves do not pass through other players."
        }
      },
      {
        "id": "imbibe",
        "title": {
          "ru": "Пара источников перед 100 энергии",
          "en": "Choose fountains before 100 energy"
        },
        "body": {
          "ru": "До «Питье» танк ставит босса у выбранной пары источников. После усиления готовьтесь к соответствующим слизням и инфекциям.",
          "en": "Before Imbibe the tank positions the boss by the chosen fountain pair. Prepare for their slimes and infections afterward."
        }
      }
    ],
    "flow": [
      {
        "id": "position",
        "title": {
          "ru": "Начните у Тьмы и Огня",
          "en": "Start by Shadow and Flame"
        },
        "body": {
          "ru": "Танк ставит босса ближе к источникам Тьмы и Огня. Остальные занимают места для перехвата слизней, не в центральной воронке.",
          "en": "The tank starts the boss closest to Shadow and Flame fountains. Everyone else prepares to intercept slimes, away from the central cavity."
        }
      },
      {
        "id": "drink",
        "title": {
          "ru": "100 энергии: два усиления",
          "en": "100 energy: two infusions"
        },
        "body": {
          "ru": "«Питье» активирует две ближайшие чаши. Быстро убейте их слизней, сохраняя проходы и выполняя личные метки.",
          "en": "Imbibe activates the two closest fountains. Quickly kill their slimes while keeping paths clear and handling personal marks."
        }
      },
      {
        "id": "rotate",
        "title": {
          "ru": "Следующая пара источников",
          "en": "Next fountain pair"
        },
        "body": {
          "ru": "Для следующего «Питье» переместите босса к Огню и Крови, затем к Крови и Тьме. Повторяйте круг; путь выбирайте по свободной земле.",
          "en": "For the next Imbibe move the boss to Flame and Blood, then Blood and Shadow. Repeat the rotation, following clear ground."
        }
      },
      {
        "id": "finish",
        "title": {
          "ru": "Каждый цикл опаснее",
          "en": "Each cycle is more dangerous"
        },
        "body": {
          "ru": "С каждым «Питье» растёт постоянный урон. Не затягивайте убийство слизней; распределите сильное лечение и защиту по поздним циклам.",
          "en": "Each Imbibe increases constant damage. Kill slimes promptly and distribute strong healing and defensives across later cycles."
        }
      }
    ],
    "roles": {
      "tank": {
        "position": {
          "ru": "У двух выбранных источников, вне центральной воронки; оставляйте проход для группы.",
          "en": "Beside the two chosen fountains, outside the central cavity; leave a path for the group."
        },
        "actions": [
          {
            "ru": "Меняйтесь после каждого «Сочащиеся клыки» и используйте защиту на удар.",
            "en": "Swap after every Dripping Fangs and use mitigation for the hit."
          },
          {
            "ru": "Перед 100 энергии заранее приведите босса к следующей паре источников.",
            "en": "Before 100 energy bring the boss to the next fountain pair."
          }
        ]
      },
      "healer": {
        "position": {
          "ru": "В пределах лечения группы и танка при перемещении между источниками.",
          "en": "Within healing range of the raid and the tank moving between fountains."
        },
        "actions": [
          {
            "ru": "«Взрывная инфекция» снимайте по очереди, когда группа переживёт взрыв. Расстояние от цели не уменьшает этот общий удар.",
            "en": "Dispel Exploding Infection one at a time when the raid can survive the explosion. Distance from its target does not reduce that raidwide hit."
          },
          {
            "ru": "Снимайте поглощение лечения «Стигийская инфекция» лечением. При «Истощающая инфекция» поддерживайте союзников, стоящих рядом с целью.",
            "en": "Heal through Stygian Infection’s absorb. For Siphoning Infection, support the allies standing beside its target."
          }
        ]
      },
      "melee": {
        "position": {
          "ru": "Сбоку от босса, с возможностью быстро перейти к ближайшей слизи.",
          "en": "Beside the boss with room to switch quickly to nearby slimes."
        },
        "actions": [
          {
            "ru": "Огненные слизни — первый приоритет; кровавых добивайте после каждого разделения.",
            "en": "Burning slimes are the first priority; finish blood slimes after every split."
          },
          {
            "ru": "С «Чумная пена» выйдите из плотной группы и избегайте чужих волн.",
            "en": "Leave the clump with Plague Froth and avoid other players’ waves."
          }
        ],
        "heroic": {
          "ru": "Не убивайте много огненных слизней одновременно: их предсмертный эффект накапливается.",
          "en": "Do not kill many burning slimes simultaneously; their death effect stacks."
        }
      },
      "ranged": {
        "position": {
          "ru": "Между источниками и центральной воронкой, с обзором подходящих слизней.",
          "en": "Between the fountains and central cavity, with sight of incoming slimes."
        },
        "actions": [
          {
            "ru": "Сначала убивайте огненных, затем останавливайте отставших слизней. Не позволяйте им дойти до центра.",
            "en": "Kill burning slimes first, then stop stragglers. Do not let them reach the centre."
          },
          {
            "ru": "При «Истощающая инфекция» встаньте рядом с отмеченным союзником, чтобы его периодическое вытягивание крови сняло поглощение лечения.",
            "en": "For Siphoning Infection, stand beside the affected ally so their periodic blood siphon clears the healing absorb."
          }
        ],
        "heroic": {
          "ru": "Закрывайте появляющиеся маленькие круги: в каждом должен стоять хотя бы один игрок.",
          "en": "Cover the small circles that appear; each needs at least one player."
        }
      }
    },
    "mechanics": [
      {
        "id": "imbibe",
        "spellId": 1283164,
        "name": {
          "ru": "Питье",
          "en": "Imbibe"
        },
        "signal": {
          "ru": "Босс достигает 100 энергии и использует два ближайших источника.",
          "en": "The boss reaches 100 energy and uses the two closest fountains."
        },
        "response": {
          "ru": "Заранее выберите пару положением босса. Рабочий порядок: Тьма + Огонь → Огонь + Кровь → Кровь + Тьма. Активные источники определяют слизней и инфекции.",
          "en": "Choose the pair beforehand through boss positioning. One rotation is Shadow + Flame → Flame + Blood → Blood + Shadow. Active fountains determine the slimes and infections."
        },
        "counters": [],
        "counterRoles": [],
        "spellIcon": "/assets/wow/raids/venomous-abyss/spells/1283164.jpg"
      },
      {
        "id": "adds",
        "spellId": 1280189,
        "name": {
          "ru": "Тлетворный взрыв",
          "en": "Malignant Burst"
        },
        "signal": {
          "ru": "От источников к центральной воронке движутся слизни.",
          "en": "Slimes move from fountains toward the central cavity."
        },
        "response": {
          "ru": "Убейте их до центра: дошедшая слизь взрывается по всей группе. Огненные имеют приоритет; кровавые требуют добивания после разделений; теневым нужно пробить щит.",
          "en": "Kill them before the centre; a slime reaching it explodes across the raid. Prioritise burning slimes, finish blood slimes after splits and break shadow slimes’ shields."
        },
        "counters": [],
        "counterRoles": [],
        "spellIcon": "/assets/wow/raids/venomous-abyss/spells/1280189.jpg"
      },
      {
        "id": "bloodslime",
        "spellId": 1291530,
        "name": {
          "ru": "Полнокровная стойкость",
          "en": "Sanguineous Fortitude"
        },
        "signal": {
          "ru": "Большой красный слизень не останавливается контролем.",
          "en": "A large red slime ignores crowd control."
        },
        "response": {
          "ru": "Не тратьте оглушение на большого слизня. Убейте его, затем добейте меньших, появляющихся после разделений; малых уже можно контролировать.",
          "en": "Do not waste a stun on the large slime. Kill it and finish the smaller ones spawned by its splits; smaller slimes can be controlled."
        },
        "counters": [],
        "counterRoles": []
      },
      {
        "id": "shadow",
        "spellId": 1312366,
        "name": {
          "ru": "Липкие миазмы",
          "en": "Miasmic Coating"
        },
        "signal": {
          "ru": "Теневой слизень идёт к центру под поглощающим щитом.",
          "en": "A shadow slime approaches the centre with an absorb shield."
        },
        "response": {
          "ru": "Пробейте щит уроном и убейте слизня. При необходимости задержите его оглушением, пока защита «Затвердевший яд» ещё не включилась; после смерти избегайте падающих сгустков.",
          "en": "Break its shield with damage and kill it. If needed, delay it with a stun before Hardened Venom activates; dodge falling blobs after its death."
        },
        "counters": [
          "stun"
        ],
        "counterRoles": [
          "tank",
          "melee",
          "ranged"
        ],
        "targetId": "shadow"
      },
      {
        "id": "burning",
        "spellId": 1285979,
        "name": {
          "ru": "Едкий поток",
          "en": "Caustic Surge"
        },
        "signal": {
          "ru": "Огненные слизни пульсируют уроном и взрываются при смерти.",
          "en": "Burning slimes pulse damage and burst when they die."
        },
        "response": {
          "ru": "Убивайте их первыми и поддерживайте здоровье группы перед гибелью слизи.",
          "en": "Kill them first and restore the raid’s health before a slime dies."
        },
        "counters": [],
        "counterRoles": [],
        "heroic": {
          "ru": "Предсмертный эффект накапливается. Разделяйте убийства небольшими паузами, если целители не выдержат одновременные взрывы.",
          "en": "The death effect stacks. Stagger kills if the healers cannot cover simultaneous bursts."
        }
      },
      {
        "id": "froth",
        "spellId": 1281907,
        "name": {
          "ru": "Чумная пена",
          "en": "Plague Froth"
        },
        "signal": {
          "ru": "На игроках «Чумная пена».",
          "en": "Players receive Plague Froth."
        },
        "response": {
          "ru": "Разойдитесь с метками: после окончания от каждой цели расходятся волны крестом. Встаньте так, чтобы их линии не пересекли группу, и уклоняйтесь от чужих волн.",
          "en": "Spread with the debuffs; each sends out crossing waves when it expires. Position their paths away from the group and dodge other players’ waves."
        },
        "counters": [],
        "counterRoles": []
      },
      {
        "id": "exploding",
        "spellId": 1295173,
        "name": {
          "ru": "Взрывная инфекция",
          "en": "Exploding Infection"
        },
        "signal": {
          "ru": "Огненное усиление накладывает «Взрывная инфекция».",
          "en": "The flame infusion applies Exploding Infection."
        },
        "response": {
          "ru": "Целители снимают магический эффект по очереди, когда здоровье группы восстановлено. Каждое снятие вызывает общий взрыв; уход дальше от цели не уменьшает его урон.",
          "en": "Healers dispel the magic effect one at a time after the raid recovers. Each removal causes a raidwide explosion; moving farther from the target does not reduce it."
        },
        "counters": [
          "magic"
        ],
        "counterRoles": [
          "healer"
        ]
      },
      {
        "id": "siphon",
        "spellId": 1299941,
        "name": {
          "ru": "Истощающая инфекция",
          "en": "Siphoning Infection"
        },
        "signal": {
          "ru": "Кровавое усиление даёт «Истощающая инфекция» и блокирует лечение цели.",
          "en": "The blood infusion applies Siphoning Infection and blocks the target’s healing."
        },
        "response": {
          "ru": "Союзники входят в область рядом с целью: её «Вытягивание крови» вытягивает у них здоровье и снимает поглощение лечения. Целители поддерживают помощников; обычное лечение самой цели эту задачу не заменяет.",
          "en": "Allies stand near the target; its Siphon Blood drains them and clears the healing absorb. Healers support the helpers; ordinary healing on the target does not replace this step."
        },
        "counters": [],
        "counterRoles": []
      },
      {
        "id": "stygian",
        "spellId": 1294994,
        "name": {
          "ru": "Стигийская инфекция",
          "en": "Stygian Infection"
        },
        "signal": {
          "ru": "Теневое усиление накладывает «Стигийская инфекция».",
          "en": "The shadow infusion applies Stygian Infection."
        },
        "response": {
          "ru": "Целители снимают поглощение лечением. Отмеченный игрок держится отдельно от остальных и уклоняется от атак инфекции.",
          "en": "Healers heal through the absorb. The affected player stays apart from others and dodges the infection’s attacks."
        },
        "counters": [],
        "counterRoles": []
      },
      {
        "id": "fangs",
        "spellId": 1280935,
        "name": {
          "ru": "Сочащиеся клыки",
          "en": "Dripping Fangs"
        },
        "signal": {
          "ru": "«Сочащиеся клыки» направлен в текущего танка.",
          "en": "Dripping Fangs targets the active tank."
        },
        "response": {
          "ru": "Танк использует защиту на удар, затем второй танк сразу забирает босса. Повторяйте смену после каждого применения.",
          "en": "The tank uses mitigation for the hit, then the other tank immediately taunts. Repeat after every cast."
        },
        "counters": [
          "defend"
        ],
        "counterRoles": [
          "tank"
        ]
      },
      {
        "id": "catalyst",
        "spellId": 1282525,
        "name": {
          "ru": "Тлетворный катализатор",
          "en": "Malignant Catalyst"
        },
        "signal": {
          "ru": "Появляются небольшие круги «Каталитическая желчь».",
          "en": "Small Catalytic Bile circles appear."
        },
        "response": {
          "ru": "Распределитесь так, чтобы в каждом круге стоял хотя бы один игрок. Не оставляйте дальние круги пустыми.",
          "en": "Spread coverage so at least one player stands in every circle. Do not leave distant circles empty."
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
        "heroicOnly": true
      }
    ],
    "adds": [
      {
        "id": "burning",
        "npcId": 260905,
        "name": {
          "ru": "Жгучий яд",
          "en": "Burning Venom"
        },
        "portrait": "/assets/wow/raids/venomous-abyss/enemies/260905.webp",
        "description": {
          "ru": "Огненная слизь постоянно наносит урон группе.",
          "en": "Burning slime continuously damages the raid."
        },
        "action": {
          "ru": "Убивайте первой; в героическом режиме не допускайте серии одновременных смертей.",
          "en": "Kill it first; on Heroic avoid a chain of simultaneous deaths."
        },
        "death": {
          "ru": "«Едкий поток» наносит урон при смерти; в героическом режиме эффект накапливается.",
          "en": "Caustic Surge damages the raid on death; on Heroic its effect stacks."
        }
      },
      {
        "id": "blood",
        "npcId": 261679,
        "name": {
          "ru": "Сворачивающийся яд",
          "en": "Clotting Venom"
        },
        "portrait": "/assets/wow/raids/venomous-abyss/enemies/261679.webp",
        "description": {
          "ru": "Большая кровавая слизь защищена от контроля.",
          "en": "A large blood slime protected from crowd control."
        },
        "action": {
          "ru": "Убейте большую, затем всех малых после каждого разделения.",
          "en": "Kill the large slime, then every smaller slime after each split."
        },
        "death": {
          "ru": "Разделяется на меньших слизней; их уже можно останавливать контролем.",
          "en": "Splits into smaller slimes that can be stopped with crowd control."
        }
      },
      {
        "id": "shadow",
        "npcId": 260895,
        "name": {
          "ru": "Сокрытый яд",
          "en": "Shrouded Venom"
        },
        "portrait": "/assets/wow/raids/venomous-abyss/enemies/260895.webp",
        "description": {
          "ru": "Теневая слизь под щитом, направляющаяся к центру.",
          "en": "A shielded shadow slime heading toward the centre."
        },
        "action": {
          "ru": "Пробейте щит и убейте; задержите контролем, если она приближается к воронке.",
          "en": "Break its shield and kill it; delay it with crowd control if it approaches the cavity."
        },
        "death": {
          "ru": "Оставляет падающие сгустки «Мрачный выброс»: уклоняйтесь от мест попадания.",
          "en": "Releases falling Umbral Ejection blobs; dodge their impact areas."
        }
      }
    ],
    "diagram": {
      "title": {
        "ru": "Где стоять и куда двигаться",
        "en": "Where to stand and move"
      },
      "caption": {
        "ru": "Двигайтесь от пары источников к следующей, сохраняя доступ к слизням и свободные линии для волн.",
        "en": "Move between fountain pairs while keeping access to slimes and clear lanes for waves."
      },
      "heroicCaption": {
        "ru": "Распределите игроков по малым кругам; убийства огненных слизней согласуйте с целителями.",
        "en": "Assign players across small circles; coordinate burning-slime deaths with healers."
      },
      "steps": [
        {
          "id": "fountains",
          "title": {
            "ru": "Внешние источники",
            "en": "Outer fountains"
          },
          "body": {
            "ru": "Перед «Питье» босс ближе к выбранным двум источникам; группа сохраняет пути между ними.",
            "en": "Before Imbibe the boss stands closest to the chosen two fountains; the group keeps routes between them clear."
          }
        },
        {
          "id": "slimes",
          "title": {
            "ru": "Перехват слизней",
            "en": "Intercept the slimes"
          },
          "body": {
            "ru": "Распределите урон по пути от источников к центру, первым убивайте огонь.",
            "en": "Cover the paths from fountains toward the centre; kill burning slimes first."
          }
        },
        {
          "id": "centre",
          "title": {
            "ru": "Центр не пропускает ошибок",
            "en": "Protect the centre"
          },
          "body": {
            "ru": "Не допускайте ни одного слизня в воронку. Личные кресты размещайте в стороне от линии перехвата.",
            "en": "Do not let a slime enter the cavity. Place personal crossing waves away from the interception line."
          }
        }
      ]
    },
    "sources": [
      {
        "title": "Encounter journal · Normal / Heroic",
        "url": "https://www.wowhead.com/npc=261679"
      },
      {
        "title": "Icy Veins · Panthea",
        "url": "https://www.icy-veins.com/wow/vashnik-raid-guide/"
      },
      {
        "title": "Method · Purke · Heroic",
        "url": "https://www.method.gg/guides/the-venomous-abyss/vashnik-the-malignant-heroic"
      }
    ]
  }
];
