# Characters-style site and Valyro CMS

Owner direction: 22 October 2026. This supersedes the earlier requirement to use the book as the homepage/navigation.

## Public site

- `PlatformHome` renders `AtlasHome`: the same `AtlasFrame`, `AtlasHero`, character art and glass material as Characters. No cinematic entry gate is mounted.
- `WorkspaceNavigator` renders the shared top bar on all routes: the Gildra sigil + wordmark (home), five realms from `navigationMap.ts` (Characters, Mythic+, Raids, Tier lists, Articles) whose chevron or hover opens an art portal of the realm's pages, then search, EN/RU and the game switcher. A rune under the bar marks the current realm and glides on navigation. Below 1180 px the realms become a full-height sheet of section paintings. Escape returns focus to the trigger; focus leaving closes. Bosses (lairs) live in the Raids portal. Add a page to a realm in `navigationMap.ts`, never as a new top-level item without the owner's decision.
- `RouteTransitionGate` scopes every page to `.gildra-atlas`; home uses the ordinary page transition, never the archived cinematic scene transition. The page transition is the "portal": a ring of the theme accent charges at the click point and bursts on arrival, the leaving page recedes towards that point and the new one opens out of it (transform/opacity only, no document View Transition — it froze phones before).
- `--atlas-glass-*` tokens define the shared material for panels, cards, controls and legacy surfaces. Character/quality/status colors remain data semantics. Section artworks remain section-specific.
- `SiteAppearance` preserves the existing theme preference and refreshes server-rendered art. The shared cookie notice now covers home too.
- `/wow/articles` and `/ru/wow/articles` are the canonical article indexes. Disabled CMS and empty catalogs render honest localized states; upstream failures remain distinct. No invented articles are shipped.
- Public Valyro theme CSS is generated with `node scripts/generate-public-valyro-theme.mjs`; `npm run valyro:check` verifies token dependency closure and provenance in CI. Full vendor sources remain intact.
- Actual Valyro source components are used through the shared atlas adapters. Preserve their provenance manifest; do not rename custom components as Valyro. Use reduced-motion-aware transitions only for meaningful changes of state.

## Preserved book

`GrimoireHome`, `HomeBook`, `OpenBook`, `PhoneBook`, `BookNavigationDialog`, their loaders, CSS and assets remain in the repository. Active home and toolbar do not import or preload them. The navigation runtime no longer mounts ThemedPageTransition, so its canvas renderer and hidden raster iframe are not prewarmed. Re-enabling the book is a deliberate future product change, not a CSS toggle. The legacy QA scripts for the cinematic book are retained for that implementation; the active route policy regression now expects the shared page transition for home.

## CMS

The CMS has its own existing Valyro integration, native Payload editor, localized publication workflow and tenant permissions. Continue from the verified 19 October R6 source snapshot rather than replacing it with the older CMS folder from the web release. See `cms/VALYRO.md`, `cms/WORKFLOWS.md` and the redesign provenance note. Do not copy environment secrets, accounts or production content into local verification.

## Verification

Run TypeScript, atlas token checks, route mirrors/parity, CMS public contract tests, the route transition policy regression, and a production build. Inspect home, Characters, articles and representative shared surfaces at desktop/mobile sizes in EN/RU. Check mobile menu, keyboard focus, search, theme changes and reduced motion. Verify CMS filter URL/state behavior and navigation with its focused tests; authenticated integration checks require an isolated test database.

Work is separated into `redesign/characters-style`, `redesign/top-navigation`, `redesign/shared-surfaces`, `redesign/articles`, `redesign/valyro-site`, `redesign/valyro-surfaces` and `redesign/admin-valyro`. The owner explicitly authorized committing, merging into main and releasing to production on 22 October 2026. The release still requires a passing build and access to the configured deployment path.

## Main reconciliation

The old `main` contains the Fury calculator commit `da3e604a`, already adapted into the active history as `ae7ba654`, plus metadata-only `85a19bbe`. The integration merge keeps the current monorepo implementation and records the main ancestry. It must not restore the deleted root app or replace the evolved parser and dataset-aware API with their older versions.
