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
- Run the bounded, read-only catalog journey gate against the candidate API.
  It discovers a real entity from the selected dataset and measures the
  dataset list, directory and detail endpoints without embedding an ID:

  ```text
  catalog-load-check -base-url https://candidate-api.example \
    -product wow -locale en_US -dataset items \
    -requests 60 -concurrency 4
  ```

  For a non-mutating preflight against an isolated candidate database, set
  `DATABASE_URL` in the environment and use `-in-process`. This starts only the
  public catalog handler; it does not run migrations, workers or imports.

  Require zero HTTP/request failures, dataset-list p95 at or below 1 s,
  summary p95 at or below 500 ms and detail p95 at or below 1 s. Store its JSON
  output with the release evidence. Repeat for `ru_RU` before promotion.

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
- Before disarming automatic rollback, require the dataset API plus `/library`
  and `/ru/library` to return 2xx through `api.gildra.net`, and require the same
  library routes through `gildra.net`.
- In the private owner-approved mode, also exercise an authenticated nested
  bookmark such as `/library/items` and `/ru/library/items`. It must resolve to
  the same API-console catalog shell; it must not fall through to the separate
  Next renderer or return a catalog 500.
- Require the immutable deployment script's bounded `catalog-load-check` to
  pass for both `en_US` and `ru_RU`; its JSON report is retained in the deploy
  log as release evidence.
- Require `catalog-audit -require-production-ready` to pass with the selected
  same-server recovery policy. This is a fail-closed deployment gate: missing
  source reviews, linked owner/legal evidence, or publication grants must abort
  and roll back the candidate.
- Verify every allowed production grant points to an unexpired immutable
  `owner_approval` or `legal` review for the same source and surface. Direct
  grant updates are prohibited; use `catalog-source-approval` and retain its
  JSON result as release evidence.
- Verify `/database`, `/ru/database`, one EN quest and one RU quest through the
  public HTTPS path.
- Verify catalog pagination, invalid-cursor handling and reward links.
- Observe application and datastore errors for the agreed release window.

## 6. Abort and rollback

Abort promotion if migrations fail, `/readyz` is not healthy, catalog
projections are stale, reward invariants regress, the dataset API fails, or an
English/Russian public library route fails. These checks run while automatic
rollback is still armed; a later workflow smoke step is additional evidence,
not the rollback boundary.

For an application rollback, redeploy the previously recorded immutable image
digests with the unchanged Compose revision. Migration 59 only registers the
additive `rewards` relation, so an older application can be restored without a
destructive database down migration. For later incompatible data migrations,
stabilize and forward-fix unless a separately tested recovery plan explicitly
authorizes restoration.
