import ast
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock

HERE = Path(__file__).resolve().parent


class HostReleaseTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def test_reuse_requires_exact_inputs_and_immutable_image(self):
        tree = ast.parse((HERE / 'release.py').read_text())
        fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'reuse_candidate')
        candidate = dict(revision='abc', build_key='key', previous_image='old',
                         image='gildra-web:test', image_id='sha256:new')
        image = dict(Id='sha256:new', Config={'Labels': {
            'org.opencontainers.image.revision': 'abc', 'net.gildra.patch': 'test'}})
        (self.root / 'candidate.json').write_text(json.dumps(candidate))
        docker = Mock(return_value=json.dumps([image]))
        namespace = dict(STATE=self.root, json=json, subprocess=subprocess, label='test',
                         docker=docker, read=lambda _: candidate)
        exec(compile(ast.Module(body=[fn], type_ignores=[]), '<reuse>', 'exec'), namespace)
        reuse = namespace['reuse_candidate']
        self.assertTrue(reuse('abc', {'Image': 'old'}, 'key'))
        for rev, base, key in [('other', 'old', 'key'), ('abc', 'changed', 'key'), ('abc', 'old', 'changed')]:
            docker.reset_mock()
            self.assertFalse(reuse(rev, {'Image': base}, key))
            docker.assert_not_called()
        for field, value in [('Id', 'sha256:other'), ('Config', {'Labels': {}})]:
            docker.return_value = json.dumps([{**image, field: value}])
            self.assertFalse(reuse('abc', {'Image': 'old'}, 'key'))
        docker.side_effect = subprocess.CalledProcessError(1, ['docker'])
        self.assertFalse(reuse('abc', {'Image': 'old'}, 'key'))
        (self.root / 'candidate.json').unlink()
        self.assertFalse(reuse('abc', {'Image': 'old'}, 'key'))

    def test_smoke_covers_all_routes_and_drains_failed_batch(self):
        source = (HERE / 'deploy-web.sh').read_text()
        functions = source[source.index('drain_smoke() {'):source.index('\nrollback() {')]
        curl = self.root / 'curl'
        curl.write_text('''#!/usr/bin/env python3
import fcntl,json,os,sys,time
from pathlib import Path
p=Path(os.environ['COUNTS'])
def update(delta):
 with open(str(p)+'.lock','w') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX)
  s=json.loads(p.read_text()) if p.exists() else {'active':0,'peak':0,'urls':[]}
  s['active']+=delta
  s['peak']=max(s['peak'],s['active'])
  if delta>0:s['urls'].append(sys.argv[-1])
  p.write_text(json.dumps(s))
update(1)
time.sleep(0.05)
update(-1)
sys.exit(1 if sys.argv[-1]==os.environ.get('FAIL_URL') else 0)
''')
        curl.chmod(0o755)
        script = 'set -euo pipefail\nca=unused\nsmoke_pids=()\n' + functions + '\nsmoke\n'
        counts = self.root / 'counts.json'
        env = {**os.environ, 'PATH': str(self.root) + ':' + os.environ['PATH'], 'COUNTS': str(counts)}
        for failed in [False, True]:
            counts.unlink(missing_ok=True)
            env['FAIL_URL'] = 'https://wowarcana.com/ru' if failed else ''
            result = subprocess.run(['bash', '-c', script], env=env, capture_output=True, timeout=15)
            self.assertEqual(result.returncode, 1 if failed else 0, result.stderr.decode())
            state = json.loads(counts.read_text())
            self.assertEqual(state['active'], 0, 'must drain before rollback')
            self.assertLessEqual(state['peak'], 4)
            self.assertGreater(state['peak'], 1)
            if not failed:
                self.assertEqual(len(state['urls']), 32)
                self.assertIn('https://api.wowarcana.com/readyz', state['urls'])
            else:
                self.assertEqual(len(state['urls']), 4)

    def test_rollback_waits_for_smoke_children(self):
        source = (HERE / 'deploy-web.sh').read_text()
        drain = source[source.index('drain_smoke() {'):source.index('\nsmoke() {')]
        on_exit = source[source.index('on_exit() {'):source.index('\nexec 9>')]
        marker = self.root / 'child-finished'
        script = ('set -euo pipefail\narmed=true\npatch=test\nsmoke_pids=()\n'
                  + drain + on_exit +
                  '\nrollback() { test -f "$MARKER"; }\n'
                  '(sleep 0.1; touch "$MARKER") &\nsmoke_pids+=("$!")\n'
                  'trap on_exit EXIT\nexit 1\n')
        result = subprocess.run(['bash', '-c', script],
                                env={**os.environ, 'MARKER': str(marker)}, timeout=5)
        self.assertEqual(result.returncode, 1, 'rollback must wait for pending children')
        self.assertTrue(marker.exists())

    def test_no_automatic_cache_prune_and_observation_retained(self):
        source = (HERE / 'release.py').read_text()
        self.assertNotIn("docker('builder', 'prune'", source)
        self.assertIn('while time.monotonic() - start < 120:', source)


if __name__ == '__main__':
    unittest.main()
