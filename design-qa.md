# Portal concept 1 — design QA

Date: 22 October 2026. Scope: approved homepage and shared navigation, with regression coverage for the existing public pages and CMS. This is implementation of the owner's explicitly selected displayed option 1, not a new concept proposal.

## Source and matched capture

- Selected reference: `/home/zulut/.codex/generated_images/01a162e6-65bb-7a33-87dd-20d4adbea273/exec-11cd524d-da3b-4eb6-9e55-9d58b7c4e1e7.png`.
- Implementation: `.artifacts/portal-v3/home-reference-size.png`.
- Both desktop images:1488×1058, viewport1488×1058, DPR1, Russian homepage, default Arthas, consent dismissed, fonts loaded, motion settled.
- Actual side-by-side comparison: `.artifacts/portal-v3/comparison.png`; focused masthead comparison: `comparison-header.png`. Browser-rendered comparison HTML preserves the two original captures. No density normalization needed.
- Responsive captures: EN320, RU390, RU768, and1440px Illidan/Garek/Varok in `.artifacts/portal-v3/`. Mobile is an adaptation because the approved source only specifies desktop.

## Iterations and resolved findings

1. Replaced the inset editorial layout and numbered menu with the full-width character scene, centered real crest, six direct links, large serif title and continuous illustrated shelf. Consolidated the source's accidental duplicate Raids link; Home remains the central brand link.
2. Corrected heading scale, silver color, hero framing, action widths and navigation baseline. Added real generated metal rail, silver button/divider and individual destination paintings. Optimized raster delivery; the button CSS texture fell from1.53MB to22KB.
3. Replaced the older blurry Arthas artwork with the clean detailed scene derived from the selected reference. Softened the actual rail image to match the source's quiet material.
4. **P2 fixed:** mobile cover initially selected a640px thumbnail for a roughly1360px-wide crop. `<picture>` now supplies the already optimized1774×887 source on narrow screens. Independent browser probes and fresh390/320 captures confirm sharp details, correct currentSrc and no overflow. See `qa-fixed-mobile.json`, `qa-mobile-iteration.png` and the scoped report `.artifacts/portal-v3/design-qa.md`.
5. Fixed the divider's intrinsic aspect ratio and made crest sizes match the desktop/compact rail breakpoints.

## Required visual surfaces

- **Typography:** self-hosted Cormorant Garamond matches the delicate serif portal direction, with proper Cyrillic/Latin coverage. Two-line title, readable smaller copy, no clipping. Inner pages retain Alegreya. Font400 is slightly lighter than the reference (P3).
- **Layout/spacing:**86px desktop rail,64px compact rail, hero ending at828px and208px continuous shelf at the matched viewport. Artwork is edge-to-edge; the original book remains archived. On mobile the hero and three destinations stack with44px controls;320/390/768 widths do not overflow.
- **Colors/materials:** silver text, black steel and icy blue art match the target. Shared theme tokens retain all four character accents. Small over-art text uses the existing dark text halo. No demonstrated contrast blocker in the inspected views; this is not a blanket claim of WCAG certification.
- **Images:** all ornaments and paintings are actual raster assets, with source/provenance in `apps/web/public/assets/gildra/portal/SOURCE.md`. No decorative CSS/SVG substitute. Sharpness, alpha edges and mobile crop were reviewed. Individual crest/destination details vary slightly from the generated mock (P3).
- **Copy/content:** heading, lede and calls to action match the source. Links use real bilingual routes. No fabricated statistics, account characters or content previews.
- **Icons/states:** thin Lucide search/arrow/chevron/menu icons match the source's line treatment. Buttons, menu, current route, focus and hover states are functional; select/popover use actual Valyro primitives.
- **Accessibility/behavior:**50 navigation checks cover keyboard skip, nested Escape/focus restoration, search shortcut, EN/RU routes,320–1487 widths and reduced motion. Theme changes update actual hero and portrait with no user-triggered scroll jump. Native pointer/keyboard tests distinguish Playwright auto-scroll during an entrance animation from application behavior. Evidence: `.artifacts/portal-v3/navigation/`.

## Related validation

157 atlas tests passed;86 bilingual routes and46 generated mirrors passed. CMS candidate593ab088 passed45 authenticated checks in6 EN/RU desktop/mobile cases including320px; no production data was used. Production-candidate audit also found eager kit CSS and hidden destination artwork from automatic card route prefetch. Direct imports (including the common404 boundary), explicit card prefetch=false and preencoded AVIF header artwork address these measured costs without changing the composition. Production-build and resource-budget results are retained in `.artifacts/portal-v3/` during release verification. The homepage remains server-rendered; only interactive navigation/controls are client components.

No open P0/P1/P2 design findings. P3: slight generated-art and serif-weight differences; they preserve the selected composition and do not block use.

final result: passed
