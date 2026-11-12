# Server release tooling

These are the installed `gildra-ship` host release scripts, captured and updated
on 2026-11-11. They run on the dedicated server and do not use Vercel or require
GitHub Actions to deploy. Install over the existing skill scripts directory;
`origin-ca.pem` must remain alongside them.

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
  records whether an existing image was reused, and holds the compile and page
  generation seconds read from the build log.
- A finished image of the same label is reused before the build lock, not after
  waiting for someone else's build.
- `all` queues on `~/gildra-releases/.build/release.lock` from the build to the
  end of observation and names the release it waits for. After the wait the
  build checks again that the revision contains LIVE, so a release overtaken by
  another one stops in seconds instead of after its build and candidate check.
- The build fails when the log has Turbopack's "Overly broad patterns" warning
  and names the file and line (`ALLOW_BROAD_PATTERNS=1` overrides). Such a
  pattern in `apps/web/lib/og/atlasOg.tsx` matched all 129 160 files of
  `public/`; every release that added or removed a public file compiled for
  12–15 minutes on one core. With the paths marked `turbopackIgnore` the same
  change compiles in 12 s (probe: `~/gildra-releases/.probe/README.md`).

Validation:

```sh
python3 -m unittest discover -s infra/deploy/host-release -p 'test_*.py' -v   # test_site_check needs the host playwright
bash -n infra/deploy/host-release/deploy-web.sh
```

The original installed scripts are preserved at
`/home/debian/gildra-host-deploy-speed-20261111/original/`.
- The candidate check takes pictures only of pages with a problem (`SHOTS=1`:
  of every page), checks routes removed on purpose by status without a
  browser, reads the discovery pages eight at a time and reloads a page hit by
  `ERR_NETWORK_CHANGED` up to three times. Same pages and same rules: 54 pages,
  0 problems before and after; 93–103 s became 65–69 s on a fresh candidate.
- A hung step no longer holds the queue for an hour: the build stops after
  40 minutes, each part of the site check after 20. A compile over 180 s is
  reported as slow.

- The web container is replaced without a gap. Before, nginx answered 502
  ("Connection refused") while compose recreated the container: 19 of 22
  deploys on 9–11 November, 1 to 14 refusals each. Now `deploy-web.sh` starts
  a second container of the new image as the same compose service
  (`compose run --use-aliases`, name `gildra-web-bridge`), reloads nginx so it
  knows both addresses, recreates the service container, reloads, then removes
  the second container: new connections to it are refused for 1.5 s first
  (workers move to the service container), it is stopped with SIGTERM, nginx's
  neighbour entry for its address is flushed (a vanished address otherwise
  hangs a request for a minute) and nginx is reloaded once more. A new image
  that does not start stops the deploy before production is touched. No nginx
  or compose file changes.
  Sandbox (`~/gildra-releases/.probe/deploy-sandbox`, real images and the
  production nginx image, 15–25 requests a second): old switch 16, 18 and 16
  responses 502; new switch 0 errors in 9 runs. Production, 22:44 UTC:
  545 probe requests and 1760 visitor requests during the switch, no 5xx;
  the deploy step takes 22 s instead of 14–17 s.

Measured on the server on 2026-11-11 (4 cores, 6 build workers):

| release | build | compile | whole `all` |
| --- | --- | --- | --- |
| home-textures (public file change, before the fix) | 814 s | 720 s | 1067 s |
| build-speed (the fix itself, no public change) | 107 s | 40 s | 107 + 241 s (build run separately, then reused) |
| throwaway commit with a new public file and a CSS rule, after the fix | 91 s | 17.9 s | build only |

Candidate 4–6 s, site check 65–69 s (was 93–103 s), deploy 22 s (was 14–17 s, with 502s), observation 122–129 s.
