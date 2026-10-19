# Motion, design and performance pass — 18 October 2026

Branch `feature/motion-design-perf-20261018` from production source `f4da729`.
Released to gildra.net on 19 October 2026, 08:45 UTC: web image
`gildra-web:motion-design-20261019-7357c61` (`0104dafb`), commit `7357c61`; rollback
target `fba239aa` with the manifest backup `/opt/gildra/motion-design-20261019-7357c61-r1-previous.env`.
Review that led to it:
`/home/debian/gildra-design-review-20261018/REPORT.md` (live screenshots and frames).

## Transitions: one owner per navigation

- `routeTransitionKind` (`components/motion/routeTransitionPolicy.ts`, unit-tested):
  `still` / `scene` (homepage entered or left → the selected character's effect) /
  `page` (between atlas pages → quick hand-over).
- `AtlasFrameShell` no longer renders `<ViewTransition>`; `app/styles/view-transitions.css`
  is removed. React had started a document View Transition on every route commit
  next to the character effect: frost froze while React held the old snapshot (up
  to 500 ms for images), the destination flashed, then the frozen page returned.
- Quick hand-over: commit 50–370 ms after the click (local build, headless Chromium),
  the page rises from its direction (300 ms), the hero/section/card arrival cascade
  runs (it never ran before), the tapped card picture grows into the page scene
  inside the scene layer, behind the hero text (`playMorphArt`).
- The character effect is tap-to-skip (≈0.6–0.7 s instead of 1.4–2.5 s) and no
  longer lets clicks reach the invisible destination.

## Layout stability

- The top bar is imported statically (≈7 KB gzip) instead of `lazy()`: its server
  HTML was discarded during hydration and the bar vanished for ~0.5 s on every
  inner page. `SiteTheme` provides a constant context (theme read via
  `useSyncExternalStore` in `useSiteTheme`) so theme updates do not reach the root.
- Metric-matched local fallback faces (`atlas-theme.css`) for systems without
  Times New Roman / Arial (Linux, ChromeOS, Android).
- Short pages end at the bottom of the screen; the cookie notice space is reserved
  inside atlas pages (`--cookie-notice-space`), not as body padding.
- Rotation lab: no dynamic swap of the optimizer, reserved placeholder heights.

CLS (local build, 1440 / 390): `/wow` 0.002 / 0, `/wow/raids` 0.005 / 0,
`/wow/classes` 0.020 / 0, `/tier-lists` 0.053 / 0, Rotation lab 0.0001 / 0,
`/wow/characters` 0.003 / 0. Live before: 0.09–0.18 desktop, 0.15–0.24 mobile,
Rotation lab 0.48.

## Characters page

Signed out: the reader's homepage character as the scene, sign-in card beside the
hero (first screen on phones), what each hero opens with. Signed in: placeholder
cards of the final size while Battle.net answers (no shift), account summary with
real counts, class-coloured cards that settle in. Verified with a local QA-only
session fixture; no real account or Blizzard request.

## Content and layout fixes

Season 2 copy without storage jargon; RU delves and route names without
"translation not confirmed" placeholders; localized item prices; honest library
total; RU tier-list spec icons and grammar; What's new badges; privacy heading
spacing; 404 search action without an empty heading; dungeon draft badges and
centred hub; Coming soon pages; technical IDs moved into details; `/wow` without
duplicated destinations; M+ map markers and raid boss switcher on phones; compact
cookie notice; lair loot rows; ghost button alignment; Rotation lab placeholders,
palette on theme tokens and sentence case.

## Verification

- `tsc --noEmit`, `check-atlas-tokens`, `git diff --check`; 153/153 atlas tests;
  `test-route-transition-policy.mjs`.
- `next build`: 766/766 pages.
- Local preview (dummy auth, no API backend): `qa-route-transition.mjs` and
  `qa-site-theme.mjs` (both updated to the new model) pass;
  `.artifacts/motion-design/verify.mjs` (page/scene/skip/reduced/CLS/characters) passes.
- Staging with the production API (`http://127.0.0.1:3200`, same image): landing and book
  0 px against live, 28 smoke routes, both transition suites, page/scene/skip/reduced/CLS
  (CLS identical to the local build; scene effect clears in 1.4–2.4 s; tap skip 0.53 s),
  motion budget, database/library/item pages. `qa:a11y` reports the same 6 page views as
  live (catalog row contrast on /ru/database and /ru/search, M+ source links 20 px tall).
- The landing release gate caught one regression: with the bar loading before
  `globals.css`, the switcher's landing overrides lost to the global tokens (wordmark in
  Alegreya, nav 2.5 px off); `.root.home` fixes it (`7357c61`).
- After the release: smoke, `qa-route-transition` and `qa-site-theme` pass on https://gildra.net.

## Remaining

- M+ map markers 8–10 still touch on phones (needs collision offsets in `MythicRouteMap.tsx`).
- Engine-generated Title Case metric labels (`backend/internal/rotationlab/simc.go`).
- Owner decisions: RU entity names vs design rule 6; privacy contact; a changelog
  entry for character-driven themes.
- Lab timings are headless Chromium on this server, not physical devices or field data.
