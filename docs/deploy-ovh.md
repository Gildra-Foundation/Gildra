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

The deploy workflow publishes three commit-addressed GHCR images after CI succeeds, uploads only non-secret Compose, Nginx, and PostgreSQL initialization configuration, and rolls the stack forward over SSH. Runtime secrets and origin certificates remain only on the server.

## 5. First release and checks

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
