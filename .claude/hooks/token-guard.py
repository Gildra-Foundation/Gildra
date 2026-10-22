#!/usr/bin/env python3
"""PreToolUse guard against the three avoidable context sinks seen in session transcripts.

Blocks (exit 2, stderr goes back to the model) only when the call is clearly wasteful:
  1. `cat`/Read of CLAUDE.md or AGENTS.md in full (already loaded into every session);
  2. raw `npm run build|typecheck|lint` / `next build` / `tsc` whose output is not piped or redirected
     (use `npm run build:quiet` etc. — verdict + log file under .artifacts/logs);
  3. `cat FILE` / Read without a range of a file over 80 KB (use grep -n / sed -n 'A,Bp' / offset+limit).
Everything else passes untouched. Set GILDRA_TOKEN_GUARD=off to disable.
"""
import json, os, re, sys

LIMIT = 80_000
try:
    ev = json.load(sys.stdin)
except Exception:
    sys.exit(0)
if os.environ.get("GILDRA_TOKEN_GUARD") == "off":
    sys.exit(0)

tool = ev.get("tool_name", "")
inp = ev.get("tool_input") or {}
cwd = ev.get("cwd") or os.getcwd()


def deny(msg):
    print(f"[token-guard] {msg}", file=sys.stderr)
    sys.exit(2)


def size(path):
    p = path if os.path.isabs(path) else os.path.join(cwd, path)
    try:
        return os.path.getsize(p)
    except OSError:
        return 0


def is_loaded_doc(path):
    """CLAUDE.md / AGENTS.md at the session root (cwd or one of its parents) are auto-loaded."""
    if not re.search(r"(^|/)(CLAUDE|AGENTS)\.md$", path):
        return False
    full = os.path.abspath(path if os.path.isabs(path) else os.path.join(cwd, path))
    here = os.path.abspath(cwd)
    return here == os.path.dirname(full) or here.startswith(os.path.dirname(full) + os.sep)


if tool == "Read":
    path = inp.get("file_path", "")
    ranged = inp.get("offset") or inp.get("limit") or inp.get("pages")
    if not ranged and is_loaded_doc(path):
        deny("CLAUDE.md/AGENTS.md are already in your context; do not read them again (use grep -n on a specific rule if needed).")
    if not ranged and size(path) > LIMIT and not re.search(r"\.(png|jpe?g|webp|gif|pdf)$", path, re.I):
        deny(f"{os.path.basename(path)} is {size(path)//1000} KB; read a range (offset/limit) or Grep for the part you need.")
    sys.exit(0)

if tool != "Bash":
    sys.exit(0)

cmd = inp.get("command", "")
piped = re.search(r"[|>]|\btee\b|quiet", cmd) is not None

for part in re.split(r"\s*(?:&&|\|\||;|\n)\s*", cmd):
    part = part.strip()
    m = re.fullmatch(r"cat\s+(.+)", part)
    if m and "|" not in cmd and ">" not in cmd:
        files = [f.strip("'\"") for f in m.group(1).split() if not f.startswith("-")]
        if any(is_loaded_doc(f) for f in files):
            deny("CLAUDE.md/AGENTS.md are already in your context; do not cat them again.")
        big = [f for f in files if size(f) > LIMIT]
        if big:
            deny(f"{big[0]} is {size(big[0])//1000} KB; use grep -n / sed -n 'A,Bp' for the part you need.")
    if not piped and re.match(r"(npm run (build|typecheck|lint)|npx next build|next build|npx tsc|tsc)(\s|$)", part):
        deny("raw build/typecheck/lint output floods the context; run `npm run build:quiet` / `typecheck:quiet` / `lint:quiet` "
             "(or `npm run quiet -- <label> -- <cmd>`). Full log lands in .artifacts/logs/; grep it for details. "
             "To keep raw output, redirect it (`> file 2>&1`) or pipe to tail/grep.")
sys.exit(0)
