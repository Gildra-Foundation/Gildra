# Character farming recommendations

Published to `gildra.net` on 2026-10-15 at 20:43 UTC as `farm-gear-20261015-dcce589`, code revision `dcce589ea6e05051e42a51ffe2a25103f0d7060b`. The RU/EN character equipment panel and private `/api/wow/gear-farm-plans` jobs resolve source-specific leveling rewards and compare independent drops with the character's actual equipped baseline. Both web and the patched native worker were deployed. Fresh EN/RU character checks, public checks and the reviewed final observation passed. See the [deployment report](reports/farm-gear-deployment-20261015.md).

## Result presentation

Web release `gear-ui-20261015-2ae23b1` adds genuine framed location artwork,
reward and current-item icons, boss/source labels and an explicit equipped-item
comparison. Both planners share the character equipment tooltip, including
verified native/current levels and stats, hover/focus, click/tap pinning,
Escape and disclosure-close cleanup. Unknown scaling remains explicit and
receives no guessed stats or item level. Independent DPS gains and their
95% margins retain separate labels. Nine official instance images have
hash/pixel provenance beside `public/assets/wow/instances/`; Tidebound Grotto
uses the existing genuine Nymrissa portrait. Fresh postdeployment EN/RU Elkardia
checks reproduced 9 exact variants, 15 simulations and 10 positive replacements,
with all 10 source images and 88 reward/current icons. See the
[verified UI release report](reports/gear-planner-ui-deployment-20261015.md).

## Proof chain

1. Resolve the owned character on the server and read fresh Blizzard profile, specialization, talents and equipment. Developer QA accepts a trusted public snapshot internally; HTTP never accepts a client-supplied snapshot.
2. Traverse only published instance/encounter/item relationships, requiring matching published build, source type and encounter ID. Require the item and encounter to appear in the current client JournalInstance/JournalEncounter/JournalEncounterItem projection for that exact dungeon. Unknown source/difficulty membership never becomes an upgrade.
3. Use current-client MapDifficulty, ItemContextPickerEntry and a byte-verified PlayerCondition row to select the actual item context. Condition145273 has Flags33 and ContentTuning3313 (level90); a level81 character selects context17 through picker278. Unsupported account, quest, tuning or condition semantics remain unknown.
4. Resolve the item's actual ItemXBonusTree closure, inventory masks, inverse context groups and seasonal ChallengeModeItemBonusOverride. Query a fresh official default head251098 preview, require its static build to match the dataset, and compare the default control with every supported seasonal branch. The observed control bonus13663 identifies the current branch; no calendar date or guessed event state supplies the reward. All surviving branches must agree on the exact reward bonuses.
5. Resolve ItemBonus type51 through ItemScalingConfig, ItemOffsetCurve and CurvePoint. At level81 config483 uses curve109508 plus6: 133+6=139. Pass only the source-generated bonuses, context17 and player-level modifier9=81 to native SimulationCraft. Do not set a manual item-level override.
6. Check each item family's official default tooltip against the native database (level, required level and displayed primary/secondary/stamina stats). Require the actual reward's native item level to match the independently calculated client curve, preserve the official template requirement78, and agree with the catalog's equip class/subclass/inventory type. Unknown metadata fails verification.
7. Reuse race, faction, class/spec armor and weapon rules, required level, unique-equipped constraints and the complete final loadout. Fury can use supported two-handed weapons in both hands. Statless trinkets/weapons without specialization/effect proof remain excluded.
8. Simulate the unchanged baseline once, then one actual obtainable replacement per run using the same talents, maintained specialization rotation, engine, one target and120 seconds. A recommendation requires positive DPS exceeding the combined95% uncertainty margin. Negative and statistically inconclusive results are explicitly tested non-upgrades. Percentages from different drops must not be added together.

Confirmed reward generation is currently restricted to supported Normal/context17. Selecting context1 at level 90 is covered by picker tests, but its reward sequence is not implemented. The DPS comparison is restricted to damage specializations and sources with a verified level unlock. Exact rewards in sources whose quest/warband unlock is unknown remain unmeasured. At most24 replacements are simulated per job; results report bounded search coverage. Tank/healer rewards never receive a damage-based readiness claim.

## Current client evidence

`apps/web/data/wow/gear-farm-rewards.json` contains a bounded projection for eight published Normal dungeons,215 item IDs and216 journal loot rows. It includes source provenance and exact client rules rather than flattened lists of every reachable bonus.

The package is the official `wow` CDN build12.1.5.70391, BuildConfig334a36cf5f3c32a5f7a167405487fa14 / CDNConfig837a654343ce719ad447e92a6c0b557f. Its extracted DB2 tables identify their internal static build as12.1.5.70077, matching the current Blizzard API. Thirty-five complete DB2/game-table files were verified against their original content MD5; source encoded keys, archive byte ranges, SHA256, decoder/layout hashes and DBD hashes are retained in the projection. Build provenance does not imply every table row is used or that every supported source has a calculable reward.

PlayerCondition is explicitly **partial**, not described as fully MD5 verified: two encrypted EOF frames are unavailable. The selected condition145273, its complete section and every shared metadata/palette byte needed to decode it are outside those missing ranges. Its record bytes, offsets, palette proof and missing ranges are retained. The WDC5 decoder was corrected against [upstream DBCD's palette ordering](https://github.com/wowdev/DBCD/blob/master/DBCD.IO/Readers/WDC5Reader.cs): scalar palettes precede array palettes. The incorrect earlier decode is not used.

[TrinityCore ItemBonusMgr](https://github.com/TrinityCore/TrinityCore/blob/master/src/server/game/Entities/Item/ItemBonusMgr.cpp), [Item bonus application](https://github.com/TrinityCore/TrinityCore/blob/master/src/server/game/Entities/Item/Item.cpp), and [WoWDBDefs](https://github.com/wowdev/WoWDBDefs) ground the supported table semantics. They are implementation references; the actual current rules come from verified Blizzard client tables and the current official API control. Unknown random branches, endgame sequences, missing contexts, cycles and new flags fail closed.

A public Blizzard level81 character independently wears the historical context17 head251098 and trinket250226 at139/required78/timewalker81. Its older season bonuses are corroboration of leveling behavior only, and are never substituted for the current generated variant. Independent current RandPropPoints and game-table budgets reproduce the native139 head stats31 primary /269 stamina /34 haste /24 versatility using historical allocation metadata; this cross-check does not assert that the historical allocation table is a current ItemSparse export.

To reproduce the bounded projection from the verified decoded source artifacts:

```sh
cd apps/web
node scripts/build-gear-farm-rewards.mjs --source-dir ../../.artifacts/farm-scaling/cdn
```

Raw extraction proofs and algorithm notes are retained under ignored `.artifacts/farm-scaling/cdn/` and `.artifacts/farm-scaling/algorithm/`. No OAuth tokens, user credentials or private character snapshots are included in the checked-in data.

## Native required-level correction

`infra/simc/gear-metadata.patch` also corrects required-level handling in the pinned native engine. ItemBonus type51 (`SCALE_CONFIG_2`) changes item-level scaling and preserves the template requirement. Type49 (`SCALE_CONFIG`) only applies a nonzero required-level override. The prior native behavior returned0 instead of78 for the actual139 reward. The deployed worker `gildra-rotation-sim-worker:farm-gear-20261015-dcce589` returns139/78 and matches official default controls. The web adapter rejects a zero native requirement when the verified template requires78, so an old worker cannot silently produce recommendations.

## Access and scope

[Blizzard Midnight launch conditions](https://news.blizzard.com/en-us/article/24264417/world-of-warcraft-midnighttm-now-live) distinguish dungeon quest unlocks from alternative Warband levels: Windrunner81, Murder Row83, Maisara85, Blinding Vale/Nalorakk88, the remaining three90. A lower level alone does not prove a quest/Warband unlock is absent. Account expansion ownership and quest/Warband progression are not present in the snapshot.

All eight current Normal LFGDungeons rows have queue MinGear100. This is shown as a Dungeon Finder requirement, independently of the level alternative; it is not treated as a minimum for manually entering a dungeon. [Venomous Abyss](https://news.blizzard.com/en-us/article/24294062/curse-of-ulatek-the-venomous-abyss-raid-finder-wing-3-now-live) requires90 and LFR273 ilvl. [Tidebound Grotto](https://news.blizzard.com/en-us/article/24295085/step-into-lairs-and-face-the-foes-inside) requires90 and recommends273; the recommendation is not an entry gate. Neither endgame entry currently resolves exact reward variants. Other raids, Mythic+, delves, quests, vendors and world drops remain outside the bounded source set.

A suitable level and statistically better gear do not prove that the character can solo a group encounter or complete its mechanics. UI states group requirements and unknown unlocks directly.

## Private job contract

Ownership-keyed jobs use private/no-store responses, same-origin mutations, cancellation, a ten-minute deadline, one active job per owner, a bounded queue and bounded thirty-minute result retention. Results contain no access tokens. The in-process store assumes the current single web replica; multiple replicas require a shared store.

## Verification

Fresh public Blizzard QA on2026-10-15 confirms Элкардия, EU/Eversong, level81, Fury72, equipped120. Windrunner Spire meets the level alternative and queue100 threshold; seven other Normal dungeons retain unknown quest/Warband access, while the two endgame entries require90.

The final EN/RU runs detailed214/215 published loot items respectively; localized catalog coverage differs by one item. Both produced identical verified variants and DPS results. Windrunner supplied15 compatible item/slot targets:9 exact item variants,14 independent replacements plus one unchanged baseline (15 simulations). Ten replacements were statistically positive; four were non-upgrades; the neck remains unverified because its bonus list includes an unsupported type26. Baseline14,273 DPS,750 iterations, one target,120 seconds, SimulationCraft1210-01 /18428cd.

- Kroluk's Warbanner250227, Commander Kroluk: +4.39% ±0.45% replacing TRINKET_1, or +3.61% ±0.44% replacing TRINKET_2.
- Fletcher's Faded Faceplate251098, Restless Heart: +2.76% ±0.44% replacing HEAD.
- Heart of Wind250256, Restless Heart: +2.55% ±0.42% replacing TRINKET_1, or +2.05% ±0.44% replacing TRINKET_2.
- Latch's Crooked Hook250226: +0.20% ±0.44% in TRINKET_1 and −0.60% ±0.43% in TRINKET_2; neither receives upgrade status. Warworn Cleaver251088 also loses DPS in both weapon slots.

All positive targets are source-generated139 ilvl /required78 /context17 with bonus13660 and modifier9=81. Intellect/agility-only Emberwing Feather250144 and Excavating Cudgel251083 remain excluded for Fury. Public snapshots, current controls and calculation results are saved only under ignored `.artifacts/farm-scaling/`.

```sh
cd apps/web
node --experimental-strip-types --no-warnings --import ./tests/auction/resolve.mjs scripts/test-gear-farm.mjs
node --experimental-strip-types --no-warnings --import ./tests/auction/resolve.mjs scripts/test-gear-farm-reward-generation.mjs
```

The focused suite covers real table projections, level80/81/89/90 context choices, seasonal control discrimination, inventory masks, unknown conditions/phases, missing data, cycles, unsupported flags, independent drop comparisons, positive95% gains, negative/inconclusive exclusions, engine agreement, complete loadout compatibility, cancellation, and private ownership, and queue capacity after repeated queued cancellations. UI errors also cancel the server job before losing its handle. Live QA additionally requires actual source-generated139/78/context17/bonus13660 variants and a statistically positive upgrade for Elkardia.

Final verification passed: full Next production build (762 static pages), TypeScript, focused ESLint, atlas tokens, Go rotationlab and existing gear/auction-variant regressions. The production manifest includes the private farm route and excludes the disposable browser route. The current-client reward dataset is absent from all122 generated client JavaScript chunks. RU/EN browser checks passed at320/390/768/1024/1440px, including real-result rendering, keyboard/focus/reduced-motion, empty/error/loading, cancellation before POST completes and failed-poll server cleanup/retry. Actual guest GET/POST/DELETE returned401 and cross-site POST403. Authenticated account operation was not exercised in the browser; actual public Blizzard snapshots and native simulations were exercised through the internal trusted-snapshot runner. Temporary browser/build configuration and generated local agent/type files were removed or restored. Code commits `e2792a2` and `dcce589` were pushed; release `farm-gear-20261015-dcce589` then replaced web and worker. This deployment performed no API rollout, database migration/data operation or import; independent enrichment imports continued.

Fresh postdeployment EN/RU trusted-snapshot runs reproduced the same profile fingerprint, 9 exact variants, 15 simulations, 10 positive replacements and DPS values above; published loot coverage was 214 EN / 215 RU. Runtime identities matched the new web and worker image IDs recorded in the deployment report. Eight public browser page views and 28 route/status checks (including expected 404s) passed, as did eight guest/cross-site private-route boundary checks. Signed-in browser operation remains untested. After 133.6 seconds, web and worker were healthy with zero restarts; eight protected container identities/restart states and schema 171 passed verification. The one logged `NoFallbackError` on the expected 404 raid route was reproduced against the previous immutable web image and classified as pre-existing; both the original strict failure and reviewed classification are retained. Deployed image code remains `dcce589`; subsequent documentation commits are separate.
