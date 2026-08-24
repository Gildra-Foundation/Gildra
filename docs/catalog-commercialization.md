# Catalog source and commercialization gate

This document is an engineering launch gate, not legal advice. It records what
the product must verify before using third-party data to earn revenue or expose
bulk API access. Last evidence review: 2026-08-23.

## Current source decisions

| Source | Useful for | Current public/commercial posture |
| --- | --- | --- |
| [Blizzard Game Data API](https://community.developer.battle.net/documentation/world-of-warcraft/game-data-apis) | Official server-side names, item details and supported game data | Restricted pending counsel. The [Developer API Terms](https://www.blizzard.com/en-us/legal/a2989b50-5f16-43b1-abec-2ae17cc09dd6/blizzard-developer-api-terms-of-use) contain material monetization restrictions for applications using the API. |
| [Wago.Tools](https://wago.tools/) | Build-pinned client DB2 tables | Permission required; no commercial redistribution or asset-cache permission is asserted. |
| [Raidbots developer data](https://www.raidbots.com/developers) | Build-pinned SimulationCraft-oriented static datasets | Permission required for commercial redistribution; retain artifact hashes and follow the developer page's local-cache guidance. |
| [wow-listfile](https://github.com/wowdev/wow-listfile) | FileDataID-to-name lookup, including verified and community names | No repository-level license was present at review time. Treat community names as unstable and require permission before redistribution. |
| [wow.export](https://github.com/Kruithne/wow.export) | MIT-licensed extraction software and implementation reference | The software is MIT; that does not license extracted Blizzard game content or assets. |
| Wowhead tooltip verification | Manual/internal comparison | Blocked from the public API until written permission and current terms review. Do not present scraped observations as official facts. |

The database table `catalog_source_policies` is the machine-readable copy of
these decisions. A release fails closed when review is pending, expired or
blocked. Store the exact reviewed terms URL, review date and decision owner;
schedule re-review at least every 90 days and whenever a source announces a
policy change.

## Safe product value

The defensible product value is Gildra's own work: normalized relationships,
build-aware comparisons, editorial guides, search relevance, data-quality
coverage, user collections and first-party aggregate analytics. Do not assume
that placing third-party API data behind a subscription, paid API key, ad gate
or premium feature is allowed merely because the endpoint is public or the
source software is open source.

Before monetization launch, obtain a written product-specific review covering:

1. whether the whole application is considered to use Blizzard APIs and which
   subscription/advertising models are permitted;
2. redistribution of raw fields, full tooltips, icons and bulk exports;
3. attribution, trademark presentation, cache lifetime and deletion duties;
4. Wago, Raidbots and wow-listfile permission for the exact production use;
5. privacy/consent for catalog search and tooltip analytics.

## Cost and abuse controls

- Serve list summaries rather than source payloads; fetch details lazily.
- Put anonymous GETs behind Cloudflare cache and enforce per-route quotas there.
- Keep exact search counts optional for machine clients; they are the expensive
  portion of arbitrary text search.
- Track zero-result searches, detail opens, tooltip opens, source coverage and
  read-model age. These identify useful enrichment work without inventing data.
- Generate UUID-sharded sitemaps rather than one database-wide response.
- Never expose source credentials, raw artifact storage locations, internal
  provenance payloads or blocked-source tooltip data through a bulk endpoint.
