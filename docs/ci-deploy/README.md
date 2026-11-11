# CI and deployment handoff

CI verifies the source and, on trusted branch pushes, builds the four candidate
images in parallel with the test jobs. Pull requests run the tests without
publishing images. `candidate-images.yml` is a reusable workflow, not a second
push-triggered build. All existing quality gates remain required.

Each image build publishes a small artifact containing the source revision and
the build action's immutable digest. Deploy OVHcloud downloads artifacts from
the successful triggering CI run, validates all four revisions/digests, and
passes the digest references to the existing release scripts. It does not
rebuild or resolve mutable tags. A superseded master revision is refused.

Next.js CI retains `.next/cache` across compatible dependency sets. Registry
images use zstd level3. Route type generation and TypeScript validation run
explicitly before the build, avoiding the same typecheck twice. Four web smoke requests can run concurrently, with all
requests in each batch reaped before failure/rollback; API readiness remains
required. Web-only releases upload only the web deployment script. Full
releases retain their existing infrastructure, backup and migration gates.

## Verification

```sh
actionlint
python3 -m unittest discover -s scripts/ci -v
sh infra/deploy/test-deploy-web-release.sh
sh infra/deploy/test-deploy-immutable-release.sh
npm run routes:check
npm run blocks:contracts -- --check
```

The API go:generate directive pins Go1.26.6, matching CI, even when the host
default Go differs. Different Go versions can
produce different compressed embedded OpenAPI bytes even with identical API
schema. Migration integration tests derive the latest and previous versions
from the committed migrations, not the database under test.

The story library is intentionally Russian-only; `/wow/stories` redirects to
`/ru/wow/stories`. Its component supplies `lang="ru"`. The parity checker has a
single explicit exception for that page; other pages/previews still need mirrors.

## Activation and timing

These changes require review and an authorized commit/push. Test first via a PR:
PR CI never publishes or deploys. A subsequent master push can deploy because
`PRODUCTION_DEPLOY_ENABLED` is currently true. Do not confuse a local test pass
with a successful hosted CI/CD run.

Once the workflow is installed on the default branch, a manual CI run on a
selected branch also builds/publishes images and artifacts. CD accepts only a
successful master **push**, so this manual path verifies the complete build
handoff without deploying.

The last measured local release was346s total /218s until live. This patch does
not change the installed gildra-ship helper or shorten its120s observation.
Hosted CI/CD savings must be measured after activation: image build time now
overlaps tests instead of being added after them. No new production time is
claimed from local checks.

References: [GitHub workflow artifacts](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts),
[Docker digest-based delivery](https://docs.docker.com/learn/content/build-a-trusted-delivery-pipeline/).

The generated API fix was also handed off to the Midnight implementation by
explicit request. Its isolated snapshot and patch are preserved in
`/home/debian/gildra-ci-deploy-handoff-20261111/`; the claim on
`backend/internal/api/server.gen.go` was released separately. Midnight must
regenerate its expanded schema using Go1.26.6, rather than replace it with this
older generated snapshot. The CI worktree retains its own fix.
