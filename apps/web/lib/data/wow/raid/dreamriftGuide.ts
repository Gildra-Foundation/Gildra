/** Paraphrased N/H tactics. Current game identities checked 2026-11-04; no Mythic assignments. */
import type { SporefallGuide, SporefallMechanic } from './sporefallGuide';
import type { GuideText } from './voidspireVideoGuide';

export type DreamriftGuide = Omit<SporefallGuide, 'mechanics'> & {
  mechanics: (SporefallMechanic & { targetId?: string })[];
  realmPlan: {
    title: GuideText; setup: GuideText;
    realms: { id: string; title: GuideText; body: GuideText }[];
    rotation: { id: string; title: GuideText; body: GuideText }[];
    returnNote: GuideText;
  };
};
export const dreamriftGuide: DreamriftGuide = {
  "name": {
    "ru": "Химерий",
    "en": "Chimaerus"
  },
  "raidName": {
    "ru": "Провал снов",
    "en": "The Dreamrift"
  },
  "reviewedAt": "2026-11-04",
  "goal": {
    "ru": "Одна группа разбивает щиты порождений в Альн. Другая убивает их в реальности, прежде чем они дойдут до босса.",
    "en": "One team breaks manifestation shields in Aln. The other kills them in Reality before they reach the boss."
  },
  "priorities": [
    {
      "id": "upheaval",
      "title": {
        "ru": "Входите только своей группой",
        "en": "Enter with your assigned team"
      },
      "body": {
        "ru": "На Встряску пыли Альн назначенная группа собирается в круге танка; другая остаётся снаружи.",
        "en": "For Alndust Upheaval, the assigned team gathers inside the tank’s circle; the other stays out."
      }
    },
    {
      "id": "shroud",
      "title": {
        "ru": "Щит в Альн, убийство в реальности",
        "en": "Shield in Aln, kill in Reality"
      },
      "body": {
        "ru": "После снятия щита враг переходит в другой мир. Группа в реальности сразу добивает его.",
        "en": "Removing a shield sends the enemy into the other realm. The Reality team finishes it immediately."
      }
    },
    {
      "id": "flight",
      "title": {
        "ru": "Убейте всех до приземления",
        "en": "Kill every add before landing"
      },
      "body": {
        "ru": "Уходите с линии пролёта босса и добивайте новых врагов до Голодного пикирования.",
        "en": "Leave the boss’s flight path and finish new enemies before Ravenous Dive."
      }
    }
  ],
  "flow": [
    {
      "id": "prepare",
      "title": {
        "ru": "Разделитесь на две группы",
        "en": "Split into two teams"
      },
      "body": {
        "ru": "В каждой — один танк, часть целителей и бойцов. Заранее назначьте первую и вторую группу.",
        "en": "Each team needs one tank, a share of the healers and damage dealers. Assign which team goes first."
      }
    },
    {
      "id": "enter",
      "title": {
        "ru": "Первая группа входит в Альн",
        "en": "The first team enters Aln"
      },
      "body": {
        "ru": "Она делит удар в круге танка и получает Проницательность Альн на 40 секунд. Оставшийся танк забирает босса.",
        "en": "It shares the hit inside the tank’s circle and gains Alnsight for 40 seconds. The remaining tank takes the boss."
      }
    },
    {
      "id": "transfer",
      "title": {
        "ru": "Передавайте врагов между мирами",
        "en": "Pass enemies between realms"
      },
      "body": {
        "ru": "В Альн сначала разбейте щит колосса. В реальности сразу убивайте каждого появившегося врага. Следующую Встряску принимает другая группа.",
        "en": "In Aln, break the Horror’s shield first. In Reality, immediately kill each arriving enemy. The other team takes the next Upheaval."
      }
    },
    {
      "id": "consume",
      "title": {
        "ru": "На 100 энергии — Поглощение",
        "en": "At 100 energy — Consume"
      },
      "body": {
        "ru": "Добейте порождения до конца применения. Босс отбрасывает группу и взлетает.",
        "en": "Finish manifestations before the channel ends. The boss knocks the group back and takes flight."
      }
    },
    {
      "id": "return",
      "title": {
        "ru": "Уклонитесь и добейте прислужников",
        "en": "Dodge and finish the minions"
      },
      "body": {
        "ru": "Во время пролётов обе группы убивают появляющихся врагов в реальности. До приземления никого не оставляйте в живых. Затем повторите цикл.",
        "en": "During the flyovers, both teams kill new enemies in Reality. Leave none alive before the landing, then repeat the cycle."
      }
    }
  ],
  "realmPlan": {
    "title": {
      "ru": "Две группы, два мира",
      "en": "Two teams, two realms"
    },
    "setup": {
      "ru": "Разделите танков, целителей и бойцов поровну. Группы по очереди принимают Встряску пыли Альн.",
      "en": "Split tanks, healers and damage dealers evenly. Teams take turns sharing Alndust Upheaval."
    },
    "realms": [
      {
        "id": "aln",
        "title": {
          "ru": "Альн: разбейте щиты",
          "en": "Aln: break the shields"
        },
        "body": {
          "ru": "Следуйте за своим танком к колоссу. Разбитый щит отправляет врага в реальность и оставляет лужу.",
          "en": "Follow your tank to the Horror. A broken shield sends the enemy to Reality and leaves a pool."
        }
      },
      {
        "id": "reality",
        "title": {
          "ru": "Реальность: добейте врагов",
          "en": "Reality: finish the enemies"
        },
        "body": {
          "ru": "Держите босса на противоположной стороне. Убивайте пришедших порождений раньше, чем они дойдут до него.",
          "en": "Keep the boss on the opposite side. Kill arriving manifestations before they reach him."
        }
      }
    ],
    "rotation": [
      {
        "id": "first",
        "title": {
          "ru": "Встряска: группа 1",
          "en": "Upheaval: team 1"
        },
        "body": {
          "ru": "В круг входит только первая группа вместе со своим танком.",
          "en": "Only the first team enters the circle with its tank."
        }
      },
      {
        "id": "second",
        "title": {
          "ru": "Следующая Встряска: группа 2",
          "en": "Next Upheaval: team 2"
        },
        "body": {
          "ru": "Первая группа не повторяет вход: после Альн остаётся уязвимость к следующему удару.",
          "en": "The first team does not enter again: Aln leaves vulnerability to the next hit."
        }
      }
    ],
    "returnNote": {
      "ru": "Проницательность Альн длится 40 секунд, затем вы возвращаетесь. Целитель из другого мира не сможет помочь — держитесь со своей группой.",
      "en": "Alnsight lasts 40 seconds, then you return. A healer in the other realm cannot help you: stay with your team."
    }
  },
  "roles": {
    "tank": {
      "position": {
        "ru": "Босс у одного края, порождения — на противоположной стороне. Оставьте за собой место для отбрасывания.",
        "en": "Keep the boss at one side and manifestations at the opposite side. Leave room behind you for knockback."
      },
      "actions": [
        {
          "ru": "Перед Встряской соберите свою группу в круге. Второй танк забирает босса, когда вы уходите в Альн.",
          "en": "Gather your assigned team in the circle before Upheaval. The other tank takes the boss as you enter Aln."
        },
        {
          "ru": "В Альн держите колосса вдали от босса и применяйте защиту перед Неимоверными ударами.",
          "en": "In Aln, tank the Horror far from the boss and use mitigation before Colossal Strikes."
        }
      ]
    },
    "healer": {
      "position": {
        "ru": "Идите в тот же мир, что и назначенная группа: лечение между мирами не проходит.",
        "en": "Enter the same realm as your assigned team: healing does not cross realms."
      },
      "actions": [
        {
          "ru": "После появления порождений лечением снимайте поглощение Хвори Провала. Едкая мокрота тоже наносит периодический урон всей группе.",
          "en": "After manifestations spawn, heal through Rift Sickness’s healing absorb. Caustic Phlegm also deals ongoing damage to the whole group."
        },
        {
          "ru": "Готовьте групповое лечение к Поглощению и защиту танка к ударам колосса.",
          "en": "Prepare group healing for Consume and tank support for the Horror’s strikes."
        }
      ],
      "heroic": {
        "ru": "Снимайте миазмы только когда игрок отошёл от союзников и накрыл кругом лужу.",
        "en": "Dispel Miasma only once the player is away from allies and their circle overlaps a pool."
      }
    },
    "melee": {
      "position": {
        "ru": "У босса держитесь сбоку или сзади; в Альн — рядом с танком и колоссом.",
        "en": "Stay beside or behind the boss; in Aln, stay near your tank and the Horror."
      },
      "actions": [
        {
          "ru": "В Альн разбивайте щиты, начиная с колосса; в реальности сразу переключайтесь на пришедших врагов.",
          "en": "In Aln, break shields, starting with the Horror; in Reality, immediately switch to arriving enemies."
        },
        {
          "ru": "Прерывайте Пугающий крик назначенной сущности. Выходите из направленного удара босса, даже если он повернулся к вам.",
          "en": "Interrupt your assigned Essence’s Fearsome Cry. Leave the boss’s frontal attack, including when he turns toward you."
        }
      ]
    },
    "ranged": {
      "position": {
        "ru": "В реальности выбирайте место, откуда достаёте до порождений до их подхода к боссу. В Альн не отставайте от своей группы.",
        "en": "In Reality, stand where you can hit manifestations before they reach the boss. In Aln, stay with your team."
      },
      "actions": [
        {
          "ru": "Добивайте дальних порождений; урон по боссу подождёт.",
          "en": "Finish distant manifestations; boss damage can wait."
        },
        {
          "ru": "Для прерывания подойдите на дальность своей способности. На пролётах сначала уйдите с опасной линии.",
          "en": "Move within your ability’s range to interrupt. During flyovers, leave the dangerous lane first."
        }
      ],
      "heroic": {
        "ru": "С миазмами отойдите к луже, не заходя в неё, и сообщите целителю, когда готовы к снятию.",
        "en": "With Miasma, approach a pool without entering it and tell your healer when you are ready for a dispel."
      }
    }
  },
  "mechanics": [
    {
      "id": "upheaval",
      "spellId": 1262305,
      "name": {
        "ru": "Встряска пыли Альн",
        "en": "Alndust Upheaval"
      },
      "signal": {
        "ru": "Вокруг танка появляется большой круг.",
        "en": "A large circle appears around the tank."
      },
      "response": {
        "ru": "Назначенная группа входит в круг радиусом 10 м и делит удар. Она уходит в Альн на 40 секунд. Другие остаются снаружи. Чередуйте группы: уязвимость к повторному удару длится 1,5 минуты.",
        "en": "The assigned team enters the 10 yd circle and shares the hit, entering Aln for 40 seconds. Everyone else stays out. Alternate teams: vulnerability to another hit lasts 1.5 minutes."
      },
      "counters": [],
      "counterRoles": [],
      "spellIcon": "/assets/wow/raids/midnight/spells/1262305.jpg"
    },
    {
      "id": "shroud",
      "spellId": 1245727,
      "name": {
        "ru": "Пелена Альн",
        "en": "Alnshroud"
      },
      "signal": {
        "ru": "В Альн видны порождения со щитами.",
        "en": "Shielded manifestations appear in Aln."
      },
      "response": {
        "ru": "Сначала атакуйте щит Чудовищного колосса. После разрушения щита враг переходит в реальность; оставшаяся там группа убивает его. Не дайте ему дойти до босса. Обходите лужу на месте снятого щита.",
        "en": "Attack the Colossal Horror’s shield first. Breaking a shield sends the enemy to Reality, where the other team kills it. Do not let it reach the boss. Avoid the pool left where the shield broke."
      },
      "counters": [],
      "counterRoles": []
    },
    {
      "id": "fear",
      "spellId": 1249017,
      "name": {
        "ru": "Пугающий крик",
        "en": "Fearsome Cry"
      },
      "signal": {
        "ru": "Навязчивая сущность начинает Пугающий крик.",
        "en": "A Haunting Essence begins Fearsome Cry."
      },
      "response": {
        "ru": "Прервите крик: иначе он нанесёт урон и обратит игроков в бегство. Договоритесь об очереди прерываний. Свободные прерывания используйте на Стрелу сущности.",
        "en": "Interrupt the cry or it will damage and fear players. Assign an interrupt order. Use spare interrupts on Essence Bolt."
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
      "targetId": "haunting-essence",
      "spellIcon": "/assets/wow/raids/reviewed-spells/1249017.jpg"
    },
    {
      "id": "fear-rescue",
      "spellId": 1249017,
      "name": {
        "ru": "Если крик прошёл",
        "en": "If the cry completes"
      },
      "signal": {
        "ru": "Игроки бегут под действием страха.",
        "en": "Players flee under the fear effect."
      },
      "response": {
        "ru": "Целитель снимает магический страх с союзников в своём мире. Это запасной ответ на пропущенный крик; следующий нужно прервать.",
        "en": "A healer dispels the magic fear from allies in their realm. This is recovery from a missed cry; interrupt the next one."
      },
      "counters": [
        "magic"
      ],
      "counterRoles": [
        "healer"
      ],
      "spellIcon": "/assets/wow/raids/reviewed-spells/1249017.jpg"
    },
    {
      "id": "horror",
      "spellId": 1262020,
      "name": {
        "ru": "Неимоверные удары",
        "en": "Colossal Strikes"
      },
      "signal": {
        "ru": "Колосс готовит серию ударов по танку.",
        "en": "The Horror prepares a series of hits on the tank."
      },
      "response": {
        "ru": "Танк применяет снижение урона перед серией. Группа быстро разбивает щит колосса: затянувшийся бой с ним усиливает давление на целителей.",
        "en": "The tank uses damage reduction before the series. The team breaks the Horror’s shield quickly: a prolonged fight increases healing pressure."
      },
      "counters": [
        "defend"
      ],
      "counterRoles": [
        "tank"
      ],
      "targetId": "colossal-horror",
      "spellIcon": "/assets/wow/raids/midnight/spells/1262020.jpg"
    },
    {
      "id": "tear",
      "spellId": 1272726,
      "name": {
        "ru": "Терзающий разрыв",
        "en": "Rending Tear"
      },
      "signal": {
        "ru": "Босс разворачивается и готовит удар перед собой.",
        "en": "The boss turns and prepares a frontal attack."
      },
      "response": {
        "ru": "Выйдите из сектора перед боссом до удара. Целью может стать ближайший игрок, поэтому следите за поворотом, а не только за позицией танка. Попадание вызывает кровотечение и отбрасывает.",
        "en": "Leave the cone in front of the boss before the hit. A nearby player can be targeted, so watch his turn rather than relying on the tank’s position. The hit causes bleeding and knocks you back."
      },
      "counters": [],
      "counterRoles": [],
      "spellIcon": "/assets/wow/raids/reviewed-spells/1272726.jpg"
    },
    {
      "id": "sickness",
      "spellId": 1250953,
      "name": {
        "ru": "Хворь Провала",
        "en": "Rift Sickness"
      },
      "signal": {
        "ru": "Появление порождений накладывает поглощение лечения.",
        "en": "Manifestations appearing apply a healing absorb."
      },
      "response": {
        "ru": "Целители восполняют здоровье и снимают поглощение дополнительным лечением. Это не щит врага и не заклинание для прерывания.",
        "en": "Healers restore health and clear the absorb with additional healing. This is neither an enemy shield nor a cast to interrupt."
      },
      "counters": [],
      "counterRoles": [],
      "spellIcon": "/assets/wow/raids/midnight/spells/1250953.jpg"
    },
    {
      "id": "miasma",
      "spellId": 1257087,
      "name": {
        "ru": "Всепоглощающие миазмы",
        "en": "Consuming Miasma"
      },
      "signal": {
        "ru": "На игроке появляется круг миазм.",
        "en": "A player gains a Miasma circle."
      },
      "response": {
        "ru": "Отойдите от союзников и накройте кругом лужу; стоять внутри лужи не нужно. Когда в радиусе 10 м нет других игроков, целитель снимает магический эффект. Снятие очищает лужи, но наносит урон и отбрасывает тех, кто рядом.",
        "en": "Move away from allies and overlap a pool with your circle; you do not need to stand in the pool. Once no other players are within 10 yd, a healer dispels the magic effect. The dispel clears pools but damages and knocks back nearby players."
      },
      "counters": [
        "magic"
      ],
      "counterRoles": [
        "healer"
      ],
      "heroicOnly": true,
      "spellIcon": "/assets/wow/raids/reviewed-spells/1257087.jpg"
    },
    {
      "id": "consume",
      "spellId": 1245396,
      "name": {
        "ru": "Поглощение",
        "en": "Consume"
      },
      "signal": {
        "ru": "Босс набирает 100 энергии.",
        "en": "The boss reaches 100 energy."
      },
      "response": {
        "ru": "Добейте всех порождений до окончания Поглощения, даже далёких от босса. Целители поддерживают группу во время общего урона. После отбрасывания начинается полёт.",
        "en": "Finish every manifestation before Consume ends, including those far from the boss. Healers sustain the group through the damage. Flight begins after the knockback."
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
      "spellIcon": "/assets/wow/raids/reviewed-spells/1245396.jpg"
    },
    {
      "id": "flight",
      "spellId": 1245486,
      "name": {
        "ru": "Опустошение порчи",
        "en": "Corrupted Devastation"
      },
      "signal": {
        "ru": "Босс взлетает; через арену проходит линия его дыхания.",
        "en": "The boss takes flight; his breath marks a lane across the arena."
      },
      "response": {
        "ru": "Уйдите с линии пролёта и убивайте появляющихся порождений. На обычной и героической сложности здесь обе группы действуют в реальности. До Голодного пикирования убейте всех: при посадке босс поглотит выживших. На обычной сложности приземление также убирает лужи.",
        "en": "Leave the flight lane and kill the new manifestations. On Normal and Heroic, both teams work in Reality here. Kill every add before Ravenous Dive: the boss consumes survivors on landing. On Normal, landing also removes the pools."
      },
      "counters": [],
      "counterRoles": [],
      "heroic": {
        "ru": "На героической сложности посадка не очищает лужи. Продолжайте освобождать место снятием миазм.",
        "en": "On Heroic, landing does not clear pools. Keep clearing space with Miasma dispels."
      },
      "spellIcon": "/assets/wow/raids/midnight/spells/1245486.jpg"
    }
  ],
  "adds": [
    {
      "id": "colossal-horror",
      "npcId": 257691,
      "name": {
        "ru": "Чудовищный колосс",
        "en": "Colossal Horror"
      },
      "portrait": "/assets/wow/raids/dreamrift/enemies/257691.webp",
      "description": {
        "ru": "Крупное порождение, которому нужен танк.",
        "en": "A large manifestation that needs a tank."
      },
      "action": {
        "ru": "В Альн разбейте его щит первым. Танк готовит защиту к Неимоверным ударам.",
        "en": "In Aln, break its shield first. The tank prepares mitigation for Colossal Strikes."
      },
      "death": {
        "ru": "Разрушение щита отправляет его в реальность. Убейте там до подхода к боссу.",
        "en": "Breaking its shield sends it to Reality. Kill it there before it reaches the boss."
      }
    },
    {
      "id": "haunting-essence",
      "npcId": 256803,
      "name": {
        "ru": "Навязчивая сущность",
        "en": "Haunting Essence"
      },
      "portrait": "/assets/wow/raids/dreamrift/enemies/256803.webp",
      "description": {
        "ru": "Появляется с первой воздушной фазы. Применяет Пугающий крик и Стрелу сущности.",
        "en": "Appears from the first flight phase onwards. Casts Fearsome Cry and Essence Bolt."
      },
      "action": {
        "ru": "Прерывайте Пугающий крик в первую очередь; свободными прерываниями останавливайте Стрелу сущности.",
        "en": "Prioritize interrupting Fearsome Cry; use spare interrupts on Essence Bolt."
      },
      "death": {
        "ru": "Разрушение щита отправляет его в реальность. Убейте там до подхода к боссу.",
        "en": "Breaking its shield sends it to Reality. Kill it there before it reaches the boss."
      },
      "cast": {
        "spellId": 1249017,
        "name": {
          "ru": "Пугающий крик",
          "en": "Fearsome Cry"
        },
        "description": {
          "ru": "Урон по игрокам и страх.",
          "en": "Damages and fears players."
        },
        "action": {
          "ru": "Прервите заклинание в свою очередь.",
          "en": "Interrupt the cast on your turn."
        }
      }
    },
    {
      "id": "swarming-shade",
      "npcId": 256804,
      "name": {
        "ru": "Тень из роя",
        "en": "Swarming Shade"
      },
      "portrait": "/assets/wow/raids/dreamrift/enemies/256804.webp",
      "description": {
        "ru": "Мелкое порождение, которое после снятия щита идёт к боссу.",
        "en": "A small manifestation that heads toward the boss after losing its shield."
      },
      "action": {
        "ru": "В Альн бейте теней атаками по области рядом с колоссом. В реальности быстро добивайте.",
        "en": "In Aln, use area attacks on Shades gathered near the Horror. Finish them quickly in Reality."
      },
      "death": {
        "ru": "Разрушение щита отправляет его в реальность. Убейте там до подхода к боссу.",
        "en": "Breaking its shield sends it to Reality. Kill it there before it reaches the boss."
      }
    }
  ],
  "diagram": {
    "caption": {
      "ru": "Босс у края, порождения — напротив. Группа в Альн снимает щиты; группа в реальности добивает врагов.",
      "en": "Boss at one side, manifestations opposite. The Aln team breaks shields; the Reality team finishes enemies."
    },
    "heroicCaption": {
      "ru": "Босс и порождения остаются по разным сторонам. Миазмы снимайте у луж, отдельно от группы.",
      "en": "Keep boss and manifestations on opposite sides. Dispel Miasma near pools, away from the group."
    },
    "steps": [
      {
        "title": {
          "ru": "Щит → другой мир",
          "en": "Shield → other realm"
        },
        "body": {
          "ru": "Снятие щита не убивает врага: он появляется в реальности.",
          "en": "Breaking a shield does not kill the enemy: it appears in Reality."
        }
      },
      {
        "title": {
          "ru": "Путь к боссу",
          "en": "Path to the boss"
        },
        "body": {
          "ru": "Чем дальше порождение от босса, тем больше времени у группы на его убийство.",
          "en": "The farther a manifestation is from the boss, the more time the team has to kill it."
        }
      }
    ]
  },
  "sources": [
    {
      "title": "Method / Purke — Heroic, 14 Mar 2026",
      "url": "https://www.method.gg/guides/the-dreamrift/chimaerus-the-undreamt-god-heroic"
    },
    {
      "title": "Panthea — Normal / Heroic",
      "url": "https://www.icy-veins.com/wow/chimaerus-raid-guide"
    },
    {
      "title": "Game Encounter Journal — Chimaerus",
      "url": "https://www.wowhead.com/npc=256116"
    },
    {
      "title": "Alnshroud",
      "url": "https://www.wowhead.com/spell=1245727"
    },
    {
      "title": "Fearsome Cry",
      "url": "https://www.wowhead.com/spell=1249017"
    },
    {
      "title": "Consuming Miasma",
      "url": "https://www.wowhead.com/spell=1257087"
    },
    {
      "title": "Ravenous Dive",
      "url": "https://www.wowhead.com/spell=1245406"
    }
  ]
};
