# API console (api.gildra.net)

The console is the Next.js route `app/api-console/[...consolePath]` rendered
behind nginx on `api.gildra.net`. Short paths (`/`, `/datasets/...`, `/api`,
`/system`, `/catalog`) are rewritten to `/api-console/...`; internal links
always use the canonical `/api-console/...` form (`components/api-console/paths.ts`)
so they work on both origins.

## Page loading contract

Every page loads its sections independently through
`components/api-console/client.ts`:

- each request has a 12 s deadline (AbortController + timer), is cancelled
  when the page or filter changes, and idempotent GETs retry twice on network
  errors, timeouts and 5xx answers;
- a section renders its own skeleton, error card with "Повторить", or data;
  no page waits for `/v1/admin/dashboard`.

| Page | Requests |
| --- | --- |
| Overview | `/v1/admin/system`, `/v1/admin/catalog-health`, `/v1/admin/datasets/tierlist-wowhead`, `/v1/admin/datasets/tierlist-wowhead/runs`, `/v1/admin/analytics-overview?hours=24`, `/v1/admin/tierlist-wowhead?...` |
| Datasets list | `/v1/admin/datasets` |
| Dataset detail | `/v1/admin/datasets/{slug}`, `/v1/admin/datasets/{slug}/freshness`, `/v1/admin/datasets/{slug}/runs`, the dataset records route |
| API | none — static `components/api-console/endpoints.ts` (mirrors `consoleEndpoints` in Go) |
| System | `/v1/admin/system` |
| WoW catalog | `/v1/admin/catalog-health` (active build) plus the public catalog routes |

## Admin endpoints (`backend/internal/adminpanel`)

All routes require the `gildra_admin_session` cookie and answer
`{"code":"unauthorized"}` with 401 otherwise.

- `GET /v1/admin/system` — parallel pings of PostgreSQL, ClickHouse and Redis
  (2 s budget each), applied schema version, recovery policy.
- `GET /v1/admin/catalog-health` — entity/coverage counters, read-model state,
  last pipeline run and the last 8 imports. Cached for 20 s. Live source-record
  counters come from one aggregated query over the import snapshots that runs
  under a 3 s `statement_timeout`; when it is exceeded the response carries
  `catalog.warnings: ["import_activity_skipped"]` and the import list stays.
- `GET /v1/admin/analytics-overview?hours=24` — ClickHouse overview with a
  5 s budget; 503 `analytics_unavailable` when the store is slow.
- `GET /v1/admin/datasets`, `/{slug}`, `/{slug}/freshness`, `/{slug}/runs` —
  list, card, freshness (`fresh` / `stale` / `never` with `freshUntil`) and run
  history, each bounded to 5 s.
- `GET /v1/admin/endpoints` — the static method list.
- `GET /v1/admin/dashboard` — kept for older clients; assembled from the same
  bounded pieces with a 15 s overall budget.

The edition bases `/world-of-warcraft/{retail|classic|classic-era|hardcore}/v1`
are unchanged and listed on the API page.

## Worker containers

`catalog-pipeline` is a dedicated compose service (`profiles: ["operations"]`,
same image and environment as `api`, `healthcheck: disable: true`). Runners use
`docker compose run --rm --no-deps catalog-pipeline ...`; one-off workers are
therefore never reported as unhealthy api instances.

## Checks

```bash
npm run typecheck && NEXT_DIST_DIR=.next-blocks npm run build
```

```bash
NEXT_DIST_DIR=.next-blocks PORT=3000 npm run start & npm run smoke:console
```

The smoke script (`scripts/console-smoke.mjs`) stubs `/v1/**` with fixtures,
leaves `/v1/admin/dashboard` unanswered and asserts that Overview, Datasets,
API and System render with no `aria-busy` section left.
