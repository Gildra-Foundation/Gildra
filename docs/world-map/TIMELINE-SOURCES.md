# World map timeline — sources and coordinate method

Internal research notes for `apps/web/data/wow/map/events.json` and `eras-meta.json`.
Nothing here is shown on the site (clean-UI rule: no provenance text on pages).

Researched 2026-11-07 by session [MAPT]. Regenerate with
`python3 -I scripts/world-map/build_timeline.py --data <dir> --methods <file>` from `apps/web`;
event definitions (anchors, texts, sources) live in `apps/web/scripts/world-map/timeline_events.py`.

## Data contract (events.json)

`[{ id, eraId, patch, year, kind, title{en,ru}, summary{en,ru}, mapId, x, y, beforeEraId?, afterEraId?, changedMapIds?, links? }]`

- `eraId` is derived from the patch major (1 → `vanilla` … 12 → `midnight`); the ids match `eras-meta.json` and the era ids of `eras.json` ([MAPD]).
- `mapId` is a retail UiMapID; `x`/`y` are normalised 0..1 in that map. Whole-zone changes sit on the parent continent at the zone centre; site-specific events sit on the zone map at the exact point.
- `beforeEraId`/`afterEraId` are set only when the change ships with an expansion (pre-patch or launch), so the two eras show the two states. Mid-expansion changes (5.4 Vale, 7.2 Broken Shore, 12.1 Coiled Isle …) carry only `changedMapIds`.
- Additions to the brief's contract (all optional for the viewer): `kind` (`reshape` | `reveal` | `battle` | `invasion` | `instance`) for the marker icon, `changedMapIds` (retail UiMapIDs whose art differs before/after — for the compare mode), `links` (locale-free site paths; prefix `/ru` for Russian).
- `year` is the calendar year of the patch (for raid openings the year the raid opened).
- Events are ordered by patch.

## Inputs

- `catalog_db2_rows` (read-only SELECT): `UiMap` (en_US + ru_RU), `UiMapAssignment`, `UiMapLink`, `JournalInstance`, `AreaTable`, `QuestPOIBlob`/`QuestPOIPoint`, `Map` — retail build id 1599 = 12.1.5.70575.
- `AreaPOI` is not in the catalog. It was taken from the game client's own DB2 table as exported by wago.tools (`/db2/AreaPOI/csv`, current retail build on 2026-11-07; the build-pinned URL answered 503, so the exact build number was not recorded). The project's catalog import uses the same exporter (`backend/internal/wago`). 3 946 rows.
- Russian place names come from the ruRU UiMap/AreaTable/JournalInstance rows (e.g. Безмятежное взморье, Великий Раздел, Споропад, Отравленная бездна, Освобождение Кит'икса).

## Projection

UiMapAssignment maps a world rectangle `Region_0..5` (minX, minY, minZ, maxX, maxY, maxZ) of an instance map onto the UI rectangle `UiMin`..`UiMax` of a UiMap:

```
u = UiMin_0 + (Region_4 − Y) / (Region_4 − Region_1) · (UiMax_0 − UiMin_0)
v = UiMin_1 + (Region_3 − X) / (Region_3 − Region_0) · (UiMax_1 − UiMin_1)
```

The smallest assignment of the target UiMap that contains the point is used. Checked against known positions: the Orgrimmar AreaPOI falls at (0.583, 0.445) on Kalimdor, inside the Orgrimmar city rectangle (0.559–0.606, 0.400–0.448); the Icecrown Citadel raid POI at (0.538, 0.871) on Icecrown.

Anchor kinds: AreaPOI world position; centre of a child UiMap's assignment rectangle; centre of a UiMapLink rectangle (maps without shared coordinates — Voidstorm, Harandar, Undermine, K'aresh, Siren Isle, Oribos, Zereth Mortis, Argus, Draenor, the Maelstrom); QuestPOIPoint world points; centre of a parent map's own assignment rectangle.

## Verification

Each event is checked against at least two sources: warcraft.wiki.gg (patch page with its patchbox release date and the event/zone page with its "Patch changes" list) and Blizzard's own patch notes or news (worldofwarcraft.com / news.blizzard.com, archived copies for 2006–2015). Every official URL below answered HTTP 200 on 2026-11-07 and contained the relevant name (e.g. 1.9 notes → "Ahn'Qiraj", 12.1.0 notes → "Coiled Isle", 12.1.5 notes → "Kith'ix"). Exceptions are listed under "Uncertain".

Patch release dates used for `year` (patchbox, warcraft.wiki.gg): 1.9.0 2006-01-03 · 1.11.0 2006-06-19 · 2.0.3 2007-01-09 · 2.3.0 2007-11-13 · 2.4.0 2008-03-25 · 3.0.2 2008-10-14 · 3.3.0 2009-12-08 · 4.0.3a 2010-11-23 · 5.0.4 2012-08-28 · 5.2.0 2013-03-05 · 5.4.0 2013-09-10 · 6.0.2 2014-10-14 · 6.0.3 2014-10-28 · 6.2.0 2015-06-22 · 7.0.3 2016-07-19 · 7.2.0 2017-03-28 · 7.3.0 2017-08-29 · 7.3.2 2017-10-24 · 8.0.1 2018-07-17 · 8.1.0 2018-12-11 · 8.2.0 2019-06-25 · 8.3.0 2020-01-14 · 9.0.1 2020-10-13 · 9.0.2 2020-11-17 · 9.1.0 2021-06-29 · 9.2.0 2022-02-22 · 10.0.2 2022-11-15 · 10.1.0 2023-05-02 · 10.2.0 2023-11-07 · 11.0.2 2024-08-13 · 11.0.7 2024-12-17 · 11.1.0 2025-02-25 · 11.2.0 2025-08-05 · 12.0.0 2026-01-20 · 12.0.1 2026-02-10 (Midnight launch 2026-03-02) · 12.0.7 2026-06-16 · 12.1.0 2026-08-11 · 12.1.5 2026-10-13.

Era ranges (eras-meta.json): first/last patch of each expansion from the patchbox Prev/Next chain — 1.1.0–1.12.3, 2.0.1–2.4.3, 3.0.2–3.3.5a, 4.0.1–4.3.4, 5.0.4–5.4.8, 6.0.2–6.2.4a, 7.0.3–7.3.5, 8.0.1–8.3.7, 9.0.1–9.2.7, 10.0.0–10.2.7, 11.0.0–11.2.7, 12.0.0– (current 12.1.5). Accent colours and emblems are design suggestions, not game data.

## Corrections to the brief

- Theramore's destruction is patch **5.0.4**, not 5.1: the scenario and the destroyed phase were added in 5.0.4 (Theramore Isle and Dustwallow Marsh patch changes; 5.0.4 notes), unlocked shortly after the patch went live.
- Sargeras' sword strike on Silithus is dated 7.3.2 (Antorus) on the zone page; the revamped zone "Silithus: The Wound" is a 7.3.5 highlight. Event uses 7.3.2.

## Uncertain / weaker items

- `stormwind-park`, `orgrimmar-rebuilt`: the official 4.0.3a notes only describe the Shattering in general; second source is GamesRadar's Cataclysm feature (2010), plus the Stormwind City / Orgrimmar patch-change lists.
- `twilight-ascension`: the Russian event name «Сумеречное восхождение» is our translation; the official Russian name was not found in game data.
- `battle-for-darkshore`: year 2018 is the 8.1.0 patch year; the warfront may have opened for players later.
- `scourge-invasion`: the vanilla Naxxramas has no AreaPOI in the retail client; marker uses the Stratholme POI next to the Plaguewood.
- `nazjatar`: no Azeroth-map rectangle exists; marker is the midpoint of the two "Boat to Nazjatar" POIs.
- `unbinding-of-kithix`: raid entrance POI lies just outside UiMap 2509; marker uses the neighbouring POI at the map edge.
- AreaPOI build: current retail export, exact build not recorded (see Inputs).

## Considered and left out

- Westfall and Loch Modan (Cataclysm): changes are mostly quest/story; no second source describing a map change.
- Argent Tournament (3.1): no AreaPOI or quest point found to place it exactly.
- Elemental Unrest (4.0.1), Zombie Infestation (3.0.2), Void Assaults (12.0.5): world events without a lasting map change.

## Per-event positions and sources

### `ahnqiraj-gates` — The Gates of Ahn'Qiraj open (1.9.0, vanilla)

- Position: UiMap 81 “Silithus”, x=0.3644, y=0.9403 — AreaPOI 6538 “Ruins of Ahn'Qiraj” (map 1: -8417.7, 1504.4) projected through UiMapAssignment 39840.
- Sources: <https://warcraft.wiki.gg/wiki/Patch_1.9.0>; <https://warcraft.wiki.gg/wiki/Gates_of_Ahn'Qiraj>; <https://web.archive.org/web/20060323023349/http://worldofwarcraft.com/patchnotes/patch1p9.html>

### `scourge-invasion` — The Scourge invades and Naxxramas appears (1.11.0, vanilla)

- Position: UiMap 23 “Eastern Plaguelands”, x=0.2708, y=0.1152 — AreaPOI 6724 “Stratholme” (map 0: 3394.7, -3379.1) projected through UiMapAssignment 39376.
- Note: Anchor: AreaPOI 6724 Stratholme (Naxxramas hovered over the Plaguewood beside it); the vanilla citadel has no own AreaPOI in the retail client.
- Sources: <https://warcraft.wiki.gg/wiki/Patch_1.11.0>; <https://warcraft.wiki.gg/wiki/Scourge_Invasion>; <https://web.archive.org/web/20060719020411/http://www.worldofwarcraft.com:80/patchnotes/patch1p11.html>

### `dark-portal-opens` — The Dark Portal reopens (2.0.3, tbc)

- Position: UiMap 17 “Blasted Lands”, x=0.5489, y=0.5289 — AreaPOI 5056 “The Dark Portal” (map 0: -11874.8, -3204.2) projected through UiMapAssignment 39350.
- Sources: <https://warcraft.wiki.gg/wiki/Patch_2.0.3>; <https://warcraft.wiki.gg/wiki/Dark_Portal>; <https://web.archive.org/web/20070201000000/http://www.worldofwarcraft.com/patchnotes/>

### `zulaman-raid` — Zul'Aman opens (2.3.0, tbc)

- Position: UiMap 95 “Ghostlands”, x=0.8196, y=0.6434 — AreaPOI 6683 “Zul'Aman” (map 530: 6851.1, -7987.9) projected through UiMapAssignment 39857.
- Sources: <https://warcraft.wiki.gg/wiki/Patch_2.3.0>; <https://warcraft.wiki.gg/wiki/Zul'Aman>; <https://web.archive.org/web/20071201000000/http://www.worldofwarcraft.com/patchnotes/>

### `sunwell-isle` — Fury of the Sunwell (2.4.0, tbc)

- Position: UiMap 122 “Isle of Quel'Danas”, x=0.4426, y=0.456 — AreaPOI 6533 “Sunwell Plateau” (map 530: 12556.9, -6774.7) projected through UiMapAssignment 39894.
- Sources: <https://warcraft.wiki.gg/wiki/Patch_2.4.0>; <https://warcraft.wiki.gg/wiki/Isle_of_Quel'Danas>; <https://web.archive.org/web/20080415000000/http://www.worldofwarcraft.com/patchnotes/>

### `northrend` — Northrend opens (3.0.2, wrath)

- Position: UiMap 947 “Azeroth”, x=0.4997, y=0.1507 — centre of UiMap 113 “Northrend” (UiMapAssignment 39885) inside UiMap 947 (UiMapAssignment 44849).
- Sources: <https://warcraft.wiki.gg/wiki/Patch_3.0.2>; <https://warcraft.wiki.gg/wiki/World_of_Warcraft:_Wrath_of_the_Lich_King>; <https://web.archive.org/web/20081204055431/http://www.worldofwarcraft.com:80/patchnotes/>

### `dalaran-to-northrend` — Dalaran moves to Northrend (3.0.2, wrath)

- Position: UiMap 127 “Crystalsong Forest”, x=0.2961, y=0.3924 — centre of UiMap 125 “Dalaran” (UiMapAssignment 39897) inside UiMap 127 (UiMapAssignment 40042).
- Sources: <https://warcraft.wiki.gg/wiki/Dalaran>; <https://warcraft.wiki.gg/wiki/Patch_3.0.2>; <https://web.archive.org/web/20081204055431/http://www.worldofwarcraft.com:80/patchnotes/>

### `wrathgate` — Battle at the Wrathgate (3.0.2, wrath)

- Position: UiMap 115 “Dragonblight”, x=0.3926, y=0.2072 — midpoint of QuestPOI turn-in points of quests 12499/12500 'Return To Angrathar': map 571 (4800.0, 1425.5) projected through UiMapAssignment 39887.
- Sources: <https://warcraft.wiki.gg/wiki/Angrathar_the_Wrathgate>; <https://warcraft.wiki.gg/wiki/Patch_3.0.2>; <https://web.archive.org/web/20081204055431/http://www.worldofwarcraft.com:80/patchnotes/>

### `battle-for-undercity` — Battle for the Undercity (3.0.2, wrath)

- Position: UiMap 18 “Tirisfal Glades”, x=0.6181, y=0.7446 — AreaPOI 18 “Undercity” (map 0: 1594.3, 240.3) projected through UiMapAssignment 39351.
- Sources: <https://warcraft.wiki.gg/wiki/Battle_for_the_Undercity>; <https://warcraft.wiki.gg/wiki/Patch_3.0.2>; <https://web.archive.org/web/20081204055431/http://www.worldofwarcraft.com:80/patchnotes/>

### `icecrown-citadel` — Fall of the Lich King (3.3.0, wrath)

- Position: UiMap 118 “Icecrown”, x=0.538, y=0.8709 — AreaPOI 6521 “Icecrown Citadel” (map 571: 5785.6, 2069.7) projected through UiMapAssignment 39890.
- Sources: <https://warcraft.wiki.gg/wiki/Patch_3.3.0>; <https://warcraft.wiki.gg/wiki/Icecrown_Citadel>; <https://web.archive.org/web/20100207210021/http://www.worldofwarcraft.com/patchnotes/>

### `shattering` — The Shattering (4.0.3a, cataclysm)

- Position: UiMap 947 “Azeroth”, x=0.4508, y=0.4694 — centre of UiMapLink 1 (UiMap 947 → 948 “The Maelstrom”).
- Sources: <https://warcraft.wiki.gg/wiki/Patch_4.0.3a>; <https://warcraft.wiki.gg/wiki/Shattering>; <https://web.archive.org/web/20101203125846/http://www.worldofwarcraft.com/patchnotes/>

### `thousand-needles-flooded` — Thousand Needles floods (4.0.3a, cataclysm)

- Position: UiMap 12 “Kalimdor”, x=0.5353, y=0.7232 — centre of UiMap 64 “Thousand Needles” (UiMapAssignment 39725) inside UiMap 12 (UiMapAssignment 39324).
- Sources: <https://warcraft.wiki.gg/wiki/Thousand_Needles>; <https://warcraft.wiki.gg/wiki/Patch_4.0.3a>; <https://web.archive.org/web/20101203125846/http://www.worldofwarcraft.com/patchnotes/>

### `barrens-split` — The Barrens split in two (4.0.3a, cataclysm)

- Position: UiMap 12 “Kalimdor”, x=0.5104, y=0.5196 — AreaPOI 7503 “Great Divide Dive” (map 1: -438.7, -1716.0) projected through UiMapAssignment 39324.
- Note: Anchor: AreaPOI 7503 'Great Divide Dive' (Kalimdor Cup race start at the rift); the rift itself has no AreaPOI.
- Sources: <https://warcraft.wiki.gg/wiki/Northern_Barrens>; <https://warcraft.wiki.gg/wiki/Patch_4.0.3a>; <https://web.archive.org/web/20110106083701/http://www.worldofwarcraft.com/cataclysm/features/>

### `darkshore-shattered` — Darkshore is shattered (4.0.3a, cataclysm)

- Position: UiMap 62 “Darkshore”, x=0.4029, y=0.4138 — AreaPOI 798 “Auberdine” (map 1: 6439.3, 412.0) projected through UiMapAssignment 39723.
- Sources: <https://warcraft.wiki.gg/wiki/Darkshore>; <https://warcraft.wiki.gg/wiki/Patch_4.0.3a>; <https://web.archive.org/web/20110106083701/http://www.worldofwarcraft.com/cataclysm/features/>

### `badlands-scarred` — Deathwing scars the Badlands (4.0.3a, cataclysm)

- Position: UiMap 13 “Eastern Kingdoms”, x=0.5379, y=0.6939 — centre of UiMap 15 “Badlands” (UiMapAssignment 39327) inside UiMap 13 (UiMapAssignment 39325).
- Sources: <https://warcraft.wiki.gg/wiki/Badlands>; <https://warcraft.wiki.gg/wiki/Patch_4.0.3a>; <https://web.archive.org/web/20110106083701/http://www.worldofwarcraft.com/cataclysm/features/>

### `stormwind-park` — Deathwing burns Stormwind Park (4.0.3a, cataclysm)

- Position: UiMap 84 “Stormwind City”, x=0.355, y=0.6563 — AreaPOI 2432 “Lion's Rest” (map 0: -8756.0, 1106.2) projected through UiMapAssignment 39844.
- Note: Anchor: AreaPOI 2432 Lion's Rest, built on the ruins of the park.
- Sources: <https://warcraft.wiki.gg/wiki/Stormwind_City>; <https://www.gamesradar.com/50-reasons-to-play-wow-cataclysm/2>

### `orgrimmar-rebuilt` — Garrosh rebuilds Orgrimmar (4.0.3a, cataclysm)

- Position: UiMap 12 “Kalimdor”, x=0.5827, y=0.424 — centre of UiMap 85 “Orgrimmar” (UiMapAssignment 39845) inside UiMap 12 (UiMapAssignment 39324).
- Sources: <https://warcraft.wiki.gg/wiki/Orgrimmar>; <https://www.gamesradar.com/50-reasons-to-play-wow-cataclysm/2>

### `azshara-goblins` — Goblins reshape Azshara (4.0.3a, cataclysm)

- Position: UiMap 12 “Kalimdor”, x=0.6304, y=0.3573 — centre of UiMap 76 “Azshara” (UiMapAssignment 39829) inside UiMap 12 (UiMapAssignment 39324).
- Sources: <https://warcraft.wiki.gg/wiki/Azshara>; <https://warcraft.wiki.gg/wiki/Patch_4.0.3a>; <https://web.archive.org/web/20110106083701/http://www.worldofwarcraft.com/cataclysm/features/>

### `hyjal-assault` — The fight for Mount Hyjal (4.0.3a, cataclysm)

- Position: UiMap 12 “Kalimdor”, x=0.5619, y=0.2766 — AreaPOI 2606 “Nordrassil” (map 1: 5523.9, -3609.9) projected through UiMapAssignment 39324.
- Note: Anchor: AreaPOI 2606 Nordrassil.
- Sources: <https://warcraft.wiki.gg/wiki/Mount_Hyjal>; <https://warcraft.wiki.gg/wiki/Patch_4.0.3a>; <https://web.archive.org/web/20110106083701/http://www.worldofwarcraft.com/cataclysm/features/>

### `vashjir` — Vashj'ir beneath the waves (4.0.3a, cataclysm)

- Position: UiMap 13 “Eastern Kingdoms”, x=0.3284, y=0.6636 — centre of UiMap 203 “Vashj'ir” (UiMapAssignment 40528) inside UiMap 13 (UiMapAssignment 39325).
- Sources: <https://warcraft.wiki.gg/wiki/Patch_4.0.3a>; <https://warcraft.wiki.gg/wiki/Vashj'ir>; <https://web.archive.org/web/20110106083701/http://www.worldofwarcraft.com/cataclysm/features/>

### `uldum-revealed` — Uldum is revealed (4.0.3a, cataclysm)

- Position: UiMap 12 “Kalimdor”, x=0.4816, y=0.9132 — centre of UiMap 249 “Uldum” (UiMapAssignment 40951) inside UiMap 12 (UiMapAssignment 39324).
- Sources: <https://warcraft.wiki.gg/wiki/Uldum>; <https://warcraft.wiki.gg/wiki/Patch_4.0.3a>; <https://web.archive.org/web/20110106083701/http://www.worldofwarcraft.com/cataclysm/features/>

### `twilight-highlands` — Twilight Highlands open (4.0.3a, cataclysm)

- Position: UiMap 13 “Eastern Kingdoms”, x=0.5772, y=0.5871 — centre of UiMap 241 “Twilight Highlands” (UiMapAssignment 40875) inside UiMap 13 (UiMapAssignment 39325).
- Sources: <https://warcraft.wiki.gg/wiki/Twilight_Highlands>; <https://warcraft.wiki.gg/wiki/Patch_4.0.3a>; <https://web.archive.org/web/20110106083701/http://www.worldofwarcraft.com/cataclysm/features/>

### `gilneas-opens` — The Greymane Wall falls (4.0.3a, cataclysm)

- Position: UiMap 13 “Eastern Kingdoms”, x=0.4104, y=0.503 — centre of UiMap 217 “Ruins of Gilneas” (UiMapAssignment 40554) inside UiMap 13 (UiMapAssignment 39325).
- Sources: <https://warcraft.wiki.gg/wiki/Gilneas>; <https://warcraft.wiki.gg/wiki/Patch_4.0.3a>; <https://web.archive.org/web/20110106083701/http://www.worldofwarcraft.com/cataclysm/features/>

### `pandaria` — Pandaria emerges from the mists (5.0.4, mop)

- Position: UiMap 947 “Azeroth”, x=0.481, y=0.8093 — centre of UiMap 424 “Pandaria” (UiMapAssignment 42371) inside UiMap 947 (UiMapAssignment 44850).
- Sources: <https://warcraft.wiki.gg/wiki/Patch_5.0.4>; <https://warcraft.wiki.gg/wiki/Pandaria>; <https://web.archive.org/web/2012/http://us.battle.net/wow/en/blog/7080372>

### `theramore-destroyed` — The fall of Theramore (5.0.4, mop)

- Position: UiMap 70 “Dustwallow Marsh”, x=0.6502, y=0.4705 — AreaPOI 791 “Theramore Isle” (map 1: -3680.2, -4388.5) projected through UiMapAssignment 39761.
- Note: Patch is 5.0.4 (not 5.1): the scenario and the destroyed phase were added with 5.0.4, unlocked a little after the patch went live.
- Sources: <https://warcraft.wiki.gg/wiki/Theramore_Isle>; <https://warcraft.wiki.gg/wiki/Dustwallow_Marsh>; <https://web.archive.org/web/2012/http://us.battle.net/wow/en/blog/7080372>

### `isle-of-thunder` — The Isle of Thunder rises (5.2.0, mop)

- Position: UiMap 424 “Pandaria”, x=0.219, y=0.1231 — centre of UiMap 504 “Isle of Thunder” (UiMapAssignment 42828) inside UiMap 424 (UiMapAssignment 44856).
- Sources: <https://warcraft.wiki.gg/wiki/Isle_of_Thunder>; <https://warcraft.wiki.gg/wiki/Patch_5.2.0>; <https://web.archive.org/web/20131116170039/http://us.battle.net/wow/en/blog/8896363>

### `vale-corrupted` — The Vale of Eternal Blossoms is ravaged (5.4.0, mop)

- Position: UiMap 424 “Pandaria”, x=0.4859, y=0.539 — centre of UiMap 390 “Vale of Eternal Blossoms” (UiMapAssignment 42279) inside UiMap 424 (UiMapAssignment 42371).
- Sources: <https://warcraft.wiki.gg/wiki/Vale_of_Eternal_Blossoms>; <https://warcraft.wiki.gg/wiki/Patch_5.4.0>; <https://worldofwarcraft.com/en-us/news/10788364/>

### `siege-of-orgrimmar` — Siege of Orgrimmar (5.4.0, mop)

- Position: UiMap 12 “Kalimdor”, x=0.5826, y=0.4454 — AreaPOI 33 “Orgrimmar” (map 1: 1381.8, -4371.2) projected through UiMapAssignment 39324.
- Sources: <https://warcraft.wiki.gg/wiki/Siege_of_Orgrimmar>; <https://warcraft.wiki.gg/wiki/Patch_5.4.0>; <https://worldofwarcraft.com/en-us/news/10788364/>

### `iron-horde-incursion` — The Iron Horde comes through the Dark Portal (6.0.2, wod)

- Position: UiMap 17 “Blasted Lands”, x=0.5489, y=0.5289 — AreaPOI 5056 “The Dark Portal” (map 0: -11874.8, -3204.2) projected through UiMapAssignment 39350.
- Sources: <https://warcraft.wiki.gg/wiki/Iron_Horde_Incursion>; <https://warcraft.wiki.gg/wiki/Blasted_Lands>; <https://worldofwarcraft.com/en-us/news/15682579/>

### `draenor` — Expedition to Draenor (6.0.3, wod)

- Position: UiMap 946 “Cosmic”, x=0.8335, y=0.5975 — centre of UiMapLink 8 (UiMap 946 → 572 “Draenor”).
- Sources: <https://warcraft.wiki.gg/wiki/Patch_6.0.3>; <https://warcraft.wiki.gg/wiki/World_of_Warcraft:_Warlords_of_Draenor>; <https://worldofwarcraft.com/en-us/news/15682579/>

### `tanaan-jungle` — Assault on Tanaan Jungle (6.2.0, wod)

- Position: UiMap 572 “Draenor”, x=0.5788, y=0.4625 — centre of UiMap 534 “Tanaan Jungle” (UiMapAssignment 42971) inside UiMap 572 (UiMapAssignment 43075).
- Sources: <https://warcraft.wiki.gg/wiki/Tanaan_Jungle>; <https://warcraft.wiki.gg/wiki/Patch_6.2.0>; <https://web.archive.org/web/2015/http://us.battle.net/wow/en/blog/19806402>

### `broken-shore-battle` — Battle for the Broken Shore (7.0.3, legion)

- Position: UiMap 619 “Broken Isles”, x=0.5366, y=0.6808 — centre of UiMap 646 “Broken Shore” (UiMapAssignment 43536) inside UiMap 619 (UiMapAssignment 45193).
- Sources: <https://warcraft.wiki.gg/wiki/Battle_for_Broken_Shore>; <https://warcraft.wiki.gg/wiki/Broken_Shore>; <https://worldofwarcraft.com/en-us/news/20139979>

### `dalaran-to-broken-isles` — Dalaran moves to the Broken Isles (7.0.3, legion)

- Position: UiMap 619 “Broken Isles”, x=0.4586, y=0.6465 — centre of UiMap 627 “Dalaran” (UiMapAssignment 43379) inside UiMap 619 (UiMapAssignment 45091).
- Sources: <https://warcraft.wiki.gg/wiki/Dalaran>; <https://warcraft.wiki.gg/wiki/Patch_7.0.3>; <https://worldofwarcraft.com/en-us/news/20139979>

### `broken-shore-return` — Return to the Broken Shore (7.2.0, legion)

- Position: UiMap 619 “Broken Isles”, x=0.5652, y=0.6222 — AreaPOI 5250 “Tomb of Sargeras” (map 1220: -552.6, 2452.3) projected through UiMapAssignment 45193.
- Note: Anchor: AreaPOI 5250 Tomb of Sargeras.
- Sources: <https://warcraft.wiki.gg/wiki/Broken_Shore>; <https://warcraft.wiki.gg/wiki/Patch_7.2.0>; <https://worldofwarcraft.com/news/20629899>

### `argus` — Assault on Argus (7.3.0, legion)

- Position: UiMap 619 “Broken Isles”, x=0.8493, y=0.2081 — centre of UiMapLink 12 (UiMap 619 → 905 “Argus”).
- Note: Placed where the Broken Isles map links to Argus (UiMapLink 619 -> 905), as in the game.
- Sources: <https://warcraft.wiki.gg/wiki/Argus>; <https://warcraft.wiki.gg/wiki/Patch_7.3.0>; <https://worldofwarcraft.com/news/20947822>

### `silithus-wound` — Sargeras strikes Silithus (7.3.2, legion)

- Position: UiMap 12 “Kalimdor”, x=0.4378, y=0.7963 — centre of UiMap 81 “Silithus” (UiMapAssignment 39840) inside UiMap 12 (UiMapAssignment 39324).
- Note: Zone page dates the sword strike to 7.3.2 (Antorus); the revamped 'Silithus: The Wound' arrived with 7.3.5. The sword has no AreaPOI, so the marker is the zone centre on Kalimdor.
- Sources: <https://warcraft.wiki.gg/wiki/Silithus>; <https://warcraft.wiki.gg/wiki/Patch_7.3.5>; <https://worldofwarcraft.com/en-us/news/21365423>

### `teldrassil-burns` — The Burning of Teldrassil (8.0.1, bfa)

- Position: UiMap 12 “Kalimdor”, x=0.4025, y=0.0961 — AreaPOI 38 “Darnassus” (map 1: 9951.8, 2254.5) projected through UiMapAssignment 39324.
- Sources: <https://warcraft.wiki.gg/wiki/Teldrassil>; <https://warcraft.wiki.gg/wiki/War_of_the_Thorns>; <https://worldofwarcraft.com/news/21959894>

### `fall-of-lordaeron` — The Fall of Lordaeron (8.0.1, bfa)

- Position: UiMap 18 “Tirisfal Glades”, x=0.6181, y=0.7446 — AreaPOI 5614 “Ruins of Undercity” (map 0: 1594.3, 240.3) projected through UiMapAssignment 39351.
- Sources: <https://warcraft.wiki.gg/wiki/Battle_for_Lordaeron>; <https://warcraft.wiki.gg/wiki/Undercity>; <https://worldofwarcraft.com/news/21959894>

### `zandalar` — Zandalar opens to the Horde (8.0.1, bfa)

- Position: UiMap 947 “Azeroth”, x=0.5436, y=0.6321 — centre of UiMap 875 “Zandalar” (UiMapAssignment 44647) inside UiMap 947 (UiMapAssignment 45280).
- Sources: <https://warcraft.wiki.gg/wiki/Patch_8.0.1>; <https://warcraft.wiki.gg/wiki/World_of_Warcraft:_Battle_for_Azeroth>; <https://worldofwarcraft.com/news/21959894>

### `kul-tiras` — Kul Tiras opens to the Alliance (8.0.1, bfa)

- Position: UiMap 947 “Azeroth”, x=0.7154, y=0.4866 — centre of UiMap 876 “Kul Tiras” (UiMapAssignment 44648) inside UiMap 947 (UiMapAssignment 45902).
- Sources: <https://warcraft.wiki.gg/wiki/Patch_8.0.1>; <https://warcraft.wiki.gg/wiki/World_of_Warcraft:_Battle_for_Azeroth>; <https://worldofwarcraft.com/news/21959894>

### `battle-for-stromgarde` — Battle for Stromgarde (8.0.1, bfa)

- Position: UiMap 13 “Eastern Kingdoms”, x=0.4986, y=0.5064 — AreaPOI 5592 Stromgarde Keep (warfront map 1876) on the shared Eastern Kingdoms coordinates: map 0 (-1675.3, -1802.7) projected through UiMapAssignment 39325.
- Sources: <https://warcraft.wiki.gg/wiki/Battle_for_Stromgarde>; <https://warcraft.wiki.gg/wiki/Patch_8.0.1>; <https://worldofwarcraft.com/news/21959894>

### `battle-for-darkshore` — Battle for Darkshore (8.1.0, bfa)

- Position: UiMap 62 “Darkshore”, x=0.4029, y=0.4138 — AreaPOI 798 “Auberdine” (map 1: 6439.3, 412.0) projected through UiMapAssignment 39723.
- Note: Anchor: AreaPOI 798 Auberdine (the warfront POIs 5915/5960 'Ruins of Auberdine' share the position).
- Sources: <https://warcraft.wiki.gg/wiki/Battle_for_Darkshore>; <https://warcraft.wiki.gg/wiki/Darkshore>; <https://worldofwarcraft.com/news/22824892/>

### `battle-of-dazaralor` — Battle of Dazar'alor (8.1.0, bfa)

- Position: UiMap 862 “Zuldazar”, x=0.5426, y=0.2994 — AreaPOI 6012 “Battle of Dazar'alor” (map 1642: -309.9, 1117.4) projected through UiMapAssignment 44626.
- Sources: <https://warcraft.wiki.gg/wiki/Battle_of_Dazar'alor>; <https://warcraft.wiki.gg/wiki/Patch_8.1.0>; <https://worldofwarcraft.com/news/22824892/>

### `nazjatar` — Azshara raises Nazjatar (8.2.0, bfa)

- Position: UiMap 947 “Azeroth”, x=0.6451, y=0.5792 — midpoint of [AreaPOI 6139 “Boat to Nazjatar” (map 1642: -2055.0, 958.2) projected through UiMapAssignment 45280] and [AreaPOI 6140 “Boat to Nazjatar” (map 1643: 1067.0, -485.6) projected through UiMapAssignment 45902].
- Note: Anchor: midpoint of the two 'Boat to Nazjatar' AreaPOIs (6139 Zuldazar, 6140 Tiragarde) on the Azeroth map; Nazjatar has no Azeroth-map rectangle.
- Sources: <https://warcraft.wiki.gg/wiki/Nazjatar>; <https://warcraft.wiki.gg/wiki/Patch_8.2.0>; <https://worldofwarcraft.com/en-us/news/23050291>

### `mechagon` — Mechagon Island (8.2.0, bfa)

- Position: UiMap 876 “Kul Tiras”, x=0.1578, y=0.2945 — centre of UiMap 1462 “Mechagon Island” (UiMapAssignment 46773) inside UiMap 876 (UiMapAssignment 44648).
- Sources: <https://warcraft.wiki.gg/wiki/Mechagon_Island>; <https://warcraft.wiki.gg/wiki/Patch_8.2.0>; <https://worldofwarcraft.com/en-us/news/23050291>

### `nzoth-vale` — N'Zoth assaults the Vale (8.3.0, bfa)

- Position: UiMap 424 “Pandaria”, x=0.4697, y=0.5355 — AreaPOI 6539 “Ny'alotha, the Waking City” (map 870: 1140.6, 1465.6) projected through UiMapAssignment 42371.
- Sources: <https://warcraft.wiki.gg/wiki/Vale_of_Eternal_Blossoms>; <https://warcraft.wiki.gg/wiki/Assaults>; <https://worldofwarcraft.com/en-us/news/23227147/visions-of-n-zoth-content-update-notes>

### `nzoth-uldum` — N'Zoth assaults Uldum (8.3.0, bfa)

- Position: UiMap 12 “Kalimdor”, x=0.4903, y=0.903 — AreaPOI 6540 “Ny'alotha, the Waking City” (map 1: -9844.0, -976.2) projected through UiMapAssignment 39324.
- Sources: <https://warcraft.wiki.gg/wiki/Ny'alotha,_the_Waking_City>; <https://warcraft.wiki.gg/wiki/Assaults>; <https://worldofwarcraft.com/en-us/news/23227147/visions-of-n-zoth-content-update-notes>

### `icecrown-veil-torn` — The sky over Icecrown is torn (9.0.1, shadowlands)

- Position: UiMap 118 “Icecrown”, x=0.538, y=0.8709 — AreaPOI 6521 “Icecrown Citadel” (map 571: 5785.6, 2069.7) projected through UiMapAssignment 39890.
- Sources: <https://warcraft.wiki.gg/wiki/Patch_9.0.1>; <https://warcraft.wiki.gg/wiki/Icecrown_Citadel>; <https://worldofwarcraft.com/en-us/news/23529209>

### `shadowlands` — Into the Shadowlands (9.0.2, shadowlands)

- Position: UiMap 1550 “The Shadowlands”, x=0.4675, y=0.4925 — centre of UiMapLink 121 (UiMap 1550 → 1670 “Oribos”).
- Sources: <https://warcraft.wiki.gg/wiki/Oribos>; <https://warcraft.wiki.gg/wiki/Patch_9.0.2>; <https://worldofwarcraft.com/en-us/news/23529209>

### `korthia` — Korthia, City of Secrets (9.1.0, shadowlands)

- Position: UiMap 1550 “The Shadowlands”, x=0.2628, y=0.2245 — centre of UiMap 1961 “Korthia” (UiMapAssignment 64473) inside UiMap 1550 (UiMapAssignment 47693).
- Sources: <https://warcraft.wiki.gg/wiki/The_Maw>; <https://warcraft.wiki.gg/wiki/Patch_9.1.0>; <https://worldofwarcraft.com/en-us/news/23685044/chains-of-domination-content-update-notes>

### `zereth-mortis` — Zereth Mortis (9.2.0, shadowlands)

- Position: UiMap 1550 “The Shadowlands”, x=0.86, y=0.815 — centre of UiMapLink 138 (UiMap 1550 → 1970 “Zereth Mortis”).
- Sources: <https://warcraft.wiki.gg/wiki/Zereth_Mortis>; <https://warcraft.wiki.gg/wiki/Patch_9.2.0>; <https://worldofwarcraft.com/en-us/news/23770462/shadowlands-eternitys-end-content-update-notes>

### `dragon-isles` — The Dragon Isles awaken (10.0.2, dragonflight)

- Position: UiMap 947 “Azeroth”, x=0.7672, y=0.2119 — centre of UiMap 1978 “Dragon Isles” (UiMapAssignment 64626) inside UiMap 947 (UiMapAssignment 44846).
- Sources: <https://warcraft.wiki.gg/wiki/Dragon_Isles>; <https://warcraft.wiki.gg/wiki/Patch_10.0.2>; <https://worldofwarcraft.com/en-us/news/23874318/dragonflight-pre-expansion-phase-2-update-notes>

### `zaralek-cavern` — Zaralek Cavern (10.1.0, dragonflight)

- Position: UiMap 1978 “Dragon Isles”, x=0.5202, y=0.4982 — AreaPOI 7438 “Zaralek Cavern” (map 2444: -24.9, 87.8) projected through UiMapAssignment 64626.
- Note: Anchor: AreaPOI 7438 Zaralek Cavern entrance.
- Sources: <https://warcraft.wiki.gg/wiki/Zaralek_Cavern>; <https://warcraft.wiki.gg/wiki/Patch_10.1.0>; <https://worldofwarcraft.blizzard.com/en-us/news/23935248/dragonflight-embers-of-neltharion-content-update-notes-now-live>

### `amirdrassil` — Amirdrassil blooms (10.2.0, dragonflight)

- Position: UiMap 1978 “Dragon Isles”, x=0.2457, y=0.5883 — centre of UiMap 2239 “Amirdrassil” (UiMapAssignment 67543) inside UiMap 1978 (UiMapAssignment 64626).
- Sources: <https://warcraft.wiki.gg/wiki/Amirdrassil>; <https://warcraft.wiki.gg/wiki/Patch_10.2.0>; <https://worldofwarcraft.blizzard.com/en-us/news/24020034/updated-nov-7-dragonflight-guardians-of-the-dream-content-update-notes-now-live>

### `khaz-algar` — Khaz Algar is discovered (11.0.2, tww)

- Position: UiMap 947 “Azeroth”, x=0.281, y=0.845 — centre of UiMapAssignment 68431 (UiMap 947, instance map 2601).
- Note: Anchor: centre of the Azeroth map's own rectangle for the Khaz Algar underground map (instance 2601).
- Sources: <https://warcraft.wiki.gg/wiki/Khaz_Algar>; <https://warcraft.wiki.gg/wiki/Patch_11.0.2>; <https://worldofwarcraft.blizzard.com/en-us/news/24130678/the-war-within-update-notes>

### `dalaran-destroyed` — The fall of Dalaran (11.0.2, tww)

- Position: UiMap 2248 “Isle of Dorn”, x=0.2891, y=0.5454 — QuestPOIPoint objective of quest 78529 'Violent Impact' on the Tranquil Strand: map 2552 (2034.0, -808.0) projected through UiMapAssignment 67509.
- Sources: <https://warcraft.wiki.gg/wiki/Dalaran>; <https://warcraft.wiki.gg/wiki/Patch_11.0.2>; <https://worldofwarcraft.blizzard.com/en-us/news/24130678/the-war-within-update-notes>

### `dornogal` — Dornogal opens its gates (11.0.2, tww)

- Position: UiMap 2248 “Isle of Dorn”, x=0.4732, y=0.3873 — AreaPOI 7898 “Dornogal” (map 2552: 2934.9, -2381.3) projected through UiMapAssignment 67509.
- Sources: <https://warcraft.wiki.gg/wiki/Dornogal>; <https://warcraft.wiki.gg/wiki/Patch_11.0.2>; <https://worldofwarcraft.blizzard.com/en-us/news/24130678/the-war-within-update-notes>

### `siren-isle` — Siren Isle (11.0.7, tww)

- Position: UiMap 2248 “Isle of Dorn”, x=0.178, y=0.2435 — centre of UiMapLink 170 (UiMap 2248 → 2369 “Siren Isle”).
- Sources: <https://warcraft.wiki.gg/wiki/Siren_Isle>; <https://warcraft.wiki.gg/wiki/Patch_11.0.7>; <https://worldofwarcraft.blizzard.com/en-us/news/24165042>

### `undermine` — Undermine opens (11.1.0, tww)

- Position: UiMap 2274 “Khaz Algar”, x=0.8035, y=0.7425 — centre of UiMapLink 171 (UiMap 2274 → 2346 “Undermine”).
- Sources: <https://warcraft.wiki.gg/wiki/Undermine>; <https://warcraft.wiki.gg/wiki/Patch_11.1.0>; <https://worldofwarcraft.blizzard.com/en-us/news/24179386/undermined-update-notes>

### `karesh` — Ghosts of K'aresh (11.2.0, tww)

- Position: UiMap 2274 “Khaz Algar”, x=0.1765, y=0.1945 — centre of UiMapLink 172 (UiMap 2274 → 2371 “K'aresh”).
- Sources: <https://warcraft.wiki.gg/wiki/K'aresh>; <https://warcraft.wiki.gg/wiki/Patch_11.2.0>; <https://news.blizzard.com/en-us/article/24226698/ghosts-of-k-aresh-content-update-notes>

### `twilight-ascension` — Twilight Ascension (12.0.0, midnight)

- Position: UiMap 13 “Eastern Kingdoms”, x=0.5772, y=0.5871 — centre of UiMap 241 “Twilight Highlands” (UiMapAssignment 40875) inside UiMap 13 (UiMapAssignment 39325).
- Sources: <https://warcraft.wiki.gg/wiki/Twilight_Ascension>; <https://warcraft.wiki.gg/wiki/Patch_12.0.0>; <https://worldofwarcraft.blizzard.com/en-us/news/24244455>

### `quelthalas-reborn` — Quel'Thalas is remade (12.0.1, midnight)

- Position: UiMap 13 “Eastern Kingdoms”, x=0.6475, y=0.1775 — centre of UiMapLink 173 (UiMap 13 → 2537 “Quel'Thalas”).
- Sources: <https://warcraft.wiki.gg/wiki/Eversong_Woods>; <https://warcraft.wiki.gg/wiki/World_of_Warcraft:_Midnight>; <https://worldofwarcraft.blizzard.com/en-us/midnight>

### `silvermoon-restored` — Silvermoon restored (12.0.1, midnight)

- Position: UiMap 2395 “Eversong Woods”, x=0.5056, y=0.2722 — AreaPOI 8460 “Silvermoon City” (map 0: 8456.1, -4616.4) projected through UiMapAssignment 68578.
- Sources: <https://warcraft.wiki.gg/wiki/Silvermoon_City>; <https://warcraft.wiki.gg/wiki/World_of_Warcraft:_Midnight>; <https://worldofwarcraft.blizzard.com/en-us/midnight>

### `queldanas-assault` — The Void strikes Quel'Danas (12.0.1, midnight)

- Position: UiMap 2537 “Quel'Thalas”, x=0.2651, y=0.1535 — centre of UiMap 2424 “Isle of Quel'Danas” (UiMapAssignment 68707) inside UiMap 2537 (UiMapAssignment 69278).
- Sources: <https://warcraft.wiki.gg/wiki/Isle_of_Quel'Danas>; <https://warcraft.wiki.gg/wiki/World_of_Warcraft:_Midnight>; <https://worldofwarcraft.blizzard.com/en-us/midnight>

### `zulaman` — Zul'Aman, rebuilt (12.0.1, midnight)

- Position: UiMap 2537 “Quel'Thalas”, x=0.4973, y=0.6961 — centre of UiMap 2437 “Zul'Aman” (UiMapAssignment 68757) inside UiMap 2537 (UiMapAssignment 69278).
- Sources: <https://warcraft.wiki.gg/wiki/Zul'Aman>; <https://warcraft.wiki.gg/wiki/World_of_Warcraft:_Midnight>; <https://worldofwarcraft.blizzard.com/en-us/midnight>

### `harandar` — Harandar, roots of the World Trees (12.0.1, midnight)

- Position: UiMap 2537 “Quel'Thalas”, x=0.8175, y=0.1675 — centre of UiMapLink 175 (UiMap 2537 → 2413 “Harandar”).
- Sources: <https://warcraft.wiki.gg/wiki/Harandar>; <https://warcraft.wiki.gg/wiki/World_of_Warcraft:_Midnight>; <https://worldofwarcraft.blizzard.com/en-us/midnight>

### `voidstorm` — Into the Voidstorm (12.0.1, midnight)

- Position: UiMap 2537 “Quel'Thalas”, x=0.5325, y=0.2325 — centre of UiMapLink 174 (UiMap 2537 → 2405 “Voidstorm”).
- Sources: <https://warcraft.wiki.gg/wiki/Voidstorm>; <https://warcraft.wiki.gg/wiki/The_Voidspire>; <https://worldofwarcraft.blizzard.com/en-us/midnight>

### `march-on-queldanas` — March on Quel'Danas (12.0.1, midnight)

- Position: UiMap 2424 “Isle of Quel'Danas”, x=0.5261, y=0.853 — AreaPOI 8271 “March on Quel'Danas” (map 0: 10147.0, -4616.9) projected through UiMapAssignment 68707.
- Sources: <https://warcraft.wiki.gg/wiki/March_on_Quel'Danas>; <https://warcraft.wiki.gg/wiki/World_of_Warcraft:_Midnight>; <https://worldofwarcraft.blizzard.com/en-us/midnight>

### `val-naigtal` — Showdown in Val and Naigtal (12.0.7, midnight)

- Position: UiMap 2405 “Voidstorm”, x=0.176, y=0.219 — centre of UiMapLink 182 (UiMap 2405 → 2599 “Val”).
- Note: Anchor: UiMapLink rectangle Voidstorm -> Val (Naigtal sits on the opposite side of the same map).
- Sources: <https://warcraft.wiki.gg/wiki/Val>; <https://warcraft.wiki.gg/wiki/Patch_12.0.7>; <https://worldofwarcraft.blizzard.com/en-us/news/24244888/revelations-content-update-notes>

### `sporefall` — Sporefall (12.0.7, midnight)

- Position: UiMap 2413 “Harandar”, x=0.7356, y=0.6636 — AreaPOI 8256 “Sporefall” (map 2694: -822.7, -1991.4) projected through UiMapAssignment 68644.
- Sources: <https://warcraft.wiki.gg/wiki/Sporefall>; <https://warcraft.wiki.gg/wiki/Patch_12.0.7>; <https://worldofwarcraft.blizzard.com/en-us/news/24244888/revelations-content-update-notes>

### `coiled-isle` — The Coiled Isle emerges (12.1.0, midnight)

- Position: UiMap 2537 “Quel'Thalas”, x=0.71, y=0.6426 — centre of UiMap 2512 “The Coiled Isle” (UiMapAssignment 69193) inside UiMap 2537 (UiMapAssignment 69278).
- Sources: <https://warcraft.wiki.gg/wiki/Coiled_Isle>; <https://warcraft.wiki.gg/wiki/Patch_12.1.0>; <https://news.blizzard.com/en-us/article/24293281/curse-of-ula-tek-content-update-notes>

### `unbinding-of-kithix` — The Unbinding of Kith'ix (12.1.5, midnight)

- Position: UiMap 2509 “Vaults of Atal'Utek”, x=0.4723, y=0.0649 — AreaPOI 9034 “The Vaults of Ula'tek” (map 2916: 6090.7, -10399.7) projected through UiMapAssignment 69190.
- Note: Map 2916 (Vaults of Atal'Utek) has its own coordinates, so the marker sits on UiMap 2509, not on the Coiled Isle map. The raid entrance (AreaPOI 9031) lies just beyond the map's northern edge; the marker uses AreaPOI 9034 'The Vaults of Ula'tek' at that edge.
- Sources: <https://warcraft.wiki.gg/wiki/The_Unbinding_of_Kith'ix>; <https://warcraft.wiki.gg/wiki/Patch_12.1.5>; <https://news.blizzard.com/en-us/article/24304162/12-1-5-content-update-notes>

