"""Optional real PostgreSQL terminal/lock test on the coordinator's disposable DB."""
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('consumer',Path(__file__).with_name('consumer.py'))
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)

@unittest.skipUnless(os.environ.get('MIDNIGHT_DISPOSABLE_PG')=='midnight-fill-coordinator-pg','explicit disposable DB opt-in required')
class TerminalPostgresTest(unittest.TestCase):
    def test_real_database_session_holds_exclusion_until_terminal(self):
        command=['sudo','-n','docker','exec','midnight-fill-coordinator-pg','psql','-U','postgres','-X','-qAt','-v','ON_ERROR_STOP=1','-c']
        tag='midnight-'+'b'*32
        writer=subprocess.Popen(command+["SET application_name='%s'; BEGIN; CREATE TEMP TABLE writer_probe(n int); INSERT INTO writer_probe VALUES(1); SELECT pg_sleep(3); COMMIT;"%tag],stdout=subprocess.DEVNULL)
        observed=[]
        def query(run,sql,url=None):
            result=subprocess.run(command+[sql],check=True,text=True,capture_output=True)
            value=json.loads(result.stdout)
            observed.append(value)
            return value
        try:
            for _ in range(30):
                with patch.object(c,'query_json',query):
                    if not c.writers_terminal(None,tag,('source','restore')):break
                time.sleep(.05)
            else:self.fail('database writer was not observed')
            with tempfile.TemporaryDirectory() as tmp,open(Path(tmp)/'job.lock','w') as lock:
                fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
                run=c.Runner(time.time()+10,lock.fileno())
                native_sleep=time.sleep
                def wait(_):
                    with open(Path(tmp)/'job.lock') as rival:
                        with self.assertRaises(BlockingIOError):fcntl.flock(rival,fcntl.LOCK_EX|fcntl.LOCK_NB)
                    native_sleep(.1)
                with patch.object(c,'query_json',query),patch.object(c.time,'sleep',wait):
                    c.reconcile_writers(run,tag,('source','restore'),Path(tmp))
                self.assertIn(False,observed)
                self.assertEqual(observed[-2:],[True,True])
                self.assertEqual(json.loads((Path(tmp)/'reconciliation-required.json').read_text())['status'],'db_terminal')
            self.assertEqual(writer.wait(timeout=5),0)
        finally:
            if writer.poll() is None:
                subprocess.run(command+["SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name='%s';"%tag],stdout=subprocess.DEVNULL,check=True)
                writer.wait(timeout=5)
