# Auction completion UI regressions

These tests use the actual current AuctionGearOptimizer in a generated private Next harness with React StrictMode. Characters, market prices, DPS and HTTP jobs are explicitly synthetic. No auth, Blizzard requests or native simulations run. The original reliability tests and old evidence stay in place.

`qa-auction-completion-ui.mjs` requires a local actual-font bundle (`--font-source-dir`, default `.artifacts/auction-completion-20261016/ui/font-bundle`). Its manifest contains four public deployed Inter/Alegreya Latin/Cyrillic file names, SHA-256 digests and their `@font-face` declarations. The runner verifies every digest before copying the files and supplies the same `--font-ui` / `--font-atlas-display` variables as RootDocument. It does not silently substitute missing fonts or fetch fonts from the network. The audit's saved public assets can be copied read-only into this directory; all generated evidence includes the full manifest.

Run from the repository root with Node 24 and the installed browser:

```sh
node apps/web/scripts/qa-auction-completion-ui.mjs --phase green --label ui-green-unique --port 58091
node apps/web/scripts/qa-auction-completion-ui.mjs --phase green --legacy --label ui-legacy-unique --port 58091
```

The first command covers EN/RU, 390/1440, locale budget grouping and exact copper precision, incomplete-data refresh in the same search, nonce recovery for lost assembly/resume responses, cancellation before server admission, accepted late POST cancellation/unmount, 409 reconnect, changed exclusions, pending recovery loading, empty/error/focus/overflow states. The second replays the original reliability suite through this actual-font harness. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` selects a locally installed Chromium when needed.

For red/green evidence, use a fresh `--label` and `--phase red --grep 'regression:'` before product changes. Existing files are never overwritten. The runner binds source hashes for the relevant UI/client files and stops only its own verified private process group; it verifies that the chosen port closed.

Pure parser and client cancellation assertions run from `apps/web`:

```sh
node --experimental-strip-types --no-warnings --import ./tests/auction/resolve.mjs tests/auction/completion/ui-budget.test.mjs
node --experimental-transform-types --no-warnings --import ./tests/auction/resolve.mjs tests/auction/completion/ui-client.test.mjs
```
