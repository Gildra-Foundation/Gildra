#!/usr/bin/env bash
set -euo pipefail
# Invoke the entire wrapper under flock /tmp/forever-platform-20261111/heavy.lock.
export PATH=/home/debian/.local/node-v22.23.2/bin:$PATH
task_root=$(cd "$(dirname "$0")/../.." && pwd)
task_output=/tmp/forever-platform-20261111/DATA
cd "$task_root"
python3 - > "$task_output/import.log" <<'PYIMPORT'
import importlib.util,json,pathlib,tempfile
spec=importlib.util.spec_from_file_location('forever_import','scripts/forever-data/import.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
frozen=pathlib.Path('apps/web/data/wow/forever/database')
with tempfile.TemporaryDirectory(prefix='forever-data-check-') as tmp:
    output=pathlib.Path(tmp)
    manifest=module.write_snapshot(pathlib.Path('/tmp/forever-platform-20261111/DATA/sources'),output)
    for file in output.rglob('*'):
        if file.is_file() and file.read_bytes()!=(frozen/file.relative_to(output)).read_bytes():
            raise RuntimeError('Frozen snapshot differs: '+str(file.relative_to(output)))
    print(json.dumps(manifest['inventory'],indent=2))
PYIMPORT
timeout 240 node node_modules/typescript/bin/tsc -p scripts/forever-data/tsconfig.json > "$task_output/typecheck-final.log" 2>&1
node node_modules/eslint/bin/eslint.js apps/web/lib/forever/database apps/web/components/wow/forever/library 'apps/web/app/(site)/wow/forever/library' apps/web/app/ru/wow/forever/library > "$task_output/eslint.log" 2>&1
python3 scripts/forever-data/verify.py apps/web/data/wow/forever/database > "$task_output/verify.log"
python3 scripts/forever-data/test-import.py > "$task_output/test-import.log" 2>&1
(
  cd apps/web
  node --experimental-strip-types --no-warnings --import ./tests/atlas/resolve.mjs --test ../../scripts/forever-data/test-server.ts > "$task_output/test-server.log" 2>&1
)
# Own process group, always stopped before the lock is released.
setsid npm run dev -- --hostname 127.0.0.1 --port 3126 > "$task_output/dev.log" 2>&1 &
task_dev_pid=$!
cleanup() { kill -TERM -- "-$task_dev_pid" 2>/dev/null || true; wait "$task_dev_pid" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
python3 - <<'PY'
import socket,time
for attempt in range(120):
    try:
        with socket.create_connection(('127.0.0.1',3126),timeout=.5):break
    except OSError:time.sleep(.5)
else:raise RuntimeError('Own dev server did not start')
PY
timeout 600 node scripts/forever-data/qa.cjs > "$task_output/qa.log" 2>&1
