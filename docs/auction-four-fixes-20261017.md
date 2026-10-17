# Auction follow-up fixes — 17 October 2026

This release addresses the four confirmed findings from the post-fix audit:
DPS evaluation priority, first-search recovery intent, exact-variant exclusion
identity, and noncombat profession equipment inflating missing-data warnings.

## Resulting behavior

- Expensive item DPS comparisons follow discovery priority independently of
  canonical input identity. Version-2 evaluation order keeps resumptions stable;
  legacy version-1 checkpoints retain their original canonical cursor. The old
  deployed reader rejects version 2 during rollback instead of silently skipping
  candidates; searches created by the new version may need restarting after a
  rollback.
  All candidate effects and physical lots remain in the eventual search domain.
  Newly arriving priority items must also precede old unmeasured lower-priority
  candidates when the market domain changes.
- Before sending an initial search, the browser saves a validated whitelist of
  budget, encounter, objective and slots, bound to character/locale/profile.
  Pending job/nonce recovery restores that intent before another search can be
  started. Prices, stats, ownership and simulation facts remain server-owned.
- Excluded variants show the actual framed item, exact item tooltip, localized
  level and stat context, and distinguishable restore names. Existing collapsed
  grouping and batches of twenty are retained.
- Affordable unsupported variants receive bounded catalog classification.
  Authoritative noncombat classes, including profession equipment and recipes,
  do not count as missing combat-item data. Unknown types and unsupported armor
  or weapons remain excluded from native work and keep their warnings. Optional
  state fields preserve old checkpoints and bounded catalog retries.

## Verification and publication

Published web release `auction-four-fixes-release-20261017-abca09e` at 2026-10-17T16:40:25.589246+00:00; final verification completed
at 2026-10-17T16:42:54.416007+00:00. The runtime image contains clean Git revision `abca09e88880dc5c5173c624f80d48a8732b76fd`.
The subsequent publication-record commit changes this document only.

- Code commits: `1609972ed4f48f6dd1b1adae95ac0980db64b00d`, `cce5ccb71c086cbf81cde3903e05886cdfa1bad3`, `abca09e88880dc5c5173c624f80d48a8732b76fd`. Author and committer are
  `Shpuntyara <271792134+Shpuntyara@users.noreply.github.com>` on every
  new code commit and the publication-record commit.
- GitHub `master` and `fix/auction-value-speed-20261017` received all three
  code commits by normal atomic fast-forward push. Annotated release tag
  `auction-four-fixes-release-20261017-abca09e` points to the exact runtime source revision; earlier history
  was not rewritten. The final documentation commit is pushed afterward.
- Immutable web image: `sha256:5bd0c1d273d829b142f3441b317266ffc112b337f018f532d91f0d5d917277da`. Its clean Git archive and all 2,878 tracked
  archive entries were checked against the tested source. The original build
  wrapper exited 143 while its Docker child continued; successful completion
  was recovered from that same build's final log, image and source labels.
  No duplicate or unverified build was deployed.
- Final offline gate: **40/40** suites, including priority, refreshed arrivals,
  legacy/new checkpoint compatibility, unsupported-class coverage, cancellation,
  recovery intent and existing API/persistence/assembly checks. Independent
  optimizer review: 2,000 markets, 1.25 million assignments and 35,494 resumes.
- Browser gates: **156/156 current + 84/84 legacy** executions on actual current
  components with real Inter/Alegreya font assets, EN/RU and 390/1440 px layouts,
  React Strict Mode, recovery/retirement, keyboard focus, Escape/tooltips,
  exclusion identity and restoration. Their market/job facts are synthetic;
  all eight product-source hashes remained unchanged and match the image.
  Thirty-two screenshots are indexed; mobile and desktop exclusions/tooltips
  were visually inspected.
- Nonincremental TypeScript and production build passed. ESLint: zero errors,
  two existing controller warnings. Atlas strict styles: 73; EN route parity:
  86; generated mirrors current: 46.
- The isolated exact-image container passed seven published route checks,
  nine official asset byte checks, state-directory writability, and eight
  unauthenticated/cross-site API boundary checks. It used a private state
  directory and has been removed after verification.

### Fresh Elkardia verification

Real public Blizzard profile and current Eversong EU auction data, RU locale:
Elkardia level 81, Fury Warrior, native baseline **20,222 DPS**. Budget:
**10,000 gold**. The unchanged production worker reports
`SimulationCraft 1210-01 · 18428cd`.

| Objective | Confirmed purchases | Cost, gold | DPS | Gain |
| --- | --- | ---: | ---: | ---: |
| Price per DPS | Кровокаленые наголенники, item 237917 | 30.00 | 20,943 | +721 / +3.57% |
| Maximum DPS among checked sets | Кровокаленый нагрудник 237918 + наголенники 237917 | 529.96 | 21,922 | +1,700 / +8.41% |

Both results were revalidated after deployment with fresh profile/market data
and **four uncached native simulations**, baseline and candidate for each
objective. The 95% uncertainty margins are 83 and 84 DPS; both improvements
are significant and within budget. Exact real-variant exclusion also passed.
The bounded live search/assembly was partial: these are confirmed improvements,
not a claim that the entire auction market was exhaustively optimized.

First observed response: 12.06 s including one variant lookup and three
native simulations. Repeat under a changed budget: 4.88 s, one metadata
lookup and **zero DPS simulations**. These observations overlapped production
image compilation and browser QA; they are not an isolated latency benchmark.
The controlled priority regression moves the sole useful option after 80
negative options from chunk 11 into chunk 1 without dropping any option.

Fresh classification of the actual unsupported-only affordable market
projection covered **347 lots / 42 item IDs**, all authoritatively profession
class 19. It completed with zero unsupported combat-data warnings and zero
native calls. This tests that projection's classification, not full-market
coverage; unknown classes and unsupported combat items still keep warnings.

### Production and recovery evidence

- Public EN/RU character pages return 200, load without browser page errors
  or horizontal overflow; the new planner JavaScript matches the exact image
  bytes through the public domain.
- Observation: 122.8 seconds, 13 samples, zero web restarts and
  zero matched runtime errors. All nine protected container identities,
  images, restart counts and start times remained unchanged.
- Only web was replaced; existing nginx configuration was tested and softly
  reloaded. API, worker, databases, CMS and import/scraper services were preserved.
  Origin HTTPS checks verified hostname/chain using the official Cloudflare
  Origin CA; no TLS/configuration weakening was introduced.
- Private recovery manifest: `/opt/gildra/auction-four-fixes-release-20261017-abca09e-previous.env`; original immutable web image remains
  available. The archived runner restores web and the byte-exact manifest.
  New version-2 search checkpoints fail closed on the old runtime; searches
  created after this release may require restart after rollback.
- The release evidence and hash-chained operation ledger are archived under
  `/opt/gildra/releases/auction-four-fixes-release-20261017-abca09e/`. No authenticated production-browser
  session was available: the character calculation was exercised through the
  exact matching server source and actual production native worker using
  private copied QA state; the public browser check was anonymous.

Private evidence roots (not published application pages):

- `.artifacts/auction-four-fixes-release-20261017/`: final offline gate, native
  before/after proofs, build/image, staging, source binding, rollout, public
  browser/bundle, observation, cleanup and ledger.
- `.artifacts/auction-four-priority-fixes-20261017/`: red/green priority and
  rollback-reader regressions.
- `.artifacts/auction-four-coverage-fixes-20261017/`: coverage and market-arrival
  regressions, cancellation and public-data replay.
- `.artifacts/auction-four-ui-fixes-20261017/`: final 156/84 reports, frozen source
  hashes, source-commit binding, capture index and visual inspection.
