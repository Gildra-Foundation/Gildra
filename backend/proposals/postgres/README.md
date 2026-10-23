# Proposed Postgres migrations (not applied)

Files here are reviewed proposals, **outside** `migrations/postgres` on
purpose: the API entrypoint applies every pending migration there, so a
proposal moves into that folder (same number, unchanged) only after the owner
approves it, and is then applied through the migration-only operation of
`migrations/postgres/README-spell-misc-text-index.md` (Goose, `NO TRANSACTION`,
bounded `lock_timeout`, backup and disk checks, one index build at a time).

| File | Change | Size on disk | Build | Effect on writes |
|---|---|---|---|---|
| 00174 | `game_entities_published_lookup_idx` (published_version_id) INCLUDE (id, product_id, entity_type, external_id), partial on published live rows | ≈ 85 MB (1.14 M rows × ≈ 64 B) | ≈ 20–60 s, two scans of the 348 MB heap, writes continue | one more entry per non-HOT update of `game_entities` (publication); indexed columns never change on HOT updates, so HOT is unaffected |
| 00175 | drop `game_entity_localizations_locale_lower_name_idx` | frees 1.7 GB | seconds (waits for running transactions) | removes one index write per localization insert (catalog imports) |

Measured on production (2026-10-23, `frost`, ru_RU): after the candidate scan,
joining ~10 k candidates to their entities read 40 k buffers from
`game_entities` (25 k hits, 14.5 k from disk) through
`game_entities_published_version_ref_idx` + heap; 00174 turns those into
index-only reads. Expected gain: roughly 10 % of a broad cold search; the
bulk of the remaining time is the heap of `game_entity_localizations` (14 GB,
about 84 % of its rows belong to unpublished versions), which no index fixes.
