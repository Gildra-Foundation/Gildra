# Site performance and frost release — 17 October 2026

The realistic Arthas transition now uses one inert copy of visible page content
and one bounded canvas. Frost generation and fragment painting run in a worker;
no full page subtree is multiplied per shard and no synchronous PNG/base64
encoding happens on navigation. The freeze → crack → shatter sequence remains.
The old content fades behind thickening ice before its bitmap fragments fall.
Other themes, sound consent and reduced-motion behaviour are retained.

## Measurement

Three independent browser contexts per route/profile, same host, Chromium,
production containers and CDP network limits (4 Mbps down / 1 Mbps up, 80 ms).
Desktop: 1440×900, CPU1. Mobile simulation: 390×844, CPU4. The baseline production
frost image and source `82528e43` have identical motion/home/global style files.
These are laboratory observations, not real-user INP, CrUX or an FPS guarantee.

Medians below. “Blocking” is the sum of long-task time above 50 ms during the
transition observation, a diagnostic separate from the synchronous click time.

| Profile / outgoing route | Click before → after | Blocking before → after | Transition nodes before → after |
| --- | ---: | ---: | ---: |
| desktop `/ru` | 299.3 → 37 ms | 3242 → 643 ms | 7194 → 328 |
| desktop `/ru/wow/raids` | 277.4 → 19.8 ms | 2772 → 13 ms | 2214 → 104 |
| mobile `/ru` | 510.1 → 108.3 ms | 5872 → 247 ms | 5659 → 308 |
| mobile `/ru/wow/raids` | 569.3 → 95.3 ms | 6455 → 250 ms | 1987 → 104 |

All 12 optimized transitions had no page errors, fewer than 700 transition nodes
and zero toDataURL calls. The desktop home trace reduces UpdateLayoutTree from
1760 ms total / 441 ms maximum to 111 ms / 37 ms. Baseline and optimized traces
are diagnostic captures with the same instrumentation.

The responsive cover uses the same artwork/dimensions/transparency with smaller
AVIF/WebP delivery files. The 640px AVIF is 75,733 bytes versus 138,779 (45.4% less).
The 320/1024px AVIF files shrink 47.2%/42.9%; WebP variants shrink 33–42%.
The old assets remain available for existing references.

Four representative routes also received three cold load measurements per
profile. Public baseline and local candidate load timings have different
transport environments, so no percentage LCP claim is made from those samples.
The unauthenticated PSI request returned 429; no analytics credentials were read.

## Verification

- Production Docker build, TypeScript and 766 prerendered pages passed.
- Scoped ESLint, Atlas tokens, theme/route/fracture tests and React Doctor passed.
- Full production candidate and public gildra.net journeys passed: all 4 themes,
  persistence/cross-tab sync, RU/EN, 320–1440px, history, delayed routes, Escape,
  opt-outs, anchors/filters, audio consent/cleanup, system and site reduced motion.
- Ice integration passed 390/1440/2560px: growing frost, cracking, shattering,
  one snapshot/canvas, cancellation and cleanup. Controlled-clock cancellation
  waits for the actual network/React route commit; late arrival has a separate
  normal-time regression journey.
- Renderer checks passed pixel growth, frame coalescing, worker failure and
  unsupported-worker fallback, active cleanup and 60-second idle termination.
- No page/hydration errors in candidate or public journey.

## Published release

Published to https://gildra.net/ru at 2026-10-17T18:37:24Z.

- Application source: `e75ab13f7ad3b5ff5f1b93632eacc6b63fcf4e7a`.
- QA clock synchronization follow-up: `58e6c0e` (test harness only).
- Image: `sha256:14f9a715fd5ea392e7576183cedaf9dcbcf23039b2884ef867873856346d445b`.
- Release: `site-performance-20261017-e75ab13-r1`.
- Current auction changes from 82528e43 and source b369796 are retained.
- Plan: `sha256:25d835aecc9c4725d564720d87a17404db657142f87751d272e09d94e66fcb49`.

Only the web container was replaced, with the existing runtime environment and
auction-state mount preserved. Existing nginx configuration passed validation
and was softly reloaded. Origin HTTPS route/readiness checks passed with trusted
originCA validation. Six public JS/CSS/worker/cover assets matched the image
byte-for-byte in a normal browser. During 120 seconds of observation the web
remained healthy with zero restarts/runtime errors. Nine other container
identities and restart counts remained unchanged. Both isolated benchmark
containers were removed; release and rollback images remain.

Rollback image:
`sha256:469678b310adc56782881d6cbf1b232280ca82813a889ffb85226e61bb8833f3`.
The byte-exact previous release manifest and guarded rollback runner are archived
at `/opt/gildra/releases/site-performance-20261017-e75ab13-r1/`. The runner refuses
rollback over a newer image/manifest. No schema/data migration was made.

Measurements and protected deployment/recovery evidence live in
`/home/debian/gildra-site-performance-release-20261017/evidence/`; release records
and the protected recovery manifest are archived under the release directory.
The operation ledger verifies one record with tip
`sha256:1518c74aa215881285dc78b2bfa8acc05a39ddd493b2da41bd7d7442881a992f`.
No remote Git push was performed. Future web releases must retain application
source e75ab13 along with the auction 82528 changes. Worker modifications must use
a new asset version, preserving immutable caching of ice-renderer-v3.js.

Reproduce measurements with `apps/web/scripts/qa-site-performance.mjs` and
`PERF_LABEL`, `BASE_URL`, `CHROMIUM_PATH`; use `PERF_TRANSITIONS_ONLY=1` for the
transition-only pass. Raw measurements/traces are under the ignored
`apps/web/.artifacts/site-performance/` directory.
