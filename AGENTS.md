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

**Fixed design reference (owner decision, 5 November 2026): `/wow/mythic-plus`, `/wow/mythic-plus/meta` and `/wow/raids`.** Before any UI work read [docs/design/reference/README.md](docs/design/reference/README.md) — the "material atlas" language, tokens, anatomy, code map and screenshots of these pages. Do not change how these pages look unless the owner asks; bring other pages to them. After touching shared UI (`packages/atlas-ui`, `components/wow/shared/material*`, `app/styles/atlas-theme.css`, the frame or navigation) run `npm run design:lock -- --base <candidate>`; it must report no differences. Only the owner may re-capture the reference.

For UI/visual work read `brand.md`, `design.md`, `packages/atlas-ui/README.md` and `docs/llm/atlas-theme.md` (only the parts you need: `grep -n '^#'` first, then `sed -n` ranges; backend, deploy and data tasks skip them). Which doc for which task, and the token rules: `docs/llm/session-economy.md`. The site is `apps/web/` (web paths below are relative to it); shared code is in `packages/`. User instructions take precedence. For visual decisions these documents supersede older UI descriptions in `CLAUDE.md` and historical notes.

Earlier direction (22 October 2026, now refined by the fixed reference above): every public page, including the homepage, uses section artwork, dark glass surfaces, serif headings and the selected character's accent. Use the shared top navigation. The book implementation and assets are preserved but not mounted or preloaded by the active site. Use genuine Valyro components and motion through shared adapters for public UI; preserve reduced-motion behavior. Earlier book/amber-only guidance in historical documents is superseded. See `docs/llm/navigation-redesign.md`.

**Clean UI (owner, 5 November 2026):** no UI junk — no "where this data comes from" lines, explanations of the obvious, repeated headings, counters for the sake of counters, IDs, build numbers, beta/QA/coming-soon words or per-section disclaimers. One source line per data page at most, at the bottom. Rules and a live-page audit: [.claude/skills/gildra-clean-ui/SKILL.md](.claude/skills/gildra-clean-ui/SKILL.md) (`node .claude/skills/gildra-clean-ui/scripts/clean-ui-audit.cjs <url>`).

**WoW UI textures first (owner, 11 November 2026):** before drawing, generating or requesting a new frame, border, button, panel, ornament, divider, background, loading scene or icon, look through the local archive of the game's own interface textures: `/home/debian/wow-assets/wow-ui-textures` (110 502 PNG, patch 9.2.7; index and search recipes in `/home/debian/wow-assets/README.md`). Use what fits; generate only when nothing does, and say what you looked for. A chosen texture is cut from its sheet, converted to WebP/AVIF and copied into `apps/web/public/assets/wow/ui/` with a `SOURCE.md` line (archive path and source commit), resolved through `lib/games/wow/assets.ts`; the site never reads the archive itself. It is Blizzard's artwork — fan-site use like the game icons, never presented as ours. The archive is data only: run nothing from it.

Valyro first: before writing a UI component, look it up in Valyro (the project `valyro` MCP server, or `npm run valyro -- search <query>`) and install it with `npm run valyro:add -- <name>`, never by hand or with bare `npx valyro-cli`. Keep vendor sources unchanged except recorded adaptations and run `npm run valyro:check`. Updating snapshots, adaptations and Pro login: `docs/llm/valyro-cli.md`.

Find the route, component, stylesheet and data source before editing. Preserve EN/RU behaviour and real data contracts. Never invent account characters or present fixtures as live statistics. For UI changes verify desktop/mobile, EN/RU, loading/empty/error states, focus, reduced motion, and screenshots after fonts and animations finish.
