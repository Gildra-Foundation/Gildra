# Frontend integration and MDX import — implementation record

Date: 2026-10-08. Implemented by Claude Opus 5.5 (claude-opus-5-5). Isolated
checkouts only; nothing committed, pushed or deployed; no production database,
file or secret touched. RiftDen details: `riftden-platform/docs/cms.md`.

## Gildra (gildra-platform)

| Area | Files |
|---|---|
| Shared contract (mirrored to RiftDen) | `lib/cms/contract.ts`, `lib/cms/richtext.ts`, `lib/cms/revalidation.ts`, `lib/cms/readers.ts` |
| Site config, client, tracker | `lib/cms/config.ts`, `lib/cms/client.ts`, `lib/cms/plausible.ts` |
| Page-block reader | `lib/cms/pages.ts` (now `/api/public/<site>/page?slug=&locale=`; slug ids like `wow/home` kept; registry validation and code-config fallback unchanged) |
| Articles | `components/cms/{Articles,CmsRichText,paths}.ts(x)`, `components/cms/cms.module.css`, `app/wow/articles/{page,[slug]/page}.tsx`, `app/ru/wow/articles/...`, `app/wow/articles/sitemap.xml/route.ts`, `app/sitemap.xml/route.ts` |
| Guides link | `components/blocks/wow/guides/GuidesSection.tsx` ("View All Guides" → `/wow/articles` when the CMS is configured, otherwise the existing dead link) |
| Invalidation | `app/api/cms/revalidate/route.ts` |
| Readers | `app/api/readers/[action]/route.ts`, `components/cms/{ReaderApp,ReaderPage}.tsx`, `components/cms/reader.module.css`, `app/reader/{,verify,reset-password}/page.tsx`, `app/ru/reader/...` |
| Plausible | `components/cms/PlausibleTracker.tsx` in `app/root-document.tsx` (apps/web) |
| Tests | `tests/cms/{richtext,revalidation,readers}.test.ts`, `tests/cms/revalidate-e2e.mjs`, `tests/cms/readers-e2e.mjs`; scripts `test:cms`, `test:cms:revalidate-e2e`, `test:cms:readers-e2e` in `package.json` |

Environment (all server-side): `CMS_INTERNAL_URL`, `CMS_SITE_SLUG` (default
`gildra`), `CMS_PUBLIC_URL`, `CMS_MEDIA_ORIGINS`, `CMS_REVALIDATE_SECONDS`,
`CMS_REVALIDATE_SECRET`, `CMS_READERS_ENABLED=1`, `SITE_PUBLIC_ORIGIN`,
`PLAUSIBLE_SCRIPT_URL`, `PLAUSIBLE_SITE_DOMAIN`, `PLAUSIBLE_TRACKING=off`.
Without `CMS_INTERNAL_URL` everything behaves as before (article and reader
routes are not-found, guides link stays a dead link, page overrides off).

Article behaviour:
- Server-rendered with the site shell (`PageShell`); `/wow/articles?page=n`
  index and `/wow/articles/<slug>`; RU under `/ru/...`. Unknown, unpublished
  and other-site slugs are not-found (the public endpoint is site-bound and
  published-only).
- Translation contract from the CMS: canonical = URL of `resolvedLocale`;
  hreflang only for `availableLocales` (and only when more than one exists);
  a RU request that falls back to English shows an explicit notice, is
  `noindex, follow` and canonicalises to the English URL; `lang` attribute on
  the article is the served language.
- New slugs render on the first request (route is request-time because the
  shared chrome is dynamic; CMS fetches are cached with tags for 300 s).
- Covers and inline images use plain `<img>` only from allow-listed origins.

The `wow.guides` block lives in the `wow/home` block page; the current public
`/wow` renders `WowHome` (not redesigned), so the linked action is visible in
`/dev/blocks` and wherever that block page is mounted.

## CMS changes in this stage (gildra-platform/cms)

- Default reader link paths → `/reader/verify`, `/reader/reset-password`
  (`src/collections/Members.ts`, `.env.example`, README).
- Credential-confirmed second-site enrollment: `site-login` returns
  `409 enrollment-available` after Payload confirmed password + verification
  when the account has no row for an open site; `enroll: true` appends the
  membership through the same serialised, audited `MEMBER_JOIN` path (refactored
  into `appendMembership`) and logs in. Blocked rows are never reactivated; the
  probing login is rolled back. (`src/members/endpoints.ts`,
  `src/collections/Members.ts`)
- Bug fixed: auth errors were detected via `error.name`, which the production
  bundle minifies — unverified and locked logins showed as "invalid
  credentials". Now `instanceof UnverifiedEmail/LockedAuth`.
- Importer: `scripts/lib/import-bundle.ts`, `scripts/import-articles.ts`
  (`npm run import:articles`), fixture `tests/fixtures/riftden-mdx-bundle.json`
  (generated from the four real files), test `tests/import.int.test.ts`.
- No schema or migration change (drift check: no file).

## Commands and results

| Where | Command | Result |
|---|---|---|
| gildra root | `npm run typecheck` | pass |
| gildra root | `npm run test:cms` | 28/28 (renderer XSS/URL/media/TOC/blocks, webhook protocol incl. replay/skew/foreign site/size, tag plans, proxy CSRF/whitelists/cookie/enrollment/session/profile/logout/verify/reset/availability, config, tracker) |
| gildra root | `npm run build` | pass; new routes `/wow/articles`, `/wow/articles/[slug]`, `/ru/...`, `/wow/articles/sitemap.xml`, `/reader*`, `/ru/reader*`, `/api/cms/revalidate`, `/api/readers/[action]` |
| gildra root | `npm run test:cms:revalidate-e2e` | 8/8 against `next start` + stub CMS: new slug without rebuild; cached without webhook; bad signature/outdated/foreign site change nothing; replay 409; `change` refreshes (v1 → v2); control: removed article still served without webhook; `unpublish` and `delete` → next request is not-found |
| gildra root | `npm run test:cms:readers-e2e` | 9/9 against the real CMS production build (scratch DB in the isolated test Postgres) + loopback SMTP sink + Gildra `next start`: availability; registration email with `/reader/verify`; unverified login refused, verify; login without Origin 403, cookie httpOnly/SameSite, no token in body; session/profile, non-whitelisted field 400; logout; reset email `/reader/reset-password` and new password; RiftDen enrollment (`409` → `enroll: true` → active membership); a real published article on `/wow/articles/<slug>` with safe rendering, canonical, no false RU hreflang, RU fallback notice + noindex |
| gildra root | `next start` without CMS env | `/wow/articles`, `/reader`, `/ru/reader` not-found; `/api/readers/*` 404; `/api/cms/revalidate` 503 `not-configured`; sitemap index without the articles sitemap |
| cms | `npm run typecheck` / `npm run build` | pass / pass |
| cms | `npm test` | 105/105 (previous 97 + 3 enrollment/locked + 5 importer) |
| cms | `npx payload migrate:create drift_check --skip-empty` | no file |
| riftden | see `docs/cms.md` | check, lint, architecture, data, articles, 11 unit, 30 CMS, build, 8/8 e2e |

Notes on what the end-to-end runs revealed and fixed in this stage:
1. Profile lookup by `member` returns nothing for readers (document-bound field
   access) → the proxy now looks profiles up by the session's public handle.
2. Minified error names in production (above).
3. Next 16 `dynamicParams = false` on any segment blocks runtime params of all
   nested routes → removed from RiftDen's `[lang]` layout (see docs/cms.md).
4. Gildra's root `app/loading.tsx` makes every page stream, so a not-found
   page (removed article, disabled route) is served with HTTP 200 plus Next's
   `noindex` meta and not-found payload — documented Next behaviour
   (`next/dist/docs/.../loading.md`, "Status Codes"). The e2e asserts no stale
   text, the not-found marker and `noindex`. A hard 404 would need a check in
   Gildra's proxy/middleware (outside this task's paths). RiftDen has no root
   loading UI and returns a real 404.

## Review notes for Codex

- Browser journeys to run: `/wow/articles` and `/ru/wow/articles` (CMS on),
  article TOC anchors, RU fallback notice, reader register → email →
  `/reader/verify` click → login → profile → logout; RiftDen `/en/reader`
  enrollment with a Gildra account; RiftDen article index/detail with CMS and
  with the CMS stopped (MDX fallback).
- Production settings to plan: `CMS_REVALIDATE_SECRET` per site and the sites'
  `revalidateUrl` (owner-only), `CMS_PUBLIC_URL` for media, `SITE_PUBLIC_ORIGIN`
  matching the public hosts, Plausible variables, `CMS_READERS_ENABLED` only
  after SMTP works.
- RiftDen unprefixed-path 308 loop / 500 behind a proxy: fixed in stage 4
  (`apps/lol/src/proxy.ts`, see below and docs/cms.md).
- Readers' rate limiting happens in the CMS per `x-forwarded-for` forwarded by
  the proxy (taken from the site's own reverse proxy).
- Email links go to the site's default-language reader pages
  (`/reader/verify`); RU readers see the default-language page.
- The four RiftDen MDX files contain no game components, so the importer marks
  both articles ready; component rejection is covered by fixtures.

Not done: interactive browser runs, Docker/compose, real Plausible CE,
production configuration and rollout.

## Stage 4 — upgrade and review fixes (2026-10-08)

### Gildra
- `next` 16.3.1 → **16.3.8** (exact); refreshed in range: `sharp` 0.35.5,
  `fast-uri` 3.1.8, `source-map-js` 1.2.2, `@redocly/openapi-core` 1.34.20
  (dev, brings `js-yaml` 4.3.2). No overrides. `npm audit` (incl. dev) and
  `npm audit --omit=dev`: **0 vulnerabilities**. `generate:api` output unchanged.
- **Runtime CMS on a CMS-less build.** `/wow/articles*`, `/reader*`,
  `/api/readers/*`, `/api/cms/revalidate` and the articles sitemap are
  request-time/ISR routes and read the CMS variables at runtime. The static
  (○) block pages that a CMS `pages` document can override (`/tier-lists`,
  `/privacy` + RU) carry no CMS tags when built without the CMS, so the
  receiver now also calls `revalidatePath` for them
  (`lib/cms/staticPaths.ts`, route `app/api/cms/revalidate`): publishing the
  override applies it without a rebuild. Note: `/` is the platform
  `GrimoireHome`, not the `wow/home` block page — `GuidesSection` (and its
  "View all guides" link) renders only in the `/dev/blocks` gallery today. If
  `wow/home` is ever routed, add it to `lib/cms/staticPaths.ts`.
  Settings that genuinely need a rebuild: none for the CMS integration.
- `PublicArticle.readingTime?` added to the mirrored `lib/cms/contract.ts`.

### RiftDen
- `next` 16.3.8, `sharp` 0.35.5, `source-map-js` 1.2.2; `npm audit
  --omit=dev`: 0 vulnerabilities (no undici/fast-uri/js-yaml in its tree).
- **Proxy loop fixed** (`apps/lol/src/proxy.ts`): rewrites/redirects are built
  from `request.url` instead of `request.nextUrl` (origin `localhost:<port>`,
  which made the `/ru` rewrite external). Verified on the standalone server
  with default, `localhost` and reverse-proxy Host headers: unprefixed RU and
  `/en` routes 200, `/ru/...` one relative 308 (query kept), unknown locale
  404, reader routes/availability 200 with readers enabled at runtime,
  `/api/cms/revalidate` reachable unprefixed. The e2e uses unprefixed routes
  again (and a free ephemeral port).
- **No N+1:** lists use the CMS list documents (`readingTime` from the
  projection); one list request and 0 detail requests for 30 articles (test).
- **Metadata:** CMS SEO title/description/allow-listed image/noIndex applied;
  MDX metadata and `SITE_PREVIEW` noindex preserved (test).
- Home (`revalidate = 300`) and champion pages (`revalidate = 3600`) refresh
  CMS article cards without a rebuild.
- `ReaderApp` copy is RiftDen-specific (no Battle.net; mentions the shared
  gildra.net account).

### Commands and results (stage 4)

| Where | Command | Result |
|---|---|---|
| gildra root | `npm run typecheck` | pass |
| gildra root | `npm run test:cms` | **29/29** (+ static path plan) |
| gildra root | `npm run build` (no CMS env) | pass; `/tier-lists`, `/privacy` static ○, CMS routes ƒ |
| gildra root | `npm run test:cms:revalidate-e2e` | **9/9** (+ a static `/privacy` picks up a CMS override after its webhook on a CMS-less build) |
| gildra root | `npm run test:cms:readers-e2e` | **9/9** against the 3.90.2 CMS build |
| riftden | check, lint, check:architecture, check:data, check-articles | pass |
| riftden | `npm test` / `npm run test:cms` | **11/11** / **32/32** |
| riftden | `npm run build` (no CMS env) + `tests/cms/revalidate-e2e.mjs` | pass / **8/8** on unprefixed routes |
| riftden | route matrix (3 Host variants × 2 configs) | as above, no server errors |
