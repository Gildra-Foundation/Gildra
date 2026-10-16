---
id: AgDR-0001
timestamp: 2026-10-16T16:30:00Z
agent: codex
model: gpt-6
session: auction-completion-20261016
trigger: user-prompt
status: accepted
---

# Durable auction checkpoints on the current single web instance

> In the context of a bounded auction optimizer on one web instance, facing loss of accepted jobs and measured progress on web replacement, I decided to persist versioned private checkpoints and idempotent job intents in an atomic local store mounted outside the container, to recover owned work after restart, accepting a single-writer deployment constraint and host-local durability.

## Context

- User authorized all audited fixes, integration, publication and deployment. The current web keeps at most forty searches and two hundred job handles in memory.
- Search context includes Maps/Sets, measured native results and two reconstructable functions. Battle.net bearer tokens and executable tasks must never be persisted.
- Existing web runs as UID1001 with a read-only root filesystem. Recovery must retain server ownership, profile/market/engine validation and bounded retention.
- Native gear ranking changes from a flat editor APL to the maintained native APL; old scores must not be loaded into the new simulation contract.

## Options considered

| Option | Benefits | Costs |
| --- | --- | --- |
| Versioned atomic private checkpoint files on a dedicated web mount | No new dependencies or database/API migration; fits the existing bounded single-process execution; survives container replacement | Single writer; bounded synchronous checkpoint serialization cost; no host-disk disaster recovery |
| Shared Redis queue and state | Can coordinate replicas; existing Redis service | Requires a new web client, lease/fencing design and serialization/schema lifecycle; existing Redis durability configuration is not an established optimizer contract |
| PostgreSQL job/state tables via the API | Transactional shared ownership and durable state | Schema migration and API rollout, larger service changes, write-heavy checkpoint design |

## Decision

Chosen: **atomic private checkpoint files**, because it closes the actual restart failure within the current single-instance topology without changing shared databases or unrelated services. This is not a distributed queue. Any future multi-replica deployment must replace or coordinate the writer before scaling web.

Store only explicit serializable data and restartable task intent; strip simulator/discovery closures and rebuild them from trusted stored character/armory/context fields. Encode Maps/Sets with Node's built-in V8 serialization, wrap in schema v2 and semantic contract `native-apl-v1`, compress and atomically replace each record. A bounded JSON header indexes owner, scope, expiry, logical recency and job mode; startup scans headers only. An owned read reconstructs one context. Derive option aliases from the stored discovery graph rather than storing a duplicate graph. Lifecycle touches rewrite the header without inflating/recompressing its body. Use private directory/file permissions, validated opaque IDs, record-size limits and existing count/TTL eviction. A different schema or simulation contract must be rejected.

Persist a job before returning acceptance, and completed state before reporting success. Persist measured checkpoints at their existing commit boundaries. A restarted unfinished job is parked until an authenticated request from its owner supplies a current token, then resumes from its stored search or restarts only unfinished preparation. Do not persist bearer tokens, promises, callbacks, AbortControllers or native processes. Cross-record ordering writes search checkpoints before linking/publishing the corresponding job result. Reserve queued/running search contexts until settlement. Durable cancellation tombstones stop a late POST from recreating cancelled work; a 30-second acceptance deadline also rejects a delayed request body. Missing/invalid records fail closed. Transient filesystem errors preserve acknowledged files and return a fixed retryable error. New record replacement commits before evicting the previous record; failed acknowledgements cannot strand unaccepted capacity.

## Consequences and required verification

- Completed results, exclusions, option identities, native caches and traversal cursors survive web replacement within retention. In-flight uncommitted native work may be repeated.
- Every launching POST has a request identity bound to its complete action/input. Unknown network success is recovered through that identity; replay cannot create duplicate work or cross ownership.
- Recovery always revalidates character mechanics, market and engine before continuing or purchasing. Restored results remain visibly stale until that succeeds.
- Child-process tests must demonstrate real process restart, interrupted work, owner isolation, expiry, corruption, semantic-version rejection and no secret/function persistence.
- Measure checkpoint serialization against realistic retained state. The production change requires only web mount/env plus web/worker images; the worker must be upgraded before the web sends native mode.
- Rollback retains prior images and the prior runtime manifest; new state files are versioned and ignored by an older image.

## Artifacts

- Prior audit: `.artifacts/auction-full-audit-20261016/REPORT.md` in the retained reliability worktree.
- Implementation plan: `docs/auction-completion-20261016.md`.
- New verification evidence: `.artifacts/auction-completion-20261016/`.

## Implementation evidence

- Separate-process restart, HTTP task reattachment, admission/cancellation races and seven filesystem fault regressions cover the implemented lifecycle. Tests are under `apps/web/tests/auction/completion/`; run `node apps/web/scripts/test-auction-completion.mjs --output-dir <new-output-directory>` with Node 24.
- On this host, a synthetic 50,000-option checkpoint serialized in 162–237 ms; indexing forty such records took 2.8–4.4 ms without context inflation. The first owned read reconstructed one context in 371–425 ms; touches took 8.8–11 ms. These measurements are not a capacity SLA.
- Production mount: `/var/lib/gildra/auction-state`, UID/GID 1001, directory 0700, records 0600. Web health checks verify read/write access. Provision before startup; `create_host_path` is false.
