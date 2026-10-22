# Session economy — spend subscription tokens deliberately

Measured on 12 Gildra sessions of 2026-10-22 (1 289 main + 317 subagent API calls, `python3 scripts/claude-usage-report.py`).
Unit "BIU" = base-input-equivalent tokens (cache read 0.1, cache write 1.25–2, output 5).

## What actually costs

| Driver | Share of BIU | Lever |
| --- | --- | --- |
| Re-reading the whole context on every turn (cache read) | 71 % | shorter sessions, fewer turns |
| Calls made at >200k context / >300k | 59 % / 26 % | restart or compact at ~200k (no session compacted; max 453k) |
| Fixed floor at turn 1: system prompt + 19 built-in tools + skills + MCP + CLAUDE.md ≈ 62k (35k in subagents) | ≈ 26 % | trim skills/MCP; CLAUDE.md+AGENTS.md are only ≈ 2.5k of it (≈ 1 %) |
| 1 tool call per turn (1 154 of 1 300 turns); Bash = 85 % of tool calls | — | batch commands, parallel tool calls |
| Output + thinking, effort `high` everywhere (13 % direct, ≈ 8 % more as carried context) | ≈ 14–20 % | effort by task type |
| Everything on Opus (99.3 % of BIU) | — | Sonnet/Haiku for mechanics |
| Subagents inheriting Opus (12 % of BIU) | 12 % | pass `model` |
| Bash output carried in context (grep/cat/sed/ls: 722 results ≈ 475k tokens) | ≈ 12 % | ranged reads |
| Re-`cat` of CLAUDE.md/AGENTS.md/design docs (68 reads, 31 of them already-loaded files) | ≈ 2–3 % | token-guard hook, reading map |
| Skill list (6.7k tokens/session, 1 skill invoked in 1 289 calls) | ≈ 3 % | `skillOverrides` name-only |
| Screenshots (93 images ≈ 1.2k tokens each) | ≈ 2.5 % | minor; keep to a few |
| Build/test logs | < 1 % (sessions already pipe through tail) | quiet wrappers anyway |
| Cache misses | ~0 (99 % of input tokens are cache reads) | nothing to fix |

Not the problem: permission prompts (all sessions run `bypassPermissions`), MCP tool definitions (deferred; Playwright/Context7 made 0 calls), big build logs.

## Rules for every session (agent-facing)

1. **Context budget.** Stay under ~150k; at ~200k stop, write a short handoff note (done / state / next / key paths) in the notes folder and ask the coordinator for a fresh session, or `/compact` with a focus. Never grind on at 300k+.
2. **Batch.** One Bash call per logical step (`a && echo == && b`), and independent tool calls (Read×3, Grep×2) in a single message. Do not spend a turn per `ls`.
3. **Find, then range-read.** `Grep`/`grep -rn` to locate; `grep -n '^#' doc.md` then `sed -n 'A,Bp'`; Read with `offset`/`limit`. Never dump files over ~200 lines. Wide search ("where is X used") → `scout` subagent (Haiku) or `Agent` with `model: "haiku"`.
4. **Do not re-read what is loaded.** `CLAUDE.md` and `AGENTS.md` are already in context (hook blocks the re-read). Pick docs from [README.md](README.md); skip `docs/archive/**`.
5. **Quiet heavy commands.** `npm run build:quiet`, `typecheck:quiet`, `lint:quiet`, or `npm run quiet -- <label> -- <cmd>`: one verdict line + errors, full log in `.artifacts/logs/` (grep it, never cat). Builds take ~5.5 min: background them, at most **two full production builds per task** (iterate with `typecheck:quiet` and targeted `qa:*`/`test:*`; one final build).
6. **Delegate mechanics.** Checks → `check-runner` subagent (Sonnet, returns ≤15 lines). Subagent briefs name the exact question and the output size; always pass a cheaper `model` unless the subagent must design.
7. **Screenshots.** Never view images to "see if it changed": `npm run design:capture -- --deterministic --only <routes>` then `npm run design:compare <baseline> <run>` (numbers). Look only at the flagged diffs; iterate at 1440 + 390, run the full 1440/1280/768/390 matrix once at the end; prefer viewport/element crops to tall full-page PNGs (they are downscaled anyway); ≤4 images per iteration.
8. **Terse output.** Final report = result + paths + verification, not logs, diffs or the plan again. No re-explaining the task back.
9. **MCP only when needed.** Interactive Playwright MCP only for live review/debug; scripted checks use `npm run qa:*` / `design:capture`. Context7 for current Next.js/React API questions only. Valyro MCP (after the `valyro-cli` branch merges) is cheap while deferred — enable by default.
10. **Quality gates stay.** Economy never skips: typecheck + build before commit, EN/RU parity, atlas tokens, data contracts, deploy backup/rollback checks. Cheaper means fewer wasted turns, not fewer checks.

## Coordinator: model and effort per task

| Task | Model | Effort |
| --- | --- | --- |
| Visual design, motion, new page concepts, architecture, hard debugging, security review | Opus | high (xhigh only for architecture) |
| Implementing a specified change, refactor, tests, CMS/backend feature work, docs, release prep/ops | Sonnet | medium |
| Search/triage, log reading, mechanical edits, format/rename sweeps, running checks | Haiku (or `scout`/`check-runner`) | low |
| Design audit/review | `design-review` agent (Sonnet) | — |

Set at start (`start_session` model/effort) or switch with `set_session_model` / `set_session_effort`. If a Sonnet session stalls twice on the same problem, escalate to Opus with a short state note instead of looping.

## Coordinator: brief template

```
Goal: <one sentence + done-when>.
Scope: <files/area>. Out of scope: <list>.
Model/effort: <Sonnet|Opus|Haiku> / <low|medium|high>.
Read first (only these; sections, not whole files): <paths#headings>. CLAUDE.md/AGENTS.md are already loaded.
Rules: ranged reads; batch commands; heavy checks via build:quiet/typecheck:quiet or check-runner; ≤2 full builds;
  wide search via scout/haiku subagent; screenshots via design:capture + design:compare, not by eye.
Context: stop at ~200k, write a handoff note to <notes folder> and report.
Deliver: <branch/commit/PR> — no push, no merge, no deploy without the user's OK.
Report: result + paths + checks run (≤15 lines).
```

Session lifecycle: one task per session; a follow-up on a finished task reuses the session only while context < ~120k, otherwise a fresh session with the handoff note. Archive finished sessions.

## Measuring

```bash
python3 scripts/claude-usage-report.py --top 12            # all gildra transcripts
python3 scripts/claude-usage-report.py --json out.json     # machine-readable
```

Targets: mean context per call ≤ 150k (was ~209k), calls above 200k ≤ 25 % of BIU (was 59 %), single-call turns ≤ 70 % (was 89 %), Opus ≤ 60 % of BIU (was 99 %), zero reads of `CLAUDE.md`/`AGENTS.md`.

## Tooling added with this document

- `.claude/settings.json` — read-only/check commands allowed, `git push` asks, force-push denied, third-party skills name-only, `BASH_MAX_OUTPUT_LENGTH=16000`, `MAX_MCP_OUTPUT_TOKENS=15000`, `PreToolUse` guard.
- `.claude/hooks/token-guard.py` — blocks full re-reads of CLAUDE.md/AGENTS.md, raw `npm run build|typecheck|lint` without pipe/redirect, whole-file `cat`/Read of files >80 KB. Disable once with `GILDRA_TOKEN_GUARD=off`.
- `scripts/quiet.mjs` + `npm run build:quiet|typecheck:quiet|lint:quiet|quiet`.
- `.claude/agents/check-runner.md` (Sonnet), `.claude/agents/scout.md` (Haiku).
- `scripts/claude-usage-report.py` — the measurement above.
