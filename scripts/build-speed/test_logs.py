import tempfile
import unittest
from pathlib import Path
from logs import summarize


class LogsTest(unittest.TestCase):
    def test_interleaving_cached_steps_and_no_raw_commands(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'build.log'
            path.write_text('''#1 [internal] load build context
#2 [deps 8/8] RUN --mount=type=cache npm ci TOKEN=do-not-print
#2 CACHED
#1 transferring context: 1.08GB 2.0s done
#1 DONE 2.1s
#3 [builder 1/1] RUN --mount=type=cache npm run build
#3 10.0 Generating static pages using 2 workers (0/1554) ...
#3 20.0 ✓ Generating static pages using 2 workers (1554/1554)
#3 DONE 21.0s
''')
            r = summarize(path)
            self.assertEqual(r['stages'][0]['seconds'], 2.1)
            self.assertEqual(r['stages'][0]['transferred'], '1.08GB')
            self.assertTrue(r['stages'][1]['cached'])
            self.assertEqual(r['next_events'][-1]['total'], 1554)
            self.assertNotIn('do-not-print', str(r))

    def test_incomplete_stage_is_not_reported_as_zero(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'build.log'
            path.write_text('#1 [builder 1/1] RUN --mount=type=cache npm run build\n')
            self.assertNotIn('seconds', summarize(path)['stages'][0])


if __name__ == '__main__':
    unittest.main()
