# Auction reliability — verified deployment

Release `auction-reliability-20261016-764210f`; runtime source
`764210f7e26b51546e0b602f8f87d9b955872530`. Deployed **2026-10-16 10:22:19 UTC**;
verified **10:30:21 UTC**. Test-first commit: `127d22b`.

| Service | Immutable image | Container |
| --- | --- | --- |
| web | `gildra-web:auction-reliability-20261016-764210f`, `sha256:e77e773b4a435cd6bffd70abcee97738f54cd9b98a5b6a5dddf0b8c1b683a910` | `76932e46ee4aafa6f141917406b6fd04ff3e1e6f4da8bb09b3bd924b6a78bf70` |
| rotation-sim-worker | `gildra-rotation-sim-worker:auction-reliability-20261016-764210f`, `sha256:3d676fd9f7d39eacd73aba8f766e4d94bcd2c3a0700c6c1e7ba048b56632f19e` | `8ca8570a375cb0987e948a26af3ac530445e46b9315e08f346dae3feef879e72` |

## Fixed behaviour

All fourteen findings in [the acceptance matrix](../auction-reliability-plan-20261016.md)
are repaired. Affordable full-loadout seeds enter bounded traversal early. The
best measured result and best statistically confirmed purchase plan are retained
separately; a noisier leader cannot hide a confirmed improvement. Previously
measured compound choices survive pool changes only after current real-lot
allocation, budget and compatibility validation.

Users can exclude a purchased lot directly and undo the exclusion. Cancellation,
transient errors and reload retain valid results and exclusions with explicit
price freshness. Lost initial POST/202 responses recover through owned,
character/locale-scoped request IDs; retries do not create duplicate calculations
or alter the original budget. Polling can reconnect to the same job. Scope changes
retire incompatible pending requests and jobs.

Mechanical profile fingerprints ignore cosmetic/order changes and retain native
gear/talent/Azerite inputs. Consumer cancellation releases its own market wait;
shared upstream work remains bounded. Negative references retry after TTL, and
relisted unknown eligibility continues to count as incomplete data. Simulation
caches retain only the five necessary result fields.

Item tooltips show verified exact weapon facts and effects, with localized missing
data and recovery messages. The worker exports weapon metadata and derives
displayed DPS from resolved damage endpoints and speed. Native combat mechanics
and pin `18428cd3902412abc8ee274d19567d603e674e66` are unchanged. Four fresh equipped/base
weapon controls matched official data on the exact final worker image before rollout.

## Test-first evidence

The unchanged-base barrier recorded **56 cases: 41 intended failures, 15 controls**
before implementation. Later discoveries each received their own RED regression
before repair. Original failures and setup diagnostics remain preserved.

Final focused checks: **65/65** (market/reference26, optimizer9, root/API10,
Azerite3, native presentation4, initial-request recovery13). Optimizer checks
include24 independent raw-choice oracle pools. The final single StrictMode browser
run passed **80/80**:76 regressions and4 screenshot observers, EN/RU390/1440,
8 captures, no browser errors,975 product-source hashes unchanged. Final binding
also verifies999 functional source/test files against committed bytes.

Existing auction/gear/discovery/store/equipment/API regressions, full Go rotationlab,
151atlas tests, TypeScript, atlas/routes and both production builds passed.
ESLint:0 errors,273 existing warnings; changed product files passed scoped lint.
All **seven exact-image staging gates** passed, including unchanged landing/book,
visual comparison, accessibility, motion, resources, routes and transitions.

## Fresh postdeployment Элкардия

Both locales fetched a fresh public Blizzard character/auction snapshot and used
the actual deployed read-only API and native worker. Host modules were bound to
the committed source and deployed web/worker identities before and after execution.

| Locale | Verified WRIST options | Effect states / independent lot assignments | Spent / original budget, gold | Baseline → confirmed DPS | Gain | 95% margin |
| --- | ---: | ---: | ---: | --- | --- | ---: |
| EN | 63 | 36 / 64 | 300.89 / 10,000 | 14,273 → 14,776 | +503 / +3.524% | ±62 DPS |
| RU | 63 | 36 / 64 | 300.89 / 10,000 | 14,273 → 14,776 | +503 / +3.524% | ±62 DPS |

The confirmed purchase is item237923, exact crafted variant, ilvl178, required
level81. Excluding its original auction lot also passed a separate exact native
and63-assignment oracle check. Recovery preserved original metadata/budget and
started no extra native work. The visible list has22 confirmed individual upgrades;
assembly receives the entire63-option internal pool.

The separate16-slot run intentionally covers bounded discovery/assembly:2 options,
no confirmed purchase in that early pool, discoveryComplete=false and
exhaustiveComplete=false. The complete WRIST traversal still has dataComplete=false:
253 unsupported-modifier lots,1163 unmatched catalog IDs and30 unknown-eligibility
items are reported explicitly. No whole-market optimum or guessed missing item
restriction/scale/effect is claimed.

Saved fresh EN/RU results were replayed through the actual UI in4 desktop/mobile
views,12 captures, with999 source hashes unchanged. Prices, DPS, framed loaded
icons, both item tooltips, focus, reduced motion and overflow passed. This replay
mocks HTTP job envelopes and starts no new native work. No signed-in browser job
or execution inside the web container is claimed.

## Runtime verification and recovery

Public checks passed16 guest views of8 published URLs,9 official asset hashes and
8 authentication/cache/origin boundaries. Observation covered **424.714 seconds**:
both new services healthy with0 restarts,0 fatal/runtime/error lines, all8 protected
containers retaining their IDs, images, starts, restart counts and recorded health.
Existing nginx was configuration-tested and reloaded. API, CMS, databases and
imports were not redeployed; no migration or data-invariance claim is made.

Staging was returned to the deployed worker; own private QA containers/processes
were removed and ports58088/58089 closed. Previous images remain available.

Rollback restores worker `sha256:3d3209821ccec0fe2f77b3dc389ededb51ce1251e49de74ce3d1204ca5cdf0d6`
and web `sha256:571a7537f1e4e9dc7784947983937f46aa4b583c11570fd7fd5233f580d7c381`,
then the exact `/opt/gildra/auction-reliability-20261016-764210f-previous.env`.
Acquire the four production/service/edge locks and execute the retained worktree
runner `.artifacts/auction-reliability-20261016/rollout.py --rollback`; it permits
later documentation commits and refuses foreign images/manifests. The release
archive retains an immutable recovery copy. Origin checks validate hostname/TLS
using the pinned public [Cloudflare Origin CA roots](https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/#cloudflare-origin-ca-root-certificate).
Recovery artifact checksum/restore provenance is historical; its current
availability/size were checked. No database backup, restore or query ran.

Initial read-only helper health-field and launcher permission failures are saved
separately with passing corrections. They occurred before plan publication/native
execution respectively; no production rollout failure or rollback occurred.

Jobs remain process-local: a web restart loses active work. Multiple web replicas
require a shared durable queue or sticky routing. Partial traversal remains
explicit and never proves a global optimum.

Plan `sha256:a0988789bbf6f65353b7d7bf860d1f5e8e44eb6966e830b05cd49f5456c1f341`;
verified two-record ledger tip
`sha256:51521661d45e7bf8efb6023f27cfe6437aa7d2d88c0b979b964877cde16f58c1`.
All455 new-record evidence hashes were independently checked against the saved
archive. Evidence: `.artifacts/auction-reliability-20261016/` and
`/opt/gildra/releases/auction-reliability-20261016-764210f/verification-final`.
The chain is locally archived; no external immutable sink is claimed.

Runtime source is tagged separately from the later documentation publication.
Commits use `[skip ci]` because the generic GitHub workflow deploys additional
services; this release uses the scoped web/worker path above.
