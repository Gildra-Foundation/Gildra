# Reading map — which document for which task

`CLAUDE.md` and `AGENTS.md` are already in context. Read nothing else "to get oriented": find the
file with `grep -rn` / `Grep`, then read ranges (`grep -n '^#' FILE`, then `sed -n 'A,Bp' FILE`).

| Task type | Read (only the relevant sections) | Skip |
| --- | --- | --- |
| UI / visual / CSS | `design.md`, `brand.md`, `packages/atlas-ui/README.md`, `docs/llm/atlas-theme.md`, `apps/web/components/blocks/README.md`; navigation: `docs/llm/navigation-redesign.md`; theme/transitions: `docs/llm/site-theme.md` (it is a 20 KB log — headings first) | `design-qa.md` (one old block-QA record), `docs/archive/**` |
| New block / page / game | `apps/web/components/blocks/README.md` | design docs unless visual |
| Valyro components | `docs/llm/valyro-cli.md` | — |
| Backend / API / DB | `docs/architecture.md`, `docs/backend-domains.md`, `docs/catalog-*.md` for the touched domain | all design docs |
| CMS (Payload) | `cms/` README/`VALYRO.md`, the `payload` skill | design docs beyond tokens |
| Deploy / release | `docs/deploy-ovh.md`, `docs/pre-release-checklist.md`, latest section of `HANDOFF.md`, tail of `docs/releases.md` (`sed -n '1,60p'`) | everything else |
| Auction / gear / talents | the matching `docs/auction-*.md` / `docs/gear-farm-planner.md` plan + its `docs/reports/*` | other plans |

`HANDOFF.md` holds only the latest verified release; older sections are archived in `docs/reports/`.
`docs/archive/` is history — never a source of current rules.
