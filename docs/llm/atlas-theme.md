# Atlas theme — recipes for AI edits

Read first: [design.md](../../design.md) (rules), [components/atlas/README.md](../../components/atlas/README.md)
(components), [app/styles/atlas-theme.css](../../app/styles/atlas-theme.css) (tokens).
Never touch the landing scene or the contents book while doing these.

## Change the look of every inner page

| Request | Edit |
| --- | --- |
| "Make the accent more gold / more orange" | `--atlas-accent`, `--atlas-accent-strong`, and the rgba in `--atlas-accent-wash*`, `--atlas-line*` |
| "Darker / lighter panels" | `--atlas-bg`, `--atlas-surface*` (keep text contrast ≥ 4.5 — the comment in the file lists ratios) |
| "Another heading font" | load it in `app/layout.tsx` with `next/font/google` (subsets `latin`, `cyrillic`, `variable: "--font-atlas-display"`), keep `--atlas-font-display` pointing at it |
| "Bigger / smaller text" | `--atlas-text-*` scale; never go below 11 px for `--atlas-text-label` |
| "Bolder headings" | `--atlas-weight-display`, `--atlas-weight-display-hero` (Alegreya is variable 400–900) |
| "Wider / narrower page" | `--atlas-container`, `--atlas-gutter` |
| "Rounder corners" | `--atlas-radius` (buttons, controls) |

After a token change: `npm run build`, screenshot 2–3 pages (hub, detail, a table page) at 1440 and 390.

## Change one component everywhere

Edit `components/atlas/<Component>.module.css` (look) or `.tsx` (structure). Keep props
backward compatible — many pages use them. Update the table in `components/atlas/README.md`.

## Build a new inner page

1. Route files `app/<path>/page.tsx` and `app/ru/<path>/page.tsx` render one component with `locale`.
2. Copy goes to `<Area>Copy.ts` with `ru` and `en` objects.
3. Markup: `AtlasFrame` → `AtlasHero` (breadcrumbs, emblem, eyebrow, title, lede, honest stats) →
   `AtlasSection`s with `AtlasGrid` + `AtlasCard` / `AtlasPanel` / `AtlasMetaList`.
4. Page CSS module only for layout, first line `/* atlas:strict — … */`.
5. Data from the existing sources (`lib/`, `data/`, API) — never invent numbers or assets.
6. Check: `npm run typecheck`, `npm run atlas:check`, `npm run build`, screenshots EN/RU × 1440/390.

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
| Top bar | `components/platform/navigation/WorkspaceNavigatorContent.tsx`, `atlasToolbar.module.css` |
| Legacy skin for old pages | `app/styles/atlas-pages.css`, `app/styles/wow-skin.css` |
| Lairs and world bosses (reference) | `components/wow/lairs/` |
| Raids hub, Mythic+ hub, WoW hub | `components/wow/raid/RaidAtlasPage.tsx`, `components/wow/mythic/MythicAtlasPage.tsx`, `components/wow/home/WowHome.tsx` |
| Section placeholders (gear, classes, Sporefall, Prey) | `components/wow/identity/IdentityStatusPage.tsx` |
| Token guard | `scripts/check-atlas-tokens.mjs` (`npm run atlas:check`) |
