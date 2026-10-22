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

## Editorial desk iteration — 22 October 2026

The desk and article workbench share a Gildra editorial masthead, restrained
site accents and readable serif headings. The latest accessible edit opens its
native editor with its original site and title language. Site actions now open
`/admin/articles` with explicit site, content locale and optional draft filter;
they no longer depend solely on the sidebar tenant cookie. Publishing schedules
and scheduled counters are hidden from roles that cannot inspect that queue.
Existing server queries, access checks and publication semantics are unchanged.

Articles have three URL-backed working views (all, drafts/edits, published
versions), a search/site/language toolbar, the exact scoped result count and an
explicit missing-title indication for the selected content language. Filters,
reload and browser history use the same normalized query contract. Valyro
Button, Badge, DataTable, StatsCard and EmptyState remain the real components;
its useFlip animates the selected view and usePresence retains the reset control
for its brief exit transition. Reduced-motion users receive no transition.
The native Payload editor, auth, site selection and jobs worker are retained.

Validation: TypeScript and all 70 unit tests passed. The isolated UI fixture
checks article history/reload, stale response cancellation, error/empty/page
recovery, keyboard controls, scoped desk actions, role-specific desk visibility,
missing localized title, EN/RU screenshots at 390/1440 px, reduced motion and
browser diagnostics. Fixture screenshots contain synthetic data; they do not
claim to validate production authentication or a real database. Build and
production release are coordinated after integration; no deployment was made
from this branch.

## Mobile article results — 22 October 2026

Below 641 px, Articles renders one semantic list of compact records instead of
the wide table. It uses the same real rows and cell renderers: title/slug, site,
complete latest-version badge, update time, editor and live-page links. Title
links are underlined in both layouts. Desktop retains all five Valyro DataTable
columns. A media-query subscription selects one result tree; no duplicate hidden
list/table is mounted. Native site-aware links, queries and access remain unchanged.
Mobile loading uses Valyro Skeleton; existing empty/error/recovery states remain.

Validation: TypeScript and 70 unit tests passed. Existing 25 UI fixture checks
passed. Nine focused fixture groups cover EN/RU at 320/390/1440 px, long text and
status wrapping, title/editor/live keyboard access, full mobile action visibility,
loading replacement, distinct empty/error states, reset and responsive resizing
with all desktop columns retained. Reduced motion passed; no page errors.
Evidence: `.artifacts/cms-v2/mobile-results/` in the implementation worktree.
These focused screenshots use synthetic rows and local routing/API adapters;
no new image build, native-auth integration run or deployment was performed.

## Native editor comparison polish — 22 October 2026

The saved-translation panel now uses Valyro Button, usePresence and
useDismissableLayer. Opening it from the comparison control moves keyboard
focus to its visible close action; closing returns focus when it was inside the
panel. A restored session preference does not take focus from the native editor.
The panel remains non-modal, so the article stays editable alongside it.

The desktop side panel and mobile bottom panel animate only transform/opacity,
respect reduced motion, and become inert immediately when closing. Mobile uses
the dynamic viewport height and bottom safe area. A failed translation request
has a retry action. Copy buttons distinguish title and summary for assistive
technology, announce success, and handle clipboard denial/unavailability with
visible manual-copy guidance. Content language is separate from UI language.
No save, publication, tenant, permission, database or dependency changes.

Validation: TypeScript and all 70 existing unit tests passed. A synthetic editor
component fixture passed 52 checks across EN/RU at 1440/390/320 px, including
focus, keyboard closing, non-modal editing, retry, clipboard success/denial,
restored preference, reduced motion and browser errors. Before/after screenshots
and results are in `.artifacts/editor-compare` of the implementation worktree.
Native authenticated integration and release are coordinated after integration.

## Native editor controls and readable guidance — 22 October 2026

Payload's 12px root made the custom language-state labels 9px and publication
instructions/checklist copy 10.2px. These native-editor additions now set scoped,
root-scaled minimums: 14px language names, 12px state labels, and 13px guidance.
The language choices wrap as cards with 56px targets; comparison, fill, language
warning and published links use genuine Valyro Buttons with 40px targets.
The sidebar warning and checklist remain readable in a narrow native sidebar.
Published links retain their original URLs and have explicit accessible names.
No global Payload typography, language-save/fill policy, permissions or
publication behavior changed.

TypeScript and 70 unit tests passed. The actual LanguageBar/ArticlePanel fixture
uses Payload's 12px root and passed 60 checks across EN/RU at 1440/390/320px with
normal and 200% text, including keyboard switching, fill/Lexical initial content,
comparison focus return, reduced motion and containment. Evidence lives under
`.artifacts/native-readability` in the implementation worktree. Native-session
verification and production release follow the integrated candidate build.
