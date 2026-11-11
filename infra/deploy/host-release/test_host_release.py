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

    def functions(self, *names, **namespace):
        tree = ast.parse((HERE / 'release.py').read_text())
        body = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names]
        self.assertEqual(len(body), len(names))
        exec(compile(ast.Module(body=body, type_ignores=[]), '<release>', 'exec'), namespace)
        return namespace

    def test_build_report_reads_times_and_broad_patterns(self):
        import re
        report = self.functions('seconds', 'build_report', re=re)['build_report']
        warning = ("#20 119.4 ./apps/web/lib/og/atlasOg.tsx:{line}:3\n"
                   "#20 119.4 Warning: The file pattern ('/ROOT/apps/web/public/' <dynamic>) matches {n} files in [project]/apps/web\n")
        log = ('#20 727.7 ✓ Compiled successfully in 12.0min\n'
               '#20 760.1 ✓ Generating static pages using 6 workers (1598/1598) in 26.4s\n'
               + warning.format(line=44, n=129160) + warning.format(line=44, n=129160) + warning.format(line=41, n=516640))
        self.assertEqual(report(log), {'compile': 720.0, 'pages': 26.4, 'broad_patterns': [
            './apps/web/lib/og/atlasOg.tsx:41 (516640 files)', './apps/web/lib/og/atlasOg.tsx:44 (129160 files)']})
        plain = '✓ Compiled successfully in 900ms\n  Generating static pages using 6 workers (399/1598) \n'
        self.assertEqual(report(plain), {'compile': 0.9, 'broad_patterns': []})
        self.assertEqual(report('npm error'), {'broad_patterns': []})

    def test_build_reuses_before_the_lock_and_rechecks_live_after_it(self):
        source = (HERE / 'release.py').read_text()
        build = source[source.index('\ndef build():'):source.index('\ndef free_port():')]
        reuse, lock, checkout = (build.index(x) for x in ['if reuse_candidate(', 'fcntl.flock(lock', 'checkout(rev)'])
        self.assertLess(reuse, lock)
        self.assertEqual(build.count('live_base(rev)'), 2)
        self.assertLess(lock, build.rindex('live_base(rev)'))
        self.assertLess(build.rindex('live_base(rev)'), checkout)
        self.assertLess(build.index("save('build-phases.json', {**phases"), build.index("assert not phases['broad_patterns']"))
        self.assertLess(build.index("assert not phases['broad_patterns']"), build.index("save('candidate.json'"))

    def test_second_release_waits_for_the_first(self):
        import fcntl, io, threading, contextlib
        def namespace(name):
            return self.functions('queue', BUILD=self.root, label=name, os=os, fcntl=fcntl,
                                  utc=lambda: 'now', print=lambda *a, **k: said.append(a[0]))['queue']
        said = []
        first = namespace('first')()
        self.assertIn('first pid', (self.root / 'release.lock').read_text())
        done = []
        thread = threading.Thread(target=lambda: done.append(namespace('second')()), daemon=True)
        thread.start()
        thread.join(0.3)
        self.assertTrue(thread.is_alive(), 'the second release must wait')
        self.assertEqual(len(said), 1)
        self.assertIn('first pid', said[0])
        first.close()
        thread.join(5)
        self.assertFalse(thread.is_alive())
        self.assertIn('second pid', (self.root / 'release.lock').read_text())
        self.assertNotIn('first', (self.root / 'release.lock').read_text())
        done[0].close()

    def test_all_holds_the_queue_from_build_to_observe(self):
        source = (HERE / 'release.py').read_text()
        steps = source[source.index('\ndef all_steps():'):source.index("\ntimed({'build'")]
        self.assertLess(steps.index('held = timed(queue)'), steps.index('timed(build)'))
        self.assertIn('timed(deploy); timed(observe)', steps)

    def test_no_automatic_cache_prune_and_observation_retained(self):
        source = (HERE / 'release.py').read_text()
        self.assertNotIn("docker('builder', 'prune'", source)
        self.assertIn('while time.monotonic() - start < 120:', source)


if __name__ == '__main__':
    unittest.main()
