# Voidspire icon frames and enemy map — local review ready

Verified 2026-10-29 14:04:34 UTC. No commit, push or deployment was requested or performed.

Worktree: `/home/debian/Gildra-voidspire-mob-map-20261029`, branch `fix/voidspire-mob-map-20261029`, based on `6f4f209d45361d5b68d2b4e02735abc449c51b1e` (latest documented live web source).

## Result

- Removed the extra square border layer around Voidspire enemy, spell and role icons. Existing round medallions and visible keyboard focus remain.
- Added a floor-aware enemy layer with 407 original observed coordinate samples for 15 NPC records: 391 samples on `16340-0`, 16 on `16340-1`. Each point uses its exact source percentages, with no jitter, averaging or fabricated packs. The NPC filter highlights locations, points select an NPC, and known NPCs select their reviewed pull. The overlay can be hidden. Overview pull changes preserve zoom; boss phase sketches keep their existing scope.
- Floor positions are displayed only on the matching original raid map. Arena images use a different coordinate system and receive no floor points.
- Corrected raid Celestial Behemoth from open-world NPC `256598` to raid NPC `252070`, replaced the three unrelated abilities with Cosmic Injection (`1259291`) and Celestial Zone (`1259328`), and connected the two original game icons. Names checked in EN/RU. All selected abilities for the eight published trash NPC records were rechecked against their source spell lists.

## Data limits

The dots are observations, not a simultaneous enemy population, guaranteed spawn positions, fixed packs or a patrol path. The examined source returned no positions for Blinky, Voidlight Everdawn and Gladius Slauros; their existing text directions remain. No marker was invented. The layer does not claim complete trash coverage. Full provenance and per-NPC URLs: `apps/web/data/wow/raid-enemies/SOURCE.md`; fetched-source excerpts and hashes: `/home/debian/gildra-voidspire-mob-map-20261029/source-check/`.

## Verification

- Full TypeScript passed; two production builds passed (first 2m23s, final incremental 32.1s). Final code built before browser validation.
- Scoped ESLint: zero errors or warnings. Atlas: 119 strict stylesheets pass. Valyro integrity and its 8 tests pass. Existing raid suite plus three meaningful data regression tests: 19/19 pass.
- Production browser matrix on loopback `127.0.0.1:3220`: 32 groups, 80 selected states. Overview: EN/RU at 1440, 768, 390 and 320 px, seven pulls each; all six boss pages: EN/RU at 1440 and 390 px. Zero measured document overflow, page errors or broken loaded planner images.
- Verified actual dot/image geometry, floor separation, no floor dots on arena backgrounds, NPC selection by pointer and keyboard, Escape/focus, correct source links, overlay visibility, zoom preservation, keyboard sketching, persistence on reload, clear, all four themes, reduced motion and forced colours. Four scoped axe audits (EN/RU ×1440/390): zero violations. Sixteen preference groups pass.
- React Doctor: 93/100; no errors, one maintainability warning for the existing combined map-rendering function `RaidPullMap`. The two new default-array warnings were fixed. No dependency or vendor-source changes.
- Initial developer-only SVG title hydration warning was fixed by rendering one complete string. The first draft QA stalled waiting for offscreen lazy images; readiness now waits for completed images, and the final production matrix passed. Partial developer evidence is retained separately.

## Artifacts and next action

- Browser evidence: `/home/debian/gildra-voidspire-mob-map-20261029/browser-report.json` and `browser.log`.
- Preview images: `/home/debian/gildra-voidspire-mob-map-20261029/preview-map-ru-390.png`, `preview-icons-en-1440.png`.
- Source ability review: `/home/debian/gildra-voidspire-mob-map-20261029/source-review.json`.
- Build, lint, typecheck and tool logs: worktree `.artifacts/logs/`.
- Changes remain uncommitted for review. Production services and databases were not changed. Publish only on the user's explicit request, rebasing or preserving any newer web source first.
