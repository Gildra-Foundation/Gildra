#!/usr/bin/env python3
"""Bounded COPY-only BuildKit experiment; no npm/Next/image/load/prune.
Creates <=16 MiB fixture/output, plus small daemon COPY cache records. No cleanup.
Use a NEW output directory. Cold means --no-cache, never dropped OS disk caches.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time
import uuid


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--before', required=True, type=Path)
    p.add_argument('--after', required=True, type=Path)
    p.add_argument('--out', required=True, type=Path)
    args = p.parse_args()
    policies = {k: path.read_bytes() for k, path in [('before', args.before), ('after', args.after)]}
    args.out.mkdir(parents=True, exist_ok=False)
    fixture = args.out / 'context'
    fixture.mkdir()
    (fixture / 'Dockerfile').write_text('FROM scratch\nCOPY . /snapshot\n')
    for directory in ['docs', 'apps/web/public/maps', 'apps/web']:
        (fixture / directory).mkdir(parents=True, exist_ok=True)
    # Non-secret sentinels; never read any host environment/credential file.
    (fixture / 'apps/web/.env.local').write_text('TEST_SENTINEL=not-a-secret\n')
    (fixture / 'apps/web/.npmrc').write_text('# fixture credential sentinel\n')
    (fixture / 'apps/web/public/maps/tile.bin').write_bytes(bytes(range(256)) * 16)
    salt = uuid.uuid4().hex
    code = fixture / 'apps/web/input.txt'
    doc = fixture / 'docs/report.bin'
    records = []
    for name, policy in policies.items():
        (fixture / '.dockerignore').write_bytes(policy)
        code.write_text(salt + '-code-v1')
        doc.write_bytes(b'A' * (2 * 1024 * 1024))
        for scenario in ['cold', 'warm', 'doc-change', 'code-change']:
            if scenario == 'doc-change': doc.write_bytes(b'B' * (2 * 1024 * 1024))
            if scenario == 'code-change': code.write_text(salt + '-code-v2')
            out = args.out / f'{name}-{scenario}'
            command = ['sudo', '-n', 'docker', 'buildx', 'build', '--progress=plain', '--network=none', '--output', f'type=local,dest={out}']
            if scenario == 'cold': command.append('--no-cache')
            command.append(str(fixture))
            started = time.monotonic()
            run = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=120, check=True)
            elapsed = time.monotonic() - started
            # sudo's local exporter creates root-owned directories under its
            # umask. These are only this newly-created, symlink-free fixture.
            subprocess.run(['sudo', '-n', 'chown', '-R', f'{os.getuid()}:{os.getgid()}', str(out)], check=True, timeout=30)
            log = run.stdout.decode(errors='replace')
            (args.out / f'{name}-{scenario}.log').write_text(log)
            match = re.search(r'#(\d+) \[\d+/\d+\] COPY \. /snapshot', log)
            if not match: raise RuntimeError('COPY step not found in BuildKit log')
            cached = bool(re.search(rf'#{match[1]} CACHED\b', log))
            expected = scenario == 'warm' or (name == 'after' and scenario == 'doc-change')
            assert cached == expected, (name, scenario, cached, expected)
            snapshot = out / 'snapshot'
            assert (snapshot / 'apps/web/input.txt').read_bytes() == code.read_bytes()
            assert (snapshot / 'apps/web/public/maps/tile.bin').read_bytes() == (fixture / 'apps/web/public/maps/tile.bin').read_bytes()
            if name == 'after':
                assert not (snapshot / 'docs').exists()
                assert not (snapshot / 'apps/web/.env.local').exists()
                assert not (snapshot / 'apps/web/.npmrc').exists()
            records.append({'policy': name, 'scenario': scenario, 'copy_cached': cached, 'wall_seconds': round(elapsed, 3), 'output_bytes': sum(f.stat().st_size for f in out.rglob('*') if f.is_file())})
    result = {'note': 'COPY-only 2 MiB fixture. One observation per cell; elapsed is diagnostic, NOT a full-build speed estimate. No cache mounts, no pruning.', 'policy_sha256': {k: hashlib.sha256(v).hexdigest() for k,v in policies.items()}, 'records': records}
    (args.out / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))

if __name__ == '__main__': main()
