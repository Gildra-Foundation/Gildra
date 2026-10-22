# Valyro in the Gildra CMS

> Historical implementation notes (18 October). For the adopted released source
> and current work, see [CMS-REDESIGN.md](CMS-REDESIGN.md).

The custom CMS screens use Valyro source components, retrieved from the authenticated
hosted MCP at `https://valyro.xyz/api/mcp`. No Valyro credentials or runtime requests
are needed by the browser or CMS server.

## Integration

- Dashboard: StatsCard counters, Badge statuses, Button actions, a searchable and
  sortable DataTable for recent edits, and EmptyState for absent content.
- Analytics: Pro AnalyticsFilterBar period presets, Select for the site, StatsCard
  values and loading placeholders, BarChart with an accessible data table, and
  sortable DataTables for pages and referrers. Existing request cancellation and
  exact site/period binding are preserved.
- Site selection before creating content: Button with a loading state; the existing
  tenant selection, internal navigation and keyboard activation remain intact.
- Users and article workbenches: server-paginated DataTable, TextInput, Select,
  Badge and Button. Authentication, account forms and the article editor stay
  native Payload. See [WORKFLOWS.md](WORKFLOWS.md) for permissions and behavior.
- Payload continues to own authentication, permissions, content editing, the
  sidebar and language selection. Existing server queries and API endpoints remain
  the sources of data. No deltas, comparisons or fictional statistics are added.

`AdminSurface` provides a local ThemeScope, Russian/English locale and the CMS's
existing dark/amber tokens. Portals stay inside that scope. The document's Payload
`data-theme` is preserved. The imported theme's root selectors were narrowed from
`:root`/`html[data-theme]` to `.gd-valyro`; the remaining vendor source is unchanged
except for the filter bar's two optional visibility props. `showCompare={false}`
and `showGranularity={false}` hide controls unsupported by the current analytics
API. The original defaults remain enabled for other consumers.

## Source and review

Sources live in `src/components/valyro-ui`. `registry-manifest.json` records the
requested registry components, dependencies and source checksums, with the local
adaptations identified. Pro source is for use under this account's Valyro licence.

The working branch is `feature/valyro-cms-20261018`, based on CMS commit
`9e8a746fc05acf05b439e11e738dbbbc15b3962d` (13 October editor/navigation improvements).
This preserves the language bar, translation comparison and command palette.
The unrelated T3 workspace and the existing dirty admin checkout are untouched.

## Checks

Run from `cms/` with Node 22:

```sh
npm ci
npm run typecheck
npm run test:unit
npm run build
```

`tests/browser/analytics-switch.mjs` checks actual UI selections and every subsequent
committed DOM state against an isolated Plausible fixture. It covers delayed and
out-of-order answers, cached answers and errors. It accepts `PLAYWRIGHT_MODULE`
and `PLAYWRIGHT_EXECUTABLE_PATH` for an existing Playwright/Chromium installation.
It refuses non-local databases or names outside `payload_*test*`; it uses and
removes a separate scratch database. Test numbers are never production data.

No commit, push, production migration, deployment or production restart is part
of this change.

## Verified result — 2026-10-18

- Production build including TypeScript: passed. Unit suite: 51/51.
- Analytics browser regression: 6/6. Site selection/create flow: 8/8, including
  choosing Riftden with the keyboard and verifying the actual draft's tenant.
- T3 browser: RU/EN dashboard at 320/768/1024/1440 px without page overflow;
  table search, localized no-results feedback, sort state and editor link checked.
- Populated BarChart and top-page/referrer tables rendered in the local browser
  using an explicit synthetic analytics response; console diagnostics empty.
- React Doctor against HEAD: no new issues in changed files. Separate scan of
  the three new TypeScript adapters: no issues. Registry source checked by hash.

Production CMS still runs its previous image. No commit/push/deploy occurred.
