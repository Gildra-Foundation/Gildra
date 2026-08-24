# All The Things source evaluation

## Status

`All The Things` is an audited candidate source for relations that client DB2
and the Battle.net Game Data API do not fully publish. It is not currently a
public catalog source. The source policy is fail-closed (`review_status=pending`,
commercial/public API status `unknown`) until the product owner reviews use of
the derived database for a commercial website.

The repository declares the MIT license. That is strong evidence that its code
and included database files may be processed, but Gildra still records a
separate publication decision because a software license alone is not proof of
every underlying game-data right.

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

This source is best used as a relationship layer below Blizzard and DB2 field
precedence, not as a replacement canonical catalog.
