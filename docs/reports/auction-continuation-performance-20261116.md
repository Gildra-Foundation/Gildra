# Auction continuation admission, 16 November 2026

Every assembly continuation previously synchronously serialized, compressed and
saved the full private search snapshot in `beforeAcceptance`, including requests
whose excluded lots and variants were identical to the existing selection.

The admission callback now skips that snapshot only when both existing arrays
exactly match the proposed arrays, including order. An absent array differs from
an empty array. Initial selections, changed selections and reordered selections
retain the durable save before job acceptance. Ownership, input validation,
idempotency, queue limits, fresh market verification and native precision are
unchanged.

A failed save can rename its new snapshot before directory fsync fails. The
existing rollback restores the old arrays in memory, but disk may contain the
new arrays. A route-local WeakSet marks this uncertain state: its next admission
must save even if the arrays compare equal. Only a successful save clears the
marker. Recovery in a new process loads disk as its authoritative state.

## Controlled measurement

Actual API `beforeAcceptance` closure, SearchStore and synchronous durable file
writer; temporary local storage and synthetic data. The baseline callback is
frozen from merge `7b219512e`. Five paired repetitions alternate execution order.
Both profiles retain 960 public result rows and all supported market offers.

| Market offers | Before median | After median | Serialize / write / fsync |
|---|---:|---:|---|
| 960 | 7.287 ms | 0.0266 ms | 1 / 1 / 2 → 0 / 0 / 0 |
| 60,000 | 262.045 ms | 0.0361 ms | 1 / 1 / 2 → 0 / 0 / 0 |

The serialized snapshots are 0.36 MB and 13.31 MB. Readback retains the same
exclusions, result rows and offers after each pair. These are admission callback
costs, not end-to-end production or native-compute speedups. Other request
validation, lifecycle touches and required checkpoints still execute.

## Verification

Eight new actual API regressions pass: initial/absent selections, changed and
reordered option/variant arrays, request replay and fingerprint mismatch, invalid
selection, busy-job rejection, legacy allowed IDs after new lots appear, and
write failures before/after rename followed by an equal-selection repair.
Three existing queue-reservation checks pass. Targeted ESLint has no errors or
warnings; `git diff --check` is clean. The timing benchmark is opt-in and asserts
operation counts and restored data rather than a fragile elapsed-time threshold.

From the repository root:

```sh
node --experimental-transform-types --no-warnings --import ./apps/web/tests/auction/resolve.mjs --test apps/web/tests/auction/performance/assembly-admission.test.mjs
AUCTION_ADMISSION_BENCHMARK=1 node --experimental-transform-types --no-warnings --import ./apps/web/tests/auction/resolve.mjs --test apps/web/tests/auction/performance/assembly-admission.test.mjs
```

The benchmark prints raw pairs, serialized sizes, write counts and hashes of the
baseline/current callback sources. `AUCTION_ADMISSION_BASELINE_ONLY=1` measures
only the frozen baseline. No production data, account, network or native worker
is used by these checks.
