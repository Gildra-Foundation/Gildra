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
| Shared | `config`, `joberrors` | |

## Rules

- A domain never imports a transport (`httpapi`, `graphqlapi`, `adminpanel`).
- Every import between internal packages is listed in
  `backend/internal/architecture/architecture_test.go` (`allowedEdges`); a new
  one fails `go test ./...` until it is added there on purpose. Prefer wiring in
  `cmd/*` (pass an interface, as `httpapi.IndexNowQueue` does) over a new edge.
- New HTTP endpoints of the contract go into the matching `*_handlers.go`;
  endpoints outside the contract live in their domain package and are
  registered on the router in `cmd/server/main.go`.

## Next steps

- `cmd/db2-import/main.go` (2.4k lines) and `cmd/catalog-import/main.go`
  (2.0k) keep import logic in `main`; move it into `catalogimport` so it can
  be unit-tested.
- `catalogtaxonomy/indexer.go` (2.6k lines) splits naturally by entity family.
- `analytics` depends on the generated `api` types; give it its own types and
  map them in `httpapi`.
