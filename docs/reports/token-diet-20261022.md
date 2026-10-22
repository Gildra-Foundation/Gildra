# Token diet — measurement, changes, rule-preservation checklist (2026-10-22)

Rules for sessions live in [docs/llm/session-economy.md](../llm/session-economy.md); this report is the evidence.

## Measurement (12 sessions, one day, Opus 5.5 at `high` in 99.3 % of BIU)

Total ≈ 41.9M BIU (main 36.9M, subagents 5.0M). Cache read 71 %, cache write 13 %, output 14 %.
Mean context per call ≈ 209k; 59 % of cost is spent above 200k context, 26 % above 300k; no session ever compacted.
Fixed floor ≈ 62k tokens/session (35k in subagents) ≈ 26 % of BIU; `CLAUDE.md` + `AGENTS.md` ≈ 2.5k of it.
Reproduce: `python3 scripts/claude-usage-report.py`.

Top habits by cost (shares of all BIU; estimates, text ≈ chars/3.4):

1. Marathon sessions: 59 % of cost above 200k context.
2. One tool call per turn (89 % of turns), Bash 85 % of calls — each turn re-reads the full context.
3. Fixed floor ×every call: 26 %. Largest parts: system prompt + built-in tools (not controllable), skill list ≈ 3 %, MCP instructions + deferred-tool lists ≈ 2.7 %.
4. All Opus, all effort `high`: output 14 % + thinking carried in context ≈ 8 %.
5. Bash read-outputs (grep/cat/sed/ls) carried: ≈ 12.5 % (+3.6 % in subagents).
6. Subagents on Opus: 12 % of BIU (architecture-cleanup: 249 subagent calls = 30 % of that session).
7. Re-reading guidance docs: 68 reads ≈ 104k tokens, 31 were `cat CLAUDE.md/AGENTS.md` (already loaded); ≈ 2–3 %.
8. Skill list: 6.7k tokens/session, 1 skill invoked in 1 289 calls: ≈ 3 %.
9. Screenshots: 93 images, ≈ 116k tokens: ≈ 2.5 %.
10. Build/test logs: < 1 % — sessions already tail/grep them (15 builds, 2.6k output tokens). Prompt caching works (99 % cache reads).

Not a lever here: permission prompts (all 35 user turns ran `bypassPermissions`); MCP definitions (deferred; Playwright and Context7 made 0 calls).

## Estimated saving (conservative, overlaps discounted)

| Change | Est. effect on BIU |
| --- | --- |
| Restart/compact at ~200k (rule; `autoCompactWindow` proposal) | −10…15 % |
| Batch + parallel tool calls | −5…8 % |
| Sonnet/Haiku + effort by task type | −8…12 % |
| Subagents on Haiku/Sonnet (`scout`, `check-runner`, `model:` param) | −4…6 % |
| Skill list name-only, `token-guard`, reading map, output caps | −3…5 % |
| `CLAUDE.md`/`AGENTS.md` trimming, quiet logs | ≈ −1 % |
| **Total** | **≈ −25…35 %** with no check removed |

Assumptions: Sonnet/Haiku cost less per token than Opus on the subscription; savings come from behaviour changes, so they need the brief template to be used. Re-measure with the script after a week.

## Why `CLAUDE.md` was barely touched

It is 6.7 KB ≈ 2k tokens (≈ 0.7 % of BIU). Rewriting it would save < 0.3 % and conflict with the pending `claude/valyro-cli-fe52fc` edit of the Styling bullet. Only two lines changed (pointer to the economy doc; `design.md` read only for UI work). The real instruction cost was `AGENTS.md` telling every session to "start with" ≈ 12k tokens of design docs — now UI-only and section-wise.

## Rule-preservation checklist

| Critical rule | Where it lives | Status |
| --- | --- | --- |
| EN/RU parity, `app/ru/**` mirrors, `p(lang, href)`, game terms English | `CLAUDE.md` (Pages/Block pages bullets), `AGENTS.md` last paragraph | unchanged |
| Real data contracts; never invent data/characters/links/assets; `ctx.source`; assets only via `lib/games/wow/assets.ts` | `CLAUDE.md` Data bullet, `AGENTS.md` | unchanged |
| Honest UI (no `href="#"`, `.soon`/`.dead-link`/`aria-disabled`), distinct hero/data backgrounds | `CLAUDE.md` Hard design rules | unchanged |
| Atlas tokens: token-only stylesheets, `npm run atlas:check`, class names never renamed | `CLAUDE.md` Styling bullet (byte-identical), `design.md`, `docs/llm/atlas-theme.md` | unchanged |
| Valyro first (MCP / `valyro:add`, no hand-written components) | lives in `claude/valyro-cli-fe52fc` (`CLAUDE.md` Styling bullet, `AGENTS.md`, `docs/llm/valyro-cli.md`) | not on `main` yet; my edits do not touch those lines — merge-tree check below |
| Deploy safety: commit/push/deploy only on user's explicit permission; backup/rollback/health before prod changes; don't touch prod data | `CLAUDE.md` Checks & permissions, `AGENTS.md` | unchanged; plus `git push` → ask, force-push → deny in `.claude/settings.json` |
| Next.js "not the Next.js you know" block | `CLAUDE.md` tail (managed by `next dev`) | unchanged |
| Design workflow (read `design.md`, baseline/final screenshots, critique → fix, `design-review` agent) | `CLAUDE.md`, `.claude/skills/gildra-design-director` | `design.md` read now scoped to UI tasks; screenshot rule kept, with `design:compare` numbers instead of eyeballing |
| Latest release facts, rollback procedure | `HANDOFF.md` | kept; older section archived verbatim in `docs/reports/handoff-archive-auction-reliability-20261016.md` |
| 8 Oct working log (superseded by 22 Oct direction) | `docs/archive/llm-handoff-2026-10-08.md` (moved, header marks it archived) | archived |

Quality gates untouched: `npm run typecheck && npm run build`, CMS build, `go vet ./... && go test ./...`, `design:compare` pixel gate.
