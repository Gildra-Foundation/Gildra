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

Regression evidence, real Elkardia verification, the immutable web image,
rollback manifest, public route checks and final publication details are recorded
here after completion. This document does not claim deployment before those
checks pass. Private evidence roots:

- `.artifacts/auction-four-fixes-release-20261017/`
- `.artifacts/auction-four-priority-fixes-20261017/`
- `.artifacts/auction-four-coverage-fixes-20261017/`
- `.artifacts/auction-four-ui-fixes-20261017/`
