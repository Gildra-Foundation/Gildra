import http.server
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import unittest

HERE = Path(__file__).resolve().parent
PLAYWRIGHT = Path('/home/debian/Gildra-atlas/node_modules/playwright')
NODE = shutil.which('node') or os.path.expanduser('~/.local/node-v22.23.2/bin/node')
REMOVED = {'/analytics', '/blueprints', '/compare', '/patches', '/dev/atlas', '/diablo', '/games/world-of-warcraft',
           '/genshin', '/league-of-legends', '/wow/classes/warrior/fury'}
NETWORK = '<script>console.error("Failed to load resource: net::ERR_NETWORK_CHANGED")</script>'


class Site(http.server.BaseHTTPRequestHandler):
    visits = {}

    def do_GET(self):
        path = self.path.split('?')[0].rstrip('/') or '/'
        path = path[3:] or '/' if path == '/ru' or path.startswith('/ru/') else path
        body, status = '<main><h1>Page</h1></main>', 200
        if path in REMOVED:
            status = 404
        elif path == '/wow/raids':
            body = '<main><div style="width:3000px">wide</div></main>'
        elif path in ('/library', '/search') and self.headers.get('Sec-Fetch-Mode') == 'navigate':
            seen = self.visits[path] = self.visits.get(path, 0) + 1
            if path == '/search' or seen < 3:  # /library recovers on the third load, /search never
                body += NETWORK
        data = ('<!doctype html><html><head><title>t</title><link rel="icon" href="data:,"></head><body>' + body + '</body></html>').encode()
        self.send_response(status)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass


@unittest.skipUnless(PLAYWRIGHT.exists() and os.path.exists(NODE), 'needs the host playwright and node')
class SiteCheckTests(unittest.TestCase):
    def test_pictures_only_of_problem_pages_and_three_loads_on_network_change(self):
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Site)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        out = tempfile.TemporaryDirectory()
        self.addCleanup(out.cleanup)
        env = {**os.environ, 'BASE': f'http://127.0.0.1:{server.server_port}', 'OUT': out.name,
               'MATRIX': 'one', 'SHOTS': 'problems'}

        def step(name):
            return subprocess.run([NODE, str(HERE / 'site-check.cjs'), name], env=env, text=True, capture_output=True, timeout=300)

        self.assertEqual(step('discover').returncode, 0)
        capture = step('capture')
        self.assertEqual(capture.returncode, 0, capture.stderr)
        report = {x['path']: x for x in json.loads((Path(out.name) / 'report.json').read_text())}
        self.assertGreater(len(report), 40)
        self.assertEqual(report['/library'].get('attempts'), 3)
        self.assertEqual(report['/library']['errors'], [])
        self.assertEqual(report['/search'].get('attempts'), 3)
        self.assertTrue(all(x['ms'] > 0 for x in report.values()))
        pictured = sorted(path for path, x in report.items() if x.get('shot'))
        self.assertEqual(pictured, ['/search', '/wow/raids'])
        self.assertEqual(len(list((Path(out.name) / 'shots').iterdir())), 2)
        summary = step('summary')
        self.assertEqual(summary.returncode, 1)
        self.assertIn(f'{len(report)} pages', summary.stdout)
        self.assertIn('2 problems', summary.stdout)
        self.assertIn('horizontal overflow', summary.stdout)
        self.assertIn('ERR_NETWORK_CHANGED', summary.stdout)

        env['SHOTS'] = '1'
        shutil.rmtree(Path(out.name) / 'shots')
        self.assertEqual(step('capture').returncode, 0)
        pictures = len(list((Path(out.name) / 'shots').iterdir()))
        self.assertEqual(pictures, len([path for path in report if path not in REMOVED]))
        self.assertEqual({report[path]['status'] for path in report if path in REMOVED}, {404})


if __name__ == '__main__':
    unittest.main()
