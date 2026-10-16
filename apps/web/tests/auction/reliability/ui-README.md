# Offline auction reliability browser regressions

Run with Node.js 20.9+ and the already installed `playwright` Chromium browser:

```sh
node apps/web/scripts/qa-auction-reliability-ui.mjs --phase green
```

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` when the browser is installed outside Playwright's normal cache. No additional dependencies, account credentials, native worker, or published QA routes are required.

The script generates a private Next project with React StrictMode enabled under this worktree's `.artifacts/auction-reliability-20261016`, checks that the selected loopback port is free, imports the actual product components, runs TypeScript Playwright tests through the existing `playwright/test` export, and stops only its own verified process group. Default port: 58088. `--port`, `--label`, and `--output-dir` permit explicitly isolated runs. Existing proof files and run directories are never overwritten.

Every character, item, effect, price, DPS figure and HTTP job is synthetic. The fixtures cover hidden purchase exclusion across slot aliases/undo, cancellation and errors, poll timeout/retry without duplicate work, owned reload recovery and expiry, locally changed exclusions, initial-job recovery even when its first 202 is lost, initial POST timeout recovery, scope-change cancellation after a lost response, market error copy, separate measured/confirmed results and exact/missing tooltip facts. The 19 regression cases run EN/RU at 390/1440 (76 checks) with reduced motion, keyboard controls, focus checks, screenshots and traces on failures.

`ui-red.json` records the original13 failures against unchanged base product source. Additional peer, initial-request and scope failures were recorded in separate RED proofs before their repairs; existing passing lifecycle controls were added separately. The historical red-phase runner succeeds only when every selected regression failed as expected, the runner itself had no infrastructure errors, and product hashes stayed unchanged. `ui-green.json` requires every regression to pass. Reports bind source SHA256 before/after and include per-case errors, artifacts and synthetic HTTP observations. The red report remains historical evidence after implementation.

Set `AUCTION_UI_CAPTURE=1` to add four screenshot observers, which save a successful confirmed loadout and exact item tooltip in each locale/viewport. These four observers are reported separately from the 76 regressions.
