# Сцены подземелий и рейдов Forever

Графика Blizzard Entertainment из интерфейса World of Warcraft. Сайт фанатский, графика не своя — положение то же, что у игровых иконок и карт.

- Источник: https://github.com/Gethe/wow-ui-textures, ветка `live`, коммит `d23deaf8f44a7d280dc974a5c9d5321c013db59b` (9.2.7).
- Локальный архив: `/home/debian/wow-assets/wow-ui-textures`; пути в таблице — от его корня.
- Обработка: вырезан прямоугольник чистой картины (без полос кожи, логотипа, полосы загрузки), возвращена пропорция (загрузочные экраны хранятся сжатыми по ширине, настоящая 4:3 — ширина × 4/3; лента Garrison — как есть), приведено к 1280×640 фильтром lanczos3, WebP q80 без альфы. Цвета и резкость не менялись, ничего не дорисовано.
- `manifest.json`: `position` — CSS object-position главного объекта для обрезки до 3:2 и до широкой шапки.
- Скрипты и контакт-листы: `/home/debian/gildra-forever-design-20261113/instances/art-tools/` (`crops.json`, `build.cjs`, `meta.cjs`).

| slug | файл в архиве | вырезка (пиксели исходника) | примечание |
|---|---|---|---|
| ragefire-chasm | `Glues/LOADINGSCREENS/LoadScreenRagefireChasm.PNG` | x 40, y 120, 432×288 | Свой загрузочный экран. |
| the-deadmines | `Glues/LOADINGSCREENS/LoadScreenDeadmines.PNG` | x 40, y 120, 432×288 | Свой загрузочный экран. |
| wailing-caverns | `Glues/LOADINGSCREENS/LoadScreenWailingCaverns.PNG` | x 40, y 120, 432×288 | Свой загрузочный экран. |
| shadowfang-keep | `Glues/LOADINGSCREENS/LOADSCREENSHADOWFANGKEEP.PNG` | x 116, y 284, 792×528 | Свой загрузочный экран (1024×1024); верх срезан ниже логотипа и его тени. |
| blackfathom-deeps | `Glues/LOADINGSCREENS/LoadScreenBlackFathomDeeps.PNG` | x 0, y 120, 423×282 | Свой загрузочный экран; нага слева оставлена в кадре, низ срезан на y 402. |
| the-stockade | `Glues/LOADINGSCREENS/LoadScreenStormwindStockade.PNG` | x 40, y 120, 432×288 | Свой загрузочный экран. |
| gnomeregan | `Glues/LOADINGSCREENS/LoadScreenGnomeregan.PNG` | x 40, y 120, 432×288 | Свой загрузочный экран. |
| razorfen-kraul | `Glues/LOADINGSCREENS/LoadScreenRazorfenKraul.PNG` | x 56, y 124, 402×268 | Свой загрузочный экран; кадр уже, чтобы убрать бурую виньетку по краям. |
| scarlet-monastery | `Glues/LOADINGSCREENS/LoadScreenMonastery.PNG` | x 60, y 120, 432×288 | Классический экран `LoadScreenMonastery`; `LoadScreenScarletMonastery2` — вид Mists of Pandaria, не взят. |
| uldaman | `Glues/LOADINGSCREENS/LOADSCREENULDAMAN.PNG` | x 40, y 120, 432×288 | Свой загрузочный экран. |
| razorfen-downs | `Glues/LOADINGSCREENS/LoadScreenRazorfenDowns.PNG` | x 60, y 120, 432×288 | Свой загрузочный экран. |
| zul-farrak | `Glues/LOADINGSCREENS/LoadScreenZulFarrak.PNG` | x 50, y 120, 432×288 | Свой загрузочный экран. |
| maraudon | `Glues/LOADINGSCREENS/LoadScreenMaraudon.PNG` | x 40, y 120, 432×288 | Свой загрузочный экран. |
| sunken-temple | `Glues/LOADINGSCREENS/LoadScreenSunkenTemple.PNG` | x 54, y 120, 432×288 | Свой загрузочный экран. |
| blackrock-depths | `Glues/LOADINGSCREENS/LoadScreenBlackrockDepths.PNG` | x 40, y 120, 432×288 | Свой загрузочный экран. |
| blackrock-spire | `Glues/LOADINGSCREENS/LoadScreenBlackrockSpire.PNG` | x 10, y 120, 432×288 | Свой загрузочный экран. |
| dire-maul | `Glues/LOADINGSCREENS/LoadScreenDireMaul.PNG` | x 50, y 120, 432×288 | Свой загрузочный экран. |
| stratholme | `Glues/LOADINGSCREENS/LoadScreenStrathome.PNG` | x 30, y 120, 432×288 | Свой загрузочный экран (в архиве имя с опечаткой Strathome). |
| scholomance | `Glues/LOADINGSCREENS/LoadScreenScholomance.PNG` | x 40, y 120, 432×288 | Свой загрузочный экран (классический, не Scholomance2). |
| hall-of-thanes | `Glues/LOADINGSCREENS/LoadScreenDeepRunTram.PNG` | x 4, y 168, 288×192 | Новое место. Экран подземки: зал станции в Стальгорне — та же архитектура дворфов. Взята левая часть без гнома, поэтому кадр мелкий (288×192) и мягкий. Смотрел: `WorldMap/OldIronforge` и `WorldMap/Ironforge` (плоские карты-схемы), `LOADSCREENGRIMBATOL` (крепость дворфов, резче, но другое место — запасной вариант), `LOADSCREENULDUAR77`, `Glues/CREDITS/ID_Town*`. |
| ruins-of-lordaeron | `Glues/LOADINGSCREENS/LoadScreenRuinsofLordaeronBattlegrounds.PNG` | x 1, y 152, 510×340 | Новое место. Экран арены «Руины Лордерона» — именно это место. Картина идёт до низа файла, верх срезан ниже логотипа Burning Crusade. |
| excavation-site | `Glues/LOADINGSCREENS/LoadScreenDungeon.PNG` | x 70, y 120, 432×288 | Новое место. Общий классический экран подземелий: исследователь с факелом в древнем своде — по смыслу раскопки. Своей картины раскопок Болотины в архиве нет. Смотрел: `WorldMap/Wetlands` (пустая карта-подложка), `LoadScreenSilvershardMines`, `LoadScreenTwinPeaksBG`, `LoadScreenCave`, `TitleCards/*excavation*`; Ульдаман занят. |
| city-of-dalaran | `Glues/LOADINGSCREENS/LOADSCREENDALARANPRISON.PNG` | x 40, y 318, 753×502 | Новое место. Экран Аметистовой крепости: архитектура Даларана. Срез ниже логотипа Wrath of the Lich King. Смотрел: `LoadScreenDalaranSewersArena` (стоки), `Loadingscreen_VioletHold_wide` (Legion), `Garrison/GarrisonMissionLocationDalaran` (снимок города из игры, не живопись), `Glues/CREDITS/Dalaran*` и `DalaranDome*` (уходят в прозрачность). |
| the-drowned-city | `Glues/LOADINGSCREENS/LoadScreenZulGurub.PNG` | x 40, y 120, 432×288 | Новое место. Экран Зул'Гуруба: руины троллей в Тернистой долине, мост над водой. Смотрел: `LOADSCREENGUNDRAK`, `LoadScreenZulAman2`, `LoadScreenThroneoftheTides`, `Glues/CREDITS/Strangle*` (мал и уходит в прозрачность). |
| kroldok-stronghold | `Glues/LOADINGSCREENS/LoadingScreen_HighMaulRaid.PNG` | x 60, y 286, 897×598 | Новое место. Экран Верховного Молота: зал крепости огров. `LoadScreenOgreCompound` тоже смотрел — тёмно-красный, постройки не читаются; `LoadScreenDireMaul` занят. |
| alcaz-prison | `Glues/LOADINGSCREENS/LOADSCREENTOLBARAD.PNG` | x 20, y 292, 792×528 | Новое место. Экран Тол Барада: каменная тюрьма-крепость людей на острове — по смыслу, не сам Алькац. `LoadScreenTheramoreAlliance/Horde` не взяты: сепия-карта разрушенного Терамора с бомбой. Смотрел ещё `LoadScreenBaradinHold`, `WorldMap/Dustwallow` (пустая подложка). Срез ниже логотипа, верх шпиля башни чуть обрезан. |
| blackmaw-hold | `Garrison/GarrisonMissionLocationAzshara.PNG` | x 200, y 0, 572×286 | Новое место. Лента фона миссий гарнизона «Азшара»: осенний лес Азшары — снимок игры, не живопись, без фурболгов. Пропорция как есть. Загрузочного экрана Азшары и фурболгов нет. Смотрел: `QuestionFrame/answer-warboard-classic-Azshara` (256×128), `Glues/CREDITS/Grizzlemaw*` (уходит в прозрачность). |
| shapers-terrace | `Glues/LOADINGSCREENS/LoadScreenHallsofOrigination.PNG` | x 130, y 294, 789×526 | Новое место. Экран Чертогов Созидания: зал титанов, соседний Ульдум — архитектура титанов, не сам Ун'Горо. Смотрел: `LOADSCREENULDUAR77`, `WorldMap/UngoroCrater` (пустая подложка), `Pictures/11733_ungoro_256`, `Glues/CREDITS/Titan*`; Ульдаман занят. |
| onyxias-lair | `Glues/LOADINGSCREENS/LoadScreenRaid.PNG` | x 84, y 120, 417×278 | Общий классический экран рейдов: на нём Ониксия в своём логове и отряд на уступе. Низ срезан на y 398 (ниже уже кожа). `EncounterJournal/UI-EJ-BACKGROUND-OnyxiasLair` — та же картина, но выцветшая, `UI-EJ-LOREBG-OnxyiasLair` — мелкий портрет в рамке. |
| hyjal-summit | `Glues/LOADINGSCREENS/LoadScreenHyjal.PNG` | x 60, y 150, 369×246 | Свой загрузочный экран; срез ниже логотипа Burning Crusade, поэтому кадр мелкий (369×246), солнце ушло за верхний край. |
| barrow-deeps | `Glues/LOADINGSCREENS/LoadScreenEnviroment.PNG` | x 40, y 120, 432×288 | Новое место. Общий классический экран природы: туманная лесная лощина под сплетёнными корнями — по смыслу лес ночных эльфов. Смотрел: `LoadScreenCave` (пещера с дверью и костром), `LoadingScreen_VaultOfTheWardens_wide` и `LoadingScreen_EmeraldDreamway_wide` (Legion, другие места), `LoadScreen_DarkshoreWarfront`, `Garrison/GarrisonMissionLocationUnderground`, `Glues/CREDITS/NightsHollow*`. |
