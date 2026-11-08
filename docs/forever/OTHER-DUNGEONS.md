# Eight further Forever dungeon pages

Later expansion and current gaps: [8 November filling report](FILLING-20261108.md). The scope/status below describes the earlier batch.

Local work only; no commit, push or deployment. Complements Hall of Thanes.

## Scope and evidence

Eight new-dungeon catalog entries now link to EN/RU guides. The original client map files are retained. Lordaeron and Dalaran use an SVG viewport to focus on the city; clicking opens the unmodified original. Other maps show the complete extracted image, including extraction boundaries. There are no guessed boss pins, pull paths or pack coordinates.

- Ruins of Lordaeron: observed six-encounter lineup and tactics from Method (6 November), map from ForeverDB zone 2999. The observed name The Baron is retained: the client roster's The Butcher and Lordaeron Captain have not been equated with observed bosses.
- Excavation Site: Icy Veins combat guide; ForeverDB zone 2998 supplies the map and additional Highland Horror roster entry. No mechanics have been assigned to Highland Horror.
- City of Dalaran: Method's eight observed encounters and dangerous trash; ForeverDB zone 2959 map. Client-only Mana Elemental/Mana Wraith entries are not treated as aliases for Arcanic Enigma.
- The Drowned City: Raiddex client roster, Wowhead guide for Var’Taka/Captain Dreadrise and Rexas for Min’loth's transformation. Deathless Guardians has not been equated with Deathless Marrow, nor Primeval Elemental with Gill; no mechanics are assigned to these unresolved names.
- Krol’dok Stronghold: Raiddex roster, Rexas spell attribution for Ashka/Nar’gurk/Mugg. No Force Compliance attribution to Grox is inferred.
- Alcaz Prison and Blackmaw Hold: original maps and client boss rosters only. No encounter mechanics were sufficiently verified.
- Shaper’s Terrace: eleven client roster entries, only Nanaya's explicitly attributed slam.

Source URLs are stored with each guide in dungeonGuides.ts. Client-extracted high-level content does not establish live encounter behavior. Level bands and party size continue to follow the existing Blizzard-based catalog; no contradictory third-party level/size values were substituted.

## Remaining content

Confirmed pull routes, pack coordinates, mob portraits/icons and complete combat guides for high-level dungeons require further encounter evidence. The nineteen returning dungeons and three raid overviews were not expanded in this batch. Optional scope question sent to owner; no answer at implementation time.

## Validation

See browser screenshots in verification/. Validation results are appended after checks finish.

- Production build: PASS, 657 static pages generated. TypeScript: PASS.
- Focused ESLint: PASS. Atlas token audit: PASS, 147 stylesheets. Valyro: PASS.
- Portal/catalog regression tests: PASS (both test files).
- Route mirrors: PASS, 41 pairs. Global routes:check still reports the existing unpaired/nonlocalized /ru/wow/stories page, verified unchanged in HEAD.
- Chromium dev: 48 cases, eight routes × EN/RU × 320/390/1440. All returned 200, no horizontal overflow or uncaught page errors; map asset requests succeed; native disclosures respond to Enter; all nine catalog links exist. Reduced motion and forced colors exercised.
- Clean-UI audit on detailed RU and roster-only EN pages: only the permitted bottom Sources disclosure matched.
- No shared UI changed in this batch. Static pages have no asynchronous empty/loading data state. Build-generated config and agent documents were removed/restored after verification.
- Production Chromium: all eight RU pages captured at 1440 and 390 with normal motion, fonts ready, disclosure opened and cookies declined; no pageerror or console-error events. Final screenshots reviewed on desktop and mobile. Local preview stopped after capture.
