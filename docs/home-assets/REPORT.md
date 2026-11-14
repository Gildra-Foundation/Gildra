# HOME — Arthas and Icecrown grimoire

Branch feat/home-book-20261108; base cc7d4909. No deployment.

Removed theme picker, alternate epigraphs, character palette/particle rules and fel branches in CanvasPageTransition. Site bootstrap always sets Arthas and never reads obsolete saved values. Removed unused Illidan/Garek backgrounds, old Varok v1 background and six alternate weapon images. Varok v2 stays because login uses it in lib/atlas/scenes.ts. Global unused palette CSS and standalone fel implementation are outside this ownership; they are unreachable via the site theme. Request to integration/HDR: /tmp/mapcoord/HOME-requests.md.

Generated three cover and three folio candidates with built-in imagegen. Packed winners, real alpha, WebP/AVIF, manifest and provenance. Live HTML cover titles; removed cover-opening hint and repeated eyebrow. Removed per-letter ink clipping that cut Preciosa swashes. Kept snow, ice transition and book interactions. Small phones use the existing compact contents layout (page width capped at 340px).

## Assets and loading

Cover AVIF bytes at 320/640/1024: before 33,705 / 138,779 / 295,081; after 11,190 / 32,520 / 70,786. Desktop previously fetched 2,703,505-byte PNG folio; now 126,850-byte WebP, loaded only on intent/open. Existing optimized legacy folio (69,932 bytes) remains for other consumers, not used by home book.

Observed BEFORE dev-server LCP, no throttling: before 1440 RU 15,316ms / EN 5,480ms, 390 RU 1,500ms; final local production AFTER: 1440 RU 920ms / EN 680ms, 390 RU 444ms. BEFORE includes cold route compilation, so this is not evidence of a production speedup. Before and after use different server modes; recheck comparable production builds during integration. Final main verification uses Chromium DPR2, reduced motion. No horizontal overflow or page errors in six home viewports; focus returns after Escape on desktop/phone. Latest metrics: /tmp/home/verification.json. 60fps NOT confirmed: local production RAF sample /tmp/home/motion.json has desktop median 83.3ms / p95 250ms and phone median 16.7ms / p95 116.7ms under concurrent headless tests on the shared host. Opening/closing still uses the existing transform/opacity animation. A controlled A/B and physical-device check remain required.

## Validation and evidence

- test:atlas: 778 passed, 0 failed; atlas:check: 163 strict stylesheets.
- Site-theme regression test passes for Arthas, all three legacy preferences, invalid preference and blocked/unavailable storage.
- ESLint changed source files: 0 errors/warnings. npx tsc --noEmit -p apps/web passed; valyro:check 8/8 passed. Full production build passed (exit 0), including all 1499 static pages. Log: /tmp/home/build-final.log. Initial build process was terminated with SIGTERM during SSG; repeat completed successfully.
- clean-ui-audit: EN/RU zero suspicious nodes. Removed visible redundant eyebrow and open-cover explanatory hint; no new service prose.
- Screenshots /tmp/home/before-{1440-ru,1440-en,390-ru}.png and /tmp/home/after-{1440-ru,1440-en,1920-ru,1280-ru,768-ru,390-ru}.png. Open spread /tmp/home/open-book.png; held /tmp/home/held-book.png; phone /tmp/home/phone-modal.png and phone-companion-viewport.png; proofs /tmp/home/proof/.
- Normal-motion phone: opening → open, companion tab, Escape → closed pass (/tmp/home/phone-check.log). Desktop lift reached held modal (screenshot reviewed).

## Coordinator phone review — 2026-11-08

The phone modal now shows a complete framed leaf (including the whole hinge) in a centred scroll slot, using two crops of the accepted native folio. Its opaque background obscures the site header. The modal has its own top bar and a 48×48 close control with a 32px glyph. The page and pager form one compact group inside 390×844; smaller screens scroll content within the paper. Desktop cover and spread sources are unchanged.

The old meta timeout was caused by rewriting the request into a force-static view while the loader awaits connection(). Meta now stays on its existing public dynamic route; the API payload retains revalidate900. Other cached views and internal URL guards are unchanged. Added EN/RU rewrite regression. design-lock.cjs accepts --timeout (default90000) for a longer diagnostic navigation limit.

Final validation: production build exit0, TypeScript passed; ESLint0; atlas:check163; test:atlas778/0. `npm run design:lock -- --base http://127.0.0.1:3134 --timeout 300000` PASS, all12 cases200/console0/overflow0/style identical. Read-only API_INTERNAL_URL=https://gildra.net/api supplied during local build/start. Log /tmp/home/design-lock-review-prod.log. No deployment, backend or database changes.

`node apps/web/scripts/qa-home-phone.mjs` PASS: ten page states across390 RU/EN,320 RU,768 RU and390 RU normal motion. Checks cover loaded images, full leaf within viewport, centring, close hit target and top-bar containment, opaque background, compact pager, Escape and restored focus; no page errors. Artifacts /tmp/home/phone-review-final/report.json; 390 screenshots: 390-ru-reduce-contents.png, 390-ru-reduce-companion.png, 390-en-reduce-contents.png, 390-en-reduce-companion.png (same directory). All screenshot files are viewport captures at DPR2.

## Open integration risks

Earlier design-lock failure is resolved by the meta routing fix and production-mode verification. The prior shared-host RAF result did not establish stable60fps on physical devices; no new performance claim is made in this layout review. Source notes and /tmp/mapcoord/HOME-requests.md are available for integration.
