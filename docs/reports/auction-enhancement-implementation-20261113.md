# Auction item, gem and enchant integration — 2026-11-13

The prior blanket 403 blocker was incomplete. Read-only access to the existing catalog supplied actual DB2 rows for the same build as the pinned SimulationCraft engine. The checkout now contains a supported-subset configuration search connected to assembly, exact commodity quote ladders, native customization and scenario comparisons. This is a bounded heuristic, not a globally optimal full-equipment solver.

## Data and configuration

The catalog is built from original row chains with artifact references and a deterministic revision. See `apps/web/data/wow/auction-enhancements/README.md`. Ranked consumable mappings additionally come from build 12.1.5.70783 and are admitted only when their application chains match the pinned native effects in 12.1.0.69587. This does not reconstruct or prove the absent historical mapping table. Purchased enchant item IDs and installed enchant IDs are distinct; gems use their actual item IDs. Compatibility includes slot/class/subclass masks, item and character level, ordinary prismatic sockets, unique-equipped and shared category counts. Unknown professions, special sockets, conditions and missing mappings fail closed.

Native metadata v2 exports resolved socket positions/bonus and profession requirements. Legacy v1 continues to support bare-item comparison, but does not certify enhancement compatibility. Zero socket placeholders preserve native socket positions. The Go request validator and patch were extended accordingly; the native binary was not deployed.

## Search and prices

Assembly passes at most two distinct measured equipment finalists into the enhancement stage. If there is no winning bare set, up to two measured single replacements can still be considered: adding their improvements may recover DPS lost when replacing an enchanted item. Every purchasable socket and applicable enchant must be filled before a configuration qualifies. Each finalist is capped at 12 new native measurements, with bounded traversal and resumable state; at most one new enhancement measurement is requested per invocation by default.

Equipment lots retain the existing whole-lot procurement and quantity checks. Enhancements are aggregated across the entire chosen set and quoted against actual per-item quantity ladders. The total is equipment plus consumed gems plus consumed enchants; unknown prices/insufficient stock are not zero. Retained equipment and its installed enhancements cost no new gold, remain unchanged and consume uniqueness/category limits. Inventory/bag ownership is not inferred, and replaced enhancements are not credited or reused.

Commodity quotes are refreshed separately from equipment quotes, expire from local reuse after 60 seconds and retain source timestamps. Changes to quotes/budget/rules invalidate enumeration checkpoints. Exact mechanical simulation results can be reused after repricing, but an old price cannot certify a new purchase. Scenario and engine identity, equipment variants, installed configuration and metadata distinguish cached simulations. Cancellation is checked before publishing state; existing background job ownership and generation fencing remain in force.

## User flow

The assembly result publishes enhancement-stage progress and keeps continuation active until that bounded stage finishes. Recommendations include exact purchased items, assigned improvements, component prices, total, DPS difference and statistical uncertainty. Selected extra scenarios use the customized configuration with an independently computed baseline. Search limitations and missing cost evidence remain explicit; DPS does not become a survival or healing metric.

## Review and validation

Independent review reproduced a starvation bug with the real catalog: an unavailable first gem blocked all useful choices before the traversal cap. Availability-aware ordering and constraint pruning now find the feasible configuration on the first visit. Diversified seeds try alternative gems and later slots within the same 12-measurement cap. The best statistically confirmed improvement is preserved independently of higher noisy means. Review also fixed informational reasons incorrectly causing `unavailable`, the too-small commodity ID projection, filtering unsupported fallback candidates after the finalist cap, cancellation of commodity waiters, and expiry of prices during subsequent scenario work.

The shared commodity fetch remains bounded and deduplicated; cancelling a caller releases that caller immediately without aborting other consumers. Recommendations are checked for commodity freshness after the second finalist and at each scenario publication. The exact commodity projection is bounded at 512 IDs and uses one shared regional snapshot, not hundreds of requests.

Initial integrated regression run passed 59/60 suites; durable recovery exceeded its 180-second wrapper deadline under concurrent build/lint/browser load. An isolated rerun passed all 15 durable recovery tests in 58.5 seconds without changing assertions or deadlines. A focused run during catalog regeneration rejected ranked mappings while the new proof guard and snapshot were temporarily out of sync; the frozen-source rerun below passed. Test HTTP/metadata fixtures are synthetic even where the source catalog is real; they are not live character measurements.

Frozen-source results:

- Final sequential full regression gate: **65/65 suites passed**, `.artifacts/logs/auction-enhancement-final-serial-20261113-204138.log` (3m44s). This supersedes the incomplete earlier full runs.
- Final standalone TypeScript check passed: `.artifacts/logs/auction-enhancement-final-types-20261113-204139.log`.
- Focused integration, real Runner, source contracts, exact cost, cache, metadata, cancellation and stale-publication checks: **27/27 passed**, `apps/web/.artifacts/logs/auction-enhancement-frozen-focused-20261113-204113.log`.
- Source generator semantic-closure checks: **5/5 passed**, `.artifacts/logs/auction-enhancement-source-final-20261113-204115.log`. Repeated generation preserved SHA256 `31df27791b487e7d45273a4272c77e432bd6dbdec21c6ee1bc67ffed388d7737`.
- EN/RU × 390/1440, ready/pending/no-affordable/unknown states: **16/16 passed**, 16 screenshots, no browser errors, source hashes unchanged, isolated server cleaned up. `.artifacts/auction-reliability-20261016/fullcost-ui-frozen-20261113.json`.
- Full rotationlab Go suite passed: `.artifacts/logs/auction-enhancement-final-go-20261113-203954.log`.
- Production build completed successfully, including TypeScript and 1063 generated pages: `.artifacts/logs/auction-enhancement-final-build-20261113-203723.log`. The outer command session later reported SIGTERM; the build subprocess itself had already reported exit 0. Another full regression process was interrupted by SIGTERM without a completed summary; neither interruption is counted as a passed gate.
- Full lint: zero errors, 284 warnings across the repository. Final scoped lint: zero errors; its one added unused test argument was removed and the affected test lint rerun clean. Two pre-existing hook-dependency warnings remain in the optimizer UI.
- Independent final review found no remaining blocker in the reviewed implementation. No shared theme/vendor/reference UI was changed.

## Coordinated work and integration

All changes are integrated in the shared working copy, uncommitted. Executors finished; no necessary implementation remains in a separate checkout or pending chat.

- Source data and resolver: [Аукционный подбор: качество рекомендаций и стоимость](t3-thread://v2/d4cb5e6e-1d51-4b0d-9d23-8a5187e7db8e/mcp:launch:0552de6a2848468724b41cb9f884cd79f2001fd7ddf0c87db4796f77e898ac91).
- Bounded optimizer and full cost: [Аукционный подбор: качество рекомендаций и стоимость](t3-thread://v2/d4cb5e6e-1d51-4b0d-9d23-8a5187e7db8e/mcp:launch:293bec11976117e1c2a2465e733fa32f79e7d41186e1d1f826f8e86a511fda58).
- Native metadata and socket transport: [Аукционный подбор: производительность и замеры](t3-thread://v2/d4cb5e6e-1d51-4b0d-9d23-8a5187e7db8e/mcp:launch:a64f9561fd94634cfb16e5900b23ff9ec09955efc04b855b2df29ddf6f2b1786).
- Native subagents independently covered contract/review, actual Runner integration and UI regression tests. File ownership was separated; the coordinator integrated Runner, state, quotes and exact customization.

## Measurements and their limits

Final measurements on unchanged Runner SHA `30f7bb3f776576a68bf7638d1843ff48e5d8a1d08740786153da8cbdfef4a8f8`, five repeats per version against HEAD `e3cc7e82`. All inputs, synthetic delays and precision contracts were identical. No native throughput is measured; no p95 is reported for five samples.

| Fixture / milliseconds, median (min–max) | Before | After |
| --- | ---: | ---: |
| First useful publication, fixed 20ms then 200ms comparisons | 222.61 (221.83–223.77) | 23.13 (22.70–24.31) |
| Cold process suite, real Runner/catalog/persistence, synthetic transports | 2210.08 (2094.23–2275.14) | 2595.25 (2416.98–2781.59) |
| Warm first-result fixture inside that suite | 177.48 (155.21–193.81) | 189.27 (163.60–232.11) |
| Warm 5001-candidate fixture inside that suite | 132.65 (95.22–140.25) | 123.41 (98.00–157.39) |

The first comparison is published earlier, but the cold-process suite regressed by about 17%; warm ranges overlap. Do not describe this as an overall speedup. Data: `final-enhancement-first-result-20261113.json` and `final-enhancement-before-after-20261113.json` in `apps/web/tests/auction/performance/`. The benchmark measures existing bare-item orchestration, not live enhanced-character search. New enhancement search adds explicitly bounded simulation work.

For the enhancement review reproducer, the old traversal visited its 4096 cap without a native call when the first gem lacked a quote. The corrected traversal finds the compatible priced set in its first visit. These are deterministic search counts with synthetic prices, not wall-clock speedup on a live character.

## Operational boundary

The running local worker previously rejected the current native-APL request and omitted required DPS mean fields on its legacy request. Its concurrency experiment also produced a 503 at two concurrent requests. Sequential native execution remains the default; no new throughput claim is made. Deploying the compatible backend/native metadata patch requires a separate user instruction. No commits, pushes, deployment, production service restarts or purchases were performed.
