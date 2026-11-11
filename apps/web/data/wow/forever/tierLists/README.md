# GUIDES: tier research

Verified 2026-11-11 UTC. Read-only repository research. No repository modifications, no build, no commit or production action.

## Ready input

`/tmp/forever-platform-20261111/GUIDES/tier-research-data.json` contains two complete, separately scoped author-opinion boards: solo leveling 9/9 classes; dungeon healing forecast 4/4 classes. Each entry has EN/RU short original rationale and exact source URL. No numerical score, win rate, popularity or measured throughput was imported. Sources give no client-build binding: build remains null. Class ratings must not be expanded to individual specs.

- Leveling: https://mobalytics.gg/wow-forever/profile/fierce-sun-30v6cf/tier-lists/wow-forever-class-leveling-tier-list — Uncas, Nov4. Full text and nine placements fetched. Tier is editorial; ranking considers questing independently of group support.
- Healing: https://mobalytics.gg/wow-forever/profile/doublezug/tier-lists/healer-tier-list — DoubleZug, Oct25. Dungeon subsection has four classes; raid subsections excluded. This is a level60 forecast, using spells/talents beyond the beta30 cap. A visible short level60 forecast context is essential. Do not display it as observed postlaunch results or level30 evidence.

## Rejected / incomplete evidence

- https://www.wowhead.com/forever/changes is accessible, indexes all nine classes and their guides. Individual spellbook change pages return only JavaScript requirement through web text extraction; no mechanics were inferred from those empty bodies.
- https://mobalytics.gg/wow-forever/profile/crix/tier-lists/wow-forever-level-30-dps-tier-list-overview — indexed article available (Oct23); direct fetch404 twice. Its scope is beta level30 dungeon DPS. Search text confirms Marksmanship S, but A/B/C class placements absent. Imported0; total20 expected from damage spec roster but not verified against this source. Do not reconstruct missing positions.
- https://mobalytics.gg/wow-forever/tier-lists/tanking — Nov4, explicit general endgame PvE prediction; includes raid suitability. Not imported into dungeon-only board.
- https://www.icy-veins.com/wow-forever/pve-tier-list-dps-specs and corresponding `pve-tier-list-tank-specs`, `pve-tier-list-healer-specs`, `pvp-tier-list-dps-specs`, `pvp-tier-list-healer-specs`: all fetched; Oct26 versions still TBD. Their authors decline max-level placements based on level30 beta. All imported0.
- https://raider.io/events/the-forever-open/brackets/finals is a readable primary tournament bracket. It can support specific level30 duel results, not generic class tiers or level60 PvP win rates. No PvP rank imported.
- https://wowforever.gg/en/tier-lists/ provides a full level30 dungeon opinion board, but rejected for production input: its Assassination description invokes Mutilate at30 while other sources put Mutilate at40. Broader mechanical/ranking reliability not resolved.
- https://mmonster.co/wow-forever/guides/tier-lists/dungeon-tier-list fetched; explicitly level60 forecast before level60 results. Contains internally inconsistent Survival ranged/melee copy. Not imported.
- https://wowfdb.com/tier-lists/ and https://roadto60forever.com/tier-lists/ fetched. Forecasts / secondary opinions, not new measured evidence. Not imported.
- https://mobalytics.gg/wow-forever/tier-lists/dps-tier-list-progress is a raid pre-BiS120s simulation prediction, even when updated Nov9. Excluded, not dungeon evidence.

## Retail Midnight parity inspected

Read `components/blocks/wow/tierWorkspace/{index.tsx,TierBoard.tsx,TierList.tsx,tierModes.ts,tierSourceKeys.ts,tierData.ts}`.

| Feature | Forever applicability |
| --- | --- |
| Activity selector with URL state | Applicable: select only independently sourced modes |
| Role filter | Applicable where a board covers multiple roles; do not pretend leveling class ranks are DPS spec ranks |
| Class search/filter | Applicable to these two datasets |
| Tier grouping and compact cards | Applicable; ties have no invented exact rank |
| Full table / board switch | Applicable but optional when only13 rows; no unsupported numeric columns |
| Keyboard and touch detail access | Applicable; rationale must remain accessible without hover |
| Links to talent/class pages | Applicable after neighboring route contracts are known |
| EN/RU names/context | Applicable; both contexts included in JSON |
| Empty filter state and reset | Applicable |
| Async loading/error/retry | Applicable only if data is fetched; bundled static JSON has no network data failure |
| Multiple source comparison / consensus | External blocker: insufficient equivalent same-level/same-role source boards; no averaging incompatible contexts |
| DPS/HPS/simulation columns | External blocker for this task; retrieved simulation is raid-specific |
| Popularity/win rate/trend | External blocker: no measured matching Forever dataset verified |
| Arena bracket/region filters | Not applicable to these inputs; no matching Forever ladder source verified |
| Mythic+ key level / raid boss / raid difficulty | Not applicable to these Forever boards |
| Hero talents | Not applicable to Forever class talent trees |
| Retail fallback sample rows | Must never be reused; crosses edition and invents live results |

## Recommended implementation boundary

Render these opinions as separate boards with the provided context, not a unified statistic or arbitrary total score. Keep exact URLs, dates, counts, null build and blockers in developer evidence. Show the source scope as useful gameplay context without provenance panels. No raid board. No generic PvP board until matched reliable evidence exists. Do not silently claim full tier-list scope completion.
