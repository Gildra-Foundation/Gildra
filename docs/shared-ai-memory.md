# Shared Gildra memory

Codex and Claude on this server use
`/var/lib/gildra/codex-team/memory/gildra/` as their common durable context.
This is local filesystem continuity, not a shared model context window or a
replica of every conversation. Repository and live-service evidence outrank notes.

## Files

- `MEMORY.md`: short index, writing protocol and user preferences.
- `CONTEXT.md`: current state, open work and next actions; keep under 150 lines.
- `REFERENCE.md`: stable project facts and links; update in place.
- `sessions/YYYY-MM.md`: dated outcomes, checks, decisions and handoffs.
- `legacy-claude.md`: index of the preserved, historical Claude notes.
- `.write.lock`: advisory filesystem lock for cooperating memory writers.

Never store keys, passwords, connection strings, raw logs or full transcripts.
Dates and verification claims must come from checks that actually ran.

## Loading

User-level `SessionStart`, `UserPromptSubmit` and `SubagentStart` hooks in
`~/.codex/hooks.json` and `~/.claude/settings.json` run the same installed loader:
`~/.local/lib/gildra-ai-memory/shared_memory_context.py`.
Codex requires trusting each exact hook definition: the three integration hooks
were reviewed and trusted individually through the native `/hooks` interface.
No trust bypass flag is used. A changed hook definition needs another review.
It reads the files anew on every event and returns a bounded snapshot. It does
not write memory or call a model. Routing matches Gildra checkout paths, a
Gildra-Foundation Git remote, or a prompt explicitly mentioning Gildra.
Unrelated projects receive no Gildra snapshot. Missing notes produce a visible
message in the injected context instead of being presented as current state.

`~/.codex/AGENTS.md`, `~/.claude/CLAUDE.md`, and this workspace's instruction
files also require reading/writing the canonical files. This covers clients
that load instructions but do not run hooks. For this workspace only,
`.claude/settings.local.json` points Claude's native auto-memory at the shared
directory; other projects keep their own native auto-memory locations.
The old Claude memory files remain in place and have an explicit shared-memory
pointer. They are historical references, not current production inventory.

## Saving and concurrency

The agent updates memory before ending substantive work; hooks do not summarize
or copy arbitrary chat text. Under `flock -x` on the shared `.write.lock`, reread
the latest target, merge only your changes, and write atomically. Use the
installed `synthesis-context-lifecycle/scripts/context_edit.py` for guarded edits
to existing durable files. Do not replace a file from a stale snapshot. Keep
older session entries; archive before trimming current context.
Existing `gildra-engineering-symbiosis` task/production locks remain separate.

## Verification and operation

Run `python3 -m unittest discover -s scripts -p 'test_*.py'` for routing, live
rereads, event compatibility, bounded output and missing-file handling.
`codex debug prompt-input` renders instruction loading without a model call.
Use `claude --init-only --debug-file <private-path>` to inspect native startup
hook loading without requesting a model turn. Codex's app-server `hooks/list`
reports parse errors, enabled state and trust status; `thread/start` initializes
a session without requesting a model turn.

For the initial installation, the actual Codex request pipeline was also sent
to a loopback HTTP capture server with authentication disabled for that test
provider. The captured model input contained the hook snapshot, canonical
index, current context and latest session. The server intentionally returned
HTTP 400 after capture; no model inference was performed. Claude's native
`--init-only` debug log confirmed the same loader supplied `additionalContext`.
Private verification artifacts are under `~/.local/state/gildra-ai-memory/`.

Source and installed loader must be byte-identical after changes. Both clients
must be restarted or opened in a new session to reliably load changed hooks.
An already-running session can read the shared files immediately.

User configuration backups and an installation manifest are kept under
`~/.local/state/gildra-ai-memory/`. Restore the backed-up instruction/settings
files to disable integration. Preserve the shared notes and any later client
settings changes; remove only this integration's hook commands if settings
have changed since installation. No application service restart is required.

Native mechanisms: [Codex hooks](https://learn.chatgpt.com/docs/hooks),
[Codex instructions](https://learn.chatgpt.com/docs/agent-configuration/agents-md),
[Claude hooks](https://code.claude.com/docs/en/hooks), and
[Claude memory](https://code.claude.com/docs/en/memory).
