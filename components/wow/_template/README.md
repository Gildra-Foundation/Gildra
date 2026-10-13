# Feature module template (components/wow/_template)

`npm run new:feature -- <name>` copies this folder to `components/wow/<name>/`
with the names replaced. A feature module is one section of the site (raids,
lairs, delves…) and follows one contract:

- **Public surface:** `index.ts` exports what routes use (the page component).
  Routes in `app/` import from `@/components/wow/<name>`; other features never
  import a feature's insides (ESLint `no-restricted-imports`) — shared pieces
  live in `components/wow/shared`, the kit in `components/atlas`.
- **Page:** `<Name>Page` takes `locale: "en" | "ru"` and renders
  `AtlasFrame scene=…` (a scene of `lib/atlas/scenes.ts`) → `AtlasHero` →
  `AtlasSection`s. No header or footer: the toolbar and the legal line are global.
- **Copy:** every string in `<name>Copy.ts` (`en` and `ru` with the same keys;
  game terms stay English).
- **Styles:** `<name>.module.css` on `--atlas-*` tokens only (`npm run atlas:check`).
- **Data:** game data through `@/lib/data/wow` on the server; never invent data —
  unverified sections stay honest (`AtlasNotice`, `AtlasEmpty`).
- **Routes:** `npm run new:page -- <path> <name>` writes `app/<path>/page.tsx`
  and its `app/ru/<path>/page.tsx` mirror (`npm run routes:check` keeps them paired);
  `npm run new:og -- <path> <kind>` adds the link-preview images.
