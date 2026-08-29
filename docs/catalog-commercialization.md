# Catalog source and commercialization gate

This document is an engineering launch gate, not legal advice. It records what
the product must verify before using third-party data to earn revenue or expose
bulk API access. Last evidence review: 2026-08-29.

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

## Primary-source review on 2026-08-29

This review distinguishes a license for developer software from permission to
republish the data handled by that software. A public repository, a download
button or a developer-oriented service is not, by itself, a redistribution
license.

| Source | Evidence reviewed | Engineering decision |
| --- | --- | --- |
| All The Things | The repository's MIT license permits use, modification and distribution of the repository material when the copyright and permission notice are retained. | Eligible for an owner-approved public relationship layer with MIT attribution. It must not overwrite official Blizzard fields or be presented as ownership of Blizzard IP. |
| Blizzard Developer API | The official API terms grant registered applications a limited, revocable right to display API data to end users, but restrict charging for API-backed features, marketing/monetization use, resale, attribution, privacy and data retention. | Eligible only for a free registered application that implements every operational condition. A paid API, paywall or sale of Blizzard data requires separate written approval. |
| Wago.Tools | The service exposes build and CSV tooling, but its public page does not state a license for redistribution of hosted DB2 output. Licenses found for related tool repositories apply to their code, not automatically to service output or extracted Blizzard data. | Keep permission-gated for the public API. Prefer direct, build-pinned client extraction or obtain written permission for the exact public use. |
| wow-listfile | The official repository publishes community and verified listfiles, but GitHub reports no repository license and the README contains no redistribution grant. | Keep permission-gated for the public API. Public repository availability is not sufficient evidence of redistribution rights. |

The ATT and Blizzard conclusions above are evidence decisions, not automatic
production grants. An accountable owner or legal approval still has to be
recorded by `catalog-source-approval`; the importer cannot grant itself rights.

### Blizzard operational gap

The product already has a privacy page, Blizzard attribution in entity views
and a footer disclaimer. However, the current local media cache only downloads
`remote` or `failed` assets once and serves cached files for one year with an
`immutable` response. It does not expire or refresh them using the source
policy's `retention_days`. Therefore `blizzard_api/asset_cache` must remain
blocked until the cache:

1. marks source assets stale no later than the configured retention period;
2. re-fetches or removes stale objects and their public metadata;
3. stops serving an object immediately after the publication grant is revoked;
4. records refresh and deletion outcomes in the media-cache run log;
5. has an integration test proving the complete stale-to-refresh and
   stale-to-delete lifecycle.

The existing permission joins already stop serving media when a grant is
missing, expired or revoked. That fail-closed behavior must be preserved when
retention is added.

## Private-library owner decision on 2026-08-29

The product owner approved Wago.Tools and wow-listfile for the free internal
Gildra library only. This is not a public-API, bulk-export, asset-cache or
commercial-use grant. The production runtime must therefore use
`CATALOG_ACCESS_MODE=private` and require a valid administrator session for
REST catalog routes, GraphQL and local media. Anonymous requests must return
`401` with a private, non-cacheable response.

This internal decision does not change the fail-closed
`production/public_api` grants in the database. Moving the library to public
access, adding paid access or exporting source-derived data requires a new
source review and an explicit owner/legal grant before the access mode changes.

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
