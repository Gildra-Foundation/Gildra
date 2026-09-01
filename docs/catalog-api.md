# Catalog API contract

The catalog API is versioned under `/world-of-warcraft/retail/v1/game`. The
historical `/v1/game` paths remain compatible aliases. The OpenAPI 3.1 source
of truth is `backend/api/openapi.yaml`; generated Go and TypeScript files must
not be edited by hand.

Edition prefixes select the product without a query parameter:

- `/world-of-warcraft/retail/v1` → `wow` (current retail client)
- `/world-of-warcraft/classic/v1` → `wow_classic`
- `/world-of-warcraft/classic-era/v1` → `wow_classic_era`
- `/world-of-warcraft/hardcore/v1` → `wow_classic_hardcore`

## Read pattern

Use the lightweight collection resource for navigation and search:

```http
GET /world-of-warcraft/retail/v1/game/entity-summaries?product=wow&type=item&locale=ru_RU&limit=24&includeTotal=true
```

It returns identity, name, icon, item quality/level and a few high-signal facts,
but deliberately excludes raw payloads and tooltip blocks. Fetch the complete
public projection only when the user opens a tooltip or detail page:

```http
GET /world-of-warcraft/retail/v1/game/entities/{uuid}?locale=ru_RU
GET /world-of-warcraft/retail/v1/game/entities/{uuid}/relationships?locale=ru_RU&direction=both&limit=50
```

Search accepts names in either supported language, aliases, game IDs and
bounded typo matching. Results are ranked by exact ID/name, prefix, full-text
match and then trigram similarity. Multiple taxonomy filters use repeated
`facet` parameters and AND semantics:

```http
GET /v1/game/entity-summaries?product=wow&type=item&locale=ru_RU&facet=equipment/slots/head&facet=equipment/armor/plate&minRequiredLevel=70
```

`category` remains the browse-tree path, while repeated `facet` values are the
independent filters selected by the user. Ranked and unranked cursors are both
opaque and are intentionally not interchangeable.

This list/detail split prevents 20 copies of large source payloads from being
sent for every result page. Raw source payloads are never part of the public
contract; they remain build-pinned provenance for import audit. Collections use opaque cursor pagination. Clients
must treat cursors as values, never parse them, and must not construct an
arbitrary previous cursor.

Detail tooltip blocks are normalized, additive projections. In particular,
`talent_spells` contains every `grants`, `replaces` or `modifies` edge together
with the related spell icon and normalized DB2 effect parameters;
`recipe_info` contains professions, reagents, currency costs and outputs. These
blocks contain canonical identifiers and source provenance rather than copied
third-party HTML.

Spell and talent detail responses resolve supported client tokens such as
effect values, durations and `$@spelldesc` references from the same build's
normalized DB2 rows. A resolved text block keeps the exact client string in
`raw_text` and sets `resolution_source` to `db2`. Tokens whose value depends on
an unavailable condition or scaling input remain unchanged; the API must never
replace them with zero or a guessed number.

## Discovery and quality

- `GET /v1/game/products` lists imported products/build families. It requires
  the administrator session while `CATALOG_ACCESS_MODE=private` is active.
  Each product also returns `freshness` (`fresh`, `stale`, `empty`,
  `refreshing` or `failed`) and `freshnessReason`. `fresh` is reserved for an
  atomic published release whose build matches the active build; a staging
  projection without a public release is never reported as fresh.
- `GET /v1/game/entity-types` returns the registry-driven UI order, localized
  labels, count and coverage totals.
- `GET /v1/game/categories` returns the many-to-many taxonomy and cached
  recursive counts.
- `GET /v1/game/coverage` exposes active-build field coverage.
- `GET /v1/game/relation-types` documents the graph ontology.
- `GET /v1/game/entities/{uuid}/quality` reports the build, update time,
  normalized-fact completeness and source provenance.
- `GET /v1/game/entities/{uuid}/versions` lists build-pinned revisions.
- `GET /v1/game/entities/{uuid}/comparison` compares the newest revisions from
  two distinct builds by default; `fromBuildId` and `toBuildId` select an
  explicit pair. Comparison facts come from normalized item, spell, talent and
  acquisition tables rather than source payload shape.
- `GET /v1/game/source-policies` exposes reviewed redistribution metadata; it is
  operational guidance, not a grant of rights.
- `GET /v1/game/sitemap-entries` is a bounded, UUID-sharded SEO read model used
  by the website's segmented sitemaps.

GraphQL exposes the same edition freshness signal through `gameProducts`:

```graphql
query Editions {
  gameProducts {
    slug
    name
    freshness
    freshnessReason
  }
}
```

## HTTP caching and errors

Successful catalog GET responses include an `ETag` plus:

```http
Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=3600, stale-if-error=86400
```

Clients should send `If-None-Match`; an unchanged response is `304` with no
body. Next.js server fetches revalidate after five minutes, while sitemap shards
revalidate hourly. Import publication remains atomic, so a cache entry always
represents one committed read-model generation.

Errors use the documented JSON/problem responses. `400` means the query or
cursor is invalid, `404` means the canonical entity is absent, `429` is reserved
for the deployment rate limiter, and `500` must not expose database or source
credentials.

Catalog delivery also has a fail-closed source gate. In production every source
that contributes to an active canonical entity or public tooltip must have both a
currently reviewed compatible policy and an explicit grant for the
`production/public_api` surface. If either record is absent, expired or blocked,
REST and GraphQL return `503 application/problem+json` with `Cache-Control:
no-store`. `GET /v1/game/source-policies` remains available for diagnostics.
Local development uses `CATALOG_PUBLICATION_MODE=report`; it preserves the page
and exposes only the number of blocked sources through response headers.

## Evolution rules

Changes inside `/v1` must be additive: add optional response fields or a new
resource, do not rename existing fields or reinterpret cursors. A breaking
contract starts `/v2`, runs alongside `/v1` for a documented migration window,
and publishes a deprecation date. Every contract change requires regeneration,
Go tests, TypeScript checking and a production Next.js build.

At the edge, cache anonymous catalog GETs and rate-limit expensive search
queries separately from cheap cached detail reads. API keys, quotas and paid
access must not be launched until the source policies and Blizzard API terms
have received product-specific legal review.
