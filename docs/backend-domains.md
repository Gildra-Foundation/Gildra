# Backend domains (Go API)

Roadmap 86. The Go backend in `backend/` is a set of domain packages under
`backend/internal/`, wired together only in `backend/cmd/*` (mainly
`cmd/server/main.go`). Transports adapt domains to a protocol and never hold
business rules.

| Layer | Packages | Notes |
|---|---|---|
| Transports | `httpapi` (OpenAPI contract, split per domain: `catalog_handlers.go`, `analytics_handlers.go`, `indexnow_handlers.go`), `graphqlapi`, `adminpanel` | May import domains; nothing imports them except `cmd/*`. |
| Generated contract | `api` (oapi-codegen from `backend/api/openapi.yaml`) | Used by `httpapi`, `adminpanel` and `analytics` only. |
| Catalog | `catalog` (read side, search), `catalogimport`, `catalogtaxonomy`, `catalogpipeline`, `catalogrelease`, `catalogquality`, `catalogmedia`, `catalogbackup` | The pipeline orchestrates import → release → quality gates. |
| Sources | `battlenet`, `wago`, `raidbots`, `attparser`, `attimport`, `datasetrefresh` | Fetch and parse external data; no HTTP serving. |
| Product features | `analytics`, `auth`, `characterworkspace`, `rotationlab`, `platformhome`, `gamemeta`, `indexnow` | Each registers its own routes or is served by `httpapi`. |
| Other games | `genshin`, `genshinimport`, `league`, `leagueimport` | Hidden by the WoW-only MVP on the site, still served by the API. |
| Shared | `config`, `joberrors`; leaves `httpjson`, `pagination`, `mediafiles` | A *leaf* may be imported by any package and imports no internal package (enforced by the architecture test). |

## Rules

- A domain never imports a transport (`httpapi`, `graphqlapi`, `adminpanel`).
- Hand-written JSON handlers write through `httpjson` (`Write`,
  `WriteProblem`) and only choose their cache policy.
- Every import between internal packages is listed in
  `backend/internal/architecture/architecture_test.go` (`allowedEdges`); a new
  one fails `go test ./...` until it is added there on purpose. Prefer wiring in
  `cmd/*` (pass an interface, as `httpapi.IndexNowQueue` does) over a new edge.
- New HTTP endpoints of the contract go into the matching `*_handlers.go`;
  endpoints outside the contract live in their domain package and are
  registered on the router in `cmd/server/main.go`.

## Runtime limits (cmd/server)

| Variable | Default | Effect |
|---|---|---|
| `API_REQUEST_TIMEOUT` | `20s` | Context deadline for public requests; `0` disables. Admin/auth, rotation simulations, gear variants and media are exempt (`httpapi.LongRunningPrefixes`). |
| `DATABASE_MAX_CONNS` | pgx default, max(4, CPUs) | API pool size (`application_name=gildra-api`). |
| `WORKER_DATABASE_MAX_CONNS` | `5` | Separate River pool (`application_name=gildra-worker`). |

Catalog list totals never hold a page (`internal/catalog/totals.go`): exact
counts run in the background (at most 2 at once, 10 min timeout), a request
waits for one at most 2 s, and a finished count stays fresh for
max(10 min, 100 × its duration) and is served up to 24 h while it is
recounted; a failure backs off for a minute. Until the first count is ready
`/v1/game/entities` reports the planner's estimate and `entity-summaries`
leaves `total` out. An exact count of every spell takes about 2.5 min on
production (533,234 spells, two passes over the 23 GB localization table).
List descriptions/tooltip icons are loaded per page; the integration test
`TestCatalogListQueryCountDoesNotGrowWithPageSize` guards the query count.
It runs in CI through Testcontainers, or locally against any server with
`GILDRA_INTEGRATION_DATABASE_URL` (it creates and drops its own database).

## Next steps

- `cmd/db2-import` and `cmd/catalog-import` are split by concern but still
  keep import logic in `main`; move it into `catalogimport` so it can be
  unit-tested.
- Large files left: `genshin/service.go` (1.5k), `rotationlab/simc.go`
  (1.4k), `catalogimport/store.go` (1.5k), `adminpanel/handler.go` (1.2k).
- `analytics` depends on the generated `api` types; give it its own types and
  map them in `httpapi`.
