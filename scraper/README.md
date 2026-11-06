# Gildra crawler

ParsesUnix 0.10.0 is pinned to commit
`6eb5e5fe5ca2676751aca993a30aaa6604f77bd9` for reproducible builds.

The paid provider order is Scrape.do, Bright Data Web Unlocker, ZenRows,
Zyte, then Firecrawl. Credentials alone never enable a crawl: a source profile,
seed URLs, and an explicit credit budget are also required.

Create one reviewed profile per source. Keep only public, permitted URLs in a
profile and never add cookies, authorization headers, or provider tokens.

Local verification:

```sh
.venv-parsesunix/bin/ws-profile validate scraper/profiles/source-template.yaml
.venv-parsesunix/bin/ws-run scraper/config/production.json --preflight
```

The production container is intentionally on-demand:

```sh
docker compose --profile scraping run --rm scraper /app/config/production.json --preflight
```

Extract the six current Wowhead raid and Mythic+ tier-list links with the
Scrape.do normal strategy (one source URL):

```sh
docker compose --profile scraping run --rm \
  --entrypoint python scraper \
  /app/parsers/wowhead_tier_lists.py
```

The validated, deduplicated result is written atomically to
`scraper/reports/wowhead-tier-lists.json`. Provider credentials are read only
from the process environment and are never included in the report.

Fetch all six discovered pages and extract every tier placement and canonical
specialization guide URL. Guide body text is intentionally not collected:

```sh
docker compose --profile scraping run --rm \
  --entrypoint python scraper \
  -m parsers.wowhead_tier_details
```

The result is written to
`scraper/reports/wowhead-tier-list-details.json`. The parser fails closed if a
tier badge cannot be joined to its guide URL.

`Tierlist — wow.gg` is collected by `parsers.wowgg_tierlist` every eight
hours. It discovers wow.gg's public browser API configuration at run time and
stores every exposed Mythic+, raid, and PvP context: roles, add-ons, key
ranges, dungeons, raids, retail bosses, raid difficulties, PvP brackets,
regions, metrics, and source weeks. The landing page follows the paid-provider
policy above; the site's public JSON API is called directly to avoid spending
hundreds of proxy credits per refresh.

The candidate is published by `parsers.wowgg_dataset_service` only after the
complete filter map, row counts, tier assignments, URLs, and regression bounds
pass validation. Failed or partial runs leave the last-known-good snapshot
active.

`Mythic+ meta — MythicStats` (`mplus-meta-mythicstats`) is collected by
`parsers.mythicstats_meta` every six hours. mythicstats.com allows all
crawlers in `robots.txt` and publishes no terms forbidding reuse; only numbers
are stored (weekly spec presence in the top 2000 keys, average key level, Gini
coefficients, the latest week's affixes and sample size), never page text or
images, and the site is credited on every page that shows them.

- Seeds: `https://mythicstats.com/meta` and the newest
  `https://mythicstats.com/period/<id>` listed there (2 requests per run, at
  most 1 request per second, `parsers.mythicstats_client`).
- Budget: direct HTTPS first, 0 credits per run in the normal case
  (~240 requests a month). The paid provider chain is a fallback only when the
  direct response is blocked or fails its HTML contract; a fallback run is
  capped at 2 provider requests.
- Publishing: `parsers.mythicstats_meta_dataset_service` validates seasons,
  weeks, role counts, ranges and source URLs, rejects a candidate that lost
  more than half of its weeks, and inserts a snapshot only when the content
  hash changed. Failed runs keep the last-known-good snapshot active; the API
  marks it `stale` after 36 hours without a successful check.

`Tierlist — MythicStats` is collected by `parsers.mythicstats_tierlist` once a
day (06:15 UTC). It reads the `/spec` tier list and the `/dps` performance
table through the shared `parsers.mythicstats_client`: direct HTTPS first
(one request per second, zero credits), paid providers only as a fallback.
Only spec, tier, position, sample size and period are kept, with a link back
to mythicstats.com.

`Tierlist — u.gg` is collected by `parsers.ugg_tierlist` every twelve hours.
u.gg renders its tier lists from public JSON on `stats2.u.gg`
(`robots.txt` allows `*`, `Content-Signal: use=reference`), so the collector
reads it directly: HEAD probes find the newest `v{N}` data build, then five
files (Mythic+ all keys; raid all, normal, heroic and mythic) are fetched for
dps, healer and tank — five requests and zero credits per run. Spec + hero
talent rows collapse into one record per spec (best hero talent sets the tier
and position; the split stays in `hero_talents`). A payload older than seven
days fails closed, and `parsers.ugg_dataset_service` keeps the last-known-good
snapshot when validation fails.

JSON-payload tier lists (`parsers.tierlist_payload`) store one validated
document per snapshot in `dataset_snapshots.payload` (no tables of their own)
and keep the last good snapshot when a candidate fails validation. All of them
fetch directly over HTTPS (one request every 1.5 s, zero credits); only spec,
position, tier and the source's numbers are kept:

- `tierlist-wowmeta` — wowmeta.com Mythic+ DPS/healer/tank (confidence-bound
  rating, mean rating, sample, max key), 3 pages, daily 08:15 UTC.
- `tierlist-wythic` — wythic.com spec tiers by share in top Mythic+ runs,
  1 page, every 12 hours.
- `tierlist-method` — method.gg editorial Mythic+ tier list, 1 page, daily
  08:45 UTC.
- `tierlist-murlok` — murlok.io PvP ranking per role for Solo Shuffle, 2v2,
  3v3, Blitz and RBG, 15 pages, every 12 hours; murlok has no tiers, so they
  are cut from its score by natural breaks (`tiers_derived`).
- `tierlist-pvp-ladder` — Gildra's PvP tier from the official Blizzard PvP
  leaderboards (EU + US): spec share among players at or above the overall
  #1000 in Solo Shuffle/Blitz (per-spec boards) and among the top 500/500/300
  characters of 3v3/2v2/RBG by active specialization; tiers by natural breaks,
  specs nobody plays at the top are F. About 2 500 API requests, every 12
  hours. `PVP_LADDER_TOP="3v3=500,2v2=500,rbg=300"` overrides the sample.

Not collected: boomkin.io (its terms forbid automated collection),
seemeta.com and archon.gg (both answer a bot challenge, direct and through
Scrape.do; Archon's daily job is off since its snapshot is stale since
2026-08-26), Maxroll and Mobalytics (terms).

Maxroll and Wowhead tier lists are not collected for the source tabs: their
terms forbid automated collection (see the source review in the tier-list
sources task) until written permission exists.

`Mythic+ runs — Raider.IO` (`mplus-runs-raiderio`) is collected by
`parsers.raiderio_mplus` every twelve hours from Raider.IO's documented public
API (https://raider.io/api): `static-data` (current season and dungeons),
`runs` (season leaderboard per dungeon and region, 20 runs a page) and
`season-cutoffs` (rating percentiles per region). Raider.IO's terms require a
link back to raider.io on every public page that shows the data and forbid
scraping beyond the published endpoints; nothing else is read.

- Sample: the top of every dungeon's leaderboard — 15 pages for US and EU, 4
  for KR and TW (`RAIDERIO_MPLUS_PAGES="us=15,eu=15,kr=4,tw=4"` overrides),
  about 6 000 runs. The leaderboards list timed runs only, so the snapshot
  keeps upgrades and time left, never a "timed %".
- Stored per run: run id, dungeon, key level, upgrades, clear time, timer,
  completion time, region, the five specializations and a video flag.
  Character names are not stored.
- Budget: ~310 direct API requests a run at one request per second (about six
  minutes), `Retry-After` honoured on 429, zero paid credits.
- Publishing: `parsers.raiderio_mplus_dataset_service` checks roles (1 tank,
  1 healer, 3 DPS), levels, timers, ids, regions and cutoff ordering, rejects a
  candidate that lost more than half of its runs, and keeps the last good
  snapshot on failure. The API computes compositions, stats and the route
  finder from it (`/v1/meta/wow/mythic-plus/{comps,stats,runs}`) and marks it
  `stale` after 30 hours without a successful check.

`Mythic+ leaderboard — EU/US/KR/TW` (`mplus-leaderboard-<region>`) is
collected by `parsers.mplus_leaderboard` every twelve hours from the official
Blizzard APIs only (client credentials `BATTLENET_CLIENT_ID` /
`BATTLENET_CLIENT_SECRET` in the worker's environment, never stored):

- Discovery: Mythic+ leaderboards of every connected realm, dungeon and week
  (the last three weeks; sixteen on the first run) give each character's best
  observed run per dungeon, a lower bound of the rating. Characters of the
  previous snapshot are carried over.
- Rating: the season Mythic+ profile of the top 700 candidates and the top 130
  of every specialization gives the exact rating, the specialization of the
  counted runs and the highest timed key.
- Details: overall top 500 + top 100 per specialization get item level, hero
  talent tree and talent loadout; the top 30 per specialization also get
  equipment, summarised as trinket and weapon shares.
- Budget: about 16k requests for EU or US and 2–3k for KR or TW per run,
  at `BLIZZARD_API_RATE` (default 6 requests per second, far below the 36k per
  hour / 100 per second limit shared with the website), so a full run takes
  1.5–2 hours. The daemon starts it in a background thread
  (`POST /internal/v1/datasets/mplus-leaderboard/refresh` answers at once);
  every region is validated and published on its own, a failed region keeps
  its last-known-good snapshot, and the API marks it `stale` after 48 hours.
