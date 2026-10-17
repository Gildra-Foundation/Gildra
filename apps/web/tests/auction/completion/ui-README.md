# Auction completion UI regressions

These tests use the actual current AuctionGearOptimizer in a generated private Next harness with React StrictMode. Characters, market prices, DPS and HTTP jobs are explicitly synthetic. No auth, Blizzard requests or native simulations run. The original reliability tests and old evidence stay in place.

`qa-auction-completion-ui.mjs` requires a local actual-font bundle (`--font-source-dir`, default `.artifacts/auction-completion-20261016/ui/font-bundle`). Its manifest contains four public deployed Inter/Alegreya Latin/Cyrillic file names, SHA-256 digests and their `@font-face` declarations. The runner verifies every digest before copying the files and supplies the same `--font-ui` / `--font-atlas-display` variables as RootDocument. It does not silently substitute missing fonts or fetch fonts from the network. The audit's saved public assets can be copied read-only into this directory; all generated evidence includes the full manifest.

Run from the repository root with Node 22.23 or newer and the installed browser:

```sh
node apps/web/scripts/qa-auction-completion-ui.mjs --phase green --label ui-green-unique --port 58091
node apps/web/scripts/qa-auction-completion-ui.mjs --phase green --legacy --label ui-legacy-unique --port 58091
```

The first command covers EN/RU, 390/1440, locale budget grouping and exact copper precision, incomplete-data refresh in the same search, nonce recovery for lost assembly/resume responses, cancellation before server admission, accepted late POST cancellation/unmount, 409 reconnect, changed exclusions, pending recovery loading, empty/error/focus/overflow states. The second replays the original reliability suite through this actual-font harness. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` selects a locally installed Chromium when needed.

For red/green evidence, use a fresh `--label` and `--phase red --grep 'regression:'` before product changes. Existing files are never overwritten. The runner binds source hashes for the relevant UI/client files and stops only its own verified private process group; it verifies that the chosen port closed.

Pure parser, client cancellation and recovery-cache assertions run from `apps/web`:

```sh
node --experimental-strip-types --no-warnings --import ./tests/auction/resolve.mjs tests/auction/completion/ui-budget.test.mjs
node --experimental-transform-types --no-warnings --import ./tests/auction/resolve.mjs tests/auction/completion/ui-client.test.mjs
```

The `audit fixes:` cases cover exact-variant exclusion across duplicate auction lots and slot aliases, local-choice recovery after reload, editing while discovery has a pending POST and retiring it before assembly, grouped restoration of 400 duplicate rows, an adjacent disabled-action reason, the explicit `value` / `dps` search objective, and accurate diagnostic copy for significant versus inconclusive maximum-DPS alternatives. A separate legacy regression also pauses pending discovery when excluding a purchased physical lot. Card checkboxes send `excludedVariantKeys` (`JSON.stringify([itemId, variantKey])`); purchase exclusion sends physical-lot slot aliases through `excludedOptionIds`. Both fields participate in recovery and 409 selection matching. The legacy suite still independently verifies physical-lot exclusion across aliases and keyboard restoration.

Excluded groups are mounted only when their disclosure is opened, initially at most 20 groups; duplicate lots of the same exact variant share one restore action. More groups require an explicit “Show 20 more” action. The private fixture contains 400 rows / 200 lots of one exact variant and must render just one restore action after opening.

The `postfix fixes:` cases preserve canonical budget, encounter, objective and selected slots when the first search is still pending, including nonce recovery and a held retirement barrier before any POST. Safe form intent is whitelisted, bounded, and bound to the current character, locale, specialization cache key and profile. Its nonce and form inputs are saved synchronously before waiting for older work; the global active handle is updated only after that older work retires. No prices, item stats or account facts are restored from browser storage. Legacy caches without form intent continue to recover their server-owned handles/results. Invalid intent is rejected; completed server DTOs remain authoritative.

Excluded exact variants reuse `GearPlannerItem` frames/details and show localized level/stat context. Same-name variants with equal or different levels have distinct Restore accessible names, keyboard-pinned descriptions and keyboard restoration. The evidence runner hashes `GearPlannerItem.tsx` alongside the existing seven UI/client files so these presentation changes are bound to each accepted run.

The postdeployment regressions require acknowledged cancellation:503/network failure keeps the exact job/nonce plus a validated `cancellationRequested` intent, exposes Retry cancellation, blocks replacement POSTs, and retries safely after reload. Only acknowledged DELETE (or404 for a known job) clears handles. Unknown-admission nonce404 is not an acknowledgement. Late POSTs still retire behind the existing barrier; recovery/exclusion changes retain ownership until retirement succeeds. Tests also cover a held DELETE, failed prior-scope retirement, preserved existing checkpoints after retry, and localized413 feedback.

Semantic no-ops (Select all with every slot selected, or locale formatting of the same numeric budget) preserve results, exact exclusions and recovery. Real changes and invalid drafts remove actionable recommendations. Canonical exact variants compact only at the POST wire boundary through `auctionGearSelectionTransport`; internal cache and409 matching retain string keys, legacy keys and physical-lot bans remain unchanged. A browser regression covers compact wire identity plus409/reload. Evidence hashes include the shared transport helper (nine product files).

Real form edits while a request needs recovery also retire its scoped ID/nonce with acknowledgement, even if the global active entry is missing. A validated newer form intent stays alongside those handles. After retirement/reload, owned checkpoint metadata is compared to that intent: a previous budget/slots/objective cannot restore outdated recommendations or overwrite the newer draft. Starting a new search waits for that acknowledgement, and scope unmount cannot dispatch its queued action. The two changed-form regressions cover failed/successful retirement, reload, draft retention and the exact subsequent budget POST.

The final merged-theme UI evidence additionally hashes `app/globals.css` and `app/styles/site-theme.css` (eleven source dependencies). A reload can abort an older keepalive DELETE before acknowledgement; the pending-intent/barrier test now explicitly verifies that the UI stays locked without a POST and retries cancellation when that happens, rather than treating an unacknowledged timeout as success.
