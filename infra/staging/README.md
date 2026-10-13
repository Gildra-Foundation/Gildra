# Staging (roadmap 90)

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
