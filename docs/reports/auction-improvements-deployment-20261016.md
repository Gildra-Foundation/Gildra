# Confirmed auction upgrades and visible loadout assembly — verified deployment

Release: `auction-improvements-20261016-f2fbe4c`. Source: `f2fbe4c0efbd5f9d1abbad7b1c3bc713618d954f`.
Web: `gildra-web:auction-improvements-20261016-f2fbe4c`, `sha256:a059d0dbfcd33eda1b1cd2387fed4a5c620e72206c4bb48d936d736cd693eadb`.
Deployed: **2026-10-16 05:17:00 UTC**.
Final verification: **2026-10-16 05:24:39 UTC**.

The auction page now shows every retained confirmed-positive lot choice. Negative,
inconclusive and pending raw matches remain private server data and are excluded
from the default assembly request. Price sorting preserves all real financial
choices and uses DPS gain as the equal-price tie-break. Genuine icons, native
variant/current-item tooltips and cancellation/source-snapshot cleanup remain.

One **Build a loadout within budget** action and its result appear above the item
list. Assembly uses the original budget and selected confirmed-positive option
IDs, minus explicit exclusions, to evaluate one compatible complete loadout.
Baseline/candidate whole-loadout DPS, cost and remaining gold are labelled;
the purchase list contains replacements and other slots retain equipped items.
Zero-upgrade and partial-search states remain explicit. Only completed exhaustive
enumeration establishes the highest measured DPS among the allowed retained
positive options, including keeping current gear; no whole-market maximum is claimed.

Fresh postdeployment Элкардия EN/RU checks passed with all 16 combat slots selected.
An independent recursion verified every allowed assignment and an explicit option
exclusion against actual native results. Counts below come from this deployment's
market snapshots, not historical saved fixtures.

| Locale | Raw retained rows | Confirmed positives | Assignments / after exclusion | Spent / budget, gold | Whole-loadout DPS | 95% margin DPS / significant |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| EN | 599 | 11 | 12 / 11 | 20 / 10000 | 14,273 → 14,750 (+477; +3.342%) | 63 / true |
| RU | 599 | 11 | 12 / 11 | 20 / 10000 | 14,273 → 14,750 (+477; +3.342%) | 63 / true |

These calculations use committed host source, public Blizzard character snapshots
and the actual unchanged production API/native worker. They do not run inside the
web container or authenticate a browser job; deployed web identity is checked
separately. Private component harness checks use real results in EN/RU at
320/390/768/1024/1440 px, including true touch tooltips, top action placement,
positive-only requests, exclusions and completed/partial empty states.
The signed-in browser search/assembly flow was not tested.

Original feature evidence remains stamped `8bede7c`;
explicit carry-forward checks 26 unchanged
feature/dependency files against final Git bytes. The sole subsequent source
change removes the game-switcher summary's overriding aria-label. Its actual
final-image four-view keyboard/touch/axe check passes. The first candidate's
failed standard accessibility gate and original optional EN HEAD timeout remain
failed historical evidence, separate from the successful final gates and fresh
required-only postdeployment EN/RU runs.

The final immutable image passed all seven official staging gates and the
nine-image/eight-boundary contract. Existing scoped static checks passed with
their recorded Next pages-path ESLint configuration warning; final image build
provides the final revision typecheck. Production checks passed 16 guest EN/RU
desktop/mobile views (including the published game destinations), nine official
image hashes, 28 standard route cases and eight private/cache/origin boundaries.
Observation covered **402.887 seconds**: web healthy,
zero restarts and nine protected containers unchanged. Exactly one existing `Internal: NoFallbackError` was reviewed against the direct immutable current rollback-image 404 control. The strict failed observation remains preserved; no other runtime error is exempted.

This is a web-only release. Worker `sha256:3d3209821ccec0fe2f77b3dc389ededb51ce1251e49de74ce3d1204ca5cdf0d6`
and API `sha256:28df99ef1c178f65328e816da0d103f189e03e4040fb2bf2ddc994d944c924c7` were not redeployed.
No database migration, import or data-count invariance claim is made.
Rollback restores only previous web `gildra-web:game-switcher-20261016-ced19b0`,
`sha256:7c2b8b2ab3304a1c28b79a0c7931084cb66125956fb167e4bbd252a2f396ea62`, source `ced19b07c3abe739eed156688ffd426c70f88c5d`,
using `/opt/gildra/auction-improvements-20261016-f2fbe4c-previous.env` and the saved scoped `rollout.py --rollback`.
The runner refuses a different/newer manifest or web image; no database restore
is required. The current manifest digest is `sha256:e6299f0200703a5934b2b1512e6941303ca6955283f0ae75260d25bf48d28934`.

Verified ledger tip: `sha256:dfb2643dd00e3511ab3fb2aeb38968890c3a60bd70fa4bbe217c8d0157df5c49`. Plan: `sha256:0649c10dbdcd6778bbeaa4d481656370a2a3a0ee6ce77559ab71b740a774e7a0`.
Final evidence is retained in `/opt/gildra/releases/auction-improvements-20261016-f2fbe4c/` and
`.artifacts/auction-improvements-20261016/`, including required-only
`postdeploy-en/`, `postdeploy-ru/`, source/carry bindings, native controls,
public checks and the preserved unsuccessful first-candidate evidence.
