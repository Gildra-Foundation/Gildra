# Build context measurements (2026-11-11)

The root `.dockerignore` removes documentation/reports, task notes, the separately
built scraper and these diagnostic tools from web's `COPY . .`. It also excludes
nested `.env*` and `.npmrc` files. All public files, backend (including OpenAPI),
infra (including the simc patch), manifests, scripts and application tests remain.
The scraper/backend build contexts have their own ignore scope. Web and simc are
the two root-context Dockerfiles. Design lock and other QA run from the checkout,
where documentation is still present; no quality gate is removed.

At source `58a3d59d8fffcc33981bf60b10e8915a4f7df519`, tracked payload decreases from
1,071,574,411 to 1,016,357,013 bytes: **55,217,398 bytes (5.153%)**, 376 files.
All 128,736 public files / 981,004,661 bytes have the same tree fingerprint.
These are Git blob bytes, not compressed transport bytes. The full-build wall-time
improvement has NOT been measured. Historical build durations are not an A/B test.

## Reproduce without a build

From the repository root (Go with module download access, Python 3):

```sh
mkdir -p /tmp/gildra-build-measurement
 git show 58a3d59d8fffcc33981bf60b10e8915a4f7df519:.dockerignore > /tmp/gildra-build-measurement/before.ignore
python3 -m unittest discover -s scripts/build-speed -p 'test_*.py' -v
cd scripts/build-speed
GOMAXPROCS=2 go test -v ./...
GOMAXPROCS=2 go run . -rev 58a3d59d8fffcc33981bf60b10e8915a4f7df519 -before /tmp/gildra-build-measurement/before.ignore > /tmp/gildra-build-measurement/context.json
```

`context.go` uses pinned Moby patternmatcher, reports resolved commit and both
policy SHA256s, and reads Git metadata only. It does not inspect untracked local
secrets. A source-tree fingerprint is **not an image reuse authorization**: it
omits build args, platform, base digest, toolchain and runtime inputs.

Parse real logs without printing raw build commands or environment values:

```sh
python3 scripts/build-speed/logs.py /path/to/release/build.log > /tmp/stages.json
```

Parallel step durations overlap; do not sum them to infer end-to-end time. Missing
completion means unknown, not zero. No detailed buildtrace file was available in
the inspected completed release; do not infer trace CPU time from console gaps.

## Bounded cache experiment

`cache_probe.py` builds only a scratch image stage containing a 2 MiB synthetic
report, a tiny source/asset and dummy secret sentinels. It runs the SAME fixture
under both policies: cold (`--no-cache`), warm, doc edit, then source edit. It asserts
COPY cache reuse and exported bytes, including secret exclusion. It exports local
files, creates no image tag, runs no code, installs no dependencies, uses no cache
mounts, and performs no prune or deletion. Requires passwordless `sudo docker` and
`sudo chown` for its own local export. Choose a new output directory each run;
fixture/output <=16 MiB plus small BuildKit records. Do not loop indefinitely.

```sh
python3 scripts/build-speed/cache_probe.py \
  --before /tmp/gildra-build-measurement/before.ignore --after .dockerignore \
  --out /tmp/gildra-build-measurement/probe
```

Cold here means BuildKit cache bypass, NOT cold OS page cache. The timings are
single-observation diagnostics on a busy host; the verified result is cache
hit/miss behavior, not seconds saved in a production build. No test result or image
is reused across revisions by these tools.

## Integration and rollback

Cherry-pick the handoff commit into the next release source. Do not edit a frozen
source snapshot or an executing release helper. Existing helper pins its Dockerfile
outside the source directory but reads this root `.dockerignore` from `git archive`.
Keep normal typecheck/tests/a11y/design-lock/site-check/rollback/observation gates.
The next full candidate build is the integration gate; this isolated branch was
not deployed. Revert this commit to restore context inclusion (no runtime/data
migration). Reintroduce an excluded path if a future build genuinely consumes it.

For full builds, hold `/tmp/forever-platform-20261111/heavy.lock` for the complete
operation and independently inspect other release jobs: the installed helper does
not enforce that lock. Its unconditional `docker builder prune -f` conflicts with
warm-cache retention; it was not changed here. Coordinate any helper change with
the current release owner after its running process finishes. Do not run the
helper as a benchmark while the user prohibits pruning.
