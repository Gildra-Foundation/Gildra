# Site themes and page transitions — production verification

Published to `https://gildra.net` on 17 October 2026 at 17:17 UTC
(19:17 Europe/Warsaw). Source: `a052e488c7fc03800014368cdad6758c0ffc49b9`.

The homepage selection now sets the theme throughout the site. Arthas navigation
freezes the outgoing page, grows cracks, and scatters twelve fragments to reveal
the loaded destination. Sound follows the existing explicit sound choice and
volume. Illidan, Garek and Varok have distinct transitions and shared site palettes.
Reduced motion skips the effect. See [implementation](../llm/site-theme.md).

The release was rebased onto the latest `origin/master` (`33fba09`) and retains
all production fixes from `abca09e`. Source was committed and built from a clean
Git archive. The branch is `feature/site-theme-transitions-20261017`; no remote
push or default-branch change was performed. Future releases must include this
source commit to preserve the published feature.

## Verification

- The final immutable Docker image built successfully, including TypeScript and
  766 prerendered pages. Existing theme and navigation-policy suites passed.
- The candidate used the exact release image with no production environment,
  credentials, network or data mounts. Chromium passed all four themes,
  persistence/reload, minimum crack duration, transparent fragment gaps,
  history, navigation opt-out, anchors/filters, RU/EN, 320–1440 px, delayed route
  loading, Escape, cross-tab selection, sound cleanup and both motion settings.
- The full browser journey passed again through the public domain, without
  page or hydration errors. Both public theme bundles matched the image bytes.
- Origin HTTPS checks verified the hostname and Cloudflare Origin CA, without
  disabling TLS checks. Public and local routes and API readiness passed.
- A 120-second observation with 13 samples found a healthy web, zero restarts
  and zero matched runtime errors. Nine protected containers retained their
  identities, images, start times, status and restart counts.

Only web was recreated. Existing nginx configuration was tested and softly
reloaded to resolve web's new address. No API, worker, CMS, database, cache or
scraper/import container was replaced. No migrations, data imports, DNS or TLS
configuration changes were made. The temporary candidate was removed.

## Immutable release and rollback

Release: `site-theme-20261017-a052e48`.

Web image:
`sha256:37a710b626de993211ed7758ea58699a103d888091c36fd5c805360fb3eb196a`.

Previous image retained:
`sha256:5bd0c1d273d829b142f3441b317266ffc112b337f018f532d91f0d5d917277da`.

The byte-exact previous manifest is retained privately at
`/opt/gildra/site-theme-20261017-a052e48-previous.env`. The reviewed release-specific
runner at `/opt/gildra/releases/site-theme-20261017-a052e48/rollout.py --rollback`
restores that manifest and previous web image; it requires the shared production
locks and refuses to overwrite a different/newer image or manifest.
No rollback was required.

Private evidence and the operation plan are archived under
`/opt/gildra/releases/site-theme-20261017-a052e48/`. The local preparation record
is `/home/debian/gildra-site-theme-release-20261017/evidence/`.
