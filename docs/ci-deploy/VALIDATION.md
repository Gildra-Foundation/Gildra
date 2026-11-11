# Local validation — 2026-11-11 16:40 UTC

Branch `fix/ci-deploy-speed-20261111`, base `84628f869`.
The checks below were completed before branch publication.

Verified:

- actionlint: all workflows pass.
- Image handoff: four tests pass (exact digests, wrong revision, missing image,
  injected output). Outputs are emitted only after every artifact validates.
- Web deployment contract: healthy rollout, no-op, failed rollout, single
  parallel-probe failure and exact manifest rollback pass.
- Full immutable release contract: rollback, worker participation, previous-image
  backup, slow/failing backup and legacy manifest normalization pass.
- Frontend route parity161 and generated mirrors104 pass.
- Generated block contracts11 are current; frontend API generation has no drift.
- Valyro8, Atlas868 and observability7 tests pass; atlas token audit passes.
- Full TypeScript and ESLint pass (0 errors;285 existing lint warnings).
- Backend Go1.26.6 full generation and repeat determinism pass; GraphQL unchanged.
  Pinned go:generate directive also reproduced the same hash from host Go1.27.1
  in a separate temporary source tree after the Midnight handoff.
- PostgreSQL/ClickHouse migration validation, immutable baseline and sequence
  through177 pass; gofmt clean.
- Actual isolated PostgreSQL backup/restore passes (81.59s under host load).
- Baseline15→177, rollback176/reapply177 and read-model/recovery/publication guards
  pass (119.26s); targeted catalogbackup units/API compile and go vet pass.

Production frontend build PASS (1598 pages), route types + TypeScript PASS,
browser smoke30/30 PASS (including expected404s and EN/RU shell).
Lighthouse PASS on all4 configured pages with unchanged budgets (isolated port13298).
Only nonblocking warning: total-blocking-time316.9ms versus warning threshold300ms.
Scores and CLS: [{"url": "http://127.0.0.1:13298/ru", "accessibility": 1, "cls": 0.000894846061723575}, {"url": "http://127.0.0.1:13298/ru/wow/lairs/nymrissa-wavecaller", "accessibility": 1, "cls": 0.001351634614074357}, {"url": "http://127.0.0.1:13298/wow/raids", "accessibility": 1, "cls": 0.0005166585640934341}, {"url": "http://127.0.0.1:13298/wow/whats-new", "accessibility": 1, "cls": 0.0004817659053839646}].
Hosted GitHub CI/CD had not run at the time of the local checks above.

Evidence logs: `/tmp/gildra-ci-frontend-static2.log`,
`/tmp/gildra-ci-frontend-checks.log`, `/tmp/gildra-ci-frontend-build.log`,
`/tmp/gildra-ci-backend-20261111/`.

A separate pre-existing observation remains: the SQL guard from migration164
counts usable UI maps without checking names, whereas177 excludes unnamed
maps from public dataset statistics. Tests now seed named eligible maps and
retain excluded-map/wrong-build checks. No published migration was modified.

## Hosted CI follow-up — 2026-11-11

PR #3 run `43066972060` passed backend generation/drift, migration validation,
formatting and `go vet`. Staticcheck then found deprecated ReverseProxy.Director
usage and two numeric HTTP status codes in the private browser fixture.
The fixture now uses Rewrite/SetURL and named HTTP constants.

After the fix, Go1.26.6 full `staticcheck@2026.2.1 -tags=integration ./...`
and `go test -race ./internal/mythicbuilds` pass. Database/browser opt-in tests
remain skipped without their fixture environment. A separate local HTTP smoke
using the fixture's proxy setup passed upstream host/path/query forwarding,
credential removal, write rejection and upstream-error handling.
The hosted CI rerun remains pending.
