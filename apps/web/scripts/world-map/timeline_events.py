"""Event definitions for apps/web/data/wow/map/events.json (world-map timeline).

Run (from apps/web): python3 -I scripts/world-map/build_timeline.py --data <dir>
Each event anchors to game data: an AreaPOI world position, the centre of a
child UiMap rectangle (UiMapAssignment), a UiMapLink rectangle or a QuestPOI
point, projected into the UiMap given as mapId. Texts are our own summaries.
"""

# anchor kinds:
#   ("poi", areaPoiId)                      AreaPOI Pos_0/Pos_1 on ContinentID, projected into mapId
#   ("rect", childUiMapId)                  centre of the child map's UiMapAssignment rectangle inside mapId
#   ("link", childUiMapId)                  centre of the UiMapLink rectangle mapId -> child
#   ("world", instanceMapId, X, Y, label)   a world point from game data (QuestPOIPoint), projected into mapId
#   ("assign", instanceMapId)               centre of mapId's own UiMapAssignment rectangle for that instance map
#   ("mid", anchorA, anchorB)               midpoint of two anchors

E = []
def ev(id, patch, year, mapId, anchor, title, summary, kind, before=None, after=None, changed=None, links=None, sources=None, note=None):
    E.append(dict(id=id, patch=patch, year=year, mapId=mapId, anchor=anchor, title=title, summary=summary, kind=kind,
                  beforeEraId=before, afterEraId=after, changedMapIds=changed, links=links, sources=sources or [], note=note))

W = "https://warcraft.wiki.gg/wiki/"

# ---------------------------------------------------------------- vanilla
ev("ahnqiraj-gates", "1.9.0", 2006, 81, ("poi", 6538),
   {"en": "The Gates of Ahn'Qiraj open", "ru": "Открытие врат Ан'Киража"},
   {"en": "After a server-wide war effort, the Scarab Wall in southern Silithus opens and the ruins and temple of Ahn'Qiraj become raids.",
    "ru": "После общего сбора ресурсов на каждом сервере Стена Скарабея на юге Силитуса открывается, и руины и храм Ан'Киража становятся рейдами."},
   "instance", sources=[W+"Patch_1.9.0", W+"Gates_of_Ahn'Qiraj", "https://web.archive.org/web/20060323023349/http://worldofwarcraft.com/patchnotes/patch1p9.html"])
ev("scourge-invasion", "1.11.0", 2006, 23, ("poi", 6724),
   {"en": "The Scourge invades and Naxxramas appears", "ru": "Нашествие Плети и появление Наксрамаса"},
   {"en": "Necropolises hover over zones across both continents while the floating citadel of Naxxramas arrives above the Plaguewood in the Eastern Plaguelands.",
    "ru": "Над зонами обоих континентов зависают некрополи, а летающая цитадель Наксрамас появляется над Чумным лесом в Восточных Чумных землях."},
   "invasion", sources=[W+"Patch_1.11.0", W+"Scourge_Invasion", "https://web.archive.org/web/20060719020411/http://www.worldofwarcraft.com:80/patchnotes/patch1p11.html"],
   note="Anchor: AreaPOI 6724 Stratholme (Naxxramas hovered over the Plaguewood beside it); the vanilla citadel has no own AreaPOI in the retail client.")

# ---------------------------------------------------------------- tbc
ev("dark-portal-opens", "2.0.3", 2007, 17, ("poi", 5056),
   {"en": "The Dark Portal reopens", "ru": "Темный портал открывается вновь"},
   {"en": "The Dark Portal in the Blasted Lands becomes passable again and leads expeditions from Azeroth to the shattered world of Outland.",
    "ru": "Темный портал в Выжженных землях снова становится проходимым и ведёт экспедиции Азерота в расколотый мир Запределья."},
   "reveal", before="vanilla", after="tbc", links=None,
   sources=[W+"Patch_2.0.3", W+"Dark_Portal", "https://web.archive.org/web/20070201000000/http://www.worldofwarcraft.com/patchnotes/"])
ev("zulaman-raid", "2.3.0", 2007, 95, ("poi", 6683),
   {"en": "Zul'Aman opens", "ru": "Открытие Зул'Амана"},
   {"en": "The Amani temple city on the eastern edge of the Ghostlands opens as a raid against Zul'jin.",
    "ru": "Храмовый город Амани на восточной окраине Призрачных земель открывается как рейд против Зул'джина."},
   "instance", sources=[W+"Patch_2.3.0", W+"Zul'Aman", "https://web.archive.org/web/20071201000000/http://www.worldofwarcraft.com/patchnotes/"])
ev("sunwell-isle", "2.4.0", 2008, 122, ("poi", 6533),
   {"en": "Fury of the Sunwell", "ru": "Ярость Солнечного Колодца"},
   {"en": "The Isle of Quel'Danas opens with a new quest hub, Magisters' Terrace and the Sunwell Plateau raid.",
    "ru": "Открывается остров Кель'Данас с новым лагерем заданий, Террасой Магистров и рейдом Плато Солнечного Колодца."},
   "reveal", changed=[122], sources=[W+"Patch_2.4.0", W+"Isle_of_Quel'Danas", "https://web.archive.org/web/20080415000000/http://www.worldofwarcraft.com/patchnotes/"])

# ---------------------------------------------------------------- wrath
ev("northrend", "3.0.2", 2008, 947, ("rect", 113),
   {"en": "Northrend opens", "ru": "Открытие Нордскола"},
   {"en": "Alliance and Horde fleets land on the frozen continent of Northrend to take the war to the Lich King.",
    "ru": "Флоты Альянса и Орды высаживаются на ледяном континенте Нордскол, чтобы начать войну с Королём-личом."},
   "reveal", before="tbc", after="wrath", changed=[113], sources=[W+"Patch_3.0.2", W+"World_of_Warcraft:_Wrath_of_the_Lich_King", "https://web.archive.org/web/20081204055431/http://www.worldofwarcraft.com:80/patchnotes/"])
ev("dalaran-to-northrend", "3.0.2", 2008, 127, ("rect", 125),
   {"en": "Dalaran moves to Northrend", "ru": "Даларан переносится в Нордскол"},
   {"en": "The Kirin Tor lift the city of Dalaran from the Alterac foothills and float it above Crystalsong Forest.",
    "ru": "Кирин-Тор поднимают Даларан из предгорий Альтерака и переносят город в небо над Лесом Хрустальной Песни."},
   "reshape", before="tbc", after="wrath", changed=[125, 127], sources=[W+"Dalaran", W+"Patch_3.0.2", "https://web.archive.org/web/20081204055431/http://www.worldofwarcraft.com:80/patchnotes/"])
ev("wrathgate", "3.0.2", 2008, 115, ("world", 571, 4800.0, 1425.5, "midpoint of QuestPOI turn-in points of quests 12499/12500 'Return To Angrathar'"),
   {"en": "Battle at the Wrathgate", "ru": "Битва у Врат Гнева"},
   {"en": "The joint Alliance and Horde assault on Angrathar the Wrathgate in Dragonblight ends in the Forsaken plague and the fall of Bolvar Fordragon.",
    "ru": "Совместный штурм Альянса и Орды у Ангратара, Врат Гнева, в Драконьем Погосте заканчивается чумой Отрёкшихся и падением Болвара Фордрагона."},
   "battle", sources=[W+"Angrathar_the_Wrathgate", W+"Patch_3.0.2", "https://web.archive.org/web/20081204055431/http://www.worldofwarcraft.com:80/patchnotes/"])
ev("battle-for-undercity", "3.0.2", 2008, 18, ("poi", 18),
   {"en": "Battle for the Undercity", "ru": "Битва за Подгород"},
   {"en": "Thrall, Sylvanas and Varian retake the Undercity after Varimathras and Putress seize the Forsaken capital.",
    "ru": "Тралл, Сильвана и Вариан отбивают Подгород после того, как Варимати и Мерзоцид захватывают столицу Отрёкшихся."},
   "battle", sources=[W+"Battle_for_the_Undercity", W+"Patch_3.0.2", "https://web.archive.org/web/20081204055431/http://www.worldofwarcraft.com:80/patchnotes/"])
ev("icecrown-citadel", "3.3.0", 2009, 118, ("poi", 6521),
   {"en": "Fall of the Lich King", "ru": "Падение Короля-лича"},
   {"en": "The Icecrown Citadel raid opens in the heart of Icecrown, ending the campaign against Arthas.",
    "ru": "В сердце Ледяной Короны открывается рейд Цитадель Ледяной Короны, завершающий поход против Артаса."},
   "instance", sources=[W+"Patch_3.3.0", W+"Icecrown_Citadel", "https://web.archive.org/web/20100207210021/http://www.worldofwarcraft.com/patchnotes/"])

# ---------------------------------------------------------------- cataclysm
CATA_OFF = "https://web.archive.org/web/20110106083701/http://www.worldofwarcraft.com/cataclysm/features/"
CATA_NOTES = "https://web.archive.org/web/20101203125846/http://www.worldofwarcraft.com/patchnotes/"
ev("shattering", "4.0.3a", 2010, 947, ("link", 948),
   {"en": "The Shattering", "ru": "Катаклизм"},
   {"en": "Deathwing bursts out of Deepholm through the Maelstrom, and quakes and floods reshape most of Kalimdor and the Eastern Kingdoms.",
    "ru": "Смертокрыл вырывается из Подземья через Водоворот, а землетрясения и наводнения меняют облик большей части Калимдора и Восточных королевств."},
   "reshape", before="wrath", after="cataclysm", changed=[12, 13, 948], sources=[W+"Patch_4.0.3a", W+"Shattering", CATA_NOTES])
ev("thousand-needles-flooded", "4.0.3a", 2010, 12, ("rect", 64),
   {"en": "Thousand Needles floods", "ru": "Затопление Тысячи Игл"},
   {"en": "The canyon of Thousand Needles fills with sea water, leaving only the tops of its mesas above the surface.",
    "ru": "Каньон Тысячи Игл заполняется морской водой, и над поверхностью остаются только вершины столовых гор."},
   "reshape", before="wrath", after="cataclysm", changed=[64], sources=[W+"Thousand_Needles", W+"Patch_4.0.3a", CATA_NOTES])
ev("barrens-split", "4.0.3a", 2010, 12, ("poi", 7503),
   {"en": "The Barrens split in two", "ru": "Степи раскалываются надвое"},
   {"en": "A vast rift, the Great Divide, tears the Barrens apart into the Northern and Southern Barrens.",
    "ru": "Огромный разлом, Великий Раздел, разрывает Степи на Северные и Южные."},
   "reshape", before="wrath", after="cataclysm", changed=[10, 199], sources=[W+"Northern_Barrens", W+"Patch_4.0.3a", CATA_OFF],
   note="Anchor: AreaPOI 7503 'Great Divide Dive' (Kalimdor Cup race start at the rift); the rift itself has no AreaPOI.")
ev("darkshore-shattered", "4.0.3a", 2010, 62, ("poi", 798),
   {"en": "Darkshore is shattered", "ru": "Разорение Темных берегов"},
   {"en": "Tidal waves and an elemental rift wreck the coast of Darkshore and destroy the port of Auberdine; Lor'danel becomes the new outpost.",
    "ru": "Приливные волны и разлом стихий разрушают побережье Темных берегов и порт Аубердин; новым оплотом становится Лор'данел."},
   "reshape", before="wrath", after="cataclysm", changed=[62], sources=[W+"Darkshore", W+"Patch_4.0.3a", CATA_OFF])
ev("badlands-scarred", "4.0.3a", 2010, 13, ("rect", 15),
   {"en": "Deathwing scars the Badlands", "ru": "Смертокрыл выжигает Бесплодные земли"},
   {"en": "Deathwing's flight burns a deep scar across the Badlands, changing the layout of the whole zone.",
    "ru": "Полёт Смертокрыла оставляет глубокий выжженный след через Бесплодные земли и меняет облик всей зоны."},
   "reshape", before="wrath", after="cataclysm", changed=[15], sources=[W+"Badlands", W+"Patch_4.0.3a", CATA_OFF])
ev("stormwind-park", "4.0.3a", 2010, 84, ("poi", 2432),
   {"en": "Deathwing burns Stormwind Park", "ru": "Смертокрыл сжигает парк Штормграда"},
   {"en": "Deathwing's attack leaves Stormwind's park district in ruins; in 7.0.3 the site becomes the Lion's Rest memorial.",
    "ru": "Атака Смертокрыла превращает парковый квартал Штормграда в руины; в 7.0.3 на этом месте появляется мемориал Покой Льва."},
   "reshape", before="wrath", after="cataclysm", changed=[84], sources=[W+"Stormwind_City", "https://www.gamesradar.com/50-reasons-to-play-wow-cataclysm/2"],
   note="Anchor: AreaPOI 2432 Lion's Rest, built on the ruins of the park.")
ev("orgrimmar-rebuilt", "4.0.3a", 2010, 12, ("rect", 85),
   {"en": "Garrosh rebuilds Orgrimmar", "ru": "Гаррош перестраивает Оргриммар"},
   {"en": "Under Warchief Garrosh Hellscream, Orgrimmar is rebuilt in iron with new districts and a remodelled layout.",
    "ru": "При вожде Гарроше Адском Крике Оргриммар перестраивают в железе: у города новые кварталы и новая планировка."},
   "reshape", before="wrath", after="cataclysm", changed=[85], sources=[W+"Orgrimmar", "https://www.gamesradar.com/50-reasons-to-play-wow-cataclysm/2"])
ev("azshara-goblins", "4.0.3a", 2010, 12, ("rect", 76),
   {"en": "Goblins reshape Azshara", "ru": "Гоблины перестраивают Азшару"},
   {"en": "The Bilgewater goblins carve up Azshara for the Horde, turning it into a new low-level Horde zone.",
    "ru": "Гоблины Трюмных Вод перекраивают Азшару для Орды и превращают её в новую зону Орды для начальных уровней."},
   "reshape", before="wrath", after="cataclysm", changed=[76], sources=[W+"Azshara", W+"Patch_4.0.3a", CATA_OFF])
ev("hyjal-assault", "4.0.3a", 2010, 12, ("poi", 2606),
   {"en": "The fight for Mount Hyjal", "ru": "Битва за гору Хиджал"},
   {"en": "Mount Hyjal opens as a high-level zone where the Cenarion Circle defends Nordrassil from Ragnaros' forces.",
    "ru": "Гора Хиджал открывается как зона высокого уровня: Круг Кенария защищает Нордрассил от сил Рагнароса."},
   "reveal", before="wrath", after="cataclysm", changed=[198], sources=[W+"Mount_Hyjal", W+"Patch_4.0.3a", CATA_OFF],
   note="Anchor: AreaPOI 2606 Nordrassil.")
ev("vashjir", "4.0.3a", 2010, 13, ("rect", 203),
   {"en": "Vashj'ir beneath the waves", "ru": "Подводный Вайш'ир"},
   {"en": "The sunken naga realm of Vashj'ir off the coast of Stormwind opens as an underwater zone.",
    "ru": "Затонувшее королевство наг Вайш'ир у берегов Штормграда открывается как подводная зона."},
   "reveal", before="wrath", after="cataclysm", changed=[203], sources=[W+"Patch_4.0.3a", "https://warcraft.wiki.gg/wiki/Vashj'ir", CATA_OFF])
ev("uldum-revealed", "4.0.3a", 2010, 12, ("rect", 249),
   {"en": "Uldum is revealed", "ru": "Ульдум открывается"},
   {"en": "The titan-guarded desert of Uldum south of Tanaris becomes reachable for the first time.",
    "ru": "Пустыня Ульдум к югу от Танариса, охраняемая титанами, впервые становится доступной."},
   "reveal", before="wrath", after="cataclysm", changed=[249], sources=[W+"Uldum", W+"Patch_4.0.3a", CATA_OFF])
ev("twilight-highlands", "4.0.3a", 2010, 13, ("rect", 241),
   {"en": "Twilight Highlands open", "ru": "Открытие Сумеречного нагорья"},
   {"en": "The highlands east of the Wetlands, home of Grim Batol and the Twilight's Hammer, open as a new zone.",
    "ru": "Нагорье к востоку от Болотины с Грим Батолом и логовом Сумеречного Молота открывается как новая зона."},
   "reveal", before="wrath", after="cataclysm", changed=[241], sources=[W+"Twilight_Highlands", W+"Patch_4.0.3a", CATA_OFF])
ev("gilneas-opens", "4.0.3a", 2010, 13, ("rect", 217),
   {"en": "The Greymane Wall falls", "ru": "Стена Седогрива пала"},
   {"en": "Gilneas, sealed behind the Greymane Wall since the Third War, opens as the worgen starting area.",
    "ru": "Гилнеас, закрытый Стеной Седогрива со времён Третьей войны, открывается как стартовая зона воргенов."},
   "reveal", before="wrath", after="cataclysm", changed=[179, 217], sources=[W+"Gilneas", W+"Patch_4.0.3a", CATA_OFF])

# ---------------------------------------------------------------- mop
ev("pandaria", "5.0.4", 2012, 947, ("rect", 424),
   {"en": "Pandaria emerges from the mists", "ru": "Пандария выходит из туманов"},
   {"en": "The mists around the hidden continent of Pandaria part, and Alliance and Horde fleets land on its shores.",
    "ru": "Туманы вокруг скрытого континента Пандария рассеиваются, и к его берегам причаливают флоты Альянса и Орды."},
   "reveal", before="cataclysm", after="mop", changed=[424], sources=[W+"Patch_5.0.4", W+"Pandaria", "https://web.archive.org/web/2012/http://us.battle.net/wow/en/blog/7080372"])
ev("theramore-destroyed", "5.0.4", 2012, 70, ("poi", 791),
   {"en": "The fall of Theramore", "ru": "Падение Терамора"},
   {"en": "Garrosh Hellscream's mana bomb destroys Theramore Isle, leaving a crater in place of Jaina's city.",
    "ru": "Манабомба Гарроша Адского Крика уничтожает остров Терамор, и на месте города Джайны остаётся воронка."},
   "battle", before="cataclysm", after="mop", changed=[70], sources=[W+"Theramore_Isle", W+"Dustwallow_Marsh", "https://web.archive.org/web/2012/http://us.battle.net/wow/en/blog/7080372"],
   note="Patch is 5.0.4 (not 5.1): the scenario and the destroyed phase were added with 5.0.4, unlocked a little after the patch went live.")
ev("isle-of-thunder", "5.2.0", 2013, 424, ("rect", 504),
   {"en": "The Isle of Thunder rises", "ru": "Остров Грома"},
   {"en": "The Isle of Thunder opens off Kun-Lai Summit, with the Kirin Tor and Sunreavers fighting over Lei Shen's stronghold.",
    "ru": "У Вершины Кунь-Лай открывается Остров Грома, где Кирин-Тор и Похитители Солнца сражаются за твердыню Лэй Шэня."},
   "reveal", changed=[504], sources=[W+"Isle_of_Thunder", W+"Patch_5.2.0", "https://web.archive.org/web/20131116170039/http://us.battle.net/wow/en/blog/8896363"])
ev("vale-corrupted", "5.4.0", 2013, 424, ("rect", 390),
   {"en": "The Vale of Eternal Blossoms is ravaged", "ru": "Разорение Вечноцветущего дола"},
   {"en": "Garrosh unearths the Heart of Y'Shaarj beneath the Vale, and sha energy ravages its eastern half.",
    "ru": "Гаррош выкапывает из-под дола Сердце И'Шарджа, и энергия ша опустошает его восточную половину."},
   "reshape", changed=[390], sources=[W+"Vale_of_Eternal_Blossoms", W+"Patch_5.4.0", "https://worldofwarcraft.com/en-us/news/10788364/"])
ev("siege-of-orgrimmar", "5.4.0", 2013, 12, ("poi", 33),
   {"en": "Siege of Orgrimmar", "ru": "Осада Оргриммара"},
   {"en": "Alliance and Horde rebels storm Orgrimmar and bring down Warchief Garrosh Hellscream.",
    "ru": "Альянс и восставшие воины Орды штурмуют Оргриммар и свергают вождя Гарроша Адского Крика."},
   "battle", sources=[W+"Siege_of_Orgrimmar", W+"Patch_5.4.0", "https://worldofwarcraft.com/en-us/news/10788364/"])

# ---------------------------------------------------------------- wod
ev("iron-horde-incursion", "6.0.2", 2014, 17, ("poi", 5056),
   {"en": "The Iron Horde comes through the Dark Portal", "ru": "Железная Орда выходит из Темного портала"},
   {"en": "The Dark Portal turns red and the Iron Horde floods into the Blasted Lands, which change to show the invasion.",
    "ru": "Темный портал становится красным, Железная Орда хлынула в Выжженные земли, и зона меняется, показывая вторжение."},
   "invasion", before="mop", after="wod", changed=[17], sources=[W+"Iron_Horde_Incursion", W+"Blasted_Lands", "https://worldofwarcraft.com/en-us/news/15682579/"])
ev("draenor", "6.0.3", 2014, 946, ("link", 572),
   {"en": "Expedition to Draenor", "ru": "Экспедиция на Дренор"},
   {"en": "Heroes of Azeroth pass through the Dark Portal into an alternate, untainted Draenor ruled by the warlords of the Iron Horde.",
    "ru": "Герои Азерота проходят через Темный портал в альтернативный, неосквернённый Дренор, где правят вожди Железной Орды."},
   "reveal", before="mop", after="wod", changed=[572], sources=[W+"Patch_6.0.3", W+"World_of_Warcraft:_Warlords_of_Draenor", "https://worldofwarcraft.com/en-us/news/15682579/"])
ev("tanaan-jungle", "6.2.0", 2015, 572, ("rect", 534),
   {"en": "Assault on Tanaan Jungle", "ru": "Штурм Танаанских джунглей"},
   {"en": "Tanaan Jungle opens, with Hellfire Citadel as the Iron Horde's last bastion under Gul'dan's control.",
    "ru": "Открываются Танаанские джунгли, где Цитадель Адского Пламени становится последним оплотом Железной Орды под властью Гул'дана."},
   "reveal", changed=[534], sources=[W+"Tanaan_Jungle", W+"Patch_6.2.0", "https://web.archive.org/web/2015/http://us.battle.net/wow/en/blog/19806402"])

# ---------------------------------------------------------------- legion
ev("broken-shore-battle", "7.0.3", 2016, 619, ("rect", 646),
   {"en": "Battle for the Broken Shore", "ru": "Битва за Расколотый берег"},
   {"en": "The Alliance and Horde assault on the Legion's beachhead fails and King Varian Wrynn falls on the Broken Shore.",
    "ru": "Наступление Альянса и Орды на плацдарм Легиона проваливается, и король Вариан Ринн гибнет на Расколотом берегу."},
   "battle", before="wod", after="legion", changed=[646], sources=[W+"Battle_for_Broken_Shore", W+"Broken_Shore", "https://worldofwarcraft.com/en-us/news/20139979"])
ev("dalaran-to-broken-isles", "7.0.3", 2016, 619, ("rect", 627),
   {"en": "Dalaran moves to the Broken Isles", "ru": "Даларан переносится на Расколотые острова"},
   {"en": "The Kirin Tor teleport Dalaran from Northrend to hover over the Broken Isles as the base against the Legion.",
    "ru": "Кирин-Тор переносят Даларан из Нордскола в небо над Расколотыми островами, где он становится базой против Легиона."},
   "reshape", before="wod", after="legion", changed=[627], sources=[W+"Dalaran", W+"Patch_7.0.3", "https://worldofwarcraft.com/en-us/news/20139979"])
ev("broken-shore-return", "7.2.0", 2017, 619, ("poi", 5250),
   {"en": "Return to the Broken Shore", "ru": "Возвращение на Расколотый берег"},
   {"en": "The Broken Shore grows into a full zone where the Armies of Legionfall push to the Tomb of Sargeras.",
    "ru": "Расколотый берег становится полноценной зоной, где Армия погибели Легиона пробивается к Гробнице Саргераса."},
   "reshape", changed=[646], sources=[W+"Broken_Shore", W+"Patch_7.2.0", "https://worldofwarcraft.com/news/20629899"],
   note="Anchor: AreaPOI 5250 Tomb of Sargeras.")
ev("argus", "7.3.0", 2017, 619, ("link", 905),
   {"en": "Assault on Argus", "ru": "Штурм Аргуса"},
   {"en": "The Vindicaar carries the war to Argus, the Legion's homeworld, which now hangs in the sky over Azeroth.",
    "ru": "Виндикар переносит войну на Аргус, родной мир Легиона, который теперь висит в небе над Азеротом."},
   "reveal", changed=[905], sources=[W+"Argus", W+"Patch_7.3.0", "https://worldofwarcraft.com/news/20947822"],
   note="Placed where the Broken Isles map links to Argus (UiMapLink 619 -> 905), as in the game.")
ev("silithus-wound", "7.3.2", 2017, 12, ("rect", 81),
   {"en": "Sargeras strikes Silithus", "ru": "Удар Саргераса по Силитусу"},
   {"en": "As the Pantheon imprisons him, Sargeras plunges his sword into Silithus, and the wound begins to bleed azerite.",
    "ru": "Перед тем как Пантеон заточает его, Саргерас вонзает меч в Силитус, и из раны начинает сочиться азерит."},
   "reshape", before="legion", after="bfa", changed=[81], sources=[W+"Silithus", W+"Patch_7.3.5", "https://worldofwarcraft.com/en-us/news/21365423"],
   note="Zone page dates the sword strike to 7.3.2 (Antorus); the revamped 'Silithus: The Wound' arrived with 7.3.5. The sword has no AreaPOI, so the marker is the zone centre on Kalimdor.")

# ---------------------------------------------------------------- bfa
ev("teldrassil-burns", "8.0.1", 2018, 12, ("poi", 38),
   {"en": "The Burning of Teldrassil", "ru": "Сожжение Тельдрассила"},
   {"en": "At the end of the War of the Thorns Sylvanas orders the World Tree Teldrassil set ablaze, and Darnassus burns with it.",
    "ru": "В конце Войны Шипов Сильвана приказывает поджечь Мировое древо Тельдрассил, и вместе с ним сгорает Дарнас."},
   "battle", before="legion", after="bfa", changed=[57, 89], sources=[W+"Teldrassil", W+"War_of_the_Thorns", "https://worldofwarcraft.com/news/21959894"])
ev("fall-of-lordaeron", "8.0.1", 2018, 18, ("poi", 5614),
   {"en": "The Fall of Lordaeron", "ru": "Падение Лордерона"},
   {"en": "The Alliance besieges Lordaeron; Sylvanas floods the Undercity with blight and the city is left in ruins.",
    "ru": "Альянс осаждает Лордерон; Сильвана заливает Подгород чумой, и город остаётся в руинах."},
   "battle", before="legion", after="bfa", changed=[18, 90], sources=[W+"Battle_for_Lordaeron", W+"Undercity", "https://worldofwarcraft.com/news/21959894"])
ev("zandalar", "8.0.1", 2018, 947, ("rect", 875),
   {"en": "Zandalar opens to the Horde", "ru": "Зандалар открывается Орде"},
   {"en": "The troll continent of Zandalar, with its capital Dazar'alor, becomes the Horde's new war front.",
    "ru": "Тролльский континент Зандалар со столицей Дазар'алор становится новым фронтом Орды."},
   "reveal", before="legion", after="bfa", changed=[875], links=["/wow/mythic-plus/midnight-season-2/kings-rest", "/wow/mythic-plus/midnight-season-2/temple-of-sethraliss"],
   sources=[W+"Patch_8.0.1", W+"World_of_Warcraft:_Battle_for_Azeroth", "https://worldofwarcraft.com/news/21959894"])
ev("kul-tiras", "8.0.1", 2018, 947, ("rect", 876),
   {"en": "Kul Tiras opens to the Alliance", "ru": "Кул-Тирас открывается Альянсу"},
   {"en": "The island kingdom of Kul Tiras and its port Boralus become the Alliance's new war front.",
    "ru": "Островное королевство Кул-Тирас и его порт Боралус становятся новым фронтом Альянса."},
   "reveal", before="legion", after="bfa", changed=[876], sources=[W+"Patch_8.0.1", W+"World_of_Warcraft:_Battle_for_Azeroth", "https://worldofwarcraft.com/news/21959894"])
ev("battle-for-stromgarde", "8.0.1", 2018, 13, ("world", 0, -1675.3, -1802.7, "AreaPOI 5592 Stromgarde Keep (warfront map 1876) on the shared Eastern Kingdoms coordinates"),
   {"en": "Battle for Stromgarde", "ru": "Битва за Стромгард"},
   {"en": "The first warfront turns the Arathi Highlands into a battlefield between Stromgarde Keep and the Horde fortress of Ar'gorok.",
    "ru": "Первый военный фронт превращает Нагорье Арати в поле боя между Стромгардом и крепостью Орды Ар'горок."},
   "battle", changed=[14], sources=[W+"Battle_for_Stromgarde", W+"Patch_8.0.1", "https://worldofwarcraft.com/news/21959894"])
ev("battle-for-darkshore", "8.1.0", 2018, 62, ("poi", 798),
   {"en": "Battle for Darkshore", "ru": "Битва за Темные берега"},
   {"en": "The second warfront reshapes Darkshore as night elves and Forsaken fight over the coast below burned Teldrassil.",
    "ru": "Второй военный фронт меняет облик Темных берегов: ночные эльфы и Отрёкшиеся сражаются за побережье под сожжённым Тельдрассилом."},
   "battle", before="legion", after="bfa", changed=[62], sources=[W+"Battle_for_Darkshore", W+"Darkshore", "https://worldofwarcraft.com/news/22824892/"],
   note="Anchor: AreaPOI 798 Auberdine (the warfront POIs 5915/5960 'Ruins of Auberdine' share the position).")
ev("battle-of-dazaralor", "8.1.0", 2019, 862, ("poi", 6012),
   {"en": "Battle of Dazar'alor", "ru": "Битва за Дазар'алор"},
   {"en": "The Alliance strikes the Zandalari capital, and King Rastakhan falls in the raid on the Great Seal.",
    "ru": "Альянс наносит удар по столице зандаларов, и король Растахан гибнет в рейде на Великую Печать."},
   "battle", sources=[W+"Battle_of_Dazar'alor", W+"Patch_8.1.0", "https://worldofwarcraft.com/news/22824892/"])
ev("nazjatar", "8.2.0", 2019, 947, ("mid", ("poi", 6139), ("poi", 6140)),
   {"en": "Azshara raises Nazjatar", "ru": "Азшара открывает Назжатар"},
   {"en": "Queen Azshara parts the Great Sea and opens her sunken capital of Nazjatar to the surface world.",
    "ru": "Королева Азшара раздвигает воды Великого моря и открывает свою затонувшую столицу Назжатар."},
   "reveal", changed=[1355], sources=[W+"Nazjatar", W+"Patch_8.2.0", "https://worldofwarcraft.com/en-us/news/23050291"],
   note="Anchor: midpoint of the two 'Boat to Nazjatar' AreaPOIs (6139 Zuldazar, 6140 Tiragarde) on the Azeroth map; Nazjatar has no Azeroth-map rectangle.")
ev("mechagon", "8.2.0", 2019, 876, ("rect", 1462),
   {"en": "Mechagon Island", "ru": "Остров Мехагон"},
   {"en": "The mechanical island of Mechagon opens northwest of Kul Tiras, home of King Mechagon and a megadungeon.",
    "ru": "К северо-западу от Кул-Тираса открывается механический остров Мехагон с королём Мехагоном и мегаподземельем."},
   "reveal", changed=[1462], sources=[W+"Mechagon_Island", W+"Patch_8.2.0", "https://worldofwarcraft.com/en-us/news/23050291"])
ev("nzoth-vale", "8.3.0", 2020, 424, ("poi", 6539),
   {"en": "N'Zoth assaults the Vale", "ru": "Н'Зот атакует Вечноцветущий дол"},
   {"en": "Ny'alotha rises over the Vale of Eternal Blossoms, and the restored vale falls under the Black Empire's assaults.",
    "ru": "Над Вечноцветущим долом поднимается Ни'алота, и восстановленный дол становится целью атак Чёрной империи."},
   "invasion", changed=[390, 1530], sources=[W+"Vale_of_Eternal_Blossoms", W+"Assaults", "https://worldofwarcraft.com/en-us/news/23227147/visions-of-n-zoth-content-update-notes"])
ev("nzoth-uldum", "8.3.0", 2020, 12, ("poi", 6540),
   {"en": "N'Zoth assaults Uldum", "ru": "Н'Зот атакует Ульдум"},
   {"en": "A second entrance to Ny'alotha opens in Uldum, and the desert falls under rotating assaults.",
    "ru": "Второй вход в Ни'алоту открывается в Ульдуме, и пустыня оказывается под чередой атак."},
   "invasion", changed=[249, 1527], sources=[W+"Ny'alotha,_the_Waking_City", W+"Assaults", "https://worldofwarcraft.com/en-us/news/23227147/visions-of-n-zoth-content-update-notes"])

# ---------------------------------------------------------------- shadowlands
ev("icecrown-veil-torn", "9.0.1", 2020, 118, ("poi", 6521),
   {"en": "The sky over Icecrown is torn", "ru": "Небо над Ледяной Короной разорвано"},
   {"en": "With the veil to the afterlife shattered above Icecrown Citadel, the Scourge rises again across Azeroth.",
    "ru": "Завеса между мирами над Цитаделью Ледяной Короны разрушена, и Плеть снова поднимается по всему Азероту."},
   "invasion", sources=[W+"Patch_9.0.1", W+"Icecrown_Citadel", "https://worldofwarcraft.com/en-us/news/23529209"])
ev("shadowlands", "9.0.2", 2020, 1550, ("link", 1670),
   {"en": "Into the Shadowlands", "ru": "Путь в Темные Земли"},
   {"en": "Heroes cross into the Shadowlands; Oribos, the Eternal City, becomes the hub between the realms of death.",
    "ru": "Герои переходят в Темные Земли; Орибос, Вечный город, становится центром между царствами смерти."},
   "reveal", before="bfa", after="shadowlands", changed=[1550], sources=[W+"Oribos", W+"Patch_9.0.2", "https://worldofwarcraft.com/en-us/news/23529209"])
ev("korthia", "9.1.0", 2021, 1550, ("rect", 1961),
   {"en": "Korthia, City of Secrets", "ru": "Кортия, город тайн"},
   {"en": "Korthia, a part of the Maw holding the secrets of the First Ones, opens to explorers.",
    "ru": "Кортия, часть Утробы с тайнами Изначальных, открывается для исследователей."},
   "reveal", changed=[1961], sources=[W+"The_Maw", W+"Patch_9.1.0", "https://worldofwarcraft.com/en-us/news/23685044/chains-of-domination-content-update-notes"])
ev("zereth-mortis", "9.2.0", 2022, 1550, ("link", 1970),
   {"en": "Zereth Mortis", "ru": "Зерет Мортис"},
   {"en": "The hidden realm of the First Ones opens, where the Jailer seeks the Sepulcher of the First Ones.",
    "ru": "Открывается скрытый мир Изначальных, где Тюремщик ищет Гробницу Предвечных."},
   "reveal", changed=[1970], sources=[W+"Zereth_Mortis", W+"Patch_9.2.0", "https://worldofwarcraft.com/en-us/news/23770462/shadowlands-eternitys-end-content-update-notes"])

# ---------------------------------------------------------------- dragonflight
ev("dragon-isles", "10.0.2", 2022, 947, ("rect", 1978),
   {"en": "The Dragon Isles awaken", "ru": "Пробуждение Драконьих островов"},
   {"en": "The ancestral home of the dragonflights reappears in the north, and expeditions land on the Waking Shores.",
    "ru": "Родина драконьих стай вновь появляется на севере, и экспедиции высаживаются на Берегах Пробуждения."},
   "reveal", before="shadowlands", after="dragonflight", changed=[1978], links=["/wow/mythic-plus/midnight-season-2/ruby-life-pools"],
   sources=[W+"Dragon_Isles", W+"Patch_10.0.2", "https://worldofwarcraft.com/en-us/news/23874318/dragonflight-pre-expansion-phase-2-update-notes"])
ev("zaralek-cavern", "10.1.0", 2023, 1978, ("poi", 7438),
   {"en": "Zaralek Cavern", "ru": "Пещера Заралек"},
   {"en": "A vast cave system opens beneath the Dragon Isles, hiding Neltharion's old laboratory and Aberrus.",
    "ru": "Под Драконьими островами открывается огромная система пещер с давней лабораторией Нелтариона и Аберрусом."},
   "reveal", changed=[2133], sources=[W+"Zaralek_Cavern", W+"Patch_10.1.0", "https://worldofwarcraft.blizzard.com/en-us/news/23935248/dragonflight-embers-of-neltharion-content-update-notes-now-live"],
   note="Anchor: AreaPOI 7438 Zaralek Cavern entrance.")
ev("amirdrassil", "10.2.0", 2023, 1978, ("rect", 2239),
   {"en": "Amirdrassil blooms", "ru": "Амирдрассил расцветает"},
   {"en": "The new World Tree Amirdrassil grows in the Emerald Dream and later blooms into the waking world on the Dragon Isles.",
    "ru": "Новое Мировое древо Амирдрассил вырастает в Изумрудном Сне, а затем расцветает в реальном мире на Драконьих островах."},
   "reveal", changed=[2200, 2239], sources=[W+"Amirdrassil", W+"Patch_10.2.0", "https://worldofwarcraft.blizzard.com/en-us/news/24020034/updated-nov-7-dragonflight-guardians-of-the-dream-content-update-notes-now-live"])

# ---------------------------------------------------------------- the war within
ev("khaz-algar", "11.0.2", 2024, 947, ("assign", 2601),
   {"en": "Khaz Algar is discovered", "ru": "Открытие Каз Алгара"},
   {"en": "The hidden isle and subterranean continent of Khaz Algar opens northwest of Pandaria.",
    "ru": "К северо-западу от Пандарии открывается скрытый остров и подземный континент Каз Алгар."},
   "reveal", before="dragonflight", after="tww", changed=[2274], sources=[W+"Khaz_Algar", W+"Patch_11.0.2", "https://worldofwarcraft.blizzard.com/en-us/news/24130678/the-war-within-update-notes"],
   note="Anchor: centre of the Azeroth map's own rectangle for the Khaz Algar underground map (instance 2601).")
ev("dalaran-destroyed", "11.0.2", 2024, 2248, ("world", 2552, 2034.0, -808.0, "QuestPOIPoint objective of quest 78529 'Violent Impact' on the Tranquil Strand"),
   {"en": "The fall of Dalaran", "ru": "Гибель Даларана"},
   {"en": "Xal'atath destroys Dalaran above the Isle of Dorn, and the wreckage of the city crashes onto the Tranquil Strand.",
    "ru": "Ксал'атат уничтожает Даларан над островом Дорн, и обломки города падают на Безмятежное взморье."},
   "battle", before="dragonflight", after="tww", sources=[W+"Dalaran", W+"Patch_11.0.2", "https://worldofwarcraft.blizzard.com/en-us/news/24130678/the-war-within-update-notes"])
ev("dornogal", "11.0.2", 2024, 2248, ("poi", 7898),
   {"en": "Dornogal opens its gates", "ru": "Дорногал открывает ворота"},
   {"en": "The earthen capital of Dornogal on the Isle of Dorn becomes the new hub for adventurers in Khaz Algar.",
    "ru": "Столица земельников Дорногал на острове Дорн становится новым центром для искателей приключений в Каз Алгаре."},
   "reveal", before="dragonflight", after="tww", changed=[2339], sources=[W+"Dornogal", W+"Patch_11.0.2", "https://worldofwarcraft.blizzard.com/en-us/news/24130678/the-war-within-update-notes"])
ev("siren-isle", "11.0.7", 2024, 2248, ("link", 2369),
   {"en": "Siren Isle", "ru": "Остров Сирен"},
   {"en": "The storm-wracked Siren Isle, once an azerite mine of Kul Tiras, opens off the Isle of Dorn.",
    "ru": "У острова Дорн открывается остров Сирен, где бушуют штормы и где Кул-Тирас когда-то добывал азерит."},
   "reveal", changed=[2369], sources=[W+"Siren_Isle", W+"Patch_11.0.7", "https://worldofwarcraft.blizzard.com/en-us/news/24165042"])
ev("undermine", "11.1.0", 2025, 2274, ("link", 2346),
   {"en": "Undermine opens", "ru": "Открытие Нижней Шахты"},
   {"en": "The goblin capital of Undermine, deep under Kezan, opens with the Liberation of Undermine raid.",
    "ru": "Гоблинская столица Нижняя Шахта в глубинах Кезана открывается вместе с рейдом «Освобождение Нижней Шахты»."},
   "reveal", changed=[2346], sources=[W+"Undermine", W+"Patch_11.1.0", "https://worldofwarcraft.blizzard.com/en-us/news/24179386/undermined-update-notes"])
ev("karesh", "11.2.0", 2025, 2274, ("link", 2371),
   {"en": "Ghosts of K'aresh", "ru": "Призраки К'ареша"},
   {"en": "Adventurers reach K'aresh, the ruined homeworld of the ethereals, and the Manaforge Omega raid.",
    "ru": "Искатели приключений попадают на К'ареш, разрушенную родину эфириалов, и в рейд «Манагорн Омега»."},
   "reveal", changed=[2371], sources=[W+"K'aresh", W+"Patch_11.2.0", "https://news.blizzard.com/en-us/article/24226698/ghosts-of-k-aresh-content-update-notes"])

# ---------------------------------------------------------------- midnight
MN_SITE = "https://worldofwarcraft.blizzard.com/en-us/midnight"
MN_NOTES = "https://worldofwarcraft.blizzard.com/en-us/news/24246298/second-midnight-pre-expansion-update-notes"
ev("twilight-ascension", "12.0.0", 2026, 13, ("rect", 241),
   {"en": "Twilight Ascension", "ru": "Сумеречное восхождение"},
   {"en": "Before the return to Quel'Thalas, the Twilight's Blade cult gathers in the Twilight Highlands and is driven back.",
    "ru": "Перед возвращением в Кель'Талас культ Сумеречного Клинка собирается в Сумеречном нагорье и терпит поражение."},
   "invasion", sources=[W+"Twilight_Ascension", W+"Patch_12.0.0", "https://worldofwarcraft.blizzard.com/en-us/news/24244455"])
ev("quelthalas-reborn", "12.0.1", 2026, 13, ("link", 2537),
   {"en": "Quel'Thalas is remade", "ru": "Кель'Талас преображается"},
   {"en": "Eversong Woods and the Ghostlands merge into one restored land, now joined to the rest of the Eastern Kingdoms.",
    "ru": "Леса Вечной Песни и Призрачные земли объединяются в один восстановленный край, теперь связанный с остальными Восточными королевствами."},
   "reshape", before="tww", after="midnight", changed=[2537, 2395, 94, 95], sources=[W+"Eversong_Woods", W+"World_of_Warcraft:_Midnight", MN_SITE])
ev("silvermoon-restored", "12.0.1", 2026, 2395, ("poi", 8460),
   {"en": "Silvermoon restored", "ru": "Луносвет восстановлен"},
   {"en": "Silvermoon City, rebuilt in full after decades of ruin, opens its gates to both factions against the Void.",
    "ru": "Луносвет, полностью отстроенный после десятилетий разрухи, открывает ворота обеим фракциям перед лицом Бездны."},
   "reshape", before="tww", after="midnight", changed=[2393, 110], links=["/wow/mythic-plus/midnight-season-2/murder-row"],
   sources=[W+"Silvermoon_City", W+"World_of_Warcraft:_Midnight", MN_SITE])
ev("queldanas-assault", "12.0.1", 2026, 2537, ("rect", 2424),
   {"en": "The Void strikes Quel'Danas", "ru": "Удар Бездны по Кель'Данасу"},
   {"en": "Xal'atath and her Void armies attack the Isle of Quel'Danas in a bid to claim the Sunwell.",
    "ru": "Ксал'атат и войска Бездны атакуют остров Кель'Данас, чтобы захватить Солнечный Колодец."},
   "invasion", before="tww", after="midnight", changed=[2424, 122], sources=[W+"Isle_of_Quel'Danas", W+"World_of_Warcraft:_Midnight", MN_SITE])
ev("zulaman", "12.0.1", 2026, 2537, ("rect", 2437),
   {"en": "Zul'Aman, rebuilt", "ru": "Новый Зул'Аман"},
   {"en": "The Amani homeland returns as a full zone, with the temple city of Atal'Aman at its heart.",
    "ru": "Земли Амани возвращаются как полноценная зона, в сердце которой стоит храмовый город Атал'Аман."},
   "reveal", before="tww", after="midnight", changed=[2437], links=["/wow/mythic-plus/midnight-season-2/den-of-nalorakk"],
   sources=[W+"Zul'Aman", W+"World_of_Warcraft:_Midnight", MN_SITE])
ev("harandar", "12.0.1", 2026, 2537, ("link", 2413),
   {"en": "Harandar, roots of the World Trees", "ru": "Харандар, корни Мировых деревьев"},
   {"en": "Beneath Quel'Thalas lies Harandar, a glowing cavern jungle where the roots of Azeroth's World Trees meet.",
    "ru": "Под Кель'Таласом лежит Харандар — светящиеся пещерные джунгли, где сходятся корни Мировых деревьев Азерота."},
   "reveal", before="tww", after="midnight", changed=[2413], links=["/wow/mythic-plus/midnight-season-2/the-blinding-vale", "/wow/raids/the-dreamrift"],
   sources=[W+"Harandar", W+"World_of_Warcraft:_Midnight", MN_SITE])
ev("voidstorm", "12.0.1", 2026, 2537, ("link", 2405),
   {"en": "Into the Voidstorm", "ru": "В Бурю Бездны"},
   {"en": "Heroes cross into the Voidstorm, the world Xal'atath uses as her launching point, crowned by the Voidspire.",
    "ru": "Герои отправляются в Бурю Бездны — мир, откуда Ксал'атат начинает наступление, над которым возвышается Шпиль Бездны."},
   "reveal", before="tww", after="midnight", changed=[2405], links=["/wow/raids/the-voidspire", "/wow/mythic-plus/midnight-season-2/voidscar-arena"],
   sources=[W+"Voidstorm", W+"The_Voidspire", MN_SITE])
ev("march-on-queldanas", "12.0.1", 2026, 2424, ("poi", 8271),
   {"en": "March on Quel'Danas", "ru": "Марш на Кель'Данас"},
   {"en": "The united elves storm the Void-tainted Sunwell and defeat L'ura in the final battle of the first raid tier.",
    "ru": "Объединённые эльфы штурмуют осквернённый Бездной Солнечный Колодец и побеждают Л'уру в последней битве первого рейдового этапа."},
   "battle", links=["/wow/raids/march-on-queldanas"], sources=[W+"March_on_Quel'Danas", W+"World_of_Warcraft:_Midnight", MN_SITE])
ev("val-naigtal", "12.0.7", 2026, 2405, ("link", 2599),
   {"en": "Showdown in Val and Naigtal", "ru": "Схватка в Вале и Найтале"},
   {"en": "Two new mini zones open beyond the Voidstorm, the frozen world of Val and Naigtal, to confront leaders of the Void.",
    "ru": "За Бурей Бездны открываются две новые мини-зоны — ледяной мир Вал и Найтал, где героев ждут предводители Бездны."},
   "reveal", changed=[2599, 2600], sources=[W+"Val", W+"Patch_12.0.7", "https://worldofwarcraft.blizzard.com/en-us/news/24244888/revelations-content-update-notes"],
   note="Anchor: UiMapLink rectangle Voidstorm -> Val (Naigtal sits on the opposite side of the same map).")
ev("sporefall", "12.0.7", 2026, 2413, ("poi", 8256),
   {"en": "Sporefall", "ru": "Споропад"},
   {"en": "In Harandar the fungarians grow the giant Rotmire, and the one-boss Sporefall raid opens.",
    "ru": "В Харандаре грибной народ выращивает гиганта Гнилотопа, и открывается рейд из одного босса — Споропад."},
   "instance", links=["/wow/raids/sporefall"], sources=[W+"Sporefall", W+"Patch_12.0.7", "https://worldofwarcraft.blizzard.com/en-us/news/24244888/revelations-content-update-notes"])
ev("coiled-isle", "12.1.0", 2026, 2537, ("rect", 2512),
   {"en": "The Coiled Isle emerges", "ru": "Спиральный остров выходит из тумана"},
   {"en": "The fog lifts from the island east of Zul'Aman, revealing the temple of Atal'Utek and the Venomous Abyss.",
    "ru": "Туман над островом к востоку от Зул'Амана рассеивается, открывая храм Атал'Утек и Отравленную бездну."},
   "reveal", changed=[2512, 2509], links=["/wow/mythic-plus/midnight-season-2/altar-of-fangs", "/wow/raids/venomous-abyss"],
   sources=[W+"Coiled_Isle", W+"Patch_12.1.0", "https://news.blizzard.com/en-us/article/24293281/curse-of-ula-tek-content-update-notes"])
ev("unbinding-of-kithix", "12.1.5", 2026, 2509, ("poi", 9034),
   {"en": "The Unbinding of Kith'ix", "ru": "Освобождение Кит'икса"},
   {"en": "With Ula'tek defeated, the bonds on the C'Thraxxi general Kith'ix weaken beneath the Coiled Isle.",
    "ru": "После поражения Ула'тека слабеют путы, которыми под Спиральным островом скован ц'тракский генерал Кит'икс."},
   "instance", links=["/wow/raids/the-unbinding-of-kithix"], note="Map 2916 (Vaults of Atal'Utek) has its own coordinates, so the marker sits on UiMap 2509, not on the Coiled Isle map. The raid entrance (AreaPOI 9031) lies just beyond the map's northern edge; the marker uses AreaPOI 9034 'The Vaults of Ula'tek' at that edge.", sources=[W+"The_Unbinding_of_Kith'ix", W+"Patch_12.1.5", "https://news.blizzard.com/en-us/article/24304162/12-1-5-content-update-notes"])
