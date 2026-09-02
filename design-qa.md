# Design QA — Champion skill path block

## Evidence

- Source visual truth: `/home/debian/.codex/attachments/7d265ecf-fc7c-448d-b8c3-655d36b77c8b/codex-clipboard-c4e71173-ec51-40e8-a7c1-db69ecc3fb47.png`.
- Source pixels: 2072 × 504 px.
- Browser-rendered desktop page: `/home/debian/Gildra-integrated/artifacts/skill-path/skill-path-desktop.png`.
- Desktop viewport: 1600 × 900 CSS px, device scale factor 1.
- Focused desktop implementation: `/home/debian/Gildra-integrated/artifacts/skill-path/skill-path-desktop-focus.png` (1324 × 373 px).
- Browser-rendered mobile page: `/home/debian/Gildra-integrated/artifacts/skill-path/skill-path-mobile.png`.
- Mobile viewport: 390 × 844 CSS px, device scale factor 1.
- Full/focused side-by-side comparison: `/home/debian/Gildra-integrated/artifacts/skill-path/skill-path-comparison.png`.
- Density normalization: the 2072 × 504 source was proportionally normalized to 1324 × 322 px; the implementation stayed at its native 1324 × 373 px. The remaining height difference is caused by the intentional no-statistics status panel.
- State: Russian Karthus detail page, demo skill plan Q → E → W, levels 1–18, no statistics provider connected.

## Findings

No actionable P0, P1, or P2 differences remain.

- Fonts and typography: the source hierarchy is preserved through Gildra's existing Chakra Petch/Inter system. Headings, muted explanatory copy, level numbers, and ability labels remain legible at both tested viewports.
- Spacing and layout rhythm: the desktop panel retains the source's split priority/path composition, five aligned ability rows, and 18-cell rhythm. The mobile variant stacks priority over the grid and keeps horizontal scrolling inside the grid instead of expanding the page.
- Colors and visual tokens: dark indigo panels, near-black ability labels, muted empty cells, and electric-blue selected cells closely track the reference while remaining consistent with the established League catalog theme.
- Image quality and asset fidelity: all visible ability artwork is loaded from the existing official League media catalog. Eight rendered image instances loaded successfully; no placeholders, emoji, CSS drawings, or handcrafted replacement assets are used.
- Copy and content: ability names come from the localized champion record. Because no build-statistics source exists yet, the win rate and match count from the reference were deliberately not copied; the replacement copy clearly labels the state as a demo and says that a statistics source is pending.
- Icons: priority connectors use the installed Lucide icon family; ability artwork and slot badges are aligned consistently with the reference.
- States and interactions: all 18 selected level cells are present. The mobile grid was scrolled programmatically and changed scroll position successfully. Browser console errors: 0.
- Responsiveness and accessibility: desktop and mobile page overflow are both 0 px. Mobile grid overflow is contained (691 px) and scrollable. The grid has row/grid-cell semantics, selected state is exposed with `aria-selected`, and all priority images have accessible names.

## Comparison history

1. Initial browser pass found a P2 desktop density issue: the minimum grid width caused level 18 to be partially clipped inside the horizontal scroller.
2. The grid minimum width and cell constraints were reduced while preserving the 18-column structure.
3. Post-fix evidence in `skill-path-desktop-focus.png` shows all levels 1–18 completely visible at 1600 px. The mobile capture confirms labels remain visible at the initial scroll position and the grid still scrolls independently.

## Verification

- TypeScript check passed.
- Optimized Next.js production build passed.
- Desktop and mobile browser captures passed.
- Official ability images loaded: passed.
- Selected level cells: 18.
- Desktop/mobile page overflow: 0 px.
- Mobile grid scroll behavior: passed.
- Browser console errors: 0.

final result: passed
