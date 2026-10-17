# Realistic frost transition — verified production publication

Published to https://gildra.net on 17 October 2026 at 17:47 UTC.

- Release: `realistic-frost-20261017-99634f6-r2`.
- Application source: `99634f68dd6469e5236343498f1c7355eefb7b84`.
- Image: `sha256:c91c2799dcb69076e7467411b822a42b3fd28b5d21d94efcd72ef15be7cd38cd`.
- Rollback image: `sha256:37a710b626de993211ed7758ea58699a103d888091c36fd5c805360fb3eb196a`.
- Local branch: `feature/site-theme-transitions-20261017`. Follow-up test commit
  `b4980bc` explicitly waits for route hydration before controlled-time capture.
  No remote push was performed.

The owner's continuing request refines the previously authorized site-theme
publication: progressive hoarfrost, spreading cracks and falling ice shards.
Arthas now grows a textured, feathered ice sheet from the edges over 820 ms;
fractures propagate over 420 ms; 18–20 irregular pieces and small chips disperse
above the loaded destination. The same frost and fracture edges follow each
piece. Blob URLs and the finite frost RAF are released on completion/cancel.
Other character themes, route policy, sound consent and reduced motion remain
covered by the regression journey.

## Verification

- Clean-source Docker production build passed TypeScript and all 766 static
  pages. Dependencies were unchanged. Existing auction persistence tracing
  warnings remain in the build log.
- Geometry coverage/bounds/shared-edge tests, site-theme and route-policy tests,
  scoped ESLint, atlas token validation and diff whitespace checks passed.
- Chromium regression passed locally, on the isolated production candidate and
  on the public site: all four themes, persistence, history, RU/EN, 320–1440 px,
  slow routes, Escape, cross-tab selection, sound cleanup and reduced motion.
- Controlled-time material checks passed on 390/1440/2560 px: frost begins at the
  edges, coverage increases, textures decode and all URLs are revoked on release
  and cancellation. Early/late frost, cracks and shatter screenshots inspected.
- Four public JS/CSS assets matched bytes and SHA-256 values from the image.
- Origin HTTPS routes and API readiness passed. A 120-second observation found
  healthy web, zero restarts and zero runtime errors. Nine protected containers
  kept their identities and restart counts.

Only web was replaced and the existing nginx configuration gracefully reloaded.
Runtime environment/mounts were retained; no schema or data changes occurred.
Candidate checks used image defaults, a loopback port, no production secrets,
no production network and no production data. The candidate was removed.

## Rollout transport retry

The first attempt automatically restored the previous image and exact manifest
when an origin curl request hit HTTP/2 framing error 16 following nginx reload.
After restoration both HTTP/1.1 and HTTP/2 returned 200. The second attempt added
bounded transport-error retries, retained all acceptance checks and passed.
Both attempts are preserved in the hash-chained operation ledger.

Evidence: `/home/debian/gildra-realistic-frost-release-20261017/evidence/`.
Archived plan, manifests, rollback runner and checks:
`/opt/gildra/releases/realistic-frost-20261017-99634f6-r2/`.
The rollback runner verifies production locks and refuses to overwrite a newer
image or manifest. Future web releases must retain both the global theme source
`a052e48` and this refinement `99634f6`.
