# CMS continuation — 22 October 2026

The admin work continues the existing Valyro implementation; it does not replace
Payload authentication, permissions, tenant access, native editing or publication.

## Adopted source

The integration repository's CMS preceded the deployed Valyro workbench. This
branch adopts the immutable source snapshot at:

`/home/debian/gildra-cms-preview-ruen-analytics-20261019/cms-source-r6`

Its publication and verification are recorded in:

`/home/debian/gildra-cms-preview-production-20261019/RELEASE.md`

Regression tests were copied from the existing working checkout at:

`/home/debian/Gildra-valyro-admin-20261018/cms/tests`

The original checkout remains untouched. Its later operations work on
`src/jobs/heartbeat.ts`, `src/scripts/jobs-worker.ts` and `Dockerfile` is deliberately
not part of this adoption; the accepted R6 worker and Dockerfile are retained.
No environment files, credentials, media, database exports, build output or
original dependency directories are copied into the source changes.

Valyro source remains under `src/components/valyro-ui`, with provenance and
checksums in `registry-manifest.json`. All 76 installed checksums were verified
before work began. Components execute locally; no runtime Valyro credentials or
network requests are introduced. `VALYRO.md` and `WORKFLOWS.md` describe the earlier
18 October work; their "not deployed" statements are historical, superseded by
the 19 October release record above.

## Current improvement

- The Articles navigation item stays active on native article creation, editing
  and version routes. Permission-gated navigation and the command palette keep
  using the same model. A Valyro `useFlip` marker follows section changes and
  respects the system reduced-motion preference.
- Article search, site, latest-version filter, content language and page are
  encoded in the URL. Server initial data and client requests normalize the same
  query; reload and browser Back/Forward restore it. Search replaces the current
  history entry; other filter and page changes add an entry.
- Site identifiers continue through the existing server permission checks.
  Malformed/repeated site filters never silently expand the selection to all
  sites. No collection access or publication policy changes are included.
- Valyro reset controls retain content language while clearing filters and page.
  Empty catalogue, no matching results, out-of-range page and fetch failure have
  distinct actions. Existing request cancellation hides results from old filters.
- Valyro loading indicators and a brief result entrance provide feedback. Data is
  never retained for an exit animation; reduced motion disables result movement.

## Verification checklist

- [x] TypeScript check.
- [x] Unit suite: 61 tests, including URL normalization and active alias coverage.
- [x] Production build with dummy local settings; no database connection needed.
- [x] Local fixture browser: 17 checks covering URL/history, filters, empty/error/race
      states, EN/RU at 1440/390 px, keyboard, reduced motion and screenshots.
      Evidence: `.artifacts/admin-fixture/results.json` at the repository root.
- [ ] Authenticated integration/browser regression on an isolated test database.
- [ ] Deployment, if separately requested. No production changes were made here.

The fixture browser harness, when run, renders the actual workbench and Valyro
components with explicit synthetic rows and local routing/API adapters. It cannot
validate native Payload sessions, real tenant permissions or server rendering.
