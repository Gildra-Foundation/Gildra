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

Verified publication: 2026-10-17T18:14:11.125735+00:00. Runtime source is `82528e43c585653a4384858018de083d793ba416`;
image `sha256:469678b310adc56782881d6cbf1b232280ca82813a889ffb85226e61bb8833f3`; release `auction-five-fixes-release-20261017-82528e4`.

Validation on the frozen source:

- 43 offline suites passed, including the actual runner deadline/cursor tests,
  actual discovery repair and actual API compact/raw selection contracts.
- 204 completion and 84 legacy browser executions passed across EN/RU and
  390/1440 widths. Both reports bind the same 11 product/CSS hashes, with
  identical start/end bytes and owned test servers cleaned up. The final
  focused 32 executions overlap this matrix; they are not additional distinct coverage.
- Four additional private UI views replayed fresh real Elkardia DTOs, including
  item frames, icons, comparisons and tooltips. Their exact purchase identities,
  prices and comparisons match the postdeployment confirmations. Quantity is
  bound through the unchanged whole-market fingerprint, which includes offers.
- Nonincremental TypeScript and scoped ESLint passed (0 errors; 2 existing
  hook-dependency warnings). Atlas: 73 stylesheets; route parity: 86 English
  routes and 46 generated mirrors. The clean Git archive production build
  generated all 766 pages and passed its own TypeScript check.
- The exact candidate image passed 7 published route probes, 9 official asset
  hash checks and 8 authentication/cross-origin boundary checks.

Fresh Elkardia evidence uses the real public Blizzard profile, realm market and
unchanged production SimulationCraft worker, with private copied test state.
Character: Элкардия, level 81, Eversong; budget 10,000 gold.
The actual uncached postdeployment HTTP confirmations produced:

| Objective | Cost, gold | Baseline DPS | Set DPS | Gain |
| --- | ---: | ---: | ---: | ---: |
| Price per added DPS | 32.00 | 20222 | 20943 | +721 |
| Maximum DPS within budget | 531.96 | 20222 | 21922 | +1700 |

Both gains exceed the reported 95% comparison uncertainty; exact auction lots,
whole-lot costs, quantities and budget were checked. Each objective was
reconfirmed using separate baseline/candidate requests after clearing the
web mechanical cache. These are confirmed results from the evaluated domain;
`exhaustiveComplete` remains false, and further continuations retain the full
search. Prices refer to the verified market snapshot.

The previous retained value continuation measured 79.43s
and started 48 native comparisons. The fixed predeployment continuation measured
11.13s with 4 comparisons. After deployment it measured
11.67s with 7 comparisons
(12.37s including fresh verification). First cold search
was 20.43s; repeat was 6.18s
without additional DPS simulation. These are individual runs, including concurrent
build/test load, not a latency SLA. Every assembly step has at most 8 new native
comparisons and a soft 10-second yield target. An in-flight upstream request can
cross that target.

Postdeployment verification matched the public new planner JavaScript bytes to
the deployed image, checked published EN/RU character pages in Chromium and
observed health for 123.57s with no restarts or matched
runtime exceptions. All nine protected services retained their container/image,
restart count and start time. Only web was replaced; existing nginx was softly
reloaded. The owned candidate container was removed after verification.

UI component tests use private synthetic HTTP; real-character calculations use
current server modules and the actual native worker. Public browser checks are
anonymous. No authenticated production planner browser session is claimed.

Git code publication used a normal atomic fast-forward of `master` and
`fix/auction-value-speed-20261017`, plus annotated tag
`release/auction-five-fixes-20261017-82528e4`. All five task/integration commits use Shpuntyara as author
and committer; imported theme history retains its original attribution. Theme
ancestry through `94c819391690dcf67e59a799642860348e6e9029` is preserved.
This report is a subsequent documentation-only commit.

Rollback restores the previous immutable web image
`sha256:c91c2799dcb69076e7467411b822a42b3fd28b5d21d94efcd72ef15be7cd38cd` (source
`99634f68dd6469e5236343498f1c7355eefb7b84`) and byte-exact previous release manifest.
The guarded runner, evidence, origin CA and verified operation ledger are archived
under `/opt/gildra/releases/auction-five-fixes-release-20261017-82528e4`. Search/assembly checkpoint formats
remain unchanged; the optional supported-summary marker is compatible with older
checkpoints, including repair of previously saved missing-variant states.

Local evidence: `.artifacts/auction-five-fixes-release-20261017`,
`.artifacts/auction-five-ui-fixes-20261017`,
`.artifacts/auction-five-server-fixes-20261017`, and
`.artifacts/auction-five-review-20261017`. Failed/superseded runs were retained;
only the final source-bound green gates were used for publication.
