# Shared CMS — implementation record

Date: 2026-10-08. Implemented by Claude Opus 5.5 (claude-opus-5-5) in the
isolated checkout `work/gildra-platform`, branch `codex/shared-payload-admin`,
base `06697ac4`. The base `cms/` tree equals production image revision
`5c61a295…`. Nothing was committed, pushed or deployed; no production database,
container or secret was accessed.

Scope written: `cms/**` and `app/api/cms/revalidate/route.ts`. `lib/cms/` was
not changed (frontend adapters are Codex's separate task).

## What was built

Plan slices S1–S6: sites + staff roles, editorial core, pages/settings,
readers, jobs, Plausible. Details and contracts are in `README.md`.

| Area | Files |
|---|---|
| Roles and access helpers | `src/access/roles.ts`, `src/access/internal.ts` |
| Tenant integrity, publication rules, revalidation hooks | `src/editorial/policy.ts` |
| Collections | `src/collections/{Sites,Admins,Guides,Pages,Media,Taxonomy,SiteSettings,Members,MemberProfiles,AuditLog}.ts` |
| Editor and shared fields | `src/fields/{editor,shared}.ts` |
| Jobs | `src/jobs/{index,revalidateSite}.ts`, `src/scripts/jobs-worker.ts`, Dockerfile target `jobs` |
| Readers | `src/members/endpoints.ts`, `src/email/index.ts` |
| Public API and preview | `src/public/{endpoints,projection}.ts`, `src/preview/token.ts`, `src/app/(preview)/…` |
| Analytics | `src/analytics/{plausible,endpoint}.ts`, `src/components/{AnalyticsView,AnalyticsPanel,AnalyticsNavLink,EditorialDashboard}.tsx` |
| Migration and seed | `src/migrations/20261008_174758_shared_cms.{ts,json}`, `src/seed/sites.ts`, `src/scripts/seed.ts` |
| Ops | `.env.example`, `docker-compose.example.yml`, `Dockerfile`, `.dockerignore`, `README.md` |
| Gildra web receiver | `../app/api/cms/revalidate/route.ts` |
| Tests | `vitest.config.ts`, `tests/**` |

Added dependencies (exact): `@payloadcms/plugin-multi-tenant@3.88.0`,
`@payloadcms/email-nodemailer@3.88.0`; dev: `vitest@4.0.3`, `tsx@4.23.15`.
The Payload/Next/React stack was not upgraded.

## Deviations from the proposal (installed API differs or is experimental)

1. **Slugs** stay plain text fields; `slugField()` is `@experimental` in 3.88.0.
   Uniqueness is the compound index `(site_id, slug)` (Payload `indexes`).
2. **`localizeStatus`** (experimental) is not enabled: RU/EN share one status.
3. **Lexical tables** use a structured `dataTable` block because the native
   feature is `EXPERIMENTAL_TableFeature` in 3.88.0. Callouts are a block too.
4. **Dashboard**: `admin.dashboard.widgets` is `@experimental`; the stable
   `afterDashboard` slot plus a custom `/admin/analytics` view are used.
5. **Analytics cache**: bounded process-local LRU (allowed for one instance).
   `payload.kv` exists but was not needed.
6. **Jobs**: the 3.88 CLI `jobs:run` runs once and exits, so a small worker
   script (`npm run jobs:worker`) loops; in-process `autoRun` is also available
   behind `CMS_JOBS_AUTORUN`. Completed jobs are deleted (Payload default).
7. **Sites field `languages`** (not `locales`): a hasMany select named
   `locales` creates `sites_locales`, which collides with Payload's table for
   localized fields and breaks queries.
8. **NOT NULL on `guides.site_id`/`pages.site_id`** is hand-written: Payload's
   schema builder never emits NOT NULL for drafts collections. It is kept out
   of the snapshot so `migrate:create` shows no drift (verified with
   `--skip-empty`, no file produced). `media/categories/tags/site_settings`
   get NOT NULL from the schema (`required` set after the plugin).
9. **Generated `down` SQL** failed (`DROP TABLE sites CASCADE` already drops the
   FKs that later `DROP CONSTRAINT` lines name). Those statements use
   `IF EXISTS`; `down` also refuses data-losing rollbacks.

## Security findings fixed while implementing (verified in Payload source)

- Collection `create` access returning a `Where` is not checked against the
  submitted data, and drafts skip field validation, so the plugin alone does
  not stop spoofed `site` values on drafts/autosave → hook-level checks.
- In `update`/`restoreVersion`, `originalDoc` is the latest version, not the
  live row → an author could restore/overwrite a published document. The hook
  now reads the live `_status` from the main table (covered by tests).
- Internal `payload-locked-documents`, `payload-migrations`, `payload-kv` and
  `payload-jobs` default to "any logged-in user", i.e. readers → narrowed.
- Payload's schedule drawer only checks admin access before queueing
  `schedulePublish` → guarded in a jobs collection hook; the task re-checks at
  run time (tested with a demoted editor).
- Payload's default console email adapter prints verification/reset links →
  replaced by a refusing adapter when SMTP is not configured.
- Custom admin views render without a session → `/admin/analytics` redirects
  to login.

## Verification actually run

Environment: Node 22.23.2; isolated test Postgres 17.10 on `127.0.0.1:55439`,
database `payload_network_test`. Integration tests create
`payload_network_test__<name>` scratch databases on that server and refuse to
run unless the host is local and the database name matches `payload_*test*`.

| Command (in `cms/` unless noted) | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm test` (Vitest, 7 files) | **67/67 passed** |
| `npm run build` (Next 16.3.1 production) | pass; routes `/admin/[[...segments]]`, `/api/[...slug]`, `/preview/[collection]/[id]` |
| `npx payload migrate:create drift_check --skip-empty` | no migration produced (schema matches snapshot) |
| root: `npm run typecheck` | pass |
| root: `npm run build` | pass; route `/api/cms/revalidate` present |
| `git diff --check` (repo root) | pass; new files checked for trailing whitespace |
| `npm run seed` ×2 on a scratch DB | 1st: settings created; 2nd: nothing created |
| `npm run jobs:worker` on a scratch DB, then SIGTERM | started, stopped cleanly |
| `npm run migrate` + `npm run seed` on `payload_network_test` | `20261008_174758_shared_cms` applied (batch 2), settings created for both sites; no accounts created |

Test coverage (all with Local API `overrideAccess: false` unless the test sets
up fixtures):

- `tests/access.int.test.ts` (22): first-user bootstrap as owner then
  anonymous create refused; non-owner role/assignment escalation stripped;
  site admin cannot provision/edit/delete staff; owner assignment audited; last
  owner protected; staff hidden from readers/anonymous; raster upload accepted,
  foreign-site upload and SVG rejected; reads limited to the editor's site
  (docs and versions); spoofed site on create (normal and draft) rejected; site
  change rejected (owner too, autosave by foreign editor too); cross-site
  `hero`, categories, `seo.image`, foreign author, Lexical upload of foreign
  media and Lexical relationship to `members` rejected in drafts; same slug
  across sites allowed, duplicate inside a site rejected (also categories);
  author forced as `author`, can autosave own draft; author cannot publish
  (create/update/draft flag), unpublish, edit live, edit live while a newer
  draft exists, restore a version live, edit others' drafts, delete; anonymous
  and public endpoint keep serving the published version while a newer draft
  exists, author shown as name only, no emails; author cannot schedule, editor
  can, job carries site, jobs visible only to that site's publishers and not
  to readers; readers get published content only and no editorial writes;
  readers blocked from audit log, locks, migrations, sites; anonymous blocked
  from admins/members/audit/sites/jobs; settings endpoint leaks no
  configuration; site settings writable only by site admins, one per site;
  preview token valid/tampered/expired/foreign user/wrong site; analytics: 403
  for author, other-site analyst, reader and anonymous with **no upstream
  call**, 400 for invalid period, 200 for the site analyst, key not echoed;
  seed idempotent and accounts untouched.
- `tests/members.int.test.ts` (11): registration closed until opt-in;
  503 `email-not-configured` without SMTP and nothing created; input
  validation; server-set membership despite spoofed body fields; verification
  email with site link captured; identical answer for existing address and no
  email; login refused before verification; verify via emailed token;
  site-scoped login, other-site login and plain `/login` refused; session
  endpoint without email; self-update whitelist (memberships, blocked, email,
  `_verified` refused; password allowed); profile self-edit allowed, foreign
  profile and `member` re-pointing refused; members/editor cannot list readers;
  anonymous profiles hide `member`; public profile has no email; other-site
  admin cannot see or change the reader; site admin cannot touch `blocked` or
  other sites' rows; site block revokes the live token and login; audit entry;
  global block closes login and hides profile; reset link per site, same answer
  for unknown address, reset works; 503 when email is disabled.
- `tests/jobs.int.test.ts` (5): due schedule publishes once, future one waits,
  re-runs add no versions; demoted scheduler's job does not publish; author
  cannot queue; not-configured revalidation completes without delivery; draft
  saves do not notify; HTTP 500 keeps the job for retry, retry delivers;
  signature verified; unpublish notifies with `action: unpublish`.
- `tests/migration.int.test.ts` (8): legacy fixtures (admins with hash, media
  with RU/EN alt, published guide with draft + published versions, draft
  guide, `wow/home` and `league-of-legends/home` block pages with versions) on
  the two old migrations; upgrade keeps all row counts, IDs and the password
  hash, makes legacy admins owners, assigns Gildra to every document and
  version, keeps page `game/layout/blocks`; index/NOT NULL checks; Payload reads
  legacy content (RU locale, versions, media alt, `wow/home` blocks);
  `payload migrate:down` (real CLI) restores the old schema with all rows;
  `payload migrate` re-applies; with a Riftden article `migrate:down` refuses and
  changes nothing.
- `tests/fresh.int.test.ts` (1): empty database → all migrations, both sites,
  no accounts.
- `tests/unit/plausible.test.ts` (16): success mapping and bearer key; cache
  per site/range; not-configured without upstream calls; 401/500/429 mapping;
  malformed JSON/shape; timeout returns within 2 s; network failure; failures
  not cached; date range presets and custom bounds.
- `tests/unit/preview-token.test.ts` (4): token round-trip, expiry, tampering;
  Lexical reference scan across locales.

HTTP smoke against `next start` on a scratch database (not a browser):
anonymous `/api/{admins,members,audit-log,sites,payload-jobs,payload-locked-documents}`
→ 403; `/api/graphql` → 404; first-register → owner, second anonymous create →
403; plain member login → 401; analytics/preview without auth → 403/401;
public settings/articles → 200 with projection only; draft invisible publicly
(404) until published via REST, then served; legacy `/api/pages?where[slug]…`
→ 200; logged-in owner: dashboard shows "Articles by site", `/admin/analytics`,
guide edit/create, pages, media, admins, members, audit log, site pages → 200;
CMS-local preview renders the draft with a session, 404 without; anonymous
`/admin/analytics` → redirect to login.

## Review round 2 — fixes for Codex's independent findings (2026-10-08)

| # | Finding | Fix | Regression evidence |
|---|---|---|---|
| 1 HIGH | Site admin could repoint `plausibleSiteId` to another tenant (and `publicUrl`/`revalidateUrl`) | `src/collections/Sites.ts`: `slug`, `domain`, `game`, `publicUrl`, `plausibleSiteId`, `revalidateUrl` have owner-only field access on **create and update**; site admins keep name, languages, default locale, registration | `access` › "site configuration authority": Gildra admin's attempt leaves all six mappings unchanged while name/registration/languages change; foreign site update refused; analytics then queries only `gildra.net` (spy on upstream `site_id`); owner can change and restore |
| 2 HIGH | `down` guard missed settings and draft-only metadata | `ROLLBACK_CHECKS` (exported) in the migration: other-site content/versions, added/changed sites or languages, settings beyond seeded defaults, non-owner staff, site roles, readers, profiles, categories, tags, guide rels/text arrays in live **and version** tables, new guide/page/media fields in live rows, version rows and version locales, rich text using new blocks, any `payload_jobs` row, any audit entry, duplicate slugs. The seed no longer queues cache-invalidation jobs (`SKIP_REVALIDATION` context) so a seeded, untouched DB stays rollback-clean. Old migrations untouched | `migration` (12): clean legacy roundtrip still passes; seeded untouched state → no blockers; custom RU tagline → real `payload migrate:down` refuses ("site settings beyond the seeded defaults: 1"), tables still present, revert → clean; draft-only `gameContext.patch` (live row NULL) → CLI refuses; site config (registration, Plausible id), non-owner staff, page version noIndex, version text list, callout block in a version — each blocks and unblocks when reverted |
| 3 MEDIUM | Any site admin could `unlock` any reader | `Members.access.unlock` → owner `true`, site admins `{ "memberships.site": { in: adminSites } }` (native unlock combines the Where), otherwise `false` | `members` › unlock: Gildra admin and Gildra editor refused for a Riftden-only locked reader (still locked); Riftden admin and owner succeed |
| 4 MEDIUM | `join` rebuilt memberships and lost `joinedAt`/row ids; racy | `src/members/endpoints.ts` join: transaction + `pg_advisory_xact_lock(hashtext('gildra:member-join:<id>'))`, re-read inside the lock, pass existing rows unchanged, append one row; write runs with the reader as `req.user` and `req` propagated under explicit context `gildra:memberJoin`; `Members` hooks allow that context only for keys `["memberships"]` and only "previous rows identical + one active row for that site" | `members` › joins: two concurrent joins (Gildra + a third site) both land, original row keeps id and `2026-01-01` timestamp; repeat join idempotent; audit entries have the reader as actor; direct self-update of memberships still refused, also with a forged join context that drops a row |
| 5 MEDIUM | `2026-02-31` and tomorrow accepted | `parseDateRange`: real calendar dates (UTC components round-trip), `to` ≤ today UTC, inclusive length ≤ 366 days | unit: 02-31, 02-30, 13-01, 04-31, 2025-02-29, tomorrow, 367-day span rejected; 2024-02-29, today, 366-day span accepted |
| 6 MEDIUM | Malformed metrics shown as zero | `validRow`: exact metric count, finite non-negative numbers (null only for bounce_rate/visit_duration), exact dimension count, strings, `time:day` dates; aggregate must be exactly one row | unit: 13 malformed shapes (`metrics:['malformed']`, truncated, extra metric, negative, null visitors, string Infinity, missing/numeric dimensions, non-date day, 0 or 2 aggregate rows) → `invalid-response`; truthful empty data → `ok` with zeros/nulls; mocks follow the real v2 row shape |
| 7 | No translation availability in public articles | `presentArticles` adds `requestedLocale`, `resolvedLocale`, `availableLocales` from a `locale: "all"` read of the served version (published publicly; latest draft for preview). A locale counts only with title, summary **and** non-empty body. Text is re-read in the resolved locale without field fallback, so languages are never mixed; RU→EN fallback preserved | `access` › "public translation contract": EN-only article with a RU draft → `availableLocales: ["en"]`, EN text, no draft text; genuine RU/EN → `["en","ru"]`, RU text for `ru`; list endpoint same per item; partial RU (title published via draft+EN publish) → not available, EN title and summary served |
| — | Author reference rejected non-owner staff (Codex note) | `assertSameSiteReferences` marks found admin docs as `collection: "admins"` before the role check | `access`: editor can set a Gildra author as `author`; an analyst is refused |
| — | Analytics initial site | `AnalyticsView` reads the native selector cookie `payload-tenant` and passes `initialSiteID` (only if that site is analysable); the panel still follows later selector changes | authenticated HTTP below |

### Commands and outcomes (round 2)

| Command (in `cms/`) | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm test` | **97/97 passed** — access 24, members 13, jobs 5, migration 12, fresh 1, unit plausible 38, unit preview/refs 4 |
| `npm run build` | pass |
| `npx payload migrate:create drift_check --skip-empty` | no file produced |
| `git diff --check` (root) + trailing-whitespace scan of new files | pass / none |

Authenticated native admin recheck (production `next start` on a scratch
database, real `/api/admins/login` cookies from a cookie jar, browser-like
`Sec-Fetch-Site: same-origin`; no manual `collection` injection):

| User | `/admin` "Articles by site" | `/admin/analytics` site options (selected) | Notes |
|---|---|---|---|
| owner | Gildra + Riftden rows | Gildra (selected), Riftden | with `payload-tenant=2` → Riftden selected |
| Gildra analyst | not shown (no write role) | Gildra only | `payload-tenant=2` ignored → Gildra; `/api/analytics/report?site=2` → 403, `site=1` → 200 `not-configured` |
| Gildra editor | Gildra row only | Gildra only | — |
| anonymous | — | Next redirect to `/admin/login?redirect=%2Fadmin%2Fanalytics` | — |

The Analytics nav link rendered for all three staff roles; server log had no
errors. This was HTTP, not an interactive browser session.

## Stage 3 — frontend integration support (2026-10-08)

CMS-side changes for the site frontends (details and commands:
`../tasks/shared-cms/frontend-implementation.md`):

- Reader email links default to `/reader/verify` and `/reader/reset-password`.
- `site-login`: credential-confirmed second-site enrollment (`409
  enrollment-available`, then `enroll: true` through the serialised, audited
  `MEMBER_JOIN` path); blocked rows are never reactivated.
- Fixed: unverified/locked logins were reported as invalid credentials in
  production builds (minified `error.name`); now `instanceof`.
- RiftDen MDX importer: `scripts/import-articles.ts` (`npm run import:articles`),
  drafts only, idempotent, runs as a staff account with access checks.
- `npm test`: **105/105** (adds enrollment ×2, locked mapping, importer ×5);
  typecheck and build pass; no schema drift.

## Stage 4 — security upgrade and review fixes (2026-10-08)

### Packages (CMS)

| Package | Before | Now |
|---|---|---|
| `payload`, all `@payloadcms/*` | 3.88.0 | **3.90.2** (exact) |
| `next` | 16.3.1 | **16.3.8** (exact) |
| `sharp` | 0.35.3 | **0.35.5** (`^0.35.5`) |
| `undici` / `fast-uri` / `js-yaml` / `source-map-js` | 7.29.0 / 3.1.5 / 4.3.1 / 1.2.1 | 7.29.1 / 3.1.8 / 4.3.2 / 1.2.2 |
| `nodemailer` | 9.1.1 | **10.0.16** |

Lockfile regenerated from `package.json` (the 3.88 lockfile could not resolve
the 3.90 peer set). `overrides` and why each one is needed:

- `undici: 7.29.1` — `payload@3.90.2` pins `undici 7.29.0` exactly (advisory
  fixed in 7.29.1). Patch release, same API; Payload uses it for outbound
  fetches (`safeFetch`, upload from URL).
- `nodemailer: 10.0.16` — `@payloadcms/email-nodemailer` asks for `^9.1.1`
  (high advisories in 9.x). 10.x's only breaking change is Node ≥ 20 (we run
  22); it ships its own types, so `src/email/index.ts` now derives the
  transport options type from the adapter and walks nested address lists.
  Covered by the email tests and the readers e2e over real SMTP.
- `sass: 1.105.1` — `@payloadcms/next` pulls `sass 1.77.4 → chokidar 3 →
  braces` (no fixed 3.x line). 1.105 uses chokidar 5; only the admin SCSS
  build uses it, and the CMS build passes.
- `dompurify: 3.4.16` — existing override bumped from 3.4.14 (advisory fix).

`npm audit --omit=dev`: **0 high/critical, 5 moderate** — one advisory
(`esbuild <= 0.24.2` dev-server CORS, GHSA-67mh-4wv8-2f99) reached only via
`@payloadcms/db-postgres → drizzle-kit 0.31.7 → @esbuild-kit/* → esbuild
0.18.20`; no fixed version exists upstream, esbuild's dev server is never
started by the CMS, so no override (forcing esbuild 0.25 under
`@esbuild-kit/core-utils` would risk the migration CLI).

### Payload 3.90 behaviour changes handled

- **Schema:** 3.90 adds `reset_password_requested_at` to auth collections.
  Migration `20261008_191911_payload_3_90_auth` (additive, nullable; `down`
  drops it). Types and import map regenerated; afterwards
  `migrate:create drift_check --skip-empty` creates no file.
- **Password hashes (GHSA-q6mq-ch85-c8mm):** new hashes are
  `pbkdf2-sha256-v1:` with 600 000 iterations. Legacy 25 000-iteration hashes
  still log in and are re-hashed on the first successful login (wrong
  passwords change nothing); tested for staff (`payload.login`) and readers
  (`/site-login`).
- **Scheduled publishing:** `input.user` is now `{relationTo, value}`.
  `guardJobs` accepts only `admins` schedulers with a publishing role; legacy
  plain IDs and readers are refused at queue time.
- **Job logs:** with `runHooks: true` Payload appends log rows as
  `{ $push: row }` and requires `error` on every row, so every job failed
  validation ("Status > Log"). `adaptTaskLog` in `jobsCollectionOverrides`
  resolves `$push` against the stored log and requires `error` only when
  `state === "failed"`.

### Review fixes

- **Reader account deletion** failed (`member_profiles.member_id` NOT NULL vs
  FK `SET NULL`). `members.hooks.beforeDelete` deletes the reader's profile
  with the caller's `req` (same transaction) after the owner-only access
  check; no schema change. Tests: owner deletes account + profile (audited);
  site admin/reader refused, reader may delete only own profile; rollback via
  `initTransaction`/`killTransaction` keeps both rows, commit removes both;
  bulk delete and accounts without a profile.
- **Blank create view without a site:** `/admin/collections/<guides|pages|media|
  categories|tags>/create` with no or an unusable `payload-tenant` cookie now
  redirects to `/admin/select-site?collection=…` (`src/admin/siteChoice.ts`,
  `src/components/SelectSite{View,Panel}.tsx`): an `h1` "Choose a site", one
  labelled button per site the user may create on (owners: all; others: sites
  with a create role), focus moved to the explanation, keyboard operable,
  Cancel link; no site guessed, the site stays required and immutable.
  Browser test `tests/browser/select-site.mjs` (Chromium, production build,
  scratch DB): **8/8** — guides and pages: Choose a site shows both sites,
  keyboard choice of Riftden opens a draft bound to Riftden, with a valid
  selection create opens directly; media also asks.
- **List projection:** `readingTime` (minutes, 200 wpm, rounded, min 1 — the
  frontends' rule) is computed in `projectArticle`, so lists need no detail
  fetches. No schema change.

### Commands and outcomes (stage 4)

| Command | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm test` | **112/112** in 9 files (105 + lifecycle 6 + jobs legacy-scheduler 1) |
| `npm run build` | pass (Next 16.3.8) |
| `generate:types` / `generate:importmap` | regenerated; rerun leaves both unchanged |
| `npx payload migrate:create drift_check --skip-empty` | no file |
| `node tests/browser/select-site.mjs` | 8/8 |
| native REST smoke (production build, scratch DB, loopback SMTP) | 7/7: first owner + login; seeded sites; site-bound article created and published; public list without body and `readingTime` 2 for 450 words; detail 200; other site 404; owner `DELETE /api/members/:id` removes the profile too |
| Gildra `npm run test:cms:readers-e2e` (real CMS build) | 9/9 |

## Stage 5 — final review fix: analytics attribution, Vitest (2026-10-08)

### Analytics panel showed the previous site's numbers under the new site

Codex's Chromium run: Gildra (17 visitors) → select Riftden with a 1.2 s
delayed answer → the tile said `Unique visitors · Riftden` but kept 17 until
Riftden's 9 arrived. Cause: `AnalyticsPanel` kept the last `result` across
selection changes and took the tile label from the *current* site; an aborted
older request could also clear `loading` (`finally`).

Fix (`src/components/AnalyticsPanel.tsx`): each response is stored together
with the `(siteID, period)` it was requested for and is rendered only while
that pair is still selected — so already the first render after a switch has
no numbers. `loading` is derived from the same binding (no separate state),
and a response settles only if its `AbortController` was not aborted, so
slow/aborted older requests can change neither the shown data nor the
loading state. The tile label uses the site of the bound response. The
loading line says what is loading ("Loading Riftden · Last 30 days…",
`aria-live="polite"`); the honest not-configured/error states are unchanged
and bound the same way.

Browser regression `tests/browser/analytics-switch.mjs` (real Chromium,
production build, scratch DB `…__analytics_ui`, a local HTTP Plausible Stats
API v2 fixture with synthetic per-site/period numbers and per-request
delays). A `MutationObserver` records every committed DOM state; each must
show either numbers whose label names the selected site and whose value is
the fixture value of the selected site **and** period, or a loading/error
state. Checks:
1. Gildra · 30 days = 17.
2. Delayed switch to Riftden (1.2 s): first render has no number and says
   "Loading Riftden · Last 30 days…", then 9.
3. Rapid switch Riftden·month (2 s, superseded and aborted) → Gildra·month
   (0.9 s): loading stays visible until Gildra answers (23); 2 s later the
   superseded answer (which reached the fixture) has changed nothing.
4. Burst of three switches with out-of-order answers ends on Riftden · 7 days
   = 4 and stays.
5. Period switch on Riftden 7 days → 6 months (1.2 s): no 7-day number under
   "Last 6 months", then 66.
6. Plausible unreachable → honest error for the new selection, no numbers.

Against the **pre-fix** build the same script fails with
`numbers rendered right after switching to Riftden: Unique visitors · Riftden
= 17` (and already on the first page load: no numbers and no loading
indicator). After the fix: **6/6**.

### Vitest 4.0.3 → 4.1.11 (dev tool)

`vitest` 4.0.3 carried a critical advisory (GHSA-5xrq-8626-4rwp,
GHSA-82fw-gwwq-j7x9; the latter fixed in 4.1.11) and was installed by the
Docker `npm ci`. Now `vitest 4.1.11` (exact, latest within major 4; engines
`^20 || ^22 || >=24`, we run 22.23.2). No `@vitest/ui` is installed and no
script starts a UI/API server (`vitest run`).

npm 10.9.8 crashes while resolving Vitest 4.1.11's peer set (`Cannot read
properties of null (reading 'edgesOut')` in arborist `#loadPeerSet`): it
resolves Vitest's required `vite` peer to vite 8, whose optional peer
`@vitejs/devtools` chain loops back to `vitest@*` 5.x. Therefore `vite` is now an
explicit dev dependency `^7.3.7` with override `"vite": "$vite"`, which
keeps exactly the vite **7.3.7** that was already installed (only hoisted;
same version). Lockfile diff otherwise: Vitest's own packages 4.0.3 → 4.1.11
and their small helpers (`std-env`, `tinyexec`, `es-module-lexer`, `obug`,
`yaml` hoisting).

### Final state (stage 5)

| | Version |
|---|---|
| payload / `@payloadcms/*` | 3.90.2 |
| next | 16.3.8 |
| sharp | 0.35.5 |
| nodemailer | 10.0.16 |
| undici | 7.29.1 |
| vitest / vite | 4.1.11 / 7.3.7 |
| Node | 22.23.2 |

Overrides: `dompurify 3.4.16`, `undici 7.29.1`, `nodemailer 10.0.16`,
`sass 1.105.1` (reasons in stage 4), `vite $vite` (above).

| Audit | critical | high | moderate |
|---|---|---|---|
| `npm audit --omit=dev` | 0 | 0 | 5 |
| `npm audit` (full tree, as installed by Docker `npm ci`) | 0 | 0 | 5 |

The 5 moderate entries are one advisory, GHSA-67mh-4wv8-2f99 (`esbuild <=
0.24.2`: its **development server** answers cross-origin requests). Path:
`@payloadcms/db-postgres 3.90.2 → drizzle-kit 0.31.7 → @esbuild-kit/esm-loader
→ @esbuild-kit/core-utils → esbuild 0.18.20`. Applicability: drizzle-kit uses
esbuild only to load TypeScript when generating/running migrations; nothing
in the CMS, the jobs worker or the migration commands starts esbuild's
`serve` mode, so the vulnerable server is never listening. No fixed version
exists on that path (`fixAvailable: false`); forcing esbuild ≥ 0.25 under
`@esbuild-kit/core-utils` would risk the migration CLI, so it is accepted
and documented, not overridden.

### Commands and outcomes (stage 5)

| Command | Result |
|---|---|
| `npm ci` (clean, from the new lockfile) | pass, 435 packages |
| `npm run typecheck` | pass |
| `npm test` (Vitest 4.1.11) | **112/112** in 9 files |
| `npm run build` | pass |
| `node tests/browser/analytics-switch.mjs` | pre-fix build: fails as reported; final build: **6/6** |
| `node tests/browser/select-site.mjs` (final build) | 8/8 |
| `npm audit --omit=dev` / `npm audit` | 0 critical, 0 high, 5 moderate (above) each |

## Independent Codex review completed (2026-10-08)

After stage 5, Codex independently ran the final 112 CMS tests, type checks,
production builds, frontend tests (29 Gildra, 32 Riftden plus 11 existing),
and cache journeys (9 Gildra / 8 Riftden). Actual Chromium journeys passed:
9 editorial/content checks, 7 reader checks over a real local SMTP sink, and
5 analytics checks against a synthetic local Stats API; no JavaScript errors.
Legacy upgrade, original-password authentication, and backup restoration
passed. Both final Docker images built, a fresh database migrated and the
standalone worker published a scheduled draft, delivered its revalidation
job and shut down with exit 0. Delivered patches were applied to private
baseline copies and their files compared byte for byte.

Site adapters, first-party reader pages (`/reader/verify`,
`/reader/reset-password`), and the draft-only Riftden MDX importer are included.
Signed preview works inside the CMS; external frontend preview is not included.
Custom analytics ranges use UTC days; no per-site timezone setting exists.
Down migration is conservative; after real use restore the pre-upgrade backup.
Production deployment, external SMTP, and a live Plausible CE installation
remain separate rollout work. No production files, databases, or containers
were changed. The user-facing Russian report is `payload-review.md` in the
source delivery archive; final package versions/results are above in stage 5.

## Instructions for the independent review

```bash
cd cms
npm ci
npm run typecheck
npm test                      # needs PAYLOAD_DATABASE_URL to the local payload_*test* DB
npm run build
npx payload migrate:create drift_check --skip-empty   # expect no new file
cd .. && npm run typecheck && npm run build && git diff --check
```

Suggested focus: `src/editorial/policy.ts` (all write paths), `src/access/*`,
`src/collections/{Admins,Members,MemberProfiles}.ts`, `src/jobs/index.ts`,
the hand-written parts of the migration (`INSERT INTO "sites"` … `SET NOT
NULL`, `rollbackBlockers`, `IF EXISTS` in `down`), and the public projection
(`src/public/projection.ts`). For the browser pass: `npm run dev`, create the
first account at `/admin` (it becomes owner), create staff with site roles,
then exercise the matrix in `README.md` with the site selector. The shared test
database `payload_network_test` is already migrated and seeded (no accounts).
