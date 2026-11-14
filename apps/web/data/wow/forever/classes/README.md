# Forever class comparisons

This snapshot is exclusively for the Forever edition. It is not a replacement for Retail or Classic catalogs.

Current spells, talent positions, rank caps, rank text and Russian localization use the public client-derived ForeverDB export of **1.60.1.70862**, extracted 2026-11-09. The source is a community extraction, not an independently verified local Blizzard archive. No guide prose or website implementation was copied.

Two distinct comparison contracts are deliberately retained:

- Spell `old` descriptions and `osp` coefficients compare native spell IDs against **Classic Era 1.15.9.69722**. Missing old fields are never reconstructed from later expansions. An identical description is not duplicated as a textual difference; coefficient changes remain explicit.
- Talent membership, removed Classic talents and first-rank Classic descriptions use the CC BY 4.0 [Talents Forever export](https://talentsforever.com/data.json), generated 2026-11-04. Its Classic build is unspecified. Its **Forever values are not imported**. Membership is reconciled with the current class/tree/name; every current rank and native ID comes from 70862. Only rank 1 has a textual Classic baseline. Higher ranks show current text only. Changes with identical rank-1 text and no demonstrable structural change are excluded.

`removed` means removed from the talent tree, not removed from the game. `moved` is only a tree/row/column/rank-cap change. The importer excludes SoD/rune spellbook entries. New client spell IDs alone do not prove new talent choices; older Classic membership is checked. Existing spell names with known Classic comparisons are not labelled new simply because a new rank appears.

## Reproduction

Capture these endpoints in a new evidence directory (keep the response bytes and capture timestamp):

| Filename | URL |
| --- | --- |
| foreverdb-classes.json | https://foreverdb.net/data/classes.json |
| foreverdb-datamine.json | https://foreverdb.net/data/datamine.json |
| foreverdb-ru-classes.json | https://foreverdb.net/data/l10n/ru/classes.json |
| foreverdb-ru-spells.json | https://foreverdb.net/data/l10n/ru/spells.json |
| data.json | https://talentsforever.com/data.json |
| spells/0.json … spells/63.json | https://foreverdb.net/data/spells/{shard}.json |
| spells-ru/0.json … spells-ru/63.json | https://foreverdb.net/data/l10n/ru/spells/{shard}.json |

Run `python3 apps/web/data/wow/forever/classes/import_snapshot.py <evidence-directory>` under the shared heavy limiter. The importer writes only this directory's `changes.json`, `trees.json`, and `evidence.json`. Review the build and comparison contract before refreshing; a newer dataset is not automatically equivalent. Evidence stores source hashes, per-class source/import/exclusion counts, comparison limitations and attribution.

Run `node --experimental-strip-types --no-warnings --test apps/web/tests/forever-classes/changes.test.ts` with Node 22. The browser check requires an already-running local app and uses `CLASSES_BASE` when provided. Production builds and shared-kit visual locks belong to the coordinator.

## Integration

- EN `/wow/forever/classes`, `/wow/forever/classes/[classSlug]`, `/wow/forever/changes`; exact RU twins.
- Changes GET state: `class`, `kind=talent|spellbook`, `status=added|changed|removed`, `q`, `page`. Changed includes moved talents. Class detail omits the redundant class filter. Invalid query values normalize; pages clamp to available results.
- Native spell links are `/[ru/]wow/forever/library/spell/{id}`. Removed Classic talents have no fabricated Forever ID or Retail fallback.
- Calculator links use `/[ru/]wow/forever/talent-calc/{classSlug}#tree-{tree-name-kebab}`. Coordinator must align anchor identifiers with TALENTS.
- `components/wow/forever/classes/classesKit.ts` is the temporary `library` kit adapter; coordinator replaces its export with the shared Forever kit.
- Server data boundary: `lib/data/wow/foreverClasses.ts`. No snapshot enters a client component. Native GET forms and disclosures work without JavaScript.
- Current names use verified native-ID Russian strings; untranslated names and descriptions retain English. Classic before text remains English, with a matching language attribute. Do not silently machine-translate names and claim official localization.

## Attribution

Classic comparison adaptation: [Talents Forever](https://talentsforever.com), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The adaptation replaces all Forever values with the newer native-ID snapshot and filters unverifiable differences. One closing attribution disclosure accompanies comparison pages. Gameplay names and tooltip text belong to Blizzard Entertainment. ForeverDB is credited in developer evidence; no editorial prose from either source is included.

Inventory note: `unchangedAbilities` is the importer's historical counter name for entries with **no admitted exported description/coefficient delta and no proven addition**. It does not establish that every cooldown, cost or hidden effect is unchanged. `unchangedTalents` uses the older comparison classification only when the current rank-1 text still matches that snapshot; the captured snapshot was also checked for structural changes in these entries. Source gaps are not zero-change claims.
