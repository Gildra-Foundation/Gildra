# Staging MVP — 2026-10-19

The current review environment is **https://staging.gildra.net**. Its persistent
project is `gildra-staging` in `/opt/gildra-staging`, using `compose.mvp.yml` and
`mvp.env`. The deployed `compose.yml` / `current.env` also describe this MVP.

```sh
sudo docker compose --env-file /opt/gildra-staging/mvp.env \
  -f /opt/gildra-staging/compose.mvp.yml ps
```

Web runs on the private staging network. The staging API uses the release's real
metadata and workspace handlers with its own PostgreSQL volume. The gateway
allows only GET/HEAD public catalog paths, strips credentials, and never forwards
writes to production. An edge relay joins the public proxy network; the app/API
and database do not. Only web port 3200 is published, on loopback.

Images are immutable IDs. Staging has noindex/no-store and no analytics. Its web
image was built with analytics disabled; it is not a production promotion image.
The old web-only helper below must not be used for this environment.

The live proxy contains the appended `public-server.conf` block, using the existing
wildcard certificate and an official Cloudflare IP allowlist for the new HTTPS
host. Keep this block when updating the production proxy configuration. No
production application or database is deployed by this staging setup.

`auth.env` (root, 0600) contains an independently generated AUTH_SECRET. Battle.net
client fields remain empty until the owner confirms the additional redirect URI:
`https://staging.gildra.net/api/auth/callback/battlenet`. Existing server-side
Battle.net client keys can then be connected without sending secrets in chat;
keep the original site's redirect URI and do not copy its AUTH_SECRET/cookies.
Alternatively use a separately registered client. Detailed owner checklist:
`docs/reports/mvp-release-20261019/staging-auth.md`.

The six rankings were imported atomically from the verified 19 October snapshot;
source fetch timestamps remain unchanged. There is no scheduled refresh on this
review environment: the normal 36-hour stale indicator remains active.
Only original metadata/workspace migrations are installed (see staging report).
The current initial backup was restored and verified. Retain the volume during
rollback; it will hold real private builds once OAuth is enabled.

Evidence, page index, images, checks and rollback:
`docs/reports/mvp-release-20261019/staging/`.

## Legacy web-only environment (superseded by this MVP)

A staging copy of gildra.net on the production host: the release candidate's web
image as compose project `gildra-staging` (`/opt/gildra-staging`, this
`compose.yml`), reading the production API and CMS on `gildra_default`. It is
reachable at **http://127.0.0.1:3200** on the host (SSH tunnel:
`ssh -L 3200:127.0.0.1:3200 <host>`).

Release flow for the web:

1. Build the image from a clean worktree of the release branch, as for production.
2. `sudo sh infra/deploy/deploy-web-staging.sh <image>`: starts it on staging and
   checks the main routes.
3. Run the release gate against staging, e.g.
   `SMOKE_URL=http://127.0.0.1:3200 npm run smoke:routes` (and `qa:release`).
4. Promote **the same image** to production with the usual web deploy.

What differs from production: `GILDRA_STAGING=1` (noindex, no analytics, a
staging badge, once the web app reads it), `SENTRY_ENVIRONMENT=staging`, no
`AUTH_SECRET` (Battle.net callbacks point at production, so sign-in is off),
no IndexNow key or CMS revalidate secret. Plausible does not count staging
visits: the tracker posts to `/stats/api/event` on the staging origin, which
does not exist there.

Public address (needs a Cloudflare DNS record `staging.gildra.net` → this host;
the origin certificate is already `*.gildra.net`): add a server block to
`infra/nginx/prod.conf` with basic auth (`/etc/nginx/staging.htpasswd`),
`add_header X-Robots-Tag "noindex, nofollow" always;` and
`proxy_pass http://$staging_upstream;` with `set $staging_upstream web-staging:3000;`
and the runtime resolver (127.0.0.11), so nginx starts even when staging is down.
