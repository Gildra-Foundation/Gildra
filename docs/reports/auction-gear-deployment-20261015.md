# Auction gear deployment — 2026-10-15

Status: **verified**. Published to https://gildra.net at **18:40 UTC**.

Updated only `web`, `api` and `rotation-sim-worker`. Reloaded the existing nginx
configuration to refresh upstream addresses. PostgreSQL, CMS and other services
were not recreated. PostgreSQL schema remained **171**; the API image starts its
server directly and does not run migration entrypoints. Existing runtime values,
including the actual API monitoring DSN, were preserved.

Release: `auction-gear-20261015-57f74f1`.

| Component | Immutable release tag | Image ID |
| --- | --- | --- |
| api | `gildra-api:auction-gear-20261015-57f74f1` | `sha256:28df99ef1c178f65328e816da0d103f189e03e4040fb2bf2ddc994d944c924c7` |
| rotation-sim-worker | `gildra-rotation-sim-worker:auction-gear-20261015-57f74f1` | `sha256:467ccc28e212d9011bd2d74d419182c1eb8f9302d76b00218605711c5c96ee26` |
| web | `gildra-web:auction-gear-20261015-57f74f1` | `sha256:eced5c0f79043e8ceb2f02f98ce4b7e8a5ad64299f919d50fb7a5f86c80640c7` |

Source base: `3ab504f3f004bfe925969bb3154d231f2dd323b1` plus the completed auction
feature worktree changes. Git commit/push were not requested and were not
performed. Exact source is preserved in a per-file SHA-256 manifest, source
archive and source diff. Source manifest SHA-256:
`57f74f1ac1f05419420fa1e060443f6eaa8acff983f42555ba5b60d513d4634f`.
Plan digest: `a60eaef8c8aff9b564753af234410999080e0827df4b971b4e6b8fa66ec974c9`.

## Verification

- Docker production build passed. The release worker packages the exact tested
  native SimC binary while preserving the maintained profiles from the previous
  runtime image. The API image preserves the previous runtime/tools/migrations
  and replaces the server binary only.
- Real public Elkardia run against the release **container**, using its own
  maintained preset: 48 simulations, the same 15-gold wrist lot #1071542782,
  14,273 → 14,645 DPS (+2.606%). No purchase occurred. This is the same bounded
  optimizer verification described in the live-character report; it does not
  claim a browser session or account ownership test.
- Shared staging was updated through `deploy-web-staging.sh`. All seven
  `qa:release` gates passed: home/book 0-pixel comparison, inner-page visual
  comparison, accessibility, motion, route budgets, route smoke and transitions.
- Production worker resolves the known real item to ilvl 102 / required level 80
  and explicitly rejects an unknown bonus. Production catalog API returns the
  two requested published item IDs with class and required-level filters.
- Origin smoke passed for RU/EN main and character pages, sitemap and API readyz.
  Public browser checks passed eight desktop/mobile RU/EN page views without
  page errors or horizontal overflow. Anonymous job requests return 401;
  cross-site job creation returns 403.
- After more than two minutes, all three updated containers remained healthy,
  on the expected image IDs, with restart count zero. Schema was still 171.
- Existing encrypted schema-171 backup was present, restore-verified, and its
  SHA-256 matched the registered artifact. No restore or data import was run.

## Recovery and evidence

Previous manifest: `/opt/gildra/auction-gear-20261015-57f74f1-previous.env`.
Previous images remain locally available. This was a bounded host release over
existing local hotfix images, not a full registry rollout. The preserved rollback
runner supports these exact local worker/API/web images and restores the prior
manifest only after health and origin checks:

```sh
sudo python3 /opt/gildra/releases/auction-gear-20261015-57f74f1/rollout.py --rollback
```

The runner refuses to overwrite a later deployment. Future registry rollouts
must retain a rollback path that accepts the current local worker release; the
older generic full-release script does not accept local worker tags. Use the
preserved scoped runner for this release's rollback.

Root-owned source, plan, authorization reference, script and release result:
`/opt/gildra/releases/auction-gear-20261015-57f74f1/`. Local gitignored evidence:
`.artifacts/auction-deploy-20261015/` and
`apps/web/.artifacts/release-gate/2026-10-15-18-30/report.md`.
Credentials and tokens were kept in existing runtime secret references/process
memory and were not recorded in evidence. Temporary worker canary and read-only
catalog probe were stopped after verification. Shared staging remains on the
same published image.
