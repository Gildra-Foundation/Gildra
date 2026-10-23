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

For UI/visual work read `brand.md`, `design.md`, `packages/atlas-ui/README.md` and `docs/llm/atlas-theme.md` (only the parts you need: `grep -n '^#'` first, then `sed -n` ranges; backend, CMS, deploy and data tasks skip them). Which doc for which task, and the token rules: `docs/llm/session-economy.md`. The site is `apps/web/` (web paths below are relative to it); shared code is in `packages/`. User instructions take precedence. For visual decisions these documents supersede older UI descriptions in `CLAUDE.md` and historical notes.

Current direction (owner request, 22 October 2026): every public page, including the homepage, follows Characters: character/section artwork, dark glass surfaces, serif headings and the selected character's accent. Use the shared top navigation. The book implementation and assets are preserved but not mounted or preloaded by the active site. Use genuine Valyro components and motion through shared adapters for public UI and the Valyro-based CMS; preserve reduced-motion behavior. Earlier book/amber-only guidance in historical documents is superseded. See `docs/llm/navigation-redesign.md`.

Find the route, component, stylesheet and data source before editing. Preserve EN/RU behaviour and real data contracts. Never invent account characters or present fixtures as live statistics. For UI changes verify desktop/mobile, EN/RU, loading/empty/error states, focus, reduced motion, and screenshots after fonts and animations finish.
