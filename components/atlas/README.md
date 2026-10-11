# Atlas UI kit

Building blocks of every inner page of gildra.net (everything except the
landing scene and the contents book). Server components, no client JS, styled
only through the tokens in [`app/styles/atlas-theme.css`](../../app/styles/atlas-theme.css).

```tsx
import { AtlasFrame, AtlasHero, AtlasSection, AtlasCard, AtlasGrid } from "@/components/atlas";
```

## Rules

1. **Tokens only.** Page and component CSS uses `var(--atlas-*)`. No hex colours,
   no font names, no raw `px` font sizes. `npm run atlas:check` fails otherwise.
2. **One amber.** Chrome (borders, links, buttons, eyebrows, counters) is amber.
   Class, role, item-quality and status colours are allowed only on the data they
   describe; an entry's illustration colour goes into `accent` (it tints only the
   eyebrow icon and the hover glow).
3. **Readable sizes.** The smallest text is `--atlas-text-label` (11 px, uppercase
   labels). Body copy is `--atlas-text-body` (15 px), meta text `--atlas-text-meta` (12 px).
4. **Honest data.** Counters and badges show only real numbers. Fixtures and drafts
   carry an `AtlasNotice`.
5. **Page = frame + hero + sections.** Page-specific CSS describes layout only.
6. **Copy lives apart from markup** (e.g. `components/wow/lairs/lairsCopy.ts`),
   RU and EN side by side. Game terms (boss, zone, item, spell names) stay English.

## Page skeleton

```tsx
<AtlasFrame lang={locale} art="/assets/…/background.webp">
  <AtlasHero breadcrumbs={…} emblem={<Skull />} eyebrow="World of Warcraft · Midnight"
             title="…" lede="…" stats={[{ value: 5, label: "raids" }]} />
  <AtlasSection id="list" title="…" description="…">
    <AtlasGrid min={280} fit>{items.map((item) => <AtlasCard … />)}</AtlasGrid>
  </AtlasSection>
</AtlasFrame>
```

## Components

| Component | Use for | Key props |
| --- | --- | --- |
| `AtlasFrame` | Page wrapper: atmosphere art fading into the solid body, 1540 px column, slim legal footer | `art`, `artPosition`, `tint`, `as`, `lang`, `dataAttributes`, `footer` |
| `AtlasHero` | The page `h1` with emblem, eyebrow, lede, counters or an aside | `title`, `eyebrow`, `lede`, `emblem`, `emblemShape`, `stats`, `breadcrumbs`, `actions`, `toolbar`, `aside`, `variant` |
| `AtlasStats` | Row of headline counters (used inside the hero) | `items: {value, label}[]` |
| `AtlasSection` | Titled block of the body (`h2`) | `id`, `title`, `eyebrow`, `description`, `aside`, `level` |
| `AtlasAnchorNav` | Sticky in-page chapter links with counts | `items: {href, label, count}[]`, `label` |
| `AtlasGrid` | Responsive card grid | `min` (px), `fit`, `gap` |
| `AtlasTile` | Compact icon link: quick access, next steps, catalogues without artwork | `href`, `icon`, `title`, `text`, `index` |
| `AtlasLocaleSwitch` | EN / RU switch (put it in the hero `toolbar`) | `locale`, `path` |
| `AtlasCard` | Illustrated link card (raid, dungeon, boss); `layout="feature"` for the wide highlighted entry | `href`, `title`, `image`, `eyebrow`, `subtitle`, `description`, `meta`, `cta`, `artBadge`, `artCaption`, `index`, `accent`, `artRatio` |
| `AtlasPanel` | Framed surface; never nest panels | `tone: default \| raised \| highlight`, `padding` |
| `AtlasMetaList` | Labelled facts grid (zone, group, reward) | `items: {label, value, icon}[]`, `columns` |
| `AtlasBadge` | Short uppercase label | `tone: accent \| neutral \| positive \| negative \| info \| caution`, `icon` |
| `AtlasButton` / `AtlasLinkButton` | Actions | `variant: primary \| secondary \| ghost`, `size`, `icon`, `iconAfter`, `external` |
| `AtlasNotice` | Status line for drafts, fixtures, missing data | `title`, `tone: info \| caution`, `action` |
| `AtlasBreadcrumbs` | Trail (also built into the hero) | `items: {label, href}[]` |
| `AtlasEmblem` | Seal with an icon | `shape: circle \| diamond \| square`, `size` |

Helpers (`components/atlas/format.ts`): `formatAtlasDate(iso, locale)`, `formatSeason("Midnight Season 2", locale)`, `pluralRu(n, one, few, many)`.

## Changing the look

- Whole theme: edit the token block in `app/styles/atlas-theme.css`
  (e.g. `--atlas-accent` recolours every link, button and counter; `--atlas-font-display`
  swaps every heading; `--atlas-text-*` rescales type).
- One component: edit its `*.module.css` next to the `.tsx`.
- One page: edit that page's module (layout only).

Examples: `components/wow/lairs/` (hub + boss guide), `components/wow/raid/RaidAtlasPage.tsx`,
`components/wow/mythic/MythicAtlasPage.tsx` + `DungeonCardGrid.tsx`, `components/wow/home/WowHome.tsx`,
`components/wow/identity/IdentityStatusPage.tsx`, `components/database/DatabaseHub.tsx`,
`components/platform/search/SearchPage.tsx`, `components/blocks/wow/tierWorkspace/`.

Candidates for the kit (built locally in pages today): segmented control and styled select
(tier lists, route planner), compact tool button (route planner), data table (tier lists, loot).
