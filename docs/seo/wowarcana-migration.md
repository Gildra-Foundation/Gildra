# Public domain migration: wowarcana.com

Prepared on 2026-11-09 from production-equivalent source `8fa48087f`.
This document describes a prepared change; it does not record a completed cutover.

## Public addresses

- Canonical website: `https://wowarcana.com` (English) and `/ru` (Russian).
- Public API and console: `https://api.wowarcana.com`.
- `www.wowarcana.com`, `gildra.net` and `www.gildra.net`: permanent 301 to the new apex, preserving the complete request URI.
- `api.gildra.net`: permanent 308 to the new API host, preserving request methods and bodies for compatible clients.

`metadataBase`, sitemap URLs, hreflang, Open Graph, JSON-LD, breadcrumbs, generated API specification, visible domain labels and public API bases use the new domain. Website and organization JSON-LD have stable identities. API responses carry `X-Robots-Tag: noindex, nofollow`.

Historical evidence, private infrastructure and mail are separate from public website URLs. Old DNS and certificates remain necessary for redirects. The media component accepts both old and new API URLs so existing catalog records continue to load through the frontend proxy. `PLAUSIBLE_SITE_DOMAIN=gildra.net` remains the identifier of the existing analytics dataset; the tracker script itself uses the new domain.

## Preconditions and release

1. Keep existing provider registrations on `gildra.net`. Set `AUTH_URL=https://wowarcana.com`, `AUTH_REDIRECT_PROXY_URL=https://gildra.net/api/auth`, and `WARCRAFT_LOGS_REDIRECT_URI=https://gildra.net/api/wow/logs/callback`. Battle.net uses Auth.js's built-in encrypted-state redirect proxy; the old route forwards only to the new Battle.net callback. Warcraft Logs forwards the authorization response to the new host, where existing state, PKCE and Battle.net-session binding checks run before token redemption using the old redirect URI. Sessions are issued on the new host; no session cookies or access tokens are transferred via URLs.
2. Recheck the live revisions, available disk space and symbiosis claims. Obtain the commit and release authorization required by `AGENTS.md`, then commit the tested change. Acquire production and affected service locks.
3. Issue a separate origin certificate for `wowarcana.com` and `*.wowarcana.com`, using a locally generated private key/CSR. Install as `origin-wowarcana.pem` and `origin-wowarcana-key.pem` in the existing certificate mount. Preserve `origin.pem` and `origin-key.pem` for old-domain redirects and private hosts.
4. Build the web and API images from the final source. Test the candidate with the new canonical origin before publishing. Back up the exact current Nginx/runtime/Compose/environment files and image references. Use the supported release process; do not apply a full old Compose snapshot over production.
5. Apply the additive preparation config (`/home/debian/wowarcana-migration-20261109/nginx-prepare.conf`) first: it adds the new public hosts while preserving the existing old-domain handlers. Add proxied A records for `wowarcana.com`, `www.wowarcana.com` and `api.wowarcana.com`, pointing to the existing origin. Configure Full (strict), minimum TLS 1.2 and HTTPS. Preserve unrelated DNS and policies. Verify new hosts with trusted TLS before enabling any old-domain redirect.
6. Publish the tested application/runtime changes, verify the new domain, then apply the final Nginx redirect configuration. Required runtime variables: `AUTH_URL`, `SITE_PUBLIC_ORIGIN`, `INDEXNOW_HOST`, `CATALOG_MEDIA_PUBLIC_BASE_URL`, `PLAUSIBLE_SCRIPT_URL`. Keep the explicit Warcraft Logs callback override on the old domain until registrations change. Keep `NEXT_PUBLIC_SITE_URL` absent or set to `https://wowarcana.com` when building. Update both API and worker instances that submit IndexNow. Run `nginx -t` before a graceful reload.
7. Verify externally: TLS without bypassing validation, website/API availability, old-to-new redirects with paths and queries, EN/RU metadata and sitemap URLs, indexable public pages and private noindex. Verify that existing registered callbacks on gildra.net return to wowarcana.com with state and PKCE intact. Observe health for at least 120 seconds.
8. Add/verify the new domain in Search Console, submit `https://wowarcana.com/sitemap.xml`, and submit Change of Address from the old property. Submit public URLs to IndexNow using the existing key after its new-domain key file is reachable. Search-engine processing is asynchronous.

The new Cloudflare zone was active and empty during discovery; the existing origin certificate covered only `gildra.net` and `*.gildra.net`. Detailed plan and local evidence: `/home/debian/wowarcana-migration-20261109/`.

## Rollback

Restore the exact previous web/API image references and runtime/Nginx configuration, validate Nginx, and reload gracefully. Remove only DNS records created for this migration if necessary; restore the new zone's prior SSL settings from the snapshot. Do not remove old-domain DNS, certificates, mail records or application data. Recheck public health after rollback.

## Sources

- [Google: site moves with URL changes](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes)
- [Google: Change of Address](https://support.google.com/webmasters/answer/9370220)
- [Cloudflare: Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/)
- [Cloudflare: Origin CA](https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/)

Auth.js redirect proxy design: https://authjs.dev/getting-started/deployment#securing-a-preview-deployment
