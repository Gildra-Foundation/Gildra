# Catalog delivery: migrations 00181–00182

The API adds `sort=current|item_level_desc|item_level_asc|required_level_desc|required_level_asc|name_asc|name_desc|id` to entity summaries. Dataset definitions declare `default_order`; the initial value is `current`. A text query keeps relevance order, and batch external-ID lookups keep the old fast path. A heterogeneous untyped feed retains ID order unless the caller selects a sort.

`current` sorts items by confirmed expansion's `external_expansion_id`, item level, game ID, UUID, all descending. Unknown expansion/level uses -1. It never infers membership from item IDs, item levels or names. Non-item types use descending game ID (a stable source identity/recency proxy, not a claim about release date). First-seen build is unsuitable as the default because a bulk historical import gives many unrelated ages the same ingestion build. Name ordering is lowercase C collation. Explicit ascending level order puts unknown levels first; descending puts them last.

Version-2 JSON/base64url cursors bind the ordering tuple to effective filters, locale, product, sort and projection generation. A refresh invalidates these cursors explicitly. Legacy UUID cursors continue their original ID ordering. Relevance cursors have an `r2` prefix because the rank scale changed; old relevance tokens are rejected, not silently reinterpreted.

## Read model and indexes

`catalog_delivery_order` holds two small rows per published entity (EN and RU), rather than indexing historical payloads. It stores the published version, source name, item levels/class, confirmed expansion ordinal and game ID. `name_search` is a generated simple-language name vector for word-prefix matching anywhere in a name, including Russian case endings that extend the typed stem. Ordinary exact/name-prefix/full-text/fuzzy candidates still use their existing sources and indexes. This is prefix matching, not a Russian morphological dictionary.

The API rechecks the current published pointer, deletion, display-name/usability and expansion gates. A lateral page check prevents historical version/localization joins from replacing the ordering index walk with a full join and sort. Item class/range restrictions are also applied to the small projection before those checks. No provenance or publication gate is relaxed.

`refresh_catalog_read_models` wraps its predecessor and refreshes delivery in the same transaction. `refresh_catalog_delivery_order(product_id)` also supports an explicit initial bootstrap. A transaction advisory lock serializes projection refreshes; product generation changes only with the atomic replacement. Run the supported read-model refresh after any same-version metadata/expansion repair too. Missing initialization is an error, not a fabricated empty catalog.

00182 uses `CREATE INDEX CONCURRENTLY` outside a transaction. No index removed by 00178 is recreated. Category filtering now uses the already-existing `(version_id,category_id)` index and correlated ancestry checks; no new historical category index is needed.

On an isolated 2-CPU PostgreSQL 17.10, 787,531 real production UUID/type/game-ID/slug identities expanded to 1,575,062 locale rows gave:

- btree indexes: 11.5–38.7 seconds each, about 191 seconds for the initial nine;
- name-prefix GIN: 25.9 seconds / 48 MiB;
- item-class/current index: 9.5 seconds / 31 MiB;
- final heap 292 MiB, indexes 873 MiB, total 1,166 MiB.

This is a **structural index benchmark**, not a restored catalog or an end-to-end API timing. Most level/class/expansion fields were unknown and names were canonical slugs; the actual 5,098 Russian transmog names were then loaded to verify the prefix index. Budget approximately 1.5 GiB steady state and at least 3 GiB temporary headroom, allowing for full localized names, index build workspace and MVCC replacement. Rehearse the real bootstrap duration on the restored stand; a broad source export hit its 120-second read-only timeout, so no full-refresh duration is asserted. Plan a separate bootstrap window (conservatively 5–20 minutes to rehearse, not a measured promise). The indexes themselves took about 4 minutes under concurrent host load.

## Release order

The integrated sequence is 00179 (achievements), 00180 (collections), 00181 (delivery schema), 00182 (delivery indexes). No dummy migrations are used. Keep `catalogbackup.MinimumSchemaVersion` at 182; immutable production baseline hashes and the gapless sequence must pass before release.

On the isolated restored stand, and only later in an explicitly authorized production rollout:

1. Keep the previous API serving; preserve its image and a verified backup. Apply the integrated migrations **through 00181** with the supported Goose runner and the explicitly selected database.
2. Bootstrap before index creation, to avoid maintaining all indexes during the initial load:
   ```sql
   SELECT refresh_catalog_delivery_order(NULL::smallint);
   ```
   This writes derived facts only, not source records or membership. Select a product ID instead if deliberately bootstrapping a single supported product; every product exposed by the new API needs its state initialized.
3. Apply 00182. Every index is concurrent. If a concurrent build is interrupted, inspect `pg_index.indisvalid/indisready`, drop only the invalid named delivery index concurrently and retry. `IF NOT EXISTS` keeps completed indexes but does **not** repair an invalid index.
4. Run `ANALYZE catalog_delivery_order; ANALYZE catalog_delivery_state;` and verify:
   ```sql
   SELECT product_id,refreshed_at FROM catalog_delivery_state;
   SELECT count(*) FROM catalog_delivery_order;
   SELECT indexrelid::regclass,indisvalid,indisready
   FROM pg_index WHERE indrelid IN
     ('catalog_delivery_order'::regclass,'catalog_delivery_state'::regclass);
   ```
   Verify the 11 delivery-order indexes and the state unique index, all valid/ready. Compare projection rows to twice the current nondeleted published entity count. Run real API paging/search/filter checks, not only these metadata checks.
5. Switch to the candidate API only after bootstrap/index validation. Test both locales, deep cursors, filters, exact and word-prefix searches, two expansion keys and an empty registered cohort. Recheck real query plans and full endpoint latency on the stand before production authorization.

Future publication/repair uses the normal `catalog-index -product <slug> -stats-only -confirm` / publication read-model path. Bootstrap is deliberately not an expensive implicit API request.

## Rollback

Roll the API back first. The old API ignores the additive projection/schema and can keep serving while the new data/indexes remain for diagnosis. Do not run Down while the new API is serving. If removing the feature afterward, Goose Down 00182 drops only its indexes concurrently; Down 00181 restores the prior read-model function and removes the derived tables/default-order column. Source rows, confirmed memberships, policies and original indexes are untouched. A restored source backup is not required for this additive rollback.
