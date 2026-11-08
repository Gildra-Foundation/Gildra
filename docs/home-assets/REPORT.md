# HOME — Arthas and Icecrown grimoire

Branch feat/home-book-20261108; base cc7d4909. No deployment.

Removed theme picker, alternate epigraphs, character palette/particle rules and fel branches in CanvasPageTransition. Site bootstrap always sets Arthas and never reads obsolete saved values. Removed unused Illidan/Garek backgrounds, old Varok v1 background and six alternate weapon images. Varok v2 stays because login uses it in lib/atlas/scenes.ts. Global unused palette CSS and standalone fel implementation are outside this ownership; they are unreachable via the site theme. Request to integration/HDR: /tmp/mapcoord/HOME-requests.md.

Generated three cover and three folio candidates with built-in imagegen. Packed winners, real alpha, WebP/AVIF, manifest and provenance. Live HTML cover titles; removed cover-opening hint and repeated eyebrow. Removed per-letter ink clipping that cut Preciosa swashes. Kept snow, ice transition and book interactions. Small phones use the existing compact contents layout (page width capped at 340px).

## Assets and loading

Cover AVIF bytes at 320/640/1024: before 33,705 / 138,779 / 295,081; after 11,190 / 32,520 / 70,786. Desktop previously fetched 2,703,505-byte PNG folio; now 126,850-byte WebP, loaded only on intent/open. Existing optimized legacy folio (69,932 bytes) remains for other consumers, not used by home book.

Observed dev-server LCP, no throttling: before 1440 RU 15,316ms / EN 5,480ms, 390 RU 1,500ms; after 1440 RU 2356ms / EN 1736ms, 390 RU 764ms. BEFORE includes cold route compilation, so this is not evidence of a production speedup. Recheck comparable production builds during integration. Final main verification uses Chromium DPR2, reduced motion. No horizontal overflow or page errors in six home viewports; focus returns after Escape on desktop/phone. Latest metrics: /tmp/home/verification.json. No promise of 60fps on physical phones: animations keep existing transform/opacity implementation; cold load and host CPU contention affect headless timing.

## Validation and evidence

- test:atlas: 777 passed, 0 failed; atlas:check: 163 strict stylesheets.
- Site-theme regression test passes for Arthas, all three legacy preferences, invalid preference and blocked/unavailable storage.
- ESLint changed source files: 0 errors/warnings. TypeScript and build logs: /tmp/home/tsc-final.log, /tmp/home/build.log (see final status).
- clean-ui-audit: EN/RU zero suspicious nodes. Removed visible redundant eyebrow and open-cover explanatory hint; no new service prose.
- Screenshots /tmp/home/before-{1440-ru,1440-en,390-ru}.png and /tmp/home/after-{1440-ru,1440-en,1920-ru,1280-ru,768-ru,390-ru}.png. Open spread /tmp/home/open-book.png; held /tmp/home/held-book.png; phone /tmp/home/phone-modal.png and phone-companion.png; proofs /tmp/home/proof/.
- Normal-motion phone: opening → open, companion tab, Escape → closed pass (/tmp/home/phone-check.log). Desktop lift reached held modal (screenshot reviewed).

## Open integration risks

`design:lock` fails (64 differences): dev cached meta rewrite answers 404, header hydration error includes Forever href mismatch, and CSS URL/newline serialization differs from captured reference. Log /tmp/home/design-lock.log. Shared reference routes, tokens and header source not edited. Must repeat on integrated production build and investigate failures before release; reference was not recaptured. At 768 header horizontally clips its own nav row; HDR owns this. No API, DB, nginx or production changes.
