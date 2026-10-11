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

Start with `brand.md`, `design.md`, `components/atlas/README.md` and `docs/llm/atlas-theme.md`. User instructions take precedence. For visual decisions these documents supersede older UI descriptions in `CLAUDE.md` and historical notes.

The homepage uses character artwork and a book; the book is the table of contents and navigation. All other pages use the dark atlas theme with one shared amber accent, built from `components/atlas/` and the tokens in `app/styles/atlas-theme.css`; do not extend parchment spreads to content pages.

Find the route, component, stylesheet and data source before editing. Preserve EN/RU behaviour and real data contracts. Never invent account characters or present fixtures as live statistics. For UI changes verify desktop/mobile, EN/RU, loading/empty/error states, focus, reduced motion, and screenshots after fonts and animations finish.
