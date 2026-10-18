# Mythic+ catalog: verified facts and draft routes

Changes prepared on 2026-10-18 in `fix/mythic-atlas-verification-20261018`, based on `32a5bcb8946df87242ee42741063f19dbc500849`. The user subsequently authorized commits and publication as Shpuntyara, followed by verification on gildra.net. Publication evidence is recorded separately after the live checks.

## Result

- Corrected Altar of Fangs to 30:00, The Blinding Vale to 30:00 and Temple of Sethraliss to 32:00 in the shared route data. Cards, the comparison and the planner's reserve calculation read these same values.
- Aligned the four inconsistent Russian dungeon-name fallbacks with Blizzard's Russian names; the comparison now uses the same name resolver as the cards and planner.
- Put draft status on every Mythic+ route card and before the catalog comparison. The season catalog and individual planners use the same notice and sources disclosure.
- Moved time comparison before the illustrated cards, replacing the bars with a compact semantic two-column table. Added a native anchor from the hero, readable numeric values, keyboard focus and links with a minimum 44px height. The anchor also works when revisiting the same fragment after scrolling back to the top.
- Added explicit source-check dates and the 12.1.5 context. Route tactics remain unverified, with no invented verification date. Removed the old 12.1 label from the route heading.
- Applied the existing route-name resolver to the deferred timeline, so it matches the other step lists. Corrected the two observed grammatical defects in the Ruby Life Pools introduction and large-pull subtitle.

## Source checks performed

Checks refer to the cited facts only. All dates below are fixed dates of completed checks, not deployment or render timestamps.

| Fact | Source | Checked |
|---|---|---|
| Current eight-dungeon pool | [Blizzard Season 2 announcement](https://worldofwarcraft.blizzard.com/en-us/news/24294369/midnight-season-2-is-now-live) | 2026-10-18 |
| Timer limits | [Raider.IO static data](https://raider.io/api/v1/mythic-plus/static-data?expansion_id=11), `season-mn-2` | 2026-10-18 |
| Russian dungeon names | [Blizzard Russian leaderboard](https://worldofwarcraft.blizzard.com/ru-ru/worldsoul/eu/leaderboards/mythic-dungeon/die-todeskrallen/temple-of-sethraliss) | 2026-10-18 |
| Patch context | [Blizzard 12.1.5 announcement](https://worldofwarcraft.blizzard.com/en-us/news/24307306/midnight-s-12-1-5-content-update-is-now-live) | 2026-10-18 |
| Authored route, forces, estimated durations and assignments | Not verified in game | No date |

Raider.IO timer snapshot in seconds: RLP 1680; AOF 1800; MR 2040; DON 1920; BV 1800; VSA 1800; KR 1980; TOS 1920.

`mythicVerification.ts` stores the check metadata; `dungeonRoutes.ts` remains the sole source of the displayed timer values. No new live request or availability dependency was added to the page. Future updates must recheck the upstream facts and update the corresponding dates together. Never advance these dates automatically on deployment.

## Validation

- `npm run typecheck`: passed. The final `npm run build` also completed TypeScript checking and generated all 766 static pages successfully.
- `npm run atlas:check`: passed, 74 strict stylesheets.
- ESLint: all new/changed catalog, metadata, copy, data and test files passed. The planner retained the same 11 warnings as its original version (3 effect-state warnings and 8 ref warnings), with zero errors and no new warning.
- React Doctor, changed scope: no introduced issues reported; the overall existing application score was 84/100.
- Chromium checks on the local standalone production artifact: RU and EN at 1440, 390 and 320 px; all eight timer/name pairs matched the cards, all route cards showed draft status, comparison rows were sorted by time, and the document had no horizontal overflow.
- The timer heading remained visible below the toolbar after repeated jumps. All eight entries fit within the mobile comparison viewport. The verification disclosure opened with Enter, contained four dated sources and explicit unverified tactics, and did not overflow at 320 px.
- Browser checks confirmed the changed timer and `max(0, time limit − planned duration)` reserve calculation in Altar of Fangs, The Blinding Vale and Temple of Sethraliss, in both locales. No page errors were recorded.
- With JavaScript disabled at 390 px, the static comparison and native sources disclosure remained usable. Repeated anchor jumps were verified after scrolling back to the top. Automated UI checks used reduced motion to avoid capturing transitional layouts.
- `git diff --check` and the shared-worktree ownership check passed. Next's automatic preview-type additions to `tsconfig.json` were removed after local development QA.

Versioned check: `MYTHIC_BASE_URL=http://127.0.0.1:5189 node apps/web/scripts/qa-mythic-atlas-verification.mjs`.

Evidence: `/home/debian/exports/mythic-plus-fixes-20261018/` (`timers-{ru,en}-{1440,390,320}.png`, `sources-{ru,en}-320.png`, `results.json`, and the checked Raider.IO response).

## Boundaries

This change does not certify route mechanics or enemy-force totals, or remove `noindex` from tactical drafts. User-saved routes and their stored identifiers are preserved. The authorized publication updates only the web image and its release metadata. Database operations and replacement of other services are outside scope. The published auction source `469a0161aed6a4cce6968d0a3e6bf7e47c6ed231` is preserved in the release; deployment evidence and current publication status are recorded in `/home/debian/gildra-mythic-publish-20261018/`.
