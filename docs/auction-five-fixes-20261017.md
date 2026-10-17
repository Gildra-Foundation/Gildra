# Auction follow-up fixes — 17 October 2026

This change addresses the five findings in the postdeployment auction audit:
unacknowledged cancellation losing recovery, a newly supported auction variant
being skipped on refresh, long assembly continuations, no-op form edits losing
results, and valid large exclusion selections exceeding the transport limit.

Expected behavior and regression requirements:

- Cancellation retains its owned job/nonce and recovery state until the server
  acknowledges cancellation. An unsuccessful cancellation remains visible and
  retryable across reloads, and prevents a conflicting new POST. Existing late
  admission, scope changes, Strict Mode and selection recovery remain covered.
- Discovery reopens missing supported-variant stages when the same item ID was
  previously inspected only for classifying unsupported variants. Supported
  arrivals join the retained search without a fresh search; noncombat items
  remain outside native work and unknown combat data keeps its warnings.
- Every assembly step has a bounded native batch and an elapsed-time yield
  target, including continuations. Checkpoints retain all options, effects and
  confirmed incumbents; frequent yields must still reach the same exhaustive
  result. An individual upstream request can exceed the target, so this is not
  a hard network-latency promise.
- Equivalent normalized budget and slot selections preserve the result,
  exclusions and recovery state. Real input changes still invalidate results
  that no longer apply.
- Large variant exclusions use a lossless compact wire representation while
  existing clients and stored string-based work descriptors remain readable.
  Encoding never turns exclusions into an allow-list that would drop newly
  discovered options. Request size remains explicitly bounded below the
  existing reverse-proxy limit, and oversize errors explain a useful next step.

Final test executions, fresh real Elkardia timings/results, immutable image,
Git publication, rollback and postdeployment checks will be recorded here after
verification. This document does not claim deployment before those checks pass.
