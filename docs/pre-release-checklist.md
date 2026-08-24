# Pre-release checklist

Use this gate before promoting a Gildra revision. Production changes still
require the protected `production` environment and its approval policy.

## 1. Source revision

- Every intended application file is tracked and reviewed; no unexpected
  untracked files enter the release.
- The revision is an immutable commit on the protected `master` branch.
- External GitHub Actions are pinned to reviewed full commit SHAs.
- CI succeeds for frontend, CMS, backend race tests, integration tests and the
  scraper image.

## 2. Dependencies and secrets

- `npm audit --omit=dev --audit-level=high` passes in the root and `cms`.
- Pinned `govulncheck` reports no reachable Go vulnerabilities.
- Secret scanning covers tracked and newly added files. `.env`, `.env.local`,
  build output, screenshots and `.codex-local` remain ignored.
- Production receives secrets through protected environment references; no
  literal credential is stored in Compose or workflow files.

## 3. Database and catalog

- Apply all PostgreSQL migrations to an empty PostgreSQL 17 database.
- Verify the newest migration can roll down and up in isolation. Production
  migrations remain forward-only; this down test proves developer recovery,
  not the production rollback strategy.
- Take a fresh production backup and prove an isolated restore before applying
  migrations or a full catalog refresh. Record the artifact reference and
  measured restore time.
- Run `catalog-audit`; require zero running imports, a successful latest import,
  valid constraints and fresh graph/read-model projection watermarks.
- Smoke-test a quest with no rewards, an ordinary quest and a large choice
  reward set in both `en_US` and `ru_RU`.

## 4. Images and Compose

- Build once from the approved commit. Tag application images with the full
  commit SHA and record their registry digests.
- Validate the exact merged deployment configuration:

  ```powershell
  docker compose -f compose.yml -f compose.prod.yml -f compose.runtime.yml config --quiet
  ```

- Do not deploy `compose.prod.yml` by itself; it is an overlay.
- Confirm API, web, CMS, nginx and scraper healthchecks, read-only filesystems
  where supported, `no-new-privileges` and digest-pinned infrastructure images.

## 5. Deployment verification

- Deploy the same image digests that passed CI; do not rebuild on the target.
- Require `/livez` and `/readyz` to return 2xx after Compose reports healthy.
- Verify `/database`, `/ru/database`, one EN quest and one RU quest through the
  public HTTPS path.
- Verify catalog pagination, invalid-cursor handling and reward links.
- Observe application and datastore errors for the agreed release window.

## 6. Abort and rollback

Abort promotion if migrations fail, `/readyz` is not healthy, catalog
projections are stale, reward invariants regress, or the public smoke test
fails.

For an application rollback, redeploy the previously recorded immutable image
digests with the unchanged Compose revision. Migration 59 only registers the
additive `rewards` relation, so an older application can be restored without a
destructive database down migration. For later incompatible data migrations,
stabilize and forward-fix unless a separately tested recovery plan explicitly
authorizes restoration.
