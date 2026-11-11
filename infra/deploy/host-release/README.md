# Server release tooling

These are the installed `gildra-ship` host release scripts, captured and updated
on 2026-11-11. They run on the dedicated server and do not use Vercel or require
GitHub Actions to deploy. Install over the existing skill scripts directory;
`site-check.cjs` and `origin-ca.pem` must remain alongside them.

Changes:

- No automatic BuildKit prune after each build. Existing host GC and the 25 GB
  disk preflight remain. This removes one cache eviction source, but does not
  guarantee a warm cache under host GC or concurrent workloads.
- Retrying `build`/`all` for the same label reuses an image only when its recorded
  revision, build inputs, helper hash, previous live image, immutable image ID
  and image labels all match. Missing images and old receipts rebuild normally.
  Candidate checks, deployment checks and 120-second observation still run.
- Smoke checks use batches of at most four requests. Every child is reaped
  before rollback, including on signals. API readiness remains mandatory.
- `build-phases.json` separates lock waiting, checkout and Docker build time,
  and records whether an existing image was reused.

Validation:

```sh
python3 -m unittest discover -s infra/deploy/host-release -p 'test_*.py' -v
bash -n infra/deploy/host-release/deploy-web.sh
```

The original installed scripts are preserved at
`/home/debian/gildra-host-deploy-speed-20261111/original/`.
No production timing is claimed for this version until a full server release
can run after the separately owned RAID maintenance lock is released.
The prior 15–18 second deployment step excludes build, candidate QA and observation.
