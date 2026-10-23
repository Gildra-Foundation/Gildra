# Shared Payload CMS — gildra.net and riftden.com

One Payload 3.90.2 / Next.js 16.3.8 / PostgreSQL CMS for both network sites:
articles, pages, media, categories, tags, per-site settings, staff with
per-site roles, a separate reader (member) system, scheduled publishing,
signed cache invalidation and Plausible statistics in the admin.

The existing collections (`admins`, `guides`, `pages`, `media`), their IDs,
slugs, `game`/`blocks` values and versions are kept. All pre-existing content —
including the `league-of-legends/*` pages — belongs to the **Gildra** site;
**Riftden** starts empty.

## Model

| Collection | Purpose | Who writes |
|---|---|---|
| `sites` | Tenants: slug, domain, game, languages, public URL, Plausible site id, revalidation URL, reader registration switch | owner; site admins only name, languages, default locale and registration (slug, domain, game, `publicUrl`, `plausibleSiteId`, `revalidateUrl` are owner-only on create and update) |
| `admins` | Staff (the only admin-panel users). `platformRole` owner/staff + `sites[] {site, role}` with role admin/editor/author/analyst | owner (first account is bootstrapped as owner) |
| `guides` | Articles (label "Articles"): RU/EN title/summary/Lexical body, cover (`hero`), author, categories, tags, SEO, publish date, game context (patch, season, last reviewed, WoW class/spec/instance, LoL champion/role/mentions), legacy `category` | site admin/editor; authors only their own drafts |
| `pages` | Block pages: per-language `blocks` (the web app's `BlockInstance[]`) overriding a site page chosen from the site's list, plus SEO | site admin/editor |
| `media` | Raster images only (jpeg/png/webp/avif/gif — SVG is rejected), localized alt/caption | site admin/editor/author |
| `categories`, `tags` | Site-scoped taxonomy | site admin/editor |
| `site-settings` | One document per site: title, tagline, navigation, footer links, default SEO, social links | site admin |
| `members` | Readers (separate auth collection, never admitted to the admin) | server endpoints; owner; site admins for their site memberships |
| `member-profiles` | Public reader face: handle, display name, bio, visibility | the reader; moderators |
| `audit-log` | Append-only journal of role, membership, blocking and site changes | hooks only |

Every site-scoped collection has a `site` relationship (official
`@payloadcms/plugin-multi-tenant` 3.90.2, labelled "Site"/"Сайт" with a site
selector in the admin). Opening "Create new" for a site-scoped collection
without a usable site selection (no cookie, or a site where you cannot create)
leads to **Choose a site** (`/admin/select-site`): one button per site you may
create on, never a guessed site; the choice sets the same `payload-tenant`
cookie as the sidebar selector. A user with no such site gets an explanation
instead of an empty editor. Slugs are unique **per site** (`(site_id, slug)` unique
index); the same slug may exist on both sites.

### Permission matrix (enforced on the server)

| Action | owner | site admin | editor | author | analyst | reader | anonymous |
|---|---|---|---|---|---|---|---|
| Read published content | all | all | all | all | all | all | all |
| Read drafts/versions | all | own sites | own sites | own sites | — | — | — |
| Create/edit drafts | all | own sites | own sites | own sites, own docs only, author forced to self | — | — | — |
| Publish / unpublish / schedule / restore live / delete | all | own sites | own sites | — | — | — | — |
| Pages, categories, tags | all | own sites | own sites | — | — | — | — |
| Site settings | all | own sites | — | — | — | — | — |
| Analytics | all | own sites | own sites | — | own sites | — | — |
| Staff accounts and roles | all | read colleagues | read colleagues | self | self | — | — |
| Reader accounts | all | memberships of own sites; unlock own-site readers | — | — | — | self (password only); join open sites | — |

Implementation notes:

- Every privilege check requires `req.user.collection === "admins"`
  (`src/access/roles.ts`). A logged-in reader is never treated as staff.
- `src/editorial/policy.ts` runs on every write, **including drafts and
  autosave** (field validation is skipped there, hooks are not): site required
  and immutable, staff role on that site, authors limited to their own
  documents, live changes need a publishing role (the live row is read from the
  main table because Payload passes the latest *version* as `originalDoc`), and
  every referenced media/category/tag/author — including uploads, relationships
  and internal links inside Lexical — must belong to the same site.
- `platformRole` and `sites` have field-level create/update access for owners
  only, so self-escalation is silently stripped. The last owner cannot be
  demoted or deleted.
- Payload's schedule drawer only checks admin access; a `payload-jobs` hook
  requires a publishing role for the scheduled document, and the job itself runs
  as the scheduling user, so rights are re-checked when it fires. Payload 3.90
  stores the scheduler as `{relationTo, value}`; only `admins` schedulers are
  accepted (legacy plain IDs and readers are refused at queue time).
- Reader accounts are deleted by owners only; the reader's public profile is
  deleted in the same transaction (`beforeDelete` on `members`), so no orphan
  profile remains and a failed delete rolls both back. Readers can delete their
  own profile, not their account.
- Passwords: Payload 3.90 hashes with PBKDF2-SHA256 600 000 iterations
  (`pbkdf2-sha256-v1:`). Pre-3.90 hashes (25 000 iterations) keep working and
  are re-hashed transparently on the next successful login (staff and
  readers); nobody has to reset a password.
- Internal collections that default to "any logged-in user"
  (`payload-locked-documents`, `payload-migrations`, `payload-kv`,
  `payload-jobs`) are narrowed to staff/owners (`src/access/internal.ts`,
  `src/jobs/index.ts`). GraphQL is disabled (it was never routed).

### Localization and publication

RU and EN are both editable. They **share one publication status**:
`localizeStatus` is experimental in Payload 3.90.2 and is not enabled, so
publishing publishes both locales. Missing RU text falls back to EN in reads.

The article and page editors open with a **language bar**
(`src/components/editor/LanguageBar.tsx`): both versions with how complete
they are (title, summary, text — the same parts the public API requires),
switching in place (unsaved typing is autosaved first), **"Fill empty fields
from the other version"** (Payload's `copyDataFromLocale`, merge mode: filled
fields are kept) and a read-only **comparison panel** with the other version
next to the form. Lists of articles and pages have a **Languages** column
(`src/components/list/LanguagesCell.tsx`, one batched query per page).

### Navigation

The sidebar (`src/admin/navModel.ts`, `components/nav/`) navigates inside the
app without reloading and stays docked on laptop widths (1025–1440 px, where
Payload would hide it); closing it is remembered in the `nav` preference.
**Ctrl+K / ⌘K** (or "Find…" in the header) opens a command palette built on
[cmdk](https://github.com/pacocoursey/cmdk): sections, articles and pages by
title or address in either language, "New article/page/image" on a chosen site,
switching the working site or the language version. It is a lazy chunk and uses
the REST API with the viewer's own access. Media thumbnails in the admin go
through Next's image optimizer (384 px WebP/AVIF, no stored sizes).

### Editor

Lexical with headings, lists, quotes, links, inline code, uploads from the
site's media, internal links/relationships to articles and pages only, and two
blocks: **Callout** (info/tip/warning) and **Table** (structured rows; the
Lexical table feature is still `EXPERIMENTAL_` in 3.90.2). Drafts autosave
every 2 s; up to 100 versions per document; versions can be compared and
restored.

### Preview

`admin.preview` builds a CMS-local URL `/preview/<collection>/<id>?token=…`.
The token (HMAC with a key derived from `PAYLOAD_SECRET`) binds staff user,
collection, document and site and expires after 10 minutes. The preview page
additionally requires a staff session of the same user; roles are re-checked on
every request. External site adapters can call
`GET /api/preview-content?token=…` for the same draft projection.

## Block pages

A `pages` document overrides one web page's block config per language. The
editor (`src/fields/blocksEditor/`) picks the page from the site's list
(`src/blocks/contract.ts`, generated by `npm run blocks:contracts` at the repo
root from the web page definitions; Riftden's pages are declared there by
hand), then edits blocks as forms generated from the shared contract
(hand-tuned for `legal`), sortable by handle or keyboard, with "add block"
limited to the page's allowed blocks and a read-only JSON view. Every save,
autosaves included, runs the site's own checks (`src/blocks/validate.ts`) and
refuses broken blocks with block, field and reason. An empty language keeps
the page from code; the public page endpoint never falls back to the other
language. The Preview button and Live Preview open Gildra's `/cms-preview`
(`CMS_SITE_PREVIEW=gildra`), which renders the draft with the site's Page shell.

## Public API for the sites

Read-only, published documents of one site, explicit field projection,
`Cache-Control: s-maxage=60, stale-while-revalidate=300`, locale `en`/`ru`
with EN fallback:

```
GET /api/public/:site/articles?locale=ru&page=1&limit=20&category=<slug>&tag=<slug>
GET /api/public/:site/articles/:slug?locale=ru
GET /api/public/:site/page?slug=wow/home&locale=ru
GET /api/public/:site/settings?locale=ru
GET /api/public/:site/taxonomy?locale=ru
GET /api/public/profiles/:handle
```

Every article carries a translation contract computed from the version being
served (published publicly, latest draft in staff preview):
`requestedLocale`, `resolvedLocale` (locale whose text is returned) and
`availableLocales` (locales with stored title, summary **and** body). A missing
or partial translation falls back to English as a whole — fields are never
mixed across languages — so hreflang can be built from `availableLocales`.

Authors are exposed as `{ name }` only; Lexical references are replaced by
public media/document projections and dropped when unpublished or foreign.
The legacy REST reads (`/api/pages?where[slug][equals]=wow/home`) keep working
for anonymous users and return only published documents — but across both
sites. Adapters should move to the endpoints above (or add
`where[site.slug][equals]=gildra`) before Riftden content with colliding slugs
exists.

## Readers (members)

A separate auth collection from staff and from the Go API `users` /
`auth_sessions` (untouched, no import). Readers never enter the Payload admin
(`access.admin = false`). Integration is meant for a **server-side proxy per
site** that keeps the token in its own first-party httpOnly cookie; nothing
relies on cross-domain cookies.

```
GET  /api/members/availability?site=gildra      → registration open|closed|unavailable, email configured?
POST /api/members/register {site,email,password,displayName}
     → 202 pending-verification (same answer for existing addresses), 403 closed, 503 email-not-configured
POST /api/members/site-login {site,email,password[,enroll]} → {token, exp, enrolled} | 401 | 403 email-not-verified | 423 locked
     | 409 enrollment-available (password confirmed, verified, no row for this site, site registration open)
GET  /api/members/session?site=gildra  (Authorization: JWT <token>) → membership + public profile
POST /api/members/join {site}  (authenticated) → join another open site
POST /api/members/site-forgot-password {site,email} → 202 sent-if-exists | 503 email-not-configured
POST /api/members/verify/:token            (Payload built-in)
POST /api/members/reset-password {token,password} (Payload built-in)
```

- Registration is opt-in per site (`sites.registrationEnabled`) **and** needs
  working email. Without it the API says so (503) instead of pretending.
- Plain `/api/members/login` is refused: login is always site-scoped and needs
  an active membership on that site.
- Second-site enrollment: an existing, verified network account that signs in
  on a site where it has no membership row gets `409 enrollment-available`
  (only after Payload has checked the password and verification, and only if
  that site's registration is open; otherwise the usual `401`). Repeating the
  request with `enroll: true` appends one active membership through the same
  serialised, audited `MEMBER_JOIN` path as `/join` (running as the reader) and
  returns the token. A blocked row for the site is never reactivated; the login
  attempt that discovered the missing row is rolled back (no session).
  Registration for an address that already exists still answers
  `pending-verification` without email (no enumeration); the site UI tells
  readers with a network account to sign in instead.
- Readers may change only their password (account) and handle/display
  name/bio/visibility (profile). Memberships, blocking, verification and email
  are server-controlled.
- Site admins manage only membership rows of their sites; owners can block an
  account globally. Any block revokes all sessions immediately.
- Verification/reset links point to `<site.publicUrl><MEMBER_VERIFY_PATH|MEMBER_RESET_PATH>?token=…`,
  default `/reader/verify` and `/reader/reset-password` — the reader pages of
  both site frontends (enabled with `CMS_READERS_ENABLED=1` there).
- Unauthenticated member endpoints are rate limited per process.

## Analytics (Plausible CE)

`GET /api/analytics/report?site=<id>&period=7d|28d|30d|91d|month|6mo|12mo`
(or `period=custom&from=YYYY-MM-DD&to=YYYY-MM-DD`: real calendar dates in UTC,
inclusive, ≤366 days, `to` not after today UTC). The site role is
checked **before** any upstream call. The server calls `POST
<PLAUSIBLE_URL>/api/v2/query` with the key from `PLAUSIBLE_API_KEY`
(aggregate, top pages, sources, daily series), times out after
`PLAUSIBLE_TIMEOUT_MS`, and caches successful reports in a bounded
process-local cache (5 min; 6 h for closed historical ranges). States are
`ok`, `not-configured` (lists what is missing) and `error`
(`timeout|unauthorized-upstream|upstream|invalid-response|network`). Every
upstream row must carry exactly the requested metrics (finite, non-negative;
null only for bounce rate/visit duration) and dimensions (`time:day` as a
date); anything else is `invalid-response`, never a zero. The UI
shows no numbers unless the state is `ok`. Visitors are shown per site and are
never summed into network-wide people.

Admin UI: "Analytics" nav link → `/admin/analytics` (site selector follows the
global site selector), plus an "Articles by site" table under the dashboard
(published, drafts, scheduled, not reviewed in 90 days).

Deploying Plausible CE itself and adding its script to the two sites are
separate production tasks.

## Jobs

- Scheduled publish/unpublish (Payload `schedulePublish`) and `revalidateSite`.
- Run exactly one runner: `CMS_JOBS_AUTORUN=true` in a single CMS process, or
  the dedicated worker (`npm run jobs:worker`, Docker target `jobs`).
  Concurrency control is enabled.
- Publish, unpublish, delete of published documents and changes to taxonomy /
  settings queue `revalidateSite` inside the same transaction. The job POSTs
  `{site, collection, id, slug, previousSlug, action}` to `sites.revalidateUrl`
  with `x-gildra-timestamp` and `x-gildra-signature: sha256=HMAC(secret,
  "<timestamp>.<body>")`, secret `CMS_REVALIDATE_SECRET_<SITE_SLUG>`; 5 retries
  with exponential backoff; "not configured" completes without retries.
  Completed jobs are deleted (Payload default).
- Payload 3.90 appends task log rows as `{ $push: row }` and requires the
  log's `error` field even for successful rows, which made every job with
  `runHooks` fail validation. `adaptTaskLog` (`src/jobs/index.ts`) resolves the
  `$push` against the stored log and requires `error` only for failed rows.
- The Gildra web app receiver is `app/api/cms/revalidate/route.ts` (secret
  `CMS_REVALIDATE_SECRET`, ±5 min window, revalidates `cms-pages` /
  `cms-page-<slug>`).

## Importing RiftDen MDX articles

Two steps; nothing is published automatically.

```bash
# in riftden-platform: parse the MDX files (AST, rejects unsupported components)
node scripts/cms/export-mdx.mjs                       # dry-run report
node scripts/cms/export-mdx.mjs --out /tmp/riftden-bundle.json
# in cms/: create drafts as a staff member with an editor/admin role on riftden
npm run import:articles -- --bundle /tmp/riftden-bundle.json --as editor@example.com            # dry run
npm run import:articles -- --bundle /tmp/riftden-bundle.json --as editor@example.com --apply
```

The importer (`scripts/lib/import-bundle.ts`) runs with `overrideAccess:
false` as that staff account, creates missing categories/the `featured` tag,
creates each article as an EN draft plus RU draft locale, and skips every slug
that already exists on the site (any status) — re-running is safe and never
overwrites edited or published documents. Rejected bundle entries are listed
and never imported.

## Local setup

```bash
cd cms
cp .env.example .env            # set PAYLOAD_SECRET, PAYLOAD_DATABASE_URL, …
npm ci
npm run migrate                 # applies all migrations
npm run seed                    # creates missing sites/settings only; never accounts
npm run dev                     # http://localhost:3001/admin → create the first (owner) account
npm run jobs:worker             # in a second terminal (or CMS_JOBS_AUTORUN=true)
```

Checks: `npm run typecheck`, `npm test` (needs a local database whose name
matches `payload_*test*`; tests create and drop `<db>__<name>` scratch
databases on the same server and refuse any other host), `npm run build`.

## Docker

`Dockerfile` targets: `runner` (default, standalone server — applies pending
migrations on start because `NODE_ENV=production`) and `jobs` (worker).
`docker-compose.example.yml` wires Postgres + CMS + worker for local/staging
use; it is not connected to any live `/opt` project.

## Migrations, backup and rollback

Migration `20261022_225420_localized_page_blocks` makes page `blocks` per
language: `up` copies each page's and version's shared value into both `en`
and `ru` (creating the missing locale row) and drops the shared column;
`down` refuses and changes nothing while any page or version has different
blocks per language (its own `ROLLBACK_CHECKS`; it runs before the shared CMS
rollback, so that list needs no page-blocks entry), otherwise it restores the
shared column and deletes the locale rows that hold nothing but blocks.

Migration `20261008_191911_payload_3_90_auth` adds the nullable
`reset_password_requested_at` column that Payload 3.90 uses on auth
collections (`admins`, `members`); its `down` drops it.

Migration `20261008_174758_shared_cms` is additive: new tables/columns, two
sites, backfill of `site_id` on every guide/page/media row **and version row**,
existing admins become owners (nobody silently loses access), then `NOT NULL`
and the per-site slug indexes. `guides`/`pages` get `NOT NULL` by hand because
Payload never emits it for drafts collections.

`payload migrate:down` restores the previous schema, but **refuses** (and
changes nothing) when anything beyond the migration and the untouched seed
exists: content or versions of other sites, added/changed sites or languages,
customised site settings, non-owner staff or site roles, readers/profiles,
taxonomy and article links, new article/page/media fields in live rows **or
any version**, rich text using the new blocks, queued jobs, audit entries, or
non-unique slugs (`ROLLBACK_CHECKS` in the migration). After real use, roll back
by restoring the backup.

Before a production upgrade:

```bash
pg_dump --format=custom --file=cms-before-shared.dump "$PAYLOAD_DATABASE_URL"
tar czf media-before-shared.tgz -C /path/to/media .
# restore rehearsal on a scratch database:
createdb cms_restore_check && pg_restore --no-owner --dbname=cms_restore_check cms-before-shared.dump
```

Rollback = stop the new image, restore the dump and media, start the previous
image (`5c61a295…`).

## Known limitations

- One publication status for both locales (see above).
- Analytics cache and member rate limits are per process; the CMS is meant to
  run as one instance.
- Site frontends have adapters, reader proxy routes and the MDX importer;
  external preview mode in the frontends is still missing.
- The plugin's "Assign tenant" menu item is removed because a document's site
  is immutable; move content by recreating it.
- `npm audit` (with and without `--omit=dev`) reports 0 critical/high and 5
  moderate entries for one advisory without an upstream fix: `esbuild <= 0.24.2` (dev-server CORS) reached only through
  `@payloadcms/db-postgres → drizzle-kit → @esbuild-kit/*`, used by the
  migration CLI, never served.
