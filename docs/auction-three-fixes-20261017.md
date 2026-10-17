# Auction planner: cancellation, lifecycle and exact-budget fixes

This release fixes three reproducible issues in the auction planner. Changing only the spelling of a budget preserves results and exclusions. Leaving a character/profile/locale while discovery cancellation is pending prevents the detached controller from starting assembly. Pre-admission cancellation can use capacity occupied by completed results, and its owner limit is a rolling request rate rather than the number of acknowledgements retained for thirty minutes.

## Behavior and compatibility

- Budget normalization validates the existing input length, range and precision before removing leading integer zeros and trailing decimal zeros. It uses exact decimal text, with no floating-point rounding. `10000`, `10000.0`, RU `10000,0` and `010000` share the same canonical amount.
- The client checks ownership before admitting work and after asynchronous retirement barriers. Assembly rechecks ownership after discovery cancellation. Late responses for a retired request do not mutate another scope. A late successful cancellation or cleanup clears saved handles only if profile, job ID and request nonce still match. It preserves newer saved form intent and exclusions and cannot overwrite another snapshot.
- Cancellation and ordinary job admission share durable terminal-result replacement. Active work and unexpired cancellation acknowledgements are never replaceable. A process exit between the new record rename and old terminal deletion can leave 201 files; restart trimming now preserves acknowledgements and interrupted work ahead of terminal results. Search checkpoint trimming is unchanged.
- At most 60 new cancellation identities per owner may be admitted in a rolling minute. Existing identity retries and cancellation of accepted work remain available. Rate history restores from existing timestamps after restart. Acknowledgements remain valid for thirty minutes.
- The global retained-job limit remains 200. If every record is protected or active, new work and new cancellation both fail closed; acknowledged barriers are preserved. Underlying storage failures still prevent acknowledgement.

No public API, durable metadata schema, search/assembly checkpoint version, database schema or native worker contract changes are required. Previously published auction fixes and the current site performance release are retained in the source ancestry.

## Verification before publication

The regressions first reproduce the original defects, then test their corrected behavior. Coverage includes numeric-equivalent budgets, departure/snapshot/locale changes during delayed cancellation, late acknowledgements crossing a snapshot change, completed-result capacity, rolling quota boundaries and free retries, owner isolation, persistence failures and an actual process exit at the 201-file boundary.

Independent review additionally checks exact budget amounts against a BigInt reference and preserves a separate crash-boundary reproduction. Final source-bound full-suite, browser, real-character, image and deployment evidence is recorded in the release report below after execution.

## Release evidence

Publication is being verified. The final record will identify immutable source/image revisions, executed test counts, fresh Elkardia results and rollback evidence. No pending check is represented here as passed.
