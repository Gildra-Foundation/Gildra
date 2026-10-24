import concurrent.futures
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from shared_memory_context import render


class MemoryContextTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'MEMORY.md').write_text('Shared decision: use the same notes.\n')
        (self.root / 'CONTEXT.md').write_text('Current task: memory setup.\n')
        (self.root / 'sessions').mkdir()
        (self.root / 'sessions/2026-10.md').write_text('# History\n\n### Old\nOld result\n\n### Latest\nVerified result\n')

    def test_both_clients_and_compaction_get_same_durable_context(self):
        for event in ['SessionStart', 'UserPromptSubmit', 'SubagentStart']:
            result = render({'cwd': '/home/debian/.t3/projects/gildra', 'hook_event_name': event}, self.root)
            output = result['hookSpecificOutput']
            self.assertEqual(output['hookEventName'], event)
            self.assertIn('Shared decision:', output['additionalContext'])
            self.assertIn('Verified result', output['additionalContext'])
            self.assertNotIn('Old result', output['additionalContext'])

    def test_unrelated_project_gets_no_gildra_memory(self):
        with patch('shared_memory_context.subprocess.run', return_value=subprocess.CompletedProcess([], 0, 'https://github.com/example/other.git', '')):
            self.assertEqual(render({'cwd': '/tmp/other'}, self.root), {})

    def test_prompt_and_repository_route_home_and_server_sessions(self):
        result = render({'cwd': '/home/debian', 'prompt': 'Проверь gildra.net'}, self.root)
        self.assertIn('hookSpecificOutput', result)
        with patch('shared_memory_context.subprocess.run', return_value=subprocess.CompletedProcess([], 0, 'git@github.com:Gildra-Foundation/Server.git', '')):
            self.assertIn('hookSpecificOutput', render({'cwd': '/home/debian/Server'}, self.root))

    def test_each_read_sees_other_agents_latest_write(self):
        payload = {'cwd': '/opt/gildra'}
        render(payload, self.root)
        (self.root / 'CONTEXT.md').write_text('Updated by the other client.\n')
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda _: render(payload, self.root), range(8)))
        self.assertTrue(all('Updated by the other client.' in r['hookSpecificOutput']['additionalContext'] for r in results))

    def test_missing_notes_are_reported_and_long_notes_are_bounded(self):
        (self.root / 'MEMORY.md').unlink()
        (self.root / 'CONTEXT.md').write_text('x' * 20000)
        result = render({'cwd': '/opt/gildra'}, self.root)['hookSpecificOutput']['additionalContext']
        self.assertIn('Cannot read MEMORY.md', result)
        self.assertIn('Truncated:', result)
        self.assertLess(len(result), 8500)

    def test_invalid_cli_input_fails_without_traceback(self):
        result = subprocess.run([sys.executable, str(Path(__file__).with_name('shared_memory_context.py'))], input='[]', capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn('invalid input', result.stderr)
        self.assertNotIn('Traceback', result.stderr)


if __name__ == '__main__':
    unittest.main()
