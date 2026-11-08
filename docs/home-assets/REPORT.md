# HOME — Arthas and Icecrown grimoire

Branch feat/home-book-20261108; base cc7d4909. No deployment.

Removed theme picker, alternate epigraphs, character palette/particle rules and fel branches in CanvasPageTransition. Site bootstrap always sets Arthas and never reads obsolete saved values. Removed unused Illidan/Garek backgrounds, old Varok v1 background and six alternate weapon images. Varok v2 stays because login uses it in lib/atlas/scenes.ts. Global unused palette CSS and standalone fel implementation are outside this ownership; they are unreachable via the site theme. Request to integration/HDR: /tmp/mapcoord/HOME-requests.md.

Generated three cover and three folio candidates with built-in imagegen. Packed winners, real alpha, WebP/AVIF, manifest and provenance. Live HTML cover titles; removed cover-opening hint and repeated eyebrow. Removed per-letter ink clipping that cut Preciosa swashes. Kept snow, ice transition and book interactions. Small phones use the existing compact contents layout (page width capped at 340px).

## Assets and loading

Cover AVIF bytes at 320/640/1024: before 33,705 / 138,779 / 295,081; after 11,190 / 32,520 / 70,786. Desktop previously fetched 2,703,505-byte PNG folio; now 126,850-byte WebP, loaded only on intent/open. Existing optimized legacy folio (69,932 bytes) remains for other consumers, not used by home book.

Observed BEFORE dev-server LCP, no throttling: before 1440 RU 15,316ms / EN 5,480ms, 390 RU 1,500ms; final local production AFTER: 1440 RU 920ms / EN 680ms, 390 RU 444ms. BEFORE includes cold route compilation, so this is not evidence of a production speedup. Before and after use different server modes; recheck comparable production builds during integration. Final main verification uses Chromium DPR2, reduced motion. No horizontal overflow or page errors in six home viewports; focus returns after Escape on desktop/phone. Latest metrics: /tmp/home/verification.json. 60fps NOT confirmed: local production RAF sample /tmp/home/motion.json has desktop median 83.3ms / p95 250ms and phone median 16.7ms / p95 116.7ms under concurrent headless tests on the shared host. Opening/closing still uses the existing transform/opacity animation. A controlled A/B and physical-device check remain required.

## Validation and evidence

- test:atlas: 777 passed, 0 failed; atlas:check: 163 strict stylesheets.
- Site-theme regression test passes for Arthas, all three legacy preferences, invalid preference and blocked/unavailable storage.
- ESLint changed source files: 0 errors/warnings. npx tsc --noEmit -p apps/web passed; valyro:check 8/8 passed. Full production build passed (exit 0), including all 1499 static pages. Log: /tmp/home/build-final.log. Initial build process was terminated with SIGTERM during SSG; repeat completed successfully.
- clean-ui-audit: EN/RU zero suspicious nodes. Removed visible redundant eyebrow and open-cover explanatory hint; no new service prose.
- Screenshots /tmp/home/before-{1440-ru,1440-en,390-ru}.png and /tmp/home/after-{1440-ru,1440-en,1920-ru,1280-ru,768-ru,390-ru}.png. Open spread /tmp/home/open-book.png; held /tmp/home/held-book.png; phone /tmp/home/phone-modal.png and phone-companion-viewport.png; proofs /tmp/home/proof/.
- Normal-motion phone: opening → open, companion tab, Escape → closed pass (/tmp/home/phone-check.log). Desktop lift reached held modal (screenshot reviewed).

## Open integration risks

`design:lock` fails (64 differences): dev cached meta rewrite answers 404, header hydration error includes Forever href mismatch, and CSS URL/newline serialization differs from captured reference. Log /tmp/home/design-lock.log. Shared reference routes, tokens and header source not edited. A repeat on the local production build also failed: meta navigation timed out after 90 seconds waiting for networkidle (/tmp/home/design-lock-prod.log); the hub had one console error per run. Must investigate on the integrated candidate before release; reference was not recaptured. At 768 header horizontally clips its own nav row; HDR owns this. No API, DB, nginx or production changes.
