# Forever library snapshot

This read model is isolated from the existing PostgreSQL Retail/Classic catalog. Its identity is `(forever, build, type, numeric ID)`. It never looks up missing IDs in another edition. No production SQL migration, data import, service restart or schema grant is required. It ships with the web image; the coordinator owns deployment.

## Refresh and validation

Run from the repository root with Python 3 and curl:

```sh
python3 scripts/forever-data/fetch.py --output /tmp/forever-next-sources
python3 scripts/forever-data/import.py --source /tmp/forever-next-sources --output /tmp/forever-next-database
FOREVER_SOURCE=/tmp/forever-next-sources python3 scripts/forever-data/test-import.py
```

Never import directly into a running server's data directory. Fetch into a new directory, normalize the whole source set, review `manifest.json`, then copy the validated snapshot into `apps/web/data/wow/forever/database` on an implementation branch. For a new build, update `FOREVER_BUILD` in `contract.ts` and the pinned snapshot assertions. Retain the previous snapshot and its SHA manifest until the release is accepted. gzip timestamps are fixed at zero; identical inputs produce identical bytes.

`fetch.py` retrieves all 64 spell shards, all 64 Russian spell shards, all 64 questguide shards, published profession datasets and observed NPC sources with at most four concurrent downloads. Non-JSON responses, HTTP errors, count mismatches, wrong shard identity and duplicate spell identities fail the import. The client build manifest must remain unchanged across the fetch. Observation feeds can change independently of a build; exact per-file hashes document the snapshot, not a transactional upstream extraction.

The normalized server files total roughly 6 MB compressed. Search reads a server-side index and returns 48 summaries; details read one modulo-64 shard. A bounded process cache retains at most 48 parsed files. No full catalog is sent to a client component, and there is no static generation of individual records.

## Source and completeness policy

Sources are public game facts from `https://foreverdb.net/data/`; no editorial guides are copied.

* `datamine.json`: client `1.60.1.70862`, comparison metadata `1.15.9.69722`. The baseline describes this source's comparison; this library does not assert that every client record is attainable in the live game.
* `items.json`: all 23,339 published client items considered. Explicit `spec` flags and OLD/TEST/DNT/UNUSED/OBSOLETE/NYI names are excluded.
* `spells/{0..63}.json`: all 32,110 published client spells considered; service/obsolete-name markers excluded. Spell existence in client data is not an availability or class-membership claim. Item stat labels come from `stats.json`, exact RU labels from `l10n/ru/ui.json`.
* `professions/{slug}.json`: all 12 published professions, 2,493 raw recipe rows / 2,492 distinct spell identities. Exclude `spec`, `missing`, missing client spells/products/reagents, required skill above 300 or required level above 60. Shared recipe identities merge profession membership. `reqC` values are never exposed as Forever minimum skill. Trainers' Classic prices/locations are not imported.
* `questguides/index.json` and 64 shards: 6,645 published records. Include only `known && src=forever`, then exclude obsolete/service names. Import level, minimum, objective text and money only when `sources[field]=forever`; reward links only for `sources.reward=forever`. Chain edges require their own `src=forever`. Full narrative text and unproven objective amounts are omitted.
* NPCs: a measured union of confirmed identities in included quest records, `vendors` with `fv || met`, `trainers` with `fv`, and rares with observed/Forever field evidence. Quest coordinate observations prove presence but do not prove Classic quest-giver relationships. Vendor stock requires `fv && !stock.cl`; rare loot requires `src=forever`. This is the published observed union, not a full client/server NPC catalog. Names of excluded quests can remove an otherwise sole NPC reference, so this normalized candidate union differs slightly from the research union.
* RU names use exact IDs in `search/ru.json`; RU spell tooltips use `l10n/ru/spells/{shard}.json`. Unknown translations retain the English game name/text. NPC RU coverage is zero; observed native RU quest-name coverage is zero. No machine translations masquerade as native strings.

Each `manifest.json` includes source hashes, output hashes, source/imported/excluded totals, RU name/description counts, relation counts and unresolved target counts. Missing targets are omitted from public links and recorded in evidence. Forward and reverse edges only point to imported Forever records.

## Runtime integration (coordinator)

Add `./data/wow/forever/database/**/*` to `outputFileTracingIncludes` for both EN/RU library roots and descendants in `apps/web/next.config.ts`; verify those files exist in the standalone image. Runtime `process.cwd()` is `apps/web` in development and `/app` in the flattened production image. No credentials or external database connection are used.

Page routes: `/wow/forever/library` and `/ru/wow/forever/library`; record routes `/{item|spell|npc|quest|recipe}/{id}`. URL filters: `type,q,quality,category,minLevel,maxLevel,page,related,edge`. Related queries use `related=type:id` and a relation kind, so every large relation group remains reachable through pagination.

Read API: `/wow/forever/library/data` (outside `/api/*`, which the live proxy routes to Go). Parameters as above, plus `id` for detail; optional `edition/build` must match or return 409. Invalid identities return 400, absent records 404, failed reads 503. No write endpoint exists. `foreverRecordPath(type,id,locale)` and `foreverIconUrl(fileId)` are safe client imports from `lib/forever/database/contract.ts`.

The existing `LibraryRecordCard` and Material/Atlas controls are reused. `LibrarySearchBox` is not used because its suggestions call the existing catalog endpoint and build Retail library destinations; the native GET form keeps Forever isolation. Coordinator changes only the local kit import and supplies the planned `ForeverFrame.scene` prop (`archive`/`archiveDeep`). No shared frame/navigation/style files are changed here. Registry, sitemap and homepage integration belong to the coordinator.

## Backup and rollback

Before integration, retain the previously accepted **full web release**, its immutable image digest and runtime manifest. This DATA branch is not a production rollback source: concurrent shell/footer releases must remain intact. Snapshot backup is the previous versioned directory plus SHA manifest (or the full previous web image). Verify its hashes and perform a candidate read/search test before publishing. Roll back by restoring the previous **full web image** via the normal coordinator release path; no PostgreSQL rollback or destructive migration exists.

Run candidate smoke checks for list/search, each record type, RU fallback, pagination, wrong edition/build, missing records, error boundaries, image fallback and standalone file presence. Full production build and design-lock after shared kit/frame integration remain coordinator gates.
