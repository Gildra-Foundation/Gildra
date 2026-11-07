# Hall of Thanes guide — 2026-11-06

Local first detailed Forever dungeon guide, EN/RU. No commit, push or deployment.
Routes: /wow/forever/dungeons/hall-of-thanes and its /ru twin. Catalog links the guide.

## Data and deliberate boundaries

- Four encounter compositions, concise mechanics/responses, four dangerous trash types and the documented pre-Durgen pack. No invented trash counts, NPC IDs, damage coefficients, timers, or portraits.
- Method: https://www.method.gg/wow-forever/dungeons/hall-of-thanes — trash behavior, patrolling Summoner, final three-enemy pack and Polymorph advice.
- Icy Veins: https://www.icy-veins.com/wow-forever/hall-of-thanes-guide — boss mechanics and compositions.
- ForG: https://forg.gg/en/forever/dungeons/hall-of-thanes — room sequence (east cave → west tunnel/pillared hall → northern bridge/reliquary).
- ForeverDB: https://foreverdb.net/dungeon/3065-the-hall-of-thanes — client minimap art. Original files /img/dungeonmaps/3065/1.webp and /2.webp copied unchanged into public/images/wow/forever/hall-of-thanes. Client art belongs to Blizzard; source attributed in the single bottom disclosure. Method's hand-drawn map was inspected for orientation, NOT copied into the app.
- Pins mark encounter AREAS, not spawn positions or a complete pull route: Faldrim tomb (part1), Magmatus eastern cave (part2), Plunder pillared hall (part2), Durgen circular reliquary (part1). No fabricated path between floors or arbitrary trash markers.
- Magmatus is used by both walkthroughs; ForeverDB's client encounter list says Infurnus. Do not map guessed NPC/spell IDs to this alias.
- Method recommends Durgen first; Icy Veins recommends golems first. Neither priority was presented as established. Shared room-clear/fear/bleed/composition facts retained.
- Official level band remains 13–18 from the existing catalog, despite wider recommended bands elsewhere.

## Retail comparison

Read MdtPullMap, MdtPullDetails and mdtPullIntel: Retail joins actual MDT node positions and NPC IDs to reviewed spell data. Those data do not exist here in equivalent completeness. Reused AtlasTabs (Valyro motion adapter), MaterialPlaque, AtlasGrid, AtlasHero, AtlasMetaList and ForeverFrame. Separate Forever model avoids inheriting keystones, enemy-force percentages and Retail class advice.

## Remaining content

This is the first dungeon, not all nine. Full per-pack coordinates, original NPC portraits and verified spell-icon identities still need client or recorded-play evidence. Other dungeons and detailed raids remain unfilled. Next: Ruins of Lordaeron with the same source review; expand exact trash route only with positional evidence.

## Verification

- Next production build PASS, 641 static pages, including EN/RU guide. TypeScript PASS.
- Scoped ESLint PASS (repository's existing pages-directory warning only); Atlas 146 strict stylesheets PASS; Valyro integrity PASS; route mirrors 33 PASS; diff check and coordination conflicts PASS.
- Chromium dev and production: EN/RU × 320/390/1440, all four encounters, correct floor switches, map pin selection, keyboard tabs, catalog navigation, image load, forced colors. Zero page errors or horizontal overflow.
- RU clean UI audit: only the allowed single Sources disclosure flagged.
- Shared navigation/material/style references unchanged in this task; previous portal design-lock remains applicable.
- Final screenshots: verification/hall-of-thanes-ru-1440.png and hall-of-thanes-ru-390.png. Chromium only; no physical-device testing.
