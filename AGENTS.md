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

Start with `brand.md`, `design.md`, `packages/atlas-ui/README.md` and `docs/llm/atlas-theme.md`. The site is `apps/web/` (web paths below are relative to it); shared code is in `packages/`. User instructions take precedence. For visual decisions these documents supersede older UI descriptions in `CLAUDE.md` and historical notes.

Current direction (owner selection, 22 October 2026, portal concept 1): the homepage follows the approved illustrated Arthas portal: central Gildra crest in a steel top rail, three section links on each side, full-width character scene, large pale serif heading and continuous illustrated Mythic+/Raids/Articles shelf. Cormorant Garamond is the portal serif; inner pages retain Characters-derived Alegreya, readable dark surfaces and real data. Appearance and game selection live in the header utility. Preserve all four character themes, RU/EN, keyboard controls and reduced motion. The book implementation and assets are preserved but not mounted or preloaded. Use genuine Valyro components and motion through shared adapters for public UI and the Valyro-based CMS. See `docs/llm/navigation-redesign.md` and `design-qa.md`.

Find the route, component, stylesheet and data source before editing. Preserve EN/RU behaviour and real data contracts. Never invent account characters or present fixtures as live statistics. For UI changes verify desktop/mobile, EN/RU, loading/empty/error states, focus, reduced motion, and screenshots after fonts and animations finish.
