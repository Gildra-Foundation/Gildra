# Atlas theme — recipes for AI edits

Read first: [design.md](../../design.md) (rules), [packages/atlas-ui/README.md](../../packages/atlas-ui/README.md)
(components), [app/styles/atlas-theme.css](../../app/styles/atlas-theme.css) (tokens).
Current owner direction (22 October 2026): the Characters-style shell and direct top navigation apply to the homepage too. The book source remains archived and unmounted. Use actual Valyro components through the atlas adapters; find them with the `valyro` MCP server and install them with `npm run valyro:add` ([valyro-cli.md](valyro-cli.md)). See [navigation-redesign.md](navigation-redesign.md); older book/amber-specific recipes below are historical.

## Change the look of every inner page

| Request | Edit |
| --- | --- |
| "Make the accent more gold / more orange" | `--atlas-accent`, `--atlas-accent-strong`, and the rgba in `--atlas-accent-wash*`, `--atlas-line*` |
| "Darker / lighter panels" | `--atlas-bg`, `--atlas-surface*` (keep text contrast ≥ 4.5 — the comment in the file lists ratios) |
| "Another heading font" | load it in `app/root-document.tsx` with `next/font/google` (subsets `latin`, `cyrillic`, `variable: "--font-atlas-display"`), keep `--atlas-font-display` pointing at it |
| "Bigger / smaller text" | `--atlas-text-*` scale; never go below 11 px for `--atlas-text-label` |
| "Bolder headings" | `--atlas-weight-display`, `--atlas-weight-display-hero` (Alegreya is variable 400–900) |
| "Wider / narrower page" | `--atlas-container`, `--atlas-gutter` |
| "Rounder corners" | `--atlas-radius` (buttons, controls) |
| "Faster / calmer motion" | `--atlas-duration-*`, `--atlas-ease*`, `--atlas-stagger` (one tempo for the whole atlas) |
| "Softer / stronger glow" | `--atlas-glow-*`, `--atlas-ring-focus`, `--atlas-shadow-*` |
| "Shorter / longer lines of text" | `--atlas-measure`, `--atlas-measure-wide` |
| "Another painting for a section", "move the crop", "tint the torchlight" | the section's entry in `lib/atlas/scenes.ts` (pages use `<AtlasFrame scene="…">`; link previews read the same entry) |

After a token change: `npm run build`, then `npm run visual:diff` (local build against the live site, 1440 and 390) and look at the pages it flags. `/dev/atlas` (with `GILDRA_DEV_GALLERY=1`) shows every kit component at once.

## Change one component everywhere

Edit `components/atlas/<Component>.module.css` (look) or `.tsx` (structure). Keep props
backward compatible — many pages use them. Update the table in `packages/atlas-ui/README.md`.

## Build a new inner page

1. Route files `app/<path>/page.tsx` and `app/ru/<path>/page.tsx` render one component with `locale`.
2. Copy goes to `<Area>Copy.ts` with `ru` and `en` objects.
3. Markup: `AtlasFrame` → `AtlasHero` (breadcrumbs, emblem, eyebrow, title, lede, honest stats) →
   `AtlasSection`s with `AtlasGrid` + `AtlasCard` / `AtlasPanel` / `AtlasMetaList`.
4. Page CSS module only for layout, first line `/* atlas:strict — … */`.
5. Data from the existing sources (`lib/`, `data/`, API) — never invent numbers or assets.
6. Check: `npm run typecheck`, `npm run atlas:check`, `npm run build`, screenshots EN/RU × 1440/390.

## Declutter a page ("too busy")

1. List the sections and what question each answers; merge or drop any that repeat the hero
   or another section (second link grid, counters already in the hero, "step 1-2-3" rows).
2. Fold long secondary detail into `AtlasDisclosure` instead of deleting it.
3. Empty state = one `AtlasNotice` line; never a tall empty panel or skeleton without data.
4. One primary action per block; no per-row button that duplicates the row link.
5. Measure: `node .artifacts/atlas/cssweight.mjs http://127.0.0.1:3100 /ru/<route>` (page-own CSS/JS).

## Make a page lighter

- `"use client"` only for real interactivity; pass strings as props or from `*Copy.ts` —
  never import `lib/i18n` in client code (~64 KB of dictionary).
- Don't render UI and hide it with CSS; don't preload images the page does not paint.
- A game's block registry is imported whole: delete blocks no page uses.
- Never read request headers in the 404 files (`app/global-not-found.tsx`, the trees' `not-found.tsx`):
  they are prerendered, and headers would make every route dynamic.

## Migrate an old page

- Replace its own hero with `AtlasHero`, its cards with `AtlasCard`, its section headers with `AtlasSection`.
- Replace literal colours with tokens; chrome becomes amber; keep data colours (class, quality, role, tier).
- Raise text below 11 px to `--atlas-text-label` / `--atlas-text-meta` and re-check the layout.
- Remove page-level second headers with a GILDRA logo; the global top bar is the only header.
- Delete overrides for the page from `app/styles/atlas-pages.css` once its own CSS uses tokens.

## Where things are

| Area | Files |
| --- | --- |
| Tokens | `app/styles/atlas-theme.css` |
| Kit | `components/atlas/*` |
| Top bar (book contents, EN/RU, GILDRA) | `components/platform/navigation/WorkspaceNavigatorContent.tsx`, `atlasToolbar.module.css` |
| 404 | `components/layout/NotFoundPage.tsx` (used by `app/(site)/not-found.tsx`, `app/ru/not-found.tsx`, `app/global-not-found.tsx`) + `NotFoundCopy.tsx` |
| Raid guides | `components/wow/raid/RaidBossGuide.tsx`, `RaidMechanicList.tsx`, `raidGuideCopy.ts` |
| Articles (shared CMS) | `components/cms/Articles.tsx`, `cms.module.css` |
| Legacy skin for old pages | `app/styles/atlas-pages.css`, `app/styles/wow-skin.css` |
| Lairs and world bosses (reference) | `components/wow/lairs/` |
| Raids hub, Mythic+ hub, WoW hub | `components/wow/raid/RaidAtlasPage.tsx`, `components/wow/mythic/MythicAtlasPage.tsx`, `components/wow/home/WowHome.tsx` |
| Section placeholders (gear, classes, Sporefall, Prey) | `components/wow/identity/IdentityStatusPage.tsx` |
| Token guard | `scripts/check-atlas-tokens.mjs` (`npm run atlas:check`) |
