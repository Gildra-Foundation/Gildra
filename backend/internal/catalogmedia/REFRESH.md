# Keeping catalog pictures cached

The API serves a cached picture only while it is younger than its source's
`catalog_source_policies.retention_days` (30 days for `blizzard_api`, no limit
for `wago_tools` and `zamimg`). Past that the media handler redirects to the
source instead. Two `catalog-media-cache` modes keep the cache inside the
window; neither changes the policy row.

## Icons: `-refresh-icons`

Renews icons of the active published build of one product, whatever expansion
a record belongs to. An icon name is due when a published record that uses it
has no proven primary icon younger than `retention - headroom`
(`-refresh-headroom-days`, default 10: a 30-day source is renewed from day 20).
Each due name is downloaded once and linked to every published record with
that name.

```sh
# Dry run: reads PostgreSQL only, prints planned downloads, row updates and
# rows per record type. No HTTP request, no write.
catalog-media-cache -product wow -refresh-icons -refresh-limit 100000

# Apply one bounded pass.
catalog-media-cache -product wow -refresh-icons -refresh-limit 3000 \
  -refresh-batch 100 -refresh-headroom-days 10 -refresh-interval 500ms \
  -refresh-checkpoint /var/lib/gildra/catalog-media/refresh-wow.json -confirm
```

- **Real bytes.** Every renewal is a GET. Bytes equal to what a record already
  points to renew that observation and its artifact in place (`cached_at`,
  `fetched_at`); different bytes become a new observation and the old one is
  kept. Nothing only moves a timestamp.
- **Batches and resume.** `-refresh-batch` names are committed per
  transaction, then the cursor file is replaced atomically. An interrupted run
  loses at most the open batch; the next run continues behind the cursor and
  wraps around. The cursor belongs to one product and build. Deleting it is
  safe: freshness in the database decides what is due.
- **Rate.** One request stream, `-refresh-interval` between any two requests,
  fallbacks included. A 429 or 503 pauses the stream for at least a minute
  (longer if `Retry-After` says so). A 429, a 5xx or a network error is not an
  answer about the icon: it stays due and is counted in `sourceTrouble`. Three
  icons in a row with such an answer from the official render host end the
  run with an error.
- **Failures.** An icon no source has is reported in `failed` and
  `failureSample` and left out of later runs for `-refresh-retry-failed-after`
  (default 72h). The run exits nonzero when more than 10% of its downloads
  (and at least 10) found no source, when the render host stopped it, or on a
  database error.
- **Lock.** The shared media advisory lock is held on one connection for the
  run; a second media job fails instead of writing concurrently.
- **Read models.** Source dependencies, library previews and coverage are
  rebuilt once at the end of a run that committed something, or by the next
  run if that one was interrupted.

Output fields: `eligibleIcons` (due names), `plannedDownloads` (names in this
run), `plannedRowUpdates`, `plannedRowsByType`, `deferredFailures`, then for an
applied run `iconsCached`, `entitiesLinked`, `rowsInserted` (new observations;
the rest were renewed in place), `failed`, `sourceTrouble`, `bytes`.

## Records without an icon name: `-derived-mode`

`plan` reads only, `verify` downloads into the chosen directory and rolls the
database links back, `apply` needs `-confirm`. `-derived-headroom-days`
(default 10) renews derived pictures the same way: unchanged bytes renew the
record's own observation. Evidence must come from the record's own published
build.

Most creature displays without a picture have no render on the official host
(147 of 150 sampled on 2026-11-12 answered 403). With `-derived-checkpoint` an
asset every asked source reported missing is remembered for
`-derived-retry-failed-after` (default 14 days) and does not use up the run's
`-derived-limit`; the record falls through to its next proven picture. A run
exits nonzero only when downloads fail for another reason (throttling, server
errors, timeouts) above the same 10% tolerance.

Default groups: `currency_file_icon` (CurrencyTypes.InventoryIconFileID),
`item_appearance_icon`, `encounter_journal_portrait`,
`instance_journal_button`, `transmog_set_item_icon`,
`mount_source_spell_icon`, `spell_misc_icon`, `creature_display_render`.

Optional groups, applied only when named or with `-derived-groups all`:
`map_journal_instance_button` shows a dungeon map by its journal button and
`quest_reward_package_item_icon` shows a reward package by one of its items.
They are related illustrations, not the map or a quest icon.

## Schedule

`infra/systemd/gildra-catalog-media-cache.{service,timer}` and
`gildra-catalog-derived-media.{service,timer}` are proposals; nothing installs
them. Icons: 3000 names per run, four runs a day. Derived: 2000 assets per
run, four runs a day, offset by five hours. Both use the same lock and pace.
Stop the old hourly expansion-scoped job before enabling them.

The opt-in benchmark `TestRefreshRealIconSample` (build tag `integration`)
downloads `MEDIA_REAL_ICON_SAMPLE`, a JSON array of 2000
`{"icon_name":…,"file_data_id":…}` rows, into its own PostgreSQL container and
directory. `MEDIA_REAL_ICON_INTERVAL` sets the pace, `MEDIA_REAL_ICON_RENEW=1`
adds a second pass over the same icons, and one icon with
`MEDIA_REAL_ICON_FANOUT=N` links it to N fixture records.
