# Forever talent snapshot

Edition `forever`. Provider's contemporaneous `live-client.json` identifies build
1.60.1.70862; **classes.json itself has no build stamp**. `evidence.json` records
this limitation, SHA-256 hashes, exclusions and editorial transformations.

Only `classes[].trees[].talents[]` is imported. The adjacent ability list includes
SoD leftovers and is not a talent source. Three retired nodes are not selectable.
All 467 node names, positions and rank caps independently agree with
TalentsForever's 1.60.1.70755 + November hotfix export. That older export is a
cross-check only; its descriptions and simplified prerequisites are not imported.
No Classic or Retail tree data is used.

- Native IDs: node, entry, definition, spell; repeated spell IDs across ranks are
  native Trait scaling, not malformed Classic spell rank chains.
- `prerequisites.required`: all flagged requirements AND at least one unflagged
  alternative. Hunter Intimidation has two alternatives.
- `gate.nodeIds`: explicit eligible nodes, overriding the row boundary. Four
  Priest Discipline nodes use this. Otherwise sum ranks through `throughRow`.
- Build validity requires a legal allocation order, not merely a final-state gate
  count: capstone gates can include their own row.
- Level 1–60; first point at 10, shifted earlier by Talented Legacy rank 0–5;
  maximum 51. Both the public calculator behavior and Wowhead's indexed
  calculator explanation corroborate this rule.
- RU names/text match native node IDs. Seven source names remain English.
  Eleven absent description arrays are editorial translations of current EN;
  two descriptions conservatively omit unresolved numerical placeholders.
  Those omissions do not change node/rank/point calculations.

Sources:

- https://foreverdb.net/data/classes.json
- https://foreverdb.net/data/l10n/ru/classes.json
- https://foreverdb.net/data/live-client.json
- https://foreverdb.net/about
- https://www.wowhead.com/forever/talent-calc/mage
- https://talentsforever.com/data.json (cross-check only)

`icons.json` lists hashes and public numeric-ID URLs for the 384 local copies of
client artwork; no generated spell/class icons. Media belong to Blizzard.

Share URL format: `?build=1.<snapshot>.<class>.<level>.<talented>.<rankDigits>`.
The snapshot pins the normalized dataset, including native node ordering. Wrong
edition/class, obsolete snapshot, illegal rank, invalid gate and over-budget
payloads fail closed. This is a WowArcana URL, not a supported game-import format.

Checks from `apps/web`:

```
node --experimental-strip-types --no-warnings --import ./tests/atlas/resolve.mjs --test tests/forever-talents/*.test.ts
TALENTS_BASE_URL=http://127.0.0.1:3159 node tests/forever-talents/browser.mjs
```

Original source snapshots and research evidence for this import:
`/tmp/forever-platform-20261111/TALENTS/research/`. Production build, shared scene,
shared kit, navigation, metadata registry and DATA link-helper consolidation are
coordinator integration tasks.
