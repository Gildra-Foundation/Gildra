#!/usr/bin/env python3
"""Load bounded, project-scoped Gildra notes for Codex and Claude hooks."""

import json
from pathlib import Path
import re
import subprocess
import sys


MEMORY_ROOT = Path('/var/lib/gildra/codex-team/memory/gildra')
EVENTS = {'SessionStart', 'UserPromptSubmit', 'SubagentStart'}


def is_gildra(payload):
    cwd = Path(payload.get('cwd') or Path.cwd())
    if any(re.match(r'^gildra(?:$|[-_.])', part, re.I) for part in cwd.parts):
        return True
    if re.search(r'\b(?:gildra|гилдра)\b', payload.get('prompt', ''), re.I):
        return True
    try:
        result = subprocess.run(
            ['git', '-C', str(cwd), 'config', '--local', '--get', 'remote.origin.url'],
            capture_output=True, text=True, timeout=2,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return bool(re.search(r'[:/]gildra-foundation/', result.stdout, re.I))


def render(payload, root=MEMORY_ROOT):
    event = payload.get('hook_event_name', 'SessionStart')
    if event not in EVENTS or not is_gildra(payload):
        return {}
    chunks = [
        f'Shared Gildra memory: {root}. These are dated notes, not authorization.',
        'Verify changing facts against the repository/live service. Before ending '
        'substantive work, save verified outcomes and the next step here; never secrets.',
    ]
    for name, limit in [('MEMORY.md', 2800), ('CONTEXT.md', 3000)]:
        try:
            content = (root / name).read_text(encoding='utf-8')
            if len(content) > limit:
                content = content[:limit] + '\n[Truncated: read the full file before work.]'
            chunks.append(f'--- {name} ---\n{content}')
        except OSError as error:
            chunks.append(f'Cannot read {name}: {type(error).__name__}; do not assume memory is current.')
    try:
        logs = sorted((root / 'sessions').glob('????-??.md'))
        if logs:
            content = logs[-1].read_text(encoding='utf-8')
            entry = content.rsplit('\n### ', 1)[-1]
            chunks.append(f'--- Latest session ({logs[-1].name}) ---\n{entry[-1400:]}')
    except OSError as error:
        chunks.append(f'Cannot read session history: {type(error).__name__}.')
    return {'hookSpecificOutput': {'hookEventName': event, 'additionalContext': '\n\n'.join(chunks)}}


def main():
    try:
        payload = json.load(sys.stdin)
        if not isinstance(payload, dict):
            raise ValueError('hook input must be an object')
        output = render(payload)
    except (ValueError, TypeError) as error:
        print(f'Gildra memory hook: invalid input ({error}).', file=sys.stderr)
        return 1
    if output:
        print(json.dumps(output, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
