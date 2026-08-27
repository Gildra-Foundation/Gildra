# Deploy to OVHcloud and Cloudflare

## 1. Prepare the OVHcloud host

Use an Ubuntu LTS or Debian host with at least 4 vCPU, 8 GB RAM and fast local SSD/NVMe. Install Docker Engine with the Compose plugin. Open inbound TCP 80 and 443; do not expose PostgreSQL, ClickHouse or Redis.

Create `/opt/gildra`, copy `.env.example` to `/opt/gildra/.env`, then replace every placeholder with a unique random secret. Keep this file only on the server.

The GitHub Container Registry packages are private by default. Log in once on the host using a GitHub token with `read:packages`:

```sh
docker login ghcr.io
```

Keep `PAYLOAD_DB_PUSH=false` in production. Payload migrations are bundled into the CMS image through `prodMigrations` and run once during service initialization.

## 2. Create the Cloudflare origin certificate

In Cloudflare, open **SSL/TLS → Origin Server → Create certificate**. Include `gildra.net`, `*.gildra.net`, then save the certificate and key on the host as:

- `/opt/gildra/infra/certs/origin.pem`
- `/opt/gildra/infra/certs/origin-key.pem`

Set Cloudflare SSL/TLS mode to **Full (strict)** and enable **Always Use HTTPS**.

## 3. Configure DNS

Create proxied records in the `gildra.net` zone:

| Type | Name | Target |
| --- | --- | --- |
| A | `@` | OVHcloud public IPv4 |
| CNAME | `www` | `gildra.net` |
| A | `cms` | OVHcloud public IPv4 |

If the host has IPv6, add matching proxied AAAA records. Do not add public DNS records for databases.

## 4. Configure GitHub

Create the `production` environment and add these secrets:

- `OVH_HOST`: server hostname or IP.
- `OVH_USER`: deployment user with Docker access and write access to `/opt/gildra`.
- `OVH_SSH_PRIVATE_KEY`: private key for that user.
- `OVH_SSH_KNOWN_HOSTS`: verified host key from the OVHcloud console or a trusted first connection.

The deploy workflow publishes four commit-addressed GHCR images after CI succeeds, uploads only non-secret Compose, Nginx, PostgreSQL initialization, and deployment configuration, and rolls the stack forward over SSH. Runtime secrets, backup credential files, and origin certificates remain only on the server.

Set the repository variable `PRODUCTION_DEPLOY_ENABLED=true` only after the production environment has required reviewers and the first release baseline described below. Keep the variable unset or `false` while preparing the host.

## 5. Establish the first immutable release baseline

Automated deployment fails closed unless `/opt/gildra/current-release.env` identifies a reviewed, currently running release. This guarantees that every later deployment has a rollback target. On the host, obtain the exact image references reported by Docker for `web`, `api`, `cms`, and `scraper`; each must use the approved `ghcr.io/gildra-foundation/gildra-*` repository and an `@sha256:` digest. Record them in a root-owned file with mode `600`:

```text
SOURCE_REVISION=<40-character Git commit SHA>
RELEASE_ID=production-baseline
WEB_IMAGE=ghcr.io/gildra-foundation/gildra-web@sha256:<digest>
API_IMAGE=ghcr.io/gildra-foundation/gildra-api@sha256:<digest>
CMS_IMAGE=ghcr.io/gildra-foundation/gildra-cms@sha256:<digest>
SCRAPER_IMAGE=ghcr.io/gildra-foundation/gildra-scraper@sha256:<digest>
DEPLOYED_AT=<UTC timestamp>
```

If the source revision is genuinely unknown, omit the `SOURCE_REVISION` line instead of inventing one. Legacy manifests containing only the four image fields are accepted for the first rollback and are upgraded automatically after a verified no-op or successful release. Never guess an image digest or copy it from the registry UI without comparing it to Docker's reported `Config.Image` value on the host.

Install the repository's backup and catalog-refresh units once, then enable their timers. Reinstall the units and reload systemd when their definitions change. Both jobs intentionally refuse to run without `current-release.env`, so an operational job cannot silently use an image version different from the active release.

## 6. Immutable deployment and rollback contract

For each approved release, the workflow resolves registry digests, validates their repository and format, and sends only immutable references to the host. The host then:

1. Acquires `/run/lock/gildra-deploy.lock`, preventing overlapping releases even if CI concurrency controls fail.
2. Copies the current release manifest to `previous-release.env`.
3. Pulls and starts the four application images.
4. Compares every continuously running application service's Docker `Config.Image` with the requested digest. Scheduled API backup and catalog refresh jobs read their image digests from the same release manifest.
5. Checks the local API readiness and both database pages through the production reverse proxy.
6. Atomically writes `current-release.env` only after all checks pass.

If any step after the rollback point fails, the host restores the previous immutable images, repeats image and health verification, records `last-rollback.env`, and leaves the workflow failed for investigation. Database migrations are never rolled back automatically. A release may set `GILDRA_ROLLBACK_COMPATIBLE=true` only when its migrations are additive and the previous application images can safely run against the resulting schema. Breaking migrations require a separate, reviewed expand/migrate/contract sequence.

## 7. First release and checks

Push to `master` or run the workflows after merging. Once deployment finishes, verify:

```sh
curl -fsS https://gildra.net/api/livez
curl -fsS https://gildra.net/api/readyz
curl -fsS https://gildra.net/INDEXNOW_KEY.txt
curl -I https://cms.gildra.net/admin
```

Replace `INDEXNOW_KEY` with the value from `.env`. The key route and submitted `keyLocation` must match exactly.

## Cloudflare hardening after launch

- Cache Next.js static assets (`/_next/static/*`) aggressively, but bypass cache for `/api/*` and `cms.gildra.net`.
- Add a rate-limit rule for analytics ingestion and CMS login.
- Restrict `cms.gildra.net` with Cloudflare Access for the editorial team.
- Configure the OVHcloud firewall to accept 80/443 only from Cloudflare IP ranges after confirming remote SSH access remains available.
