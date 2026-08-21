# Gildra architecture

Gildra is deployed as one modular monolith: one repository and one OVHcloud deployment, with isolated processes for the public site, API/worker and CMS.

```text
Visitors -> Cloudflare -> nginx on OVHcloud
                         |-- gildra.net ------> Next.js web
                         |-- gildra.net/api --> Go API + River workers
                         `-- cms.gildra.net --> Payload CMS

Go API -> PostgreSQL (users, subscriptions, River jobs)
       -> ClickHouse (product analytics)
       -> Redis (short-lived analytics cache)
```

## Ownership

- `app`, `components`, `lib`: Next.js 16 public website, Tailwind CSS, shadcn/ui, next-intl and Recharts.
- `backend`: Go 1.26 API generated from `backend/api/openapi.yaml` with oapi-codegen.
- `backend/migrations/postgres`: Goose migrations for users and subscriptions.
- `backend/migrations/clickhouse`: Goose migrations for event storage and hourly aggregate materialized views.
- `cms`: Payload CMS with localized pages and guides, media and draft publishing.
- `compose.yml`: local/full stack.
- `compose.prod.yml`: OVHcloud origin TLS and immutable GHCR images.

The TypeScript API types and Go server types are generated from the same OpenAPI document. `oapi-codegen` generates Go; `openapi-typescript` generates TypeScript because oapi-codegen itself is Go-specific.

## Data model

PostgreSQL is the source of truth for accounts, subscription state and durable River jobs. Payload uses a separate `gildra_cms` database on the same PostgreSQL instance, so its schema lifecycle cannot collide with application migrations.

ClickHouse stores append-only events in monthly partitions with a 13-month TTL. Its ordering key is optimized for overview queries, and an incremental materialized view maintains hourly event and visitor states. Redis caches overview responses briefly and is never a source of truth.

## Operations

- `/livez` checks the Go process.
- `/readyz` checks PostgreSQL, ClickHouse and Redis.
- Sentry is initialized in Next.js and Go when a DSN is provided.
- IndexNow submissions are validated for `gildra.net`, persisted as River jobs and retried up to eight times.
- CI regenerates contracts, validates Goose migrations, runs Go race tests, builds both Next.js apps and starts real PostgreSQL and ClickHouse instances through Testcontainers.
