---
id: AgDR-0002
timestamp: 2026-10-16T18:29:09Z
agent: codex
model: gpt-6
session: auction-completion-20261016
trigger: user-prompt
status: executed
---

# Prioritize useful auction discovery without reducing its domain

> In the context of a bounded search over a mixed historical auction catalog, facing current upgrades being delayed by item-ID order and incomparable pre-squish item levels, I chose summary-first discovery with wearable required-level fit before base item level, to return useful native-confirmed results earlier, accepting imperfect scheduling hints and preserving complete traversal.

## Context

- A real 16-slot run returned no upgrades after 16 continuations, although confirmed affordable wrist upgrades were around catalog position 4000.
- Prefetching summaries alone exposed another actual delay: raw catalog 610 items resolved natively 98/99 and preceded current level 81 gear. Four continuations still returned no upgrades after about five minutes.
- Native variant facts determine eligibility and native whole-loadout simulation determines improvement. Catalog hints cannot safely discard scaled or unknown variants.

## Options considered

| Option | Benefit | Cost |
| --- | --- | --- |
| Descending raw catalog item level | Cheap existing metadata | Historical scales monopolize work before useful current items |
| Wearable required-level fit, then base item level | Uses actual EN/RU summaries; no ID/expansion guessing; early level-appropriate work | Unknown/scaled hints remain imperfect; no latency guarantee |
| Resolve every native variant before any DPS comparison | Consistent current native item levels | Delays useful feedback until the entire native metadata domain is resolved |

## Decision

Choose **required-level fit first**, because the delay and scale mismatch were measured on the actual character/market. Read summaries in bounded 500-ID discovery batches; repository requests remain 100-ID pages with bounded concurrency. Sort only pending work, leaving processed native cursor prefixes intact. Retain unknown, malformed, zero, above-base-level and scaled candidates. No item-ID order estimates usefulness and no scheduling hint changes eligibility or the completed optimum.

## Consequences and verification

- Five actual-module cases cover summary prefetch, cross-squish scheduling at character levels 81/90 in EN/RU, domain/optimum retention, cancellation/retry and old checkpoints.
- Cold all 16-slot EN/RU runs reached the first confirmed upgrade in 33.288/35.883 seconds and multiple upgrade slots by continuation 2. The first bounded assembly confirmed three affordable purchases. This is an observed case, not an SLA or a whole-market optimum.
- The contemporaneous decision was recorded before the level-fit implementation in `.artifacts/auction-completion-20261016/priority/decision-level-fit-before-ilvl.md`; this canonical record consolidates it after release. Original failed trials and their exact source/image evidence remain intact.

## Artifacts

- Runtime source `79d203c96ebb42c230399948e0239c624bc9bfd6`.
- [Release results, verification and limits](../reports/auction-completion-deployment-20261016.md).
