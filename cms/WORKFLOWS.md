# CMS users and article writing

> Historical implementation notes (18 October). For the adopted released source
> and current work, see [CMS-REDESIGN.md](CMS-REDESIGN.md).

The change is prepared in `feature/valyro-cms-20261018`. It is not deployed.
No database schema changes are required.

## Users and sign-in

`/admin/users` lists CMS staff and reader accounts using Valyro DataTable,
TextInput, Select, Badge and Button. Search and pagination run on the server,
25 accounts per page; changing the query cancels and hides the previous result.
Account and profile links open Payload's native forms.

| Viewer | Staff registry | Reader registry |
| --- | --- | --- |
| Platform owner | All staff; create and manage | All readers and profiles |
| Site admin | Colleagues on administered sites and self | Readers on administered sites |
| Editor | Colleagues on edited sites and self | No access |
| Author / analyst | Self | No access |
| Reader / anonymous | No admin access | No admin access |

The registry serializes explicit account fields, never authentication documents.
Colleagues' site roles and readers' memberships are projected onto the viewer's
permitted sites. Reader profile lookups are bounded to the current page and
intersect normal collection access. A private request scope lets the server
query this page without making the profile's private `member` field queryable
to generic API callers.

Payload continues to handle password checks, sessions, cookies, lockouts and
password reset. The login screen explains staff access. When email delivery is
disabled, password recovery consistently returns 503 before looking up an
account, and the login screen explains that recovery is unavailable.

Additional access corrections:

- Staff and reader session fields verify both collection and account ID. Their
  independent numeric IDs cannot grant access to another account's sessions.
- Mixed roles such as editor of A / author of B no longer grant staff-list
  access to B.
- The native reader form may submit unchanged read-only scalars. Site admins
  can save memberships after those values are checked against a fresh,
  access-controlled account and removed from the write. Changed account values,
  unknown fields, passwords and foreign membership metadata remain forbidden.
- Generic public profile reads exclude globally blocked accounts. Private
  account relationships are readable only by self, owner or an authorized
  site moderator.

This registry covers Payload `admins`, `members` and `member-profiles`. The
separate Go API accounts and Battle.net JWT identities are not merged by email
and are not presented as CMS accounts.

## Articles

`/admin/articles` provides server search, site, content language and latest-version
filters, pagination, native editor links and article creation. A site choice
preserves the requested content language. Native bulk actions remain available
through the full list link.

A latest draft can belong to an already published article. The workbench shows
that state as unpublished edits. Live links are computed from a separate read
of the published document and its published localized content and slug. The
editor sidebar uses the same rule, so a draft translation or changed draft slug
cannot produce a premature public link.

The existing Lexical editor, editorial permissions, versions, scheduled
publication and autosave remain in use. Filling a translation copies only
empty localized title, summary and content into the current form. It preserves
filled text, status, slug, site and author. The copied body updates both the
form value and Lexical's initial value so the visible editor refreshes.
Native autosave explicitly saves a draft; publication remains a separate action.

## Verification

Use Node 22 and an isolated local PostgreSQL database named `payload_*test*`.
The tests refuse non-local or non-test database names. Each integration test
and browser scenario uses a separate scratch database.

```sh
npm run build
npm test
node tests/browser/workflows.mjs
node tests/browser/analytics-switch.mjs
node tests/browser/select-site.mjs
```

Browser scripts accept `PLAYWRIGHT_MODULE` and `PLAYWRIGHT_EXECUTABLE_PATH` for
an installed Playwright and Chromium. They create only explicit test fixtures,
start the production build on a local port and remove their scratch database.

The workflow browser scenario covers native login, user search and tenant
boundaries, article search/pagination, visible translation copying, draft
autosave, explicit publication, article creation and native reader moderation.

Verified on 2026-10-18: production build with TypeScript, all 134 tests, nine
workflow browser scenarios, six analytics scenarios and eight site-selection
scenarios passed. React Doctor found no new issues against HEAD; the eight
new workspace/view components also passed their separate scan. All 76 Valyro
source checksums and `git diff --check` passed.

T3 browser review covered Users and Articles in RU/EN at 320, 768, 1024 and
1440 CSS pixels. Settled layouts have no page-level horizontal overflow; wide
tables scroll inside their own container. The login screen also fits 320 px.
The document's dark theme remains intact. Screenshots contain isolated test
fixtures only, not production accounts.

No commit, push, deployment, production migration or service restart was made.
The live CMS remains on its previous image.
