# Gildra agent contract

The agent may read and modify all files in this repository.

Allowed:
- application and frontend changes;
- backend and API changes;
- PostgreSQL migrations;
- local data imports;
- local builds and tests;
- restarting local development services.

Do not commit or push unless explicitly requested.
Production deployment, migrations, data imports, and service restarts are allowed only when explicitly requested by the user. Verify backup, rollback, and service health before production changes.
Preserve existing user changes.

## LLM context and visual direction

Start with `docs/llm/README.md`, `brand.md`, `design.md`, and the latest `docs/llm/handoff.md`. User instructions take precedence. For visual decisions these documents supersede older UI descriptions in `CLAUDE.md` and historical notes.

The homepage uses character artwork and a book. The book is the table of contents and navigation. All other pages use the dark Raid/Mythic+ atlas style with a shared orange/amber accent; do not extend parchment character spreads to other content pages.

Find the route, component, stylesheet, and data source before editing. Preserve EN/RU behavior and real data contracts. Never invent account characters or present fixtures as live statistics.

Work on an isolated branch when the shared worktree is dirty. Preserve other sessions' changes. Exclude credentials, `.env` files, dumps, build output, dependencies, and browser artifacts from commits. Read production status without exposing secrets.

Choose checks from the actual `package.json`. For UI changes verify desktop/mobile, EN/RU, loading/empty/error states, focus, reduced motion, and browser screenshots after animations finish. Documentation-only changes require link/path and diff checks; a production build is not needed for prose alone. Record actual checks and remaining issues in the handoff. A requested GitHub push does not authorize production deployment.
