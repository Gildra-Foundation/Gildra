import type { GuideText } from './voidspireVideoGuide';
import type { SporefallGuide, SporefallMechanic } from './sporefallGuide';

export type QueldanasGuideBoss = Omit<SporefallGuide, 'mechanics' | 'diagram'> & {
  id: 'beloren' | 'midnight-falls';
  image: string;
  mechanics: (SporefallMechanic & { targetId?: string })[];
  diagram: Omit<SporefallGuide['diagram'], 'steps'> & {
    title: GuideText;
    steps: { id: string; title: GuideText; body: GuideText }[];
  };
};

// Journal difficulty flags take precedence over older strategy articles.
// Review evidence: gildra-queldanas-guide-20261104/research.md, 2026-11-04.
export const queldanasGuide: {
  raidName: GuideText;
  bosses: QueldanasGuideBoss[];
  sources: { title: string; url: string }[];
} = {
  "raidName": {
    "ru": "Марш на Кель'Данас",
    "en": "March on Quel'Danas"
  },
  "bosses": [
    {
      "id": "beloren",
      "image": "/assets/wow/raids/midnight/bosses/beloren.jpg",
      "name": {
        "ru": "Бело'рен Дитя Ал'ара",
        "en": "Belo'ren, Child of Al'ar"
      },
      "raidName": {
        "ru": "Марш на Кель'Данас",
        "en": "March on Quel'Danas"
      },
      "reviewedAt": "2026-11-04",
      "goal": {
        "ru": "Подбирайте цвет к каждой атаке. Убивайте прислужников вместе с их яйцами, а главный урон сохраняйте для яйца Бело'рена.",
        "en": "Match each attack with your feather colour. Kill the embers and their eggs; save your strongest damage for Belo'ren’s egg."
      },
      "priorities": [
        {
          "id": "colours",
          "title": {
            "ru": "Следите за своим пером",
            "en": "Check your feather"
          },
          "body": {
            "ru": "После слияния проверьте цвет: он может смениться. Принимайте атаки и прерывайте извержения своего цвета.",
            "en": "Your colour can change after Convergence. Take matching attacks and interrupt matching eruptions."
          }
        },
        {
          "id": "dive",
          "title": {
            "ru": "Круг — к краю, помощь — своего цвета",
            "en": "Take the circle out; match its colour"
          },
          "body": {
            "ru": "Отнесите круг к свободному внешнему краю. Игроки того же цвета входят вместе с вами, затем все выходят из оставшейся зоны.",
            "en": "Move the circle to a clear outer edge. Matching players join you, then everyone leaves the pool."
          }
        },
        {
          "id": "rebirth",
          "title": {
            "ru": "Главный урон — в яйцо босса",
            "en": "Save damage for the boss egg"
          },
          "body": {
            "ru": "Феникс возрождается; победу приближает урон по его яйцу. Сохраняйте для него сильные атакующие способности.",
            "en": "The phoenix returns; damaging its egg makes lasting progress. Save major offensive abilities for it."
          }
        }
      ],
      "flow": [
        {
          "id": "start",
          "title": {
            "ru": "Перо Света или Бездны",
            "en": "Light or Void Feather"
          },
          "body": {
            "ru": "После начала боя найдите свой цвет. Танки держат босса лицом от остальных; группы Света и Бездны готовятся помочь своему кругу.",
            "en": "Check your colour at the start. Tanks face the boss away from everyone else; Light and Void groups prepare for their matching circles."
          }
        },
        {
          "id": "embers",
          "title": {
            "ru": "Круг → уголь → маленькое яйцо",
            "en": "Circle → ember → small egg"
          },
          "body": {
            "ru": "Разделите удар круга игроками нужного цвета. Убейте появившегося угля, прервите его извержение и сразу добейте оставшееся яйцо.",
            "en": "Share the circle with matching players. Kill its ember, interrupt its eruption, then immediately finish the egg it leaves."
          }
        },
        {
          "id": "impact",
          "title": {
            "ru": "Феникс падает в центр",
            "en": "The phoenix falls into the centre"
          },
          "body": {
            "ru": "Когда здоровье феникса закончится, отойдите от центра: расстояние уменьшает удар и подбрасывание.",
            "en": "When the phoenix runs out of health, move away from the centre to reduce the impact and knock-up."
          }
        },
        {
          "id": "egg",
          "title": {
            "ru": "Атакуйте яйцо",
            "en": "Attack the egg"
          },
          "body": {
            "ru": "Бейте яйцо босса сильными способностями. При разметке пола переходите в сектор своего цвета и открывайте проходы в шарах.",
            "en": "Use major damage abilities on the boss egg. Move into matching floor sectors and open gaps in matching orbs."
          }
        },
        {
          "id": "repeat",
          "title": {
            "ru": "Феникс возвращается",
            "en": "The phoenix returns"
          },
          "body": {
            "ru": "Если яйцо не уничтожено, повторите цикл. Следите за новым цветом и продолжайте быстро убивать прислужников: лечение постепенно усложняется.",
            "en": "If the egg survives, repeat the cycle. Recheck your colour and keep killing embers quickly as healing becomes harder."
          }
        }
      ],
      "roles": {
        "tank": {
          "position": {
            "ru": "Держите босса лицом от группы. У каждого танка свой цвет; перед цветным ударом освободите место второму танку.",
            "en": "Face the boss away from the group. Each tank has a colour; leave room for the other tank to take their coloured strike."
          },
          "actions": [
            {
              "ru": "При «Указе стража» принимайте только удар своего цвета и используйте защиту. Ни один конус не должен остаться пустым.",
              "en": "For Guardian’s Edict, take your matching strike with mitigation. Never leave a cone empty."
            },
            {
              "ru": "Подводите босса к углю, если рядом нет луж: группе будет проще атаковать обе цели.",
              "en": "Bring the boss near an ember when the area is clear so the group can damage both."
            }
          ]
        },
        "healer": {
          "position": {
            "ru": "Держитесь сбоку от босса в пределах лечения обеих цветовых групп. Входите только в подходящий вам круг.",
            "en": "Stay beside the boss within healing range of both colour groups. Join only matching circles."
          },
          "actions": [
            {
              "ru": "Полностью восполняйте поглощённое «Вечными ожогами» лечение: эффект закончится после лечения.",
              "en": "Heal through Eternal Burns completely; healing removes the absorb."
            },
            {
              "ru": "Планируйте сильное лечение на слияние и фазу яйца. Во время падения феникса сначала отойдите от центра.",
              "en": "Plan strong healing for Convergence and the egg phase. Move away from the centre before the phoenix lands."
            }
          ]
        },
        "melee": {
          "position": {
            "ru": "Атакуйте сбоку или сзади босса, оставляя перед ним место танкам. При круге своего цвета подойдите к отмеченному игроку.",
            "en": "Attack from the boss’s side or rear, leaving the front to tanks. Join a marked player when the circle matches you."
          },
          "actions": [
            {
              "ru": "Сначала убейте угля и его яйцо. Прерывайте извержение, только если ваше перо совпадает с цветом угля.",
              "en": "Kill the ember and its egg first. Interrupt its eruption only when your feather matches its colour."
            },
            {
              "ru": "Сохраните сильные атакующие способности для яйца Бело'рена. В цветных секторах важнее занять свой цвет, чем оставаться у цели.",
              "en": "Save major offensive abilities for Belo'ren’s egg. Matching a floor sector takes priority over staying in melee range."
            }
          ]
        },
        "ranged": {
          "position": {
            "ru": "Стойте сбоку от босса ближе к свободной внешней части арены, но в пределах лечения. Не занимайте старые лужи.",
            "en": "Stand to the boss’s side toward a clear outer area, within healing range. Keep out of old pools."
          },
          "actions": [
            {
              "ru": "Получив большой круг, отнесите его к свободному краю и дождитесь игроков своего цвета.",
              "en": "Take your large circle to a clear edge and wait for matching players."
            },
            {
              "ru": "Переключайтесь с босса на угля, затем на его яйцо. Открывайте проход через шары только своим цветом.",
              "en": "Switch from the boss to the ember, then its egg. Open gaps through orbs only with your matching colour."
            }
          ]
        }
      },
      "mechanics": [
        {
          "id": "colours",
          "spellId": 1242515,
          "name": {
            "ru": "Мракозарное слияние",
            "en": "Voidlight Convergence"
          },
          "signal": {
            "ru": "Босс применяет «Мракозарное слияние»; на вас появляется перо Света или Бездны.",
            "en": "Voidlight Convergence gives you a Light or Void Feather."
          },
          "response": {
            "ru": "Проверьте новый цвет. Свет принимает светлые атаки, Бездна — тёмные. При следующем слиянии цвет может измениться.",
            "en": "Check your new colour. Light players handle Light attacks; Void players handle Void attacks. Recheck after each Convergence."
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
          "spellIcon": "/assets/wow/raids/reviewed-spells/1242515.jpg"
        },
        {
          "id": "dive",
          "spellId": 1241292,
          "name": {
            "ru": "Полет Света / Полет Бездны",
            "en": "Light Dive / Void Dive"
          },
          "signal": {
            "ru": "Вокруг выбранного игрока появляется большой светлый или тёмный круг.",
            "en": "A large Light or Void circle appears around a chosen player."
          },
          "response": {
            "ru": "С кругом идите к свободному внешнему краю. Игроки такого же цвета входят внутрь и делят удар. После падения угля все сразу выходят из лужи: она растёт.",
            "en": "Take the circle to a clear outer edge. Matching players join to share the impact. Once the ember lands, everyone leaves the growing pool."
          },
          "counters": [],
          "counterRoles": []
        },
        {
          "id": "light-eruption",
          "spellId": 1243852,
          "name": {
            "ru": "Извержение Света",
            "en": "Light Eruption"
          },
          "signal": {
            "ru": "Уголь Света начинает «Извержение Света».",
            "en": "A Light Ember starts Light Eruption."
          },
          "response": {
            "ru": "Прервите заклинание, если у вас «Перо Света». С пером Бездны поручите прерывание светлому игроку. Убейте угля и сразу его яйцо.",
            "en": "Interrupt only with Light Feather. With Void Feather, leave the interrupt to a Light player. Kill the ember, then its egg."
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
          "targetId": "light-ember"
        },
        {
          "id": "void-eruption",
          "spellId": 1243854,
          "name": {
            "ru": "Извержение Бездны",
            "en": "Void Eruption"
          },
          "signal": {
            "ru": "Уголь Бездны начинает «Извержение Бездны».",
            "en": "A Void Ember starts Void Eruption."
          },
          "response": {
            "ru": "Прервите заклинание, если у вас «Перо Бездны». С пером Света поручите прерывание тёмному игроку. Убейте угля и сразу его яйцо.",
            "en": "Interrupt only with Void Feather. With Light Feather, leave the interrupt to a Void player. Kill the ember, then its egg."
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
          "targetId": "void-ember"
        },
        {
          "id": "echoes",
          "spellId": 1242981,
          "name": {
            "ru": "Сияющие отголоски",
            "en": "Radiant Echoes"
          },
          "signal": {
            "ru": "Через арену движется ряд светлых и тёмных шаров.",
            "en": "Rows of Light and Void orbs move across the arena."
          },
          "response": {
            "ru": "Игрок нужного цвета касается подходящего шара и открывает проход. Остальные проходят через свободное место; чужой цвет не перехватывайте.",
            "en": "A matching player touches an orb to open a gap. Everyone else uses the gap; never intercept the opposite colour."
          },
          "counters": [],
          "counterRoles": []
        },
        {
          "id": "edict",
          "spellId": 1260763,
          "name": {
            "ru": "Указ стража",
            "en": "Guardian's Edict"
          },
          "signal": {
            "ru": "Перед боссом появляются цветные конусы «Указа стража».",
            "en": "Guardian’s Edict sends coloured cones in front of the boss."
          },
          "response": {
            "ru": "Танк нужного цвета принимает каждый конус с защитой. Остальные уходят с линии удара. Пустой конус или неверный цвет усиливает босса.",
            "en": "The matching tank takes each cone with mitigation. Everyone else leaves its path. An empty cone or wrong colour empowers the boss."
          },
          "counters": [
            "defend"
          ],
          "counterRoles": [
            "tank"
          ],
          "spellIcon": "/assets/wow/raids/reviewed-spells/1260763.jpg"
        },
        {
          "id": "burns",
          "spellId": 1244344,
          "name": {
            "ru": "Вечные ожоги",
            "en": "Eternal Burns"
          },
          "signal": {
            "ru": "На игроке появляется поглощение лечения и периодический урон.",
            "en": "A player gains a healing absorb and damage over time."
          },
          "response": {
            "ru": "Лекари восполняют всё поглощённое лечение, чтобы убрать ожог. Пострадавший помогает личной защитой; обычное снятие магии не заменяет лечение.",
            "en": "Healers heal through the absorb to end the burn. The affected player can use personal mitigation; a standard magic dispel does not replace healing."
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
          "id": "drop",
          "spellId": 1246709,
          "name": {
            "ru": "Смертельное пике",
            "en": "Death Drop"
          },
          "signal": {
            "ru": "Здоровье феникса закончилось; он взлетает перед ударом в центр.",
            "en": "The phoenix runs out of health and rises before crashing into the centre."
          },
          "response": {
            "ru": "Отбегите от центра, избегая старых луж. Чем дальше от места падения, тем слабее урон и подбрасывание.",
            "en": "Move away from the centre without entering old pools. Greater distance reduces the damage and knock-up."
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
          "id": "rebirth",
          "spellId": 1241313,
          "name": {
            "ru": "Возрождение",
            "en": "Rebirth"
          },
          "signal": {
            "ru": "Вместо феникса в центре остаётся большое яйцо.",
            "en": "A large egg replaces the phoenix in the centre."
          },
          "response": {
            "ru": "Направьте главный урон в яйцо: это уменьшает запас его возрождения. Во время цветной разметки пола стойте в секторе своего пера. После возвращения феникса повторите цикл.",
            "en": "Focus your strongest damage on the egg to deplete its rebirth energy. During coloured floor patterns, stand in your feather’s sector. Repeat the cycle if the phoenix returns."
          },
          "counters": [],
          "counterRoles": [],
          "spellIcon": "/assets/wow/raids/midnight/spells/1241313.jpg"
        },
        {
          "id": "quills",
          "spellId": 1242260,
          "name": {
            "ru": "Насыщенные иглы",
            "en": "Infused Quills"
          },
          "signal": {
            "ru": "От босса к игроку направлена светлая или тёмная игла.",
            "en": "A Light or Void quill is aimed from the boss at a player."
          },
          "response": {
            "ru": "Игрок цвета самой иглы встаёт между боссом и целью и принимает попадание. Цвет цели может быть противоположным — проверяйте именно иглу.",
            "en": "A player matching the quill stands between the boss and its target to intercept it. The target may have the opposite colour: match the quill itself."
          },
          "counters": [],
          "counterRoles": [],
          "heroicOnly": true
        }
      ],
      "adds": [
        {
          "id": "light-ember",
          "npcId": 246729,
          "name": {
            "ru": "Уголь Света",
            "en": "Light Ember"
          },
          "description": {
            "ru": "Светлый птенец появляется после светлого круга.",
            "en": "The Light hatchling appears after a Light circle."
          },
          "action": {
            "ru": "Убейте его вне оставшейся лужи. Прерывайте «Вспышку Света», а для опасного извержения назначьте игрока с пером Света.",
            "en": "Kill it outside the leftover pool. Interrupt Light Blast and assign a Light Feather player to its dangerous eruption."
          },
          "death": {
            "ru": "Оставляет маленькое яйцо: сразу убейте его, иначе уголь возродится.",
            "en": "Leaves a small egg: kill it immediately or the ember returns."
          },
          "portrait": "/assets/wow/raids/queldanas/enemies/246729.webp",
          "cast": {
            "spellId": 1243852,
            "name": {
              "ru": "Извержение Света",
              "en": "Light Eruption"
            },
            "description": {
              "ru": "Удар по всему рейду; прерывание зависит от цвета пера.",
              "en": "Raid-wide damage; interrupt eligibility depends on your feather."
            },
            "action": {
              "ru": "Прервите до окончания чтения, только если на вас «Перо Света».",
              "en": "Interrupt before the cast ends, only with Light Feather."
            }
          }
        },
        {
          "id": "void-ember",
          "npcId": 246728,
          "name": {
            "ru": "Уголь Бездны",
            "en": "Void Ember"
          },
          "description": {
            "ru": "Тёмный птенец появляется после тёмного круга.",
            "en": "The Void hatchling appears after a Void circle."
          },
          "action": {
            "ru": "Убейте его вне оставшейся лужи. Прерывайте «Вспышку Бездны», а для опасного извержения назначьте игрока с пером Бездны.",
            "en": "Kill it outside the leftover pool. Interrupt Void Blast and assign a Void Feather player to its dangerous eruption."
          },
          "death": {
            "ru": "Оставляет маленькое яйцо: сразу убейте его, иначе уголь возродится.",
            "en": "Leaves a small egg: kill it immediately or the ember returns."
          },
          "portrait": "/assets/wow/raids/queldanas/enemies/246728.webp",
          "cast": {
            "spellId": 1243854,
            "name": {
              "ru": "Извержение Бездны",
              "en": "Void Eruption"
            },
            "description": {
              "ru": "Удар по всему рейду; прерывание зависит от цвета пера.",
              "en": "Raid-wide damage; interrupt eligibility depends on your feather."
            },
            "action": {
              "ru": "Прервите до окончания чтения, только если на вас «Перо Бездны».",
              "en": "Interrupt before the cast ends, only with Void Feather."
            }
          }
        }
      ],
      "diagram": {
        "title": {
          "ru": "Две цветовые группы",
          "en": "Two colour groups"
        },
        "caption": {
          "ru": "Группа Света помогает светлому кругу, группа Бездны — тёмному. Перед боссом стоят только танки.",
          "en": "Light players help the Light circle; Void players help the Void circle. Only tanks stand in front of the boss."
        },
        "heroicCaption": {
          "ru": "Иглу перехватывает игрок её цвета между боссом и целью. Круги по-прежнему делят игроки совпадающего цвета.",
          "en": "A matching player intercepts each quill between the boss and its target. Circles still require matching players."
        },
        "steps": [
          {
            "id": "light",
            "title": {
              "ru": "Свет",
              "en": "Light"
            },
            "body": {
              "ru": "Светлый круг у свободного края → уголь → его яйцо.",
              "en": "Light circle at a clear edge → ember → its egg."
            }
          },
          {
            "id": "void",
            "title": {
              "ru": "Бездна",
              "en": "Void"
            },
            "body": {
              "ru": "Тёмный круг у свободного края → уголь → его яйцо.",
              "en": "Void circle at a clear edge → ember → its egg."
            }
          },
          {
            "id": "boss-egg",
            "title": {
              "ru": "Общая цель: яйцо босса",
              "en": "Shared target: the boss egg"
            },
            "body": {
              "ru": "После падения феникса обе группы атакуют яйцо, стоя в секторах своего цвета.",
              "en": "After the phoenix falls, both groups attack its egg from matching floor sectors."
            }
          }
        ]
      },
      "sources": [
        {
          "title": "Game journal: Belo'ren / Light Ember (Normal & Heroic)",
          "url": "https://www.wowhead.com/npc=246729"
        },
        {
          "title": "Method / Purke: Belo'ren Heroic",
          "url": "https://www.method.gg/guides/march-on-queldanas/beloren-child-of-alar-heroic"
        },
        {
          "title": "Icy Veins / Panthea: Belo'ren",
          "url": "https://www.icy-veins.com/wow/beloren-raid-guide"
        },
        {
          "title": "Live Light Eruption tooltip",
          "url": "https://www.wowhead.com/spell=1243852"
        },
        {
          "title": "Live Void Eruption tooltip",
          "url": "https://www.wowhead.com/spell=1243854"
        }
      ]
    },
    {
      "id": "midnight-falls",
      "image": "/assets/wow/raids/midnight/bosses/midnight-falls.jpg",
      "name": {
        "ru": "Торжество Полуночи — Л'ура",
        "en": "Midnight Falls — L'ura"
      },
      "raidName": {
        "ru": "Марш на Кель'Данас",
        "en": "March on Quel'Danas"
      },
      "reviewedAt": "2026-11-04",
      "goal": {
        "ru": "Сначала повторите порядок рун и сохраните светлые кристаллы. Затем разбейте ядра лучами. В финале держитесь в свете и тратьте по одному кристаллу на барьер.",
        "en": "First repeat the rune sequence and preserve the light crystals. Then break cores with beams. In the finale, stay in the light and spend one crystal per barrier."
      },
      "priorities": [
        {
          "id": "runes",
          "title": {
            "ru": "Руны — в показанном порядке",
            "en": "Put runes in the shown order"
          },
          "body": {
            "ru": "Получив руну, займите место в очереди по часовой стрелке от активного танка. Луч должен задеть руны в том же порядке, что показал босс.",
            "en": "With a rune, line up clockwise from the active tank. The beam must hit the runes in the order shown by the boss."
          }
        },
        {
          "id": "crystals",
          "title": {
            "ru": "Тёмные кристаллы убейте, светлые вылечите",
            "en": "Kill dark crystals; heal light ones"
          },
          "body": {
            "ru": "Бойцы уничтожают кристаллы полуночи. Лекари полностью лечат кристаллы сумерек; назначенные игроки подбирают полученные кристаллы зари.",
            "en": "Damage dealers destroy Midnight Crystals. Healers fully restore Dusk Crystals; assigned players collect the resulting Dawn Crystals."
          }
        },
        {
          "id": "archangel",
          "title": {
            "ru": "Один удар — один барьер",
            "en": "One blast, one barrier"
          },
          "body": {
            "ru": "На «Тёмного архангела» один носитель создаёт барьер дополнительной кнопкой. Все входят внутрь, затем вместе уходят от чёрной волны.",
            "en": "For Dark Archangel, one carrier uses their extra-action button to create a barrier. Everyone enters, then moves away from the black wave together."
          }
        }
      ],
      "flow": [
        {
          "id": "first",
          "title": {
            "ru": "1. Руны, матрицы и кристаллы",
            "en": "1. Runes, matrices and crystals"
          },
          "body": {
            "ru": "Держитесь вне центрального Колодца. Повторяйте порядок рун, прерывайте матрицы и разбирайте появившиеся кристаллы: тёмные убить, угасающие вылечить.",
            "en": "Keep out of the central well. Repeat rune sequences, interrupt matrices and handle the crystals they release: kill dark ones, heal fading ones."
          }
        },
        {
          "id": "transition",
          "title": {
            "ru": "Переход: затмение",
            "en": "Intermission: Eclipse"
          },
          "body": {
            "ru": "Разойдитесь так, чтобы звездные осколки не задевали соседей. Уходите от прямых лучей, оставайтесь в пределах лечения и не заходите в центр сами.",
            "en": "Spread so Starsplinter does not hit neighbours. Dodge straight beams, stay within healing range and do not enter the centre yourself."
          }
        },
        {
          "id": "cores",
          "title": {
            "ru": "2. Разбейте ядра лучами",
            "en": "2. Break the cores with beams"
          },
          "body": {
            "ru": "Босс сам переносит рейд внутрь Колодца. Направляйте отмеченные лучи в разные ядра с противоположных сторон. Не касайтесь ядер и не выходите за границу арены.",
            "en": "The boss takes the raid into the well. Aim marked beams at different cores on opposite sides. Do not touch the cores or cross the arena boundary."
          },
          "heroicBody": {
            "ru": "Внутри Колодца направляйте лучи в разные ядра. Каждая назначенная группа входит в свой луч, чтобы уменьшить общий урон. Носители временно кладут кристаллы вне лучей и сразу подбирают обратно.",
            "en": "Inside the well, aim beams at separate cores. Each assigned group joins its beam to reduce raid damage. Carriers briefly drop crystals outside the beams and pick them up immediately afterwards."
          }
        },
        {
          "id": "knock",
          "title": {
            "ru": "Перед финалом соберитесь",
            "en": "Group up before the finale"
          },
          "body": {
            "ru": "До 100 энергии поразите все ядра. Затем соберитесь с одной стороны: отбросит всех вместе, к носителям света.",
            "en": "Hit every core before 100 energy. Then gather on one side so the knockback sends everyone together toward the light carriers."
          }
        },
        {
          "id": "final",
          "title": {
            "ru": "3. Держитесь в свете",
            "en": "3. Stay in the light"
          },
          "body": {
            "ru": "Стойте рядом с носителями кристаллов. На каждый «Тёмный архангел» используйте один барьер, после удара вместе уходите из чёрной зоны. Избегайте звёзд и соединяющих их линий.",
            "en": "Stay near crystal carriers. Use one barrier for each Dark Archangel, then move out of the black area together. Avoid stars and the lines connecting them."
          },
          "heroicBody": {
            "ru": "Держитесь в свете носителей. На каждый «Тёмный архангел» используйте один барьер и вместе уходите от чёрной волны. Группами закройте все круги «Вытягивания Света», избегая линий созвездий.",
            "en": "Stay in the carriers’ light. Use one barrier per Dark Archangel and move away from the black wave together. Soak every Light Siphon circle in groups while avoiding constellation lines."
          }
        }
      ],
      "roles": {
        "tank": {
          "position": {
            "ru": "Держите Л'уру вне центрального Колодца. Ваше положение задаёт начало луча рун; не меняйте его, пока отмеченные игроки выстраиваются.",
            "en": "Keep L'ura outside the central well. Your position sets the rune beam’s starting point; stay predictable while marked players line up."
          },
          "actions": [
            {
              "ru": "Используйте защиту на серию «Небесного копья». Второй танк забирает босса после завершения серии.",
              "en": "Use mitigation for the Heaven’s Lance sequence. The other tank taunts after the sequence ends."
            },
            {
              "ru": "Двигайте босса вместе с рейдом вокруг вращающихся лучей. Во второй фазе направляйте свой луч в отдельное ядро.",
              "en": "Move the boss with the raid around rotating beams. In phase two, aim your beam at a separate core."
            }
          ]
        },
        "healer": {
          "position": {
            "ru": "Стойте в пределах лечения группы и кристаллов сумерек. В финале двигайтесь вместе с носителями света.",
            "en": "Stay within healing range of the group and Dusk Crystals. In the finale, move with the light carriers."
          },
          "actions": [
            {
              "ru": "Полностью вылечите кристаллы сумерек до их гибели. Носителей кристаллов зари продолжайте лечить: они получают постоянный урон.",
              "en": "Heal Dusk Crystals to full before they die. Keep healing Dawn Crystal carriers, who take ongoing damage."
            },
            {
              "ru": "На затмении снимайте поглощение лечением. Берегите сильное лечение для массового урона, а личную защиту — для опасных совпадений механик.",
              "en": "Heal through Eclipse absorbs. Save strong healing for raid damage and personal mitigation for dangerous overlaps."
            }
          ],
          "heroic": {
            "ru": "Помогайте закрывать назначенный луч «Гальванизации» и лечите группу после него.",
            "en": "Join your assigned Galvanize beam and heal the group afterwards."
          }
        },
        "melee": {
          "position": {
            "ru": "Держитесь у босса со стороны группы, не заходя в Колодец. На рунах освободите очередь отмеченным игрокам.",
            "en": "Stay near the boss on the group’s side, outside the well. Give marked rune players room to line up."
          },
          "actions": [
            {
              "ru": "Прерывайте «Охрану» у матриц. После разрушения призмы переключайтесь на кристаллы полуночи и убейте их до взрыва.",
              "en": "Interrupt Safeguard on matrices. When the prism breaks, switch to Midnight Crystals and kill them before they explode."
            },
            {
              "ru": "Во второй фазе направляйте отмеченный луч в своё ядро. В финале не выходите из света ради лишнего удара.",
              "en": "In phase two, aim a marked beam at your assigned core. In the finale, do not leave the light for an extra attack."
            }
          ],
          "heroic": {
            "ru": "Без метки луча всё равно помогайте своей группе разделить его урон.",
            "en": "Even without a beam mark, join your assigned group to share its damage."
          }
        },
        "ranged": {
          "position": {
            "ru": "Стойте на свободном участке внешнего кольца в пределах лечения. Оставляйте проход для рун и двигайтесь вместе с вращающимися лучами.",
            "en": "Stand in a clear part of the outer ring within healing range. Leave space for runes and move with rotating beams."
          },
          "actions": [
            {
              "ru": "Быстро переключайтесь на удалённые кристаллы полуночи. Если назначены носителем, подберите вылеченный кристалл зари и берегите его до финала.",
              "en": "Quickly switch to distant Midnight Crystals. If assigned as a carrier, collect a restored Dawn Crystal and preserve it for the finale."
            },
            {
              "ru": "С меткой «Звёздного осколка» отойдите от соседей так, чтобы линии не пересекали их; затем дайте им время выйти.",
              "en": "With Starsplinter, move so your lines do not cross neighbours, then give them time to move clear."
            }
          ],
          "heroic": {
            "ru": "Если несёте кристалл и должны принять луч, положите его рядом вне линии удара и сразу заберите после попадания.",
            "en": "If carrying a crystal when you must soak a beam, set it down beside the beam and retrieve it immediately after the hit."
          }
        }
      },
      "mechanics": [
        {
          "id": "runes",
          "spellId": 1244412,
          "name": {
            "ru": "Панихида смерти",
            "en": "Death's Dirge"
          },
          "signal": {
            "ru": "Босс показывает последовательность символов, затем такие же руны появляются над игроками.",
            "en": "The boss shows a sequence of symbols, then marks players with those runes."
          },
          "response": {
            "ru": "Запомните очередь. Отмеченные игроки выстраиваются по часовой стрелке от танка так, чтобы вращающийся луч задел их в показанном порядке. Остальные не мешают им занять места.",
            "en": "Remember the sequence. Marked players line up clockwise from the tank so the rotating beam hits them in that order. Everyone else leaves them room."
          },
          "counters": [],
          "counterRoles": [],
          "spellIcon": "/assets/wow/raids/reviewed-spells/1244412.jpg"
        },
        {
          "id": "matrices",
          "spellId": 1251392,
          "name": {
            "ru": "Охрана",
            "en": "Safeguard"
          },
          "signal": {
            "ru": "Вокруг Л'уры вращаются матрицы и читают «Охрану».",
            "en": "Matrices orbit L'ura and cast Safeguard."
          },
          "response": {
            "ru": "Прерывайте «Охрану»: каждое прерывание снимает заряд защиты матрицы. Уберите все заряды у каждой матрицы; вместо неё появятся кристаллы. Снятие положительной магии с врага также подходит, если такая способность есть.",
            "en": "Interrupt Safeguard: each interrupt removes a protective stack from the matrix. Remove every matrix’s stacks to release crystals. An offensive magic purge is another option if your class has one."
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
          "targetId": "safeguard-matrix"
        },
        {
          "id": "crystals",
          "spellId": 1252974,
          "name": {
            "ru": "Угасание",
            "en": "Dimming"
          },
          "signal": {
            "ru": "После призмы появляются враждебные кристаллы полуночи и дружественные кристаллы сумерек.",
            "en": "The prism releases hostile Midnight Crystals and friendly Dusk Crystals."
          },
          "response": {
            "ru": "Бойцы убивают кристаллы полуночи до «Космического раскола». Лекари полностью лечат кристаллы сумерек, пока те не угасли. Полученные кристаллы зари сразу подбирают назначенные носители.",
            "en": "Damage dealers kill Midnight Crystals before Cosmic Fracture. Healers restore Dusk Crystals to full before they fade. Assigned carriers immediately collect the resulting Dawn Crystals."
          },
          "counters": [],
          "counterRoles": [],
          "roleActions": {
            "healer": {
              "ru": "Лечите именно дружественный кристалл сумерек до полного здоровья; после превращения переключитесь на носителя.",
              "en": "Heal the friendly Dusk Crystal to full; once it transforms, keep its carrier alive."
            },
            "melee": {
              "ru": "Убейте кристалл полуночи до окончания его заклинания. Прерывание не заменяет убийство.",
              "en": "Kill the Midnight Crystal before its cast ends. An interrupt does not replace killing it."
            },
            "ranged": {
              "ru": "Добивайте кристаллы полуночи, особенно удалённые от основной группы.",
              "en": "Finish Midnight Crystals, especially those far from the main group."
            }
          },
          "spellIcon": "/assets/wow/raids/reviewed-spells/1252974.jpg"
        },
        {
          "id": "lance",
          "spellId": 1263970,
          "name": {
            "ru": "Небесное копье",
            "en": "Heaven's Lance"
          },
          "signal": {
            "ru": "Л'ура выпускает серию ударов «Небесного копья» в текущего танка.",
            "en": "L'ura fires a Heaven’s Lance sequence into the active tank."
          },
          "response": {
            "ru": "Танк заранее включает защиту. После всей серии второй танк забирает босса: каждый удар повышает урон следующих копий по прежней цели.",
            "en": "The active tank uses mitigation in advance. After the full sequence, the other tank taunts: each hit increases subsequent Lance damage on the previous target."
          },
          "counters": [
            "defend"
          ],
          "counterRoles": [
            "tank"
          ],
          "spellIcon": "/assets/wow/raids/reviewed-spells/1263970.jpg"
        },
        {
          "id": "quasar",
          "spellId": 1279420,
          "name": {
            "ru": "Темный квазар",
            "en": "Dark Quasar"
          },
          "signal": {
            "ru": "Из центрального Колодца выходят лучи; по комнате также летают отражающиеся от стен клинки.",
            "en": "Beams emerge from the central well while blades bounce around the room."
          },
          "response": {
            "ru": "Двигайтесь по свободной части кольца вместе с лучом, не пересекая его. Следите за возвращающимися клинками. Центральный Колодец смертелен до переноса боссом.",
            "en": "Move through the clear ring with the beam without crossing it. Watch for returning blades. The central well is lethal before the boss transports you."
          },
          "counters": [],
          "counterRoles": []
        },
        {
          "id": "eclipse",
          "spellId": 1260261,
          "name": {
            "ru": "Полное затмение",
            "en": "Total Eclipse"
          },
          "signal": {
            "ru": "Босс уходит в Колодец, на группе накапливается поглощение лечения.",
            "en": "The boss enters the well and healing absorbs build on the group."
          },
          "response": {
            "ru": "Лекари восполняют поглощённое лечение. Остальные остаются в их пределах, уходят от прямых лучей и сопротивляются сдвигу в центр. Дождитесь автоматического переноса во вторую фазу.",
            "en": "Healers heal through the absorbs. Everyone stays in range, dodges straight beams and resists the push toward the centre. Wait for the automatic transition into phase two."
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
          "spellIcon": "/assets/wow/raids/reviewed-spells/1260261.jpg"
        },
        {
          "id": "starsplinter",
          "spellId": 1282441,
          "name": {
            "ru": "Звездный осколок",
            "en": "Starsplinter"
          },
          "signal": {
            "ru": "Отмеченного игрока окружает рисунок расходящихся линий.",
            "en": "A marked player is surrounded by lines pointing outward."
          },
          "response": {
            "ru": "Отойдите так, чтобы линии не задевали соседей, и прекратите резкие перемещения. Остальные выходят из показанных линий до выброса осколков.",
            "en": "Move so your lines miss neighbours, then stop moving unpredictably. Everyone else clears the displayed lines before the shards fire."
          },
          "counters": [],
          "counterRoles": [],
          "heroic": {
            "ru": "Носитель заранее кладёт кристалл вне линий и после удара сразу подбирает его: попадание по кристаллу создаст дополнительные круги.",
            "en": "A carrier sets the crystal outside the lines, then promptly collects it after the hit: a hit on the crystal creates extra soak circles."
          }
        },
        {
          "id": "cores",
          "spellId": 1284525,
          "name": {
            "ru": "Гальванизация",
            "en": "Galvanize"
          },
          "signal": {
            "ru": "Внутри Колодца на игроках появляются лучи, а вокруг движутся ядра.",
            "en": "Inside the well, players receive beams while cores move around the arena."
          },
          "response": {
            "ru": "Каждый отмеченный направляет луч в отдельное ядро. Выбирайте цели с разных сторон, чтобы последующее притяжение уравновесилось. Не касайтесь заряженных ядер и внешней границы. Перед 100 энергии завершите все ядра и соберитесь с одной стороны для отбрасывания.",
            "en": "Each marked player aims at a different core. Use targets on opposite sides to balance the pull that follows. Avoid charged cores and the outer boundary. Finish all cores before 100 energy, then gather on one side for the knockback."
          },
          "counters": [],
          "counterRoles": [],
          "heroic": {
            "ru": "Рейд делится на группы для лучей: дополнительные игроки входят в назначенный луч и уменьшают общий урон. Носитель кладёт кристалл вне луча и забирает сразу после удара.",
            "en": "Split the raid into beam groups: additional players join their assigned beam to reduce raid damage. A carrier drops their crystal outside the beam and retrieves it immediately after the hit."
          },
          "spellIcon": "/assets/wow/raids/reviewed-spells/1284525.jpg"
        },
        {
          "id": "light",
          "spellId": 1266622,
          "name": {
            "ru": "Полночь",
            "en": "Midnight"
          },
          "signal": {
            "ru": "В финале арена темнеет, а вокруг носителей кристаллов остаются светлые круги.",
            "en": "In the finale, the arena darkens and light remains around crystal carriers."
          },
          "response": {
            "ru": "Держитесь в свете: его радиус вокруг носителя — 12 м. Носители перемещаются вместе с группой и не расходятся без плана. В темноте урон нарастает.",
            "en": "Stay in the light within 12 yards of a carrier. Carriers move with the group and avoid splitting without a plan. Damage ramps up in darkness."
          },
          "counters": [],
          "counterRoles": [],
          "spellIcon": "/assets/wow/raids/reviewed-spells/1266622.jpg"
        },
        {
          "id": "archangel",
          "spellId": 1250898,
          "name": {
            "ru": "Темный архангел",
            "en": "The Dark Archangel"
          },
          "signal": {
            "ru": "Начинается «Тёмный архангел», носителю доступен «Рассветный барьер».",
            "en": "Dark Archangel begins and a carrier can use Dawnlight Barrier."
          },
          "response": {
            "ru": "Назначенный носитель нажимает дополнительную кнопку и расходует один кристалл. Вся группа входит в барьер до удара. После него вместе уходите из чёрной волны, оставаясь рядом со следующим носителем. Личная защита не заменяет барьер.",
            "en": "The assigned carrier uses the extra-action button, consuming one crystal. Everyone enters the barrier before the blast. Afterwards, move out of the black wave together and stay near the next carrier. Personal mitigation cannot replace the barrier."
          },
          "counters": [],
          "counterRoles": [],
          "spellIcon": "/assets/wow/raids/reviewed-spells/1250898.jpg"
        },
        {
          "id": "constellation",
          "spellId": 1266388,
          "name": {
            "ru": "Созвездие тьмы",
            "en": "Dark Constellation"
          },
          "signal": {
            "ru": "На полу появляются тёмные звёзды, между ними образуются линии.",
            "en": "Dark stars appear on the floor and lines form between them."
          },
          "response": {
            "ru": "Уходите и от точек падения звёзд, и от соединяющих их линий. Выбирайте свободный участок внутри света носителя.",
            "en": "Avoid both star impact points and their connecting lines. Choose a clear space within the carrier’s light."
          },
          "counters": [],
          "counterRoles": []
        },
        {
          "id": "tears",
          "spellId": 1254262,
          "name": {
            "ru": "Слезы Л'уры",
            "en": "Tears of L'ura"
          },
          "signal": {
            "ru": "Кристалл зари или его носитель попал под направленную космическую атаку; появились небольшие круги.",
            "en": "A Dawn Crystal or its carrier is hit by a direct Cosmic attack and small circles appear."
          },
          "response": {
            "ru": "В каждый появившийся круг должен войти хотя бы один игрок. Носители избегают лучей и осколков; если попадание обязательно, заранее оставляют кристалл в безопасном месте и сразу забирают.",
            "en": "At least one player must enter each new circle. Carriers avoid beams and shards; before a required hit, they briefly set the crystal somewhere safe and retrieve it immediately."
          },
          "counters": [],
          "counterRoles": [],
          "heroicOnly": true
        },
        {
          "id": "siphon",
          "spellId": 1266897,
          "name": {
            "ru": "Вытягивание Света",
            "en": "Light Siphon"
          },
          "signal": {
            "ru": "В финале возникают круги «Вытягивания Света», которые не исчезают от одного касания.",
            "en": "In the finale, Light Siphon circles appear and do not disappear after a single touch."
          },
          "response": {
            "ru": "Разделитесь группами и стойте в каждом круге до его исчезновения. Носители поддерживают свет рядом с группами; во время закрытия уходите от линий созвездий. Не оставляйте ни один круг пустым.",
            "en": "Split into groups and remain in every circle until it disappears. Carriers keep light near the groups; avoid constellation lines while soaking. Leave no circle unattended."
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
          "id": "safeguard-matrix",
          "npcId": 264170,
          "name": {
            "ru": "Защитная матрица",
            "en": "Safeguard Matrix"
          },
          "description": {
            "ru": "Вращающаяся часть защитной призмы вокруг Л'уры.",
            "en": "An orbiting part of L'ura’s protective prism."
          },
          "action": {
            "ru": "Снимайте заряды защиты прерываниями «Охраны» или снятием положительной магии с врага. Обычное снятие вредной магии с союзника здесь не подходит.",
            "en": "Remove protective stacks by interrupting Safeguard or purging an enemy buff. A friendly magic dispel does not work here."
          },
          "death": {
            "ru": "После снятия зарядов исчезает; призма выпускает кристаллы.",
            "en": "Disappears when its stacks are removed; the prism releases crystals."
          },
          "cast": {
            "spellId": 1251392,
            "name": {
              "ru": "Охрана",
              "en": "Safeguard"
            },
            "description": {
              "ru": "Завершение добавляет защиту; прерывание убирает один заряд.",
              "en": "Completing the cast adds protection; interrupting removes one stack."
            },
            "action": {
              "ru": "Прервите «Охрану» у матрицы до окончания чтения. Продолжайте, пока не снимете все заряды.",
              "en": "Interrupt Safeguard on the matrix before it finishes. Repeat until all stacks are removed."
            }
          }
        },
        {
          "id": "midnight-crystal",
          "npcId": 250615,
          "name": {
            "ru": "Кристалл полуночи",
            "en": "Midnight Crystal"
          },
          "description": {
            "ru": "Враждебный тёмный кристалл появляется после разрушения призмы.",
            "en": "A hostile dark crystal appears after the prism breaks."
          },
          "action": {
            "ru": "Убейте до «Космического раскола». Это цель для урона, а не для лечения или назначенного прерывания.",
            "en": "Kill it before Cosmic Fracture. This is a damage target, not a healing or assigned interrupt target."
          },
          "death": {
            "ru": "Убийство предотвращает взрыв по рейду.",
            "en": "Killing it prevents the raid-wide explosion."
          }
        },
        {
          "id": "dusk-crystal",
          "npcId": 250616,
          "name": {
            "ru": "Кристалл сумерек",
            "en": "Dusk Crystal"
          },
          "description": {
            "ru": "Дружественный угасающий кристалл постепенно теряет здоровье.",
            "en": "A friendly fading crystal steadily loses health."
          },
          "action": {
            "ru": "Лекари полностью восстанавливают ему здоровье до его гибели.",
            "en": "Healers restore it to full health before it dies."
          },
          "death": {
            "ru": "При полном здоровье превращается в кристалл зари; при гибели взрывается.",
            "en": "At full health it becomes a Dawn Crystal; if it dies, it explodes."
          }
        },
        {
          "id": "dawn-crystal",
          "npcId": 251180,
          "name": {
            "ru": "Кристалл зари",
            "en": "Dawn Crystal"
          },
          "description": {
            "ru": "Сохранённый светлый кристалл после лечения кристалла сумерек.",
            "en": "A restored light crystal created by healing a Dusk Crystal."
          },
          "action": {
            "ru": "Назначенный игрок подбирает его и несёт до финала. Если временно положили на землю, сразу верните: оставленный кристалл вредит группе.",
            "en": "An assigned player picks it up and carries it to the finale. Retrieve it promptly after setting it down: an unattended crystal harms the group."
          },
          "death": {
            "ru": "В финале даёт свет вокруг носителя. Расходуется на один «Рассветный барьер».",
            "en": "Provides light around its carrier in the finale. Consumed by one Dawnlight Barrier."
          }
        }
      ],
      "diagram": {
        "title": {
          "ru": "Три вида кристаллов",
          "en": "Three kinds of crystal"
        },
        "caption": {
          "ru": "Тёмные кристаллы уничтожают. Угасающие лечат и превращают в переносной свет для финала.",
          "en": "Destroy the dark crystals. Heal the fading ones to create portable light for the finale."
        },
        "heroicCaption": {
          "ru": "Носители берегут кристаллы от космических атак: иначе появляются дополнительные круги, которые нужно закрыть игроками.",
          "en": "Carriers protect crystals from Cosmic attacks, which otherwise create extra circles for players to soak."
        },
        "steps": [
          {
            "id": "midnight",
            "title": {
              "ru": "Кристалл полуночи → убить",
              "en": "Midnight Crystal → kill"
            },
            "body": {
              "ru": "Бойцы атакуют враждебный кристалл до взрыва.",
              "en": "Damage dealers destroy the hostile crystal before it explodes."
            }
          },
          {
            "id": "dusk",
            "title": {
              "ru": "Кристалл сумерек → вылечить",
              "en": "Dusk Crystal → heal"
            },
            "body": {
              "ru": "Лекари восполняют всё здоровье, прежде чем кристалл угаснет.",
              "en": "Healers restore all its health before it fades."
            }
          },
          {
            "id": "dawn",
            "title": {
              "ru": "Кристалл зари → нести",
              "en": "Dawn Crystal → carry"
            },
            "body": {
              "ru": "Носитель подбирает вылеченный кристалл. В финале группа держится рядом; на каждый удар создаётся один барьер.",
              "en": "A carrier collects the restored crystal. The group stays nearby in the finale; one barrier protects each blast."
            }
          }
        ]
      },
      "sources": [
        {
          "title": "Game journal: Midnight Falls / Dusk Crystal (difficulty flags)",
          "url": "https://www.wowhead.com/npc=250616"
        },
        {
          "title": "Safeguard Matrix (Normal & Heroic)",
          "url": "https://www.wowhead.com/npc=264170"
        },
        {
          "title": "Method / Purke: Midnight Falls Heroic",
          "url": "https://www.method.gg/guides/march-on-queldanas/midnight-falls-heroic"
        },
        {
          "title": "Icy Veins / Panthea: Midnight Falls",
          "url": "https://www.icy-veins.com/wow/midnight-falls-raid-guide"
        },
        {
          "title": "Safeguard: interrupt removes a stack",
          "url": "https://www.wowhead.com/spell=1251392"
        },
        {
          "title": "Dawnlight Barrier",
          "url": "https://www.wowhead.com/spell=1253104"
        }
      ]
    }
  ],
  "sources": [
    {
      "title": "Blizzard: Midnight raid overview",
      "url": "https://worldofwarcraft.blizzard.com/en-us/news/24264416/midnight-raid-overview-and-schedule"
    }
  ]
};
