# Characters-style site

Owner direction: 22 October 2026. This supersedes the earlier requirement to use the book as the homepage/navigation.

## Public site

- `PlatformHome` renders `AtlasHome`: the same `AtlasFrame`, `AtlasHero`, character art and glass material as Characters. No cinematic entry gate is mounted.
- `WorkspaceNavigator` renders the shared top bar on all routes: the Gildra crest (gilded helmet, `components/brand/GildraCrest.tsx`) + wordmark (home), five realms from `navigationMap.ts` (Characters, Mythic+, Raids, Tier lists, Articles) whose chevron or hover opens an art portal of the realm's pages, then search, EN/RU and the game switcher. A rune under the bar marks the current realm and glides on navigation. Below 1180 px the realms become a full-height sheet of section paintings. Escape returns focus to the trigger; focus leaving closes. Bosses (lairs) live in the Raids portal. Add a page to a realm in `navigationMap.ts`, never as a new top-level item without the owner's decision.
- `RouteTransitionGate` scopes every page to `.gildra-atlas`; home uses the ordinary page transition, never the archived cinematic scene transition. The page transition is the "rune veil": a link click is intercepted (Next's `Link` skips a click whose default is prevented, after running its own `onClick`), the destination is prefetched, a dark veil with burning rune edges sweeps under the top bar from the side of the movement (210 ms), then `router.push` runs and the veil sweeps on to uncover the new page (380 ms) while its hero cascades and the accent ring bursts from the click point. A slow page holds the veil with the Gildra crest in a turning seal (after 240 ms) and its `loading.tsx` skeleton is uncovered after 1.1 s. One layer, transform/opacity only, no document View Transition (it froze phones before). History and scripted navigations get the reveal half only; Escape cancels; reduced motion navigates at once. Links whose own handler keeps scroll mark it with `data-route-scroll="keep"`; `data-no-book-transition` opts a link out.
- `--atlas-glass-*` tokens define the shared material for panels, cards, controls and legacy surfaces. Character/quality/status colors remain data semantics. Section artworks remain section-specific.
- `SiteAppearance` preserves the existing theme preference and refreshes server-rendered art. The shared cookie notice now covers home too.
- Public Valyro theme CSS is generated with `node scripts/generate-public-valyro-theme.mjs`; `npm run valyro:check` verifies token dependency closure and provenance in CI. Full vendor sources remain intact.
- Actual Valyro source components are used through the shared atlas adapters. Preserve their provenance manifest; do not rename custom components as Valyro. Use reduced-motion-aware transitions only for meaningful changes of state.

## Preserved book

`GrimoireHome`, `HomeBook`, `OpenBook`, `PhoneBook`, `BookNavigationDialog`, their loaders, CSS and assets remain in the repository. Active home and toolbar do not import or preload them. The navigation runtime no longer mounts ThemedPageTransition, so its canvas renderer and hidden raster iframe are not prewarmed. Re-enabling the book is a deliberate future product change, not a CSS toggle. The legacy QA scripts for the cinematic book are retained for that implementation; the active route policy regression now expects the shared page transition for home.

## Verification

Run TypeScript, atlas token checks, route mirrors/parity, the route transition policy regression, and a production build. Inspect home, Characters and representative shared surfaces at desktop/mobile sizes in EN/RU. Check mobile menu, keyboard focus, search, theme changes and reduced motion.

Work is separated into `redesign/characters-style`, `redesign/top-navigation`, `redesign/shared-surfaces`, `redesign/articles`, `redesign/valyro-site`, `redesign/valyro-surfaces` and `redesign/admin-valyro`. The owner explicitly authorized committing, merging into main and releasing to production on 22 October 2026. The release still requires a passing build and access to the configured deployment path.

## Main reconciliation

The old `main` contains the Fury calculator commit `da3e604a`, already adapted into the active history as `ae7ba654`, plus metadata-only `85a19bbe`. The integration merge keeps the current monorepo implementation and records the main ancestry. It must not restore the deleted root app or replace the evolved parser and dataset-aware API with their older versions.
