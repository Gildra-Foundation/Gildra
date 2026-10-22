# Characters-style site and Valyro CMS

Owner direction: 22 October 2026. This supersedes the earlier requirement to use the book as the homepage/navigation.

## Public site

- `PlatformHome` renders `AtlasHome`: the same `AtlasFrame`, `AtlasHero`, character art and glass material as Characters. No cinematic entry gate is mounted.
- `WorkspaceNavigator` renders the shared top bar on all routes. Direct localized links include Characters, bosses, Mythic+, raids, tier lists and articles. Mobile disclosure keeps keyboard focus and Escape behavior.
- `RouteTransitionGate` scopes every page to `.gildra-atlas`; home uses the ordinary page transition, never the archived cinematic scene transition.
- `--atlas-glass-*` tokens define the shared material for panels, cards, controls and legacy surfaces. Character/quality/status colors remain data semantics. Section artworks remain section-specific.
- `SiteAppearance` preserves the existing theme preference and refreshes server-rendered art. The shared cookie notice now covers home too.
- `/wow/articles` and `/ru/wow/articles` are the canonical article indexes. Disabled CMS and empty catalogs render honest localized states; upstream failures remain distinct. No invented articles are shipped.
- Actual Valyro source components are used through the shared atlas adapters. Preserve their provenance manifest; do not rename custom components as Valyro. Use reduced-motion-aware transitions only for meaningful changes of state.

## Preserved book

`GrimoireHome`, `HomeBook`, `OpenBook`, `PhoneBook`, `BookNavigationDialog`, their loaders, CSS and assets remain in the repository. Active home and toolbar do not import or preload them. The navigation runtime no longer mounts ThemedPageTransition, so its canvas renderer and hidden raster iframe are not prewarmed. Re-enabling the book is a deliberate future product change, not a CSS toggle. The legacy QA scripts for the cinematic book are retained for that implementation; the active route policy regression now expects the shared page transition for home.

## CMS

The CMS has its own existing Valyro integration, native Payload editor, localized publication workflow and tenant permissions. Continue from the verified 19 October R6 source snapshot rather than replacing it with the older CMS folder from the web release. See `cms/VALYRO.md`, `cms/WORKFLOWS.md` and the redesign provenance note. Do not copy environment secrets, accounts or production content into local verification.

## Verification

Run TypeScript, atlas token checks, route mirrors/parity, CMS public contract tests, the route transition policy regression, and a production build. Inspect home, Characters, articles and representative shared surfaces at desktop/mobile sizes in EN/RU. Check mobile menu, keyboard focus, search, theme changes and reduced motion. Verify CMS filter URL/state behavior and navigation with its focused tests; authenticated integration checks require an isolated test database.

Work is separated into `redesign/characters-style`, `redesign/top-navigation`, `redesign/shared-surfaces`, `redesign/articles`, `redesign/valyro-site`, `redesign/valyro-surfaces` and `redesign/admin-valyro`. The owner explicitly authorized committing, merging into main and releasing to production on 22 October 2026. The release still requires a passing build and access to the configured deployment path.
