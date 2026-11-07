# Forever raids and dungeons — 2026-11-06

Local work on the existing portal worktree at fb8ea772. No commit, push or deployment.

## Pages
- /wow/forever/raids and /ru/wow/forever/raids: Barrow Deeps, Hyjal Summit, Onyxia’s Lair; level, group size, boss count, location; scheduled opening 9 December 2026; Onyxia amulet requirement.
- /wow/forever/dungeons and /ru/wow/forever/dungeons: nine new dungeons with official level bands and locations, nineteen returning instances grouped by instance with recommended ranges.
- Forever home, desktop tabs, mobile menu and footer link to the new pages. Retail links/picks are not used for Forever. Sources and data choices: INSTANCES.md.

Uses existing AtlasFrame/hero/grid/meta/disclosure/table and two material kits. No new raster assets or invented bosses, loot, maps, timers, affixes, or Mythic+ mode. Full boss tactics are outside this overview.

## Checks
- TypeScript initial pass, scoped lint, atlas145, test:atlas16 files, Valyro and locale mirrors32 pass.
- Development Chromium: both pages EN/RU at320/390/1440; counts, canonical, navigation, locale switching, touch menu, themes, forced colors/reduced motion; zero pageerrors/overflow. Screenshots inspected.
- Clean UI: only the one permitted Sources disclosure per page flagged by the text heuristic.
- Concurrent Next dev/build generated a broken temporary type validator; stopped dev and repeated production build without concurrent generators.
- Final production build/browser/reference checks recorded below after completion.

## Next
Owner review and publication only upon explicit request. Review raid unlock date at opening. Preserve pre-existing portal edits and independently prepared NAV work when integrating.

Final checks: production build PASS (639 static pages); production Chromium 12 page/layout/locale combinations PASS including shared AtlasTable; design:lock12 reference cases PASS; scoped lint and source TypeScript PASS. Final screenshots reviewed. Local dev/production servers stopped. No publication.
