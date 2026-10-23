# GlitchTip (error tracking)

Self-hosted, Sentry-compatible error tracking for gildra.net, riftden.com, the Go API and the
scheduled host units. Runs on the production host as the compose project `glitchtip` in
`/opt/glitchtip` (this `compose.yml` + a root-only `.env` with `SECRET_KEY` and `POSTGRES_PASSWORD`).

- UI: `ssh -L 8200:127.0.0.1:8200 <host>`, then http://127.0.0.1:8200 (no public route).
  Owner login: `/opt/glitchtip/owner-login.txt`; automation API token: `/opt/glitchtip/api-token`.
- Organization `gildra`, team `platform`, projects `gildra-web`, `gildra-api`, `gildra-ops`
  (systemd unit failures via `infra/systemd/notify-unit-failure.py`), `riftden-web`.
- DSNs: `/opt/glitchtip/dsn.env`. `*_INTERNAL` = `http://<key>@glitchtip:8000/<id>` for containers
  on `gildra_default`; `*_HOST` = `http://<key>@127.0.0.1:8200/<id>` for scripts on the host.
- Only the `glitchtip` service joins `gildra_default`, and every service name is unique: on a shared
  network the name `postgres` resolves to the production Gildra database (seen on first start).

Start / upgrade: `cd /opt/glitchtip && sudo docker compose pull && sudo docker compose up -d`
(migrations run on start). Retention: 30 days (`GLITCHTIP_RETENTION_DAYS`).

## CMS (cms.gildra.net)

Create a project `gildra-cms` in organization `gildra`, put its internal DSN
(`http://<key>@glitchtip:8000/<id>`) into the production `.env` as `SENTRY_CMS_DSN`.
`compose.runtime.yml` passes it to `cms` and `cms-jobs` as `SENTRY_DSN`; empty = reporting off.
Reported: 5xx request errors, Next render errors, jobs-worker crashes and every failed
`payload-jobs` row (e.g. `revalidateSite`, once per worker process). Set a GlitchTip alert rule
"new issue → email/Telegram" for the project. Cookies, headers and request bodies are stripped.
