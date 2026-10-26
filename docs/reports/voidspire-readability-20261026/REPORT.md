# The Voidspire — readable controls and continuous environment

The planner's live labels now align with the faces of the existing painted controls. The briefing has a wider reading column, larger text and less unused space inside its heavy frame. The Voidspire role selector uses the same saved preference and manual-role behavior as the Mythic planner.

## Before and after

| Area | Previous behavior | Result |
| --- | --- | --- |
| Pull and mode cards | Number and text anchors followed approximate canvas positions; some labels sat close to the bevel. | Anchors follow independently measured seal and quiet-face geometry. Complete labels wrap inside the face; the mobile rail retains a visible next-card peek. |
| Zoom and navigation | Live plus/minus marks occupied a small badge below the painted magnifier. | Live marks sit in the actual lens, with optical font correction. Four round tools form one row; narrower map panels stack the two readable painted actions below it. |
| Floor selection | Asymmetric padding and the chevron displaced the label. | Balanced padding, an independent chevron lane and a measured vertical correction center the full wrapping label. |
| Briefing | The map column was wider; guidance used smaller type inside a 56px inset. | Columns use a 0.9/1.25 ratio. Guidance is 18px on desktop and 16px on phones, with 32/24px main headings. Safe text insets are 48/32px; frame footprints are 52/36px. |
| Role selection | Raid-local selection used a different control and did not share Mythic's saved manual choice. | Voidspire uses the existing spring-animated, large, full-width `AtlasSegmented` with shared labels and hint. A manual role clears only the saved specialization, then saves the role. Class/profile data remain intact. |
| Page environment | The original wide scene covered the upper page. | A new proportional painting continues the same environment down into terraces and a void ravine. A native scroll timeline reveals the descent; static preference fallbacks remain available. |

## Implementation boundaries

The card, plaque, medallion, panel and seven glyph assets from the preceding material release are unchanged. HTML owns all visible labels, numbers, state and accessible control names. Cards retain their original aspect ratio; no guidance is truncated with ellipses. The narrowest mode label uses compact caption type so the complete Russian label fits its painted face.

`usePullRolePreference` coordinates the existing singleton role and player-profile hooks. Both planners use its manual-selection action. Mythic's profile/spec pickers retain the raw role setter so choosing a specialization does not clear itself; its derived active-role, talent and profile behavior remain intact. The other four raids retain their local role state and previous presentation. Encounter data, spells, routes, floors, arenas and draft warnings are unchanged.

The latest published baseline for release assembly is Frost revision `82207ce9c0b6c7b95ac6dc60229d1467381a734f`, containing the preceding Voidspire, library, 3D and CMS-removal work. The release source freezer requires that full baseline and byte-checks every unrelated file against its frozen 4,524-entry source.

The environment uses the browser's native CSS scroll timeline, following the [Chrome CSS scroll-driven animation documentation](https://developer.chrome.com/docs/css-ui/scroll-driven-animations). Unsupported browsers and reduced-motion/transparency preferences retain a stationary environment; forced colors and print omit the decorative layer.

## New scene provenance

The exact image-edit prompt is copied verbatim to [PROMPT.txt](PROMPT.txt). Public delivery metadata and provenance are in `apps/web/public/assets/wow/raids/voidspire-page/manifest.json` and `SOURCE.md`.

- Built-in `image_gen.imagegen` edit of the existing scene, with an opaque background. The original scene file remains unchanged.
- Untouched native: `/home/debian/gildra-voidspire-readability-20261026/native/scene-extended.png`, 887 × 1,774px, SHA-256 `cfc644a8e1badfa8447e7e26597a24733a89d53166602a6e81952b5e8279cfae`.
- Delivery: `/assets/wow/raids/voidspire-page/scene-extended.webp`, identical dimensions, 204,048 bytes, SHA-256 `881d314d67a7c2c7ff9123485498ed2e27ee301221f64525d11a260c13793b5f`.
- Packing preserves native dimensions and uses WebP quality 84/effort 6. No manual compositing, pixel repair, recoloring, stretching or alpha edits were performed.
- The generator preserves the recognizable upper composition and reinterprets some fine details. The result is not claimed pixel-identical to the original upper scene. New terrain is decorative artwork and does not establish gameplay map or route geometry.

## Verification

Implementation evidence is kept outside the repository in `/home/debian/gildra-voidspire-readability-20261026/`. The implementation-stage checks passed scoped ESLint, Atlas strict stylesheets and React Doctor. A real Chromium check covered all seven Russian/English pull cards at 320, 390, 768, 1,024 and 1,440px in four themes: 40 groups / 280 cards with zero text-bound overflow. Desktop/mobile previews confirmed 18/16px guidance and 32/24px headings, no page overflow and no runtime errors.

Independent QA also exercises shared-role persistence and specialization overrides, map interactions, keyboard input, preferences, scene coverage and actual glyph geometry. Canvas shorthand font measurements cannot represent Alegreya's lining/tabular numeral features; optical numeral verification uses the actual rendered DOM raster. Early harness results remain preserved separately. Final build, candidate/public acceptance, immutable source binding and publication status belong to the external release report; this document does not assert deployment.
