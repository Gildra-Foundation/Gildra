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
