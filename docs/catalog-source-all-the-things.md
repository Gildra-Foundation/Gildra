# All The Things source evaluation

## Status

`All The Things` is an audited candidate source for relations that client DB2
and the Battle.net Game Data API do not fully publish. It is not currently a
public catalog source. The evidence review is complete, but the production
publication grant remains fail-closed until an accountable product owner or
legal reviewer approves the exact public surface.

The repository declares the MIT license, which expressly permits use,
modification and distribution of the repository material when its copyright
and permission notice are retained. Gildra still records a separate publication
decision because it must preserve attribution, avoid claiming Blizzard IP and
limit ATT to a derived relationship layer below official field precedence.

## Audited snapshot

- repository: `https://github.com/ATTWoWAddon/AllTheThings`
- immutable revision: `77b0b6e5cbc39dab31746c21e7c68964414e76e5`
- inspected: 2026-08-23
- product tree: `db/Standard` (Retail)
- local audit copy: `.codex-local/sources/all-the-things` (never committed)
- Retail generated database: 27 files, 28,961,031 bytes

The inspected generated Lua contains approximately 63,592 item constructors,
190,484 item-source constructors, 7,863 NPC constructors, 48,533 quest
constructors, 18,341 recipe constructors, 15,629 explicit provider fields and
41,764 cost fields. These are parser-level occurrence counts, not unique entity
or relationship counts.

## Useful facts

The nested source tree can provide candidate edges for:

- item obtained from NPC, encounter, object/container, quest, vendor or world
  category;
- quest rewards and prerequisite/alternative quest groups;
- vendor currency/item costs and reputation or quest requirements;
- profession and recipe ownership;
- crafted items and recipe acquisition;
- map/zone hierarchy and some coordinates;
- collectible restrictions such as class, faction, profession and timeline.

ATT does not establish authoritative drop percentages for every edge. Missing
chance values must remain `NULL`; verification flags and provider context must
be preserved in attributes rather than converted into invented probabilities.

## Import contract

Any importer must:

1. pin the exact Git commit and hash every input file;
2. parse the generated Lua as data without executing repository scripts or Lua
   callbacks;
3. preserve the raw source node and its complete ancestor path;
4. map only explicit numeric IDs to canonical entities from the same WoW build;
5. keep unresolved and ambiguous nodes in staging;
6. write ATT provenance and verification markers on every normalized edge;
7. publish nothing until `catalog_source_policies` and a publication grant are
   explicitly approved;
8. never use ATT to overwrite official names, descriptions, stats or DB2 facts.

The static parser writes only to `catalog_staged_source_nodes` and
`catalog_staged_source_references`. Each staged node retains its immutable file
artifact, record key, ancestor path, source line, raw source text and SHA-256
hash. References such as providers, costs, quests, maps and coordinates remain
unresolved or explicitly resolved in staging. These tables have no public API
projection and cannot make a catalog release publishable by themselves.

Promotion is a separate reviewed operation: the source policy must permit the
intended use, the target IDs must resolve within the same build, and a dedicated
projection must copy only the approved fact type into its normalized table. A
missing or ambiguous target stays in staging; it is never guessed.

## Staging import

The importer verifies that the local repository is at the exact requested Git
revision and that tracked source files are unmodified. Its default is one sorted
Lua file. A complete snapshot requires the explicit `-confirm` gate:

```bash
go run ./cmd/att-import \
  -database-url "$DATABASE_URL" \
  -source-root /srv/sources/all-the-things/db/Standard/Categories \
  -revision 77b0b6e5cbc39dab31746c21e7c68964414e76e5 \
  -build 69497 \
  -version 12.1.0.69497 \
  -max-files 0 \
  -confirm
```

Each file is replaced in one transaction. Its artifact becomes `ready` only
after the staged nodes and references commit and its SHA-256 and byte size are
recorded. The completed snapshot remains `validated`; this command never marks
the snapshot published, advances public entity versions or activates a build.

## Same-build identity resolution

Resolution is a separate fail-closed step. It accepts an explicit validated
ATT snapshot UUID and first produces a read-only classification report. A node
or reference resolves only when the canonical identity has a non-failed entity
version for the same product and build. When that version names a source
artifact, the artifact must be `ready` and have both a SHA-256 hash and byte
size. Legacy build versions without an artifact pointer remain eligible so
older canonical imports can be audited and upgraded incrementally.

Preview without changing any row:

```bash
att-resolve -database-url "$DATABASE_URL" -snapshot-id "$ATT_SNAPSHOT_ID"
```

Persist exactly the previewed classifications:

```bash
att-resolve \
  -database-url "$DATABASE_URL" \
  -snapshot-id "$ATT_SNAPSHOT_ID" \
  -confirm
```

The confirmed resolver runs in one repeatable-read transaction and records an
audit row in `catalog_source_resolution_runs`. Results remain in the staging
tables. If canonical data changes after the operator reviewed the preview, the
confirmed run stops without changing staged rows and requires a new preview.

Resolution statuses are:

- `resolved` — a source type maps to one canonical identity proven for the
  same build;
- `unresolved` — the type is recognized, but no build-proven canonical entity
  exists yet;
- `excluded` — the source node has no usable ID or is a non-game header or
  another unsupported type;
- `ambiguous` — reserved as a fail-closed state if a future identity model can
  produce multiple candidates.

Type mappings are explicit and reviewable in
`catalog_source_entity_type_mappings`; unknown types are never guessed. ATT
recipe IDs intentionally resolve to canonical `spell` entities because the
normalized recipe model uses profession spell IDs. Re-running the resolver is
idempotent and can turn prior `unresolved` rows into `resolved` after official
same-build entities are loaded. It still cannot create public relationships,
publish a snapshot, advance entity pointers or activate a build.

This source is best used as a relationship layer below Blizzard and DB2 field
precedence, not as a replacement canonical catalog.
