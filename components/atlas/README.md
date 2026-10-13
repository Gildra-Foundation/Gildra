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
   At most ~5 sections; no section repeats the hero or another section; long
   secondary detail goes into `AtlasDisclosure` (see design.md, "Без перегрузки").
6. **Copy lives apart from markup** (e.g. `components/wow/lairs/lairsCopy.ts`),
   RU and EN side by side. Game terms (boss, zone, item, spell names) stay English.

## Page skeleton

```tsx
<AtlasFrame lang={locale} art="/assets/…/background.webp">
  <AtlasHero breadcrumbs={…} eyebrow="Midnight · Season 2"
             title="…" lede="…" stats={[{ value: 5, label: "raids" }]} />
  <AtlasSection id="list" title="…" description="…">
    <AtlasGrid min={280} fit>{items.map((item) => <AtlasCard … />)}</AtlasGrid>
  </AtlasSection>
</AtlasFrame>
```

## Components

| Component | Use for | Key props |
| --- | --- | --- |
| `AtlasFrame` | Page wrapper (`artLayer`: a living layer over the scene that settles and drifts with the art, e.g. the Voidspire `VoidEye` shader; it also mounts `AtlasPointerLight`): atmosphere art behind the hero fading into the solid body, 1540 px column, slim legal footer with the "Less motion" switch (`AtlasMotionToggle`, lib/client/motionPreference.ts). Put the page's main artwork here, not in a framed box; every page gets a scene (`public/assets/wow/loading/*` for sections without their own art). The atmosphere is alive — the art settles in and drifts, the torchlight breathes, embers rise (CSS only, off under reduced motion); `still` turns it off on work surfaces | `scene` (a section of `lib/atlas/scenes.ts`: art, crop, shade, tint), or `art`, `artPosition`, `artShade` (`deep` for bright art), `tint` for entity art; `still`, `artLayer`, `as`, `lang`, `dataAttributes`, `footer` |
| `AtlasHero` | The page `h1` on the page artwork (open by default; `align="center"` for section hubs — a chapter title page with an ornament, counters below; detail pages stay left-aligned): eyebrow only for real context (season, kind · zone — never "World of Warcraft"), lede, counters as a quiet row. `emblem` only for an identity image (spec icon, item icon), never a decorative glyph | `title`, `eyebrow`, `lede`, `emblem`, `stats`, `breadcrumbs`, `actions`, `toolbar`, `aside`, `variant` |
| `AtlasStats` | Row of headline counters (used inside the hero) | `items: {value, label}[]` |
| `AtlasSection` | Titled block of the body (`h2`) | `id`, `title`, `eyebrow`, `description`, `aside`, `level` |
| `AtlasAnchorNav` | Sticky in-page chapter links with counts; the chapter in view is marked (`aria-current`, `AtlasAnchorSpy`) and kept visible in the phone strip | `items: {href, label, count}[]`, `label` |
| `AtlasGrid` | Responsive card grid | `min` (px), `fit`, `gap` |
| `AtlasTile` | Compact icon link: quick access, next steps, catalogues without artwork. An ordered list uses `index` (amber order number) instead of the same icon on every tile | `href`, `icon`, `title`, `text`, `index` |
| `AtlasCountUp` | Client: a plain number in `AtlasStats` counts up when its page arrives through in-site navigation (never on a first load); the final value holds the width | used automatically for numeric stats |
| `AtlasPointerLight` | Client, one per page: torchlight under the cursor for `data-spotlight` elements (cards, tiles, path steps, class rows: a pool of light in the entry's colour and a lit stretch of the frame) and a gentle tilt for `data-tilt` (`AtlasCard tilt` — boss portraits). Fine pointers only | mounted by `AtlasFrame` |
| `AtlasPath` | An ordered journey through illustrated steps (raid encounters in order): numbered seals on one spine, artwork alternating sides, steps slide in from their side on scroll | `steps` (`href`, `title`, `image`, `description`, `meta`, `cta`), `label` |
| `AtlasDisclosure` | Folding detail (`<details>`): long secondary notes stay in the page but closed — prefer it to deleting real content | `summary`, `open` |
| `AtlasCard` | Illustrated link card (raid, dungeon, boss); `layout="feature"` for the wide highlighted entry | `href`, `title`, `image`, `eyebrow`, `subtitle`, `description`, `meta`, `cta` (accessible name of the arrow), `artBadge`, `artCaption`, `accent`, `artRatio`. No numbering, no badge that repeats the section title, no caption that is the same on every card |
| `AtlasPanel` | Framed surface; never nest panels | `tone: default \| raised \| highlight`, `padding` |
| `AtlasMetaList` | Labelled facts grid (zone, group, reward) | `items: {label, value, icon}[]`, `columns` |
| `AtlasBadge` | Short uppercase label | `tone: accent \| neutral \| positive \| negative \| info \| caution`, `icon` |
| `AtlasButton` / `AtlasLinkButton` | Actions | `variant: primary \| secondary \| ghost`, `size`, `icon`, `iconAfter`, `external` |
| `AtlasNotice` | Status line for drafts, fixtures, missing data | `title`, `tone: info \| caution`, `action` |
| `AtlasBreadcrumbs` | Trail (also built into the hero) | `items: {label, href}[]` |
| `AtlasEmblem` | Seal with an icon | `shape: circle \| diamond \| square`, `size` |
| `AtlasTable` | Data table on tokens: sticky header, numeric columns, row headers; `layout="cards"` turns each row into a labelled card on phones (short tables), `scroll` keeps a horizontal scroll | `columns: {key, header, label, cell, rowHeader, numeric}[]`, `rows`, `rowKey`, `label`, `caption`, `layout`, `maxWidth` |
| `AtlasTabs` | Client: ARIA tabs (arrows, Home/End), panels kept in the page | `tabs`, `label`, `defaultTab`, `variant: underline \| segmented`, `onChange` |
| `AtlasField` + `AtlasInput` / `AtlasSelect` / `AtlasCheckbox` / `AtlasRange` | Native form controls (work in plain GET forms and server components); `AtlasField` adds label, hint and error | `label`, `hint`, `error`, `htmlFor`; `AtlasInput icon` |
| `AtlasTooltip` | Client: short hover/focus explanation tied by `aria-describedby` | `content`, `placement: top \| bottom`, `focusable` |
| `AtlasEmpty` / `AtlasError` / `AtlasSkeleton` | Honest states: nothing yet (`role=status`), failure with a code (`role=alert`), loading with the torchlight sweep | `title`, children, `action`; `actions`, `code`; `variant: lines \| cards \| rows`, `count`, `label` |
| `AtlasDialog` | Client modal on the native `<dialog>` (focus trap, Esc, focus return, backdrop click); `variant="sheet"` rises from the bottom on phones | `open`, `onClose`, `label`, `variant` |
| `AtlasToast` | Client: short confirmation at the bottom of the screen (`role=status`), hides itself after `duration` | `message` (null hides), `onDone`, `tone: default \| negative`, `duration` |
| `AtlasShareButton` | Client: "Share" for entity pages — the system share sheet on touch devices, otherwise copies the page link and confirms with `AtlasToast` | `title`, `locale` |
| `AtlasArtGlow` | Client: living light on points of a scene painting (lava, crystals), placed with the cover-crop maths; AtlasFrame renders it from the scene registry `glow`; hidden under reduced or less motion | `imageSize`, `focus`, `points: {at, radius, color, tempo}[]` |
| `AtlasPagination` | Paging of a list: quiet "previous", primary "next" / "show more", optional status; plain links (work without JS, the route runtime still animates) | `label`, `prev`, `next` (`href`, `label`, `attributes`), `status` |
| `AtlasChart` | Horizontal bar chart in plain HTML (reads as a list, no library); bars scaled to the largest value, grow in on scroll; rows can link | `data: {key, label, value, display, href}[]`, `label`, `max`, `unit` |

Helpers (`components/atlas/format.ts`): `formatAtlasDate(iso, locale)`, `formatSeason("Midnight Season 2", locale)`, `pluralRu(n, one, few, many)`.

## Typography and icons

Type roles (tokens in `app/styles/atlas-theme.css`; never a raw size):

| Role | Token | Font | Used for |
|---|---|---|---|
| Hero | `--atlas-text-hero` | display, `--atlas-weight-display-hero` | page `h1` (AtlasHero) |
| Section | `--atlas-text-h2` | display | AtlasSection `h2` |
| Card / sub-section | `--atlas-text-h3`, `--atlas-text-title` | display | card and step titles, `h3` |
| Lead | `--atlas-text-lead` | UI | hero lede, intro paragraphs |
| Body | `--atlas-text-body` | UI | running text, tables |
| Small / meta | `--atlas-text-small`, `--atlas-text-meta` | UI | captions, facts, footers |
| Label | `--atlas-text-label` (≥ 11 px) | UI, uppercase, `--atlas-tracking-label` | eyebrows, breadcrumbs, table heads |
| Stat | `--atlas-text-stat` | display, lining figures | counters |

Reading: one line of prose is `--atlas-measure` (`--atlas-measure-wide` for longer notes);
paragraphs and list items on atlas pages hyphenate (`hyphens: auto`, the page `lang` comes
from AtlasFrame) and avoid one-word last lines (`text-wrap: pretty`); headings never hyphenate
and balance their lines. Text set on artwork carries `--atlas-text-halo`.

Icons: interface icons are lucide-react (16 px in buttons, 18 px in tiles and CTAs, 14 px inline),
always `aria-hidden` next to a text label, or the control carries the name. Game icons (specs,
classes, abilities, items) come only from `lib/games/wow/assets.ts` (`specIcon`, `classIcon`,
`abilityIcon`) — ESLint rejects hard-coded `/assets/{specs,classes,abilities}/…` paths in
components and routes. No emoji and no decorative glyph emblems; `AtlasEmblem` holds an
identity image only.

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
