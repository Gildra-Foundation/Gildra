#!/usr/bin/env python3
"""Summarize BuildKit plain logs without echoing commands/URLs/environment values.
Durations overlap across stages: never sum them into total wall time.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path


def summarize(path):
    raw = path.read_bytes()
    steps = {}
    events = []
    for line in raw.decode(errors='replace').splitlines():
        match = re.match(r'#(\d+) (.*)', line)
        if not match:
            continue
        number, text = match.groups()
        kind = None
        if '[internal] load build context' in text: kind = 'context'
        elif '] COPY . .' in text: kind = 'source_copy'
        elif '] COPY --link' in text and 'public' in text: kind = 'public_copy'
        elif 'RUN --mount' in text and 'npm ci' in text: kind = 'npm_ci'
        elif '] RUN npm run generate:api' in text: kind = 'api_generation'
        elif 'RUN --mount' in text and 'next typegen' in text: kind = 'typecheck'
        elif 'RUN --mount' in text and 'npm run build' in text: kind = 'next_build'
        elif text == 'exporting to image': kind = 'image_export'
        if kind:
            steps.setdefault(number, {'stage': kind})
        if number in steps:
            done = re.fullmatch(r'DONE ([\d.]+)s', text)
            if done: steps[number]['seconds'] = float(done[1])
            if text == 'CACHED': steps[number]['cached'] = True
            size = re.search(r'transferring context: ([\d.]+[kMGT]?B).*done', text)
            if size: steps[number]['transferred'] = size[1]
        event = re.match(r'([\d.]+) .*?(Compiled successfully|Collecting page data|Generating static pages|Collecting build traces|Finalizing page optimization)', text)
        if event:
            row = {'step': number, 'at_seconds': float(event[1]), 'event': event[2]}
            count = re.search(r'\((\d+)/(\d+)\)', text)
            if count: row.update(completed=int(count[1]), total=int(count[2]))
            events.append(row)
    return {'log': str(path), 'sha256': hashlib.sha256(raw).hexdigest(), 'stages': list(steps.values()), 'next_events': events}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('logs', nargs='+', type=Path)
    args = parser.parse_args()
    print(json.dumps([summarize(p) for p in args.logs], indent=2))
