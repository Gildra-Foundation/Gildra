# Confirmed farming upgrades

Run from `apps/web` with Node 22+ and installed workspace dependencies:

```sh
node --experimental-strip-types --import ./tests/auction/resolve.mjs scripts/test-gear-farm.mjs
node --experimental-strip-types --import ./tests/auction/resolve.mjs scripts/test-gear-farm-reward-generation.mjs
node --experimental-strip-types --import ./tests/auction/resolve.mjs scripts/test-gear-farm-upgrades.mjs
```

The upgrade regression covers proc-only trinkets, explicit vs missing stat data,
30 exact rewards including a lower-ilvl winner beyond the former 24-item cap,
uncertainty, invalid measurements, access, partial search and unchanged coverage.
All item/source facts in that regression are synthetic.

For real offline effect measurements, first run `scripts/test-auction-item-effects.mjs`
with `GILDRA_ITEM_EFFECTS_SIMC` pointing to its pinned native binary and
`GILDRA_ITEM_EFFECTS_OUTPUT` pointing to an output JSON file. Pass that file as
`GILDRA_FARM_EFFECTS_REPORT` to `test-gear-farm-upgrades.mjs` to check the farm
confirmation logic against the measured passive/on-use effect differences.
The public reference profile and artificial stat-only controls do not prove
these items are obtainable farm rewards for any account.

From the repository root, run the actual UI in a generated loopback Next harness:

```sh
FARM_UI_FONT_DIR=/path/to/actual-inter-alegreya-bundle \
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chrome-headless-shell \
node apps/web/tests/farm-upgrades/run.mjs
```

The font bundle contains `manifest.json` and its referenced font files, as used
by the auction UI harness. Optional `FARM_UI_PORT` defaults to 58127. The harness
refuses an occupied port, binds only 127.0.0.1, mocks every farm API response and
stops its own server after testing. Artifacts remain in `.artifacts/farm-upgrades`.
The 12 cases cover RU/EN at 390/1440, confirmed/empty/partial results, progress,
keyboard activation, cancellation, errors, screenshots, no page errors/overflow.
No account, Blizzard or production simulation requests are made.
