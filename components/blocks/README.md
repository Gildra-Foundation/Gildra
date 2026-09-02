# Blocks, pages and games

Gildra pages are **configs of blocks**. A route file is three lines; the page
definition lives with its game; a block is a self-contained folder. This file
is the contract — read it before adding or changing UI.

```
lib/blocks/          core: types.ts (BlockDef), page.ts (PageConfig), registry.ts, anchors.ts, metadata.ts, gallery.ts
lib/pages/           definePage.tsx — one definition → { en, ru } route exports
lib/games/           registry.ts (GAMES, prefixes, nav, footer, legal) · adapter.ts · <slug>/{assets,client,api,pages/*}
lib/data/            DataSource contract + demo implementation (data/site.ts stays the demo dataset)
lib/anchors.ts       ANCHORS — every #id used by nav, footer, search and blocks
components/blocks/   shared/<name>/ · <game>/<name>/ · _template/ · BlockRenderer · Page
components/layout/   PageShell (Icons + TopNav + .app/.main + Footer + Reveal), Container, Section
app/**/page.tsx      thin wrappers; app/ru/** mirrors them with `.ru`
app/dev/blocks       gallery of every block at 1440/768/390 (dev only; GILDRA_DEV_GALLERY=1 in prod)
```

## Block anatomy

```
components/blocks/wow/hero/
  Hero.tsx        component: (props + data + lang + game) → JSX. Owns its root element and its #id.
  schema.ts       HeroProps (JSON-serialisable) and HeroData
  data.ts         load(ctx, props) → HeroData via ctx.source only
  demo.ts         demo props + data for the gallery
  index.ts        defineBlock({ type: "wow.hero", Component, load, anchor, demo })
```

Rules:

- **The component is pure.** No `data/site.ts`, no `lib/api/*`, no `usePathname` for
  language — `lang` and `game` arrive as props. Only `demo.ts`/`index.ts` may import
  the demo dataset.
- **Own your root.** A block renders its own `<section id=…>`; anchor targets use
  `ANCHORS.x` and the definition declares `anchor: { id, label }` (empty label =
  scroll target without a nav item). Props-derived anchors use `anchorOf(props)`.
- **Links** go through `p(lang, href)` / `gameHref(game, lang, path)`; anchors through
  `anchorHref(ANCHORS.x, path?)`. Never a literal `"/#raid"`.
- **Strings** go through `t(lang)`; nav labels through `tNav(lang)`. Add RU to the
  dictionary in `lib/i18n.ts` — never hard-code a translation in a component.
- **Registry keys**: shared blocks are plain (`columns`, `adSlot`), game blocks are
  `<game>.<name>` (`wow.hero`). Keys are the `type` in page configs and the URL in
  the gallery (`/dev/blocks/wow.hero`).
- **Styling**: `app/globals.css` is only an ordered `@import` index. Each legacy
  block's rules live in a partial next to it (`hero/hero.css`, `guides/guides.css`…);
  shared primitives, layout, responsive and database/library rules live in
  `app/styles/*.css`. Keep the import order — it is the cascade. New blocks use
  Tailwind utilities on the Gildra tokens (`bg-[var(--panel)]`) or a co-located CSS
  module (`components/league/league.module.css`). Never rename an existing class:
  `Reveal.tsx` and `scroll-margin-top` rules key on them.
- **Responsive**: `.section` and `.cards-row` are query containers
  (`container-type: inline-size`). Prefer `@container (max-width: 680px)` over
  `@media (max-width: 720px)` for block-level compaction so a block adapts to the
  column it is placed in (mythicMeta and adSlot already do; see
  `app/styles/primitives.css` and `adSlot/adSlot.css`). Page-level rules
  (hero, section nav, tier workspace) stay in `app/styles/responsive.css`.
  Note: query containers get layout containment, so a block's outer margins no
  longer collapse through `.section` — visible only when a block is rendered
  alone (the gallery), never on real pages (verified 0 px).

## Add a block (4 steps)

1. Copy `components/blocks/_template/` to `components/blocks/<game|shared>/<name>/`,
   rename `Example*`, fill `schema.ts`, `data.ts`, `demo.ts`.
2. Register it in `lib/blocks/registry.ts` (`"<game>.<name>": <name>Block`).
3. Place it in a page config: `{ type: "<game>.<name>", props: {…} }`.
4. Verify: `npm run typecheck && npm run build`, open `/dev/blocks/<type>` at
   1440/768/390, `npm run design:capture -- --deterministic` +
   `npm run design:compare <baseline> <run>` for routes you touched.

Container blocks (`container`, `columns`) take `children: BlockInstance[]`; the
type system rejects `children` on anything else and rejects unknown props.

## Add a page (3 steps)

1. Create `lib/games/<slug>/pages/<page>.ts`:

   ```ts
   export const tierListsPage = definePage({
     game: "wow",
     path: () => "/tier-lists",
     meta: ({ lang }) => ({ title: lang === "ru" ? "…" : "Mythic+ Tier List — Gildra" }),
     page: () => ({ id: "wow/tier-lists", game: "wow", path: "/tier-lists", layout: "default",
       blocks: [{ type: "sectionNav", props: { linkToHome: true, active: ANCHORS.tierPreview } }, …] }),
   });
   ```

   Dynamic routes add `path: ({ slug }) => …`, `load` (call `notFound()` for missing
   entities; it runs once per request and is shared with metadata) and `staticParams`.
2. Add the route wrappers — EN and RU:

   ```ts
   // app/tier-lists/page.tsx            // app/ru/tier-lists/page.tsx
   import { tierListsPage } from "@/lib/games/wow/pages/tier-lists";
   export const generateMetadata = tierListsPage.en.generateMetadata;   // .ru
   export default tierListsPage.en.Page;                                // .ru
   ```

   Segment config (`export const revalidate = 3600`) stays in the wrapper.
3. Add the route to `scripts/capture-design.mjs` ROUTES and to the sitemap.

Interactive "app" pages (tier workspace, database) keep their dedicated component
and wrap it in `PageShell` — they do not need to become block pages.

## Add a game (6 steps)

1. `lib/games/registry.ts`: add the slug to `GameSlug` and `GAME_ORDER`, add a
   `GameDefinition` (`prefix: "/<slug>"`, `status: "beta"`, nav tasks, footer, legal,
   seo, optional `theme` overrides for `--gold`/`--blue`…).
2. `components/Icons.tsx`: add `<symbol id="gm-<slug>">`.
3. `lib/games/<slug>/client.ts`: adapter with a search index over real destinations
   (register it in `lib/games/adapter.ts`); `assets.ts`/`api.ts` as needed.
4. `lib/games/<slug>/pages/home.ts` with `definePage`, and blocks under
   `components/blocks/<slug>/`.
5. `app/<slug>/page.tsx` + `app/ru/<slug>/page.tsx` wrappers.
6. `lib/i18n.ts`: RU strings for the new nav tasks, tagline and legal notice.

The switcher, Explore menu, search, footer and hreflang pick the game up from the
registry automatically. URLs compose as `[/ru]` + `prefix` + path; never create
`app/[game]` (it collides with `app/[key]/route.ts`).

Reference implementation: League of Legends — `lib/games/league-of-legends/`
(`api.ts`, `client.ts`, `sitemap.ts`, `pages/{home,champion,content}.ts`) and
`components/blocks/league-of-legends/*`. Its pages set `legacyLocaleQuery: true`,
so old `?locale=ru_RU` links 308 to `/ru/…`. Wide game columns are a game block
(`lol.main`), not `.section`; the game's ground colour comes from `theme` in the
registry (applied as CSS variables on `.app`).

## Payload CMS overrides

Editors can replace a page's block list without a deploy. In the CMS
(`cms/`, collection **Pages**) create a document whose `slug` is the page id
(`wow/home`, `wow/tier-lists`, `league-of-legends/home`…) and put a
`BlockInstance[]` JSON into `blocks`, e.g.

```json
[
  { "type": "wow.hero" },
  { "type": "sectionNav" },
  { "type": "container", "children": [
    { "type": "wow.metaPulse" },
    { "type": "columns", "props": { "layout": "meta", "id": "meta", "anchor": "Meta" },
      "children": [{ "type": "wow.mythicMeta" }, { "type": "wow.metaTrends" }] },
    { "type": "adSlot" },
    { "type": "wow.raidFeature" },
    { "type": "wow.guides" },
    { "type": "wow.tierPreview" }
  ]}
]
```

`lib/cms/pages.ts` fetches `CMS_INTERNAL_URL/api/pages?where[slug][equals]=<id>`
(published documents only, cached 60 s) and validates the JSON against the
registry: unknown block types, non-object props or `children` on a
non-container make the whole override invalid and the TS config renders
instead. Drafts are ignored; `layout` may switch between `default` and `bare`.
Unset `CMS_INTERNAL_URL` to disable CMS lookups (local dev without the CMS).
Block types available to editors are exactly the registry keys listed by
`/dev/blocks/manifest`.

## Sitemaps

`/sitemaps/static` is generated from `liveGames()` × `game.locales` ×
`lib/games/<slug>/sitemap.ts#staticPaths` with hreflang alternates. Per-game dynamic
sitemaps (`app/sitemaps/league-of-legends/route.ts`) are listed in
`app/sitemap.xml/route.ts`.

## Verification gate

```
npm run typecheck && NEXT_DIST_DIR=.next-blocks npm run build
npm run start   # or a prod-like server on :3000
npm run design:capture -- --deterministic --out .artifacts/design/<run>
npm run design:compare .artifacts/design/baseline .artifacts/design/<run>
npm run design:capture -- --deterministic --blocks --out .artifacts/design/<run>-blocks   # needs GILDRA_DEV_GALLERY=1 in prod builds
```

`--deterministic` disables motion and pre-accepts the cookie notice; the compare
step fails on any differing pixel or horizontal overflow (design.md §I).
