"""Run via scripts/quiet.mjs. Offline fixture wall time, never native throughput.
Before is extracted from git HEAD, not the mutable integration working tree.
"""
import hashlib, io, json, pathlib, statistics, subprocess, tarfile, tempfile, time
root = pathlib.Path(__file__).resolve().parents[5]
results = []
def runner_hash():
    return hashlib.sha256((root / 'apps/web/lib/wow/auctionGearRunner.ts').read_bytes()).hexdigest()
initial_hash = runner_hash()
with tempfile.TemporaryDirectory(prefix='auction-before-') as directory:
    before = pathlib.Path(directory)
    archive = subprocess.check_output(['git', 'archive', 'HEAD', 'apps/web/lib', 'apps/web/tests', 'apps/web/package.json', 'packages', 'package.json'], cwd=root)
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        tar.extractall(before)  # trusted local git archive, never external input
    (before / 'node_modules').symlink_to(root / 'node_modules', target_is_directory=True)
    for label, cwd in [('before', before), ('after', root)]:
        for repeat in range(5):
            start = time.monotonic()
            run = subprocess.run(['node', '--experimental-transform-types', '--no-warnings', '--import', './apps/web/tests/auction/resolve.mjs', '--test', 'apps/web/tests/auction/completion/warm-search.test.mjs', 'apps/web/tests/auction/completion/warm-first-result.test.mjs'], cwd=cwd, text=True, capture_output=True)
            samples = [json.loads(line[2:]) for line in run.stdout.splitlines() if line.startswith('# {"scope"')]
            results.append(dict(version=label, repeat=repeat, totalMs=(time.monotonic()-start)*1000, exit=run.returncode, samples=samples))
            if run.returncode:
                print(run.stdout[-5000:], run.stderr[-1000:])
    summary = {}
    for label in ['before', 'after']:
        values = [x['totalMs'] for x in results if x['version']==label]
        summary[label] = dict(medianMs=statistics.median(values), rangeMs=[min(values),max(values)])
    print(json.dumps(dict(scope='Offline synthetic transports; real Runner/catalog/persistence. No native concurrency or live speedup inference.', base=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(), runnerHash=initial_hash, runnerUnchanged=initial_hash==runner_hash(), summary=summary, runs=results), indent=2))
    if initial_hash != runner_hash() or any(x['exit'] for x in results): raise SystemExit(1)
