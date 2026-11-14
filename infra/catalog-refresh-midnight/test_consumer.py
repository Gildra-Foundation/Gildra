import copy
import datetime as dt
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import subprocess as sp
import sys
import tempfile
import shutil
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('consumer', Path(__file__).with_name('consumer.py'))
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)


class ConsumerTests(unittest.TestCase):
    def setUp(self):
        self.now = dt.datetime(2026, 11, 11, 16, 0, tzinfo=c.UTC).timestamp()
        self.meta = {'generation': '20261111T153000Z', 'completed_at': '2026-11-11T15:59:00+00:00',
                     'host': 'ns3122102', 'retention_applied': True, 'probe_sha256': 'a'*64,
                     'snapshots': {k: str(i)*64 for i,k in enumerate(['application','images','host','manifest'])}}
        self.timer = {'ActiveState':'active','SubState':'waiting','NextElapseUSecRealtime':dt.datetime(2026,11,12,2,33,tzinfo=c.UTC).timestamp(),'LastTriggerUSec':dt.datetime(2026,11,11,2,32,tzinfo=c.UTC).timestamp()}
        self.snapshots=[{'id':str(i)*64,'hostname':self.meta['host'],'tags':['server-backup','generation='+self.meta['generation'],'component='+k]} for i,k in enumerate(self.meta['snapshots'])]
        self.props = {'Result': 'success', 'ActiveState': 'inactive', 'ExecMainStatus': '0',
                      'ExecMainCode': '1', 'ExecMainStartTimestampMonotonic': '1000000000',
                      'InactiveEnterTimestampMonotonic': '2940000000'}

    def validate(self, **kwargs):
        return c.validate(kwargs.get('meta', self.meta), kwargs.get('props', self.props),
                          self.now, 3000, kwargs.get('mtime', self.now-60))

    def test_actual_metadata_schema(self):
        self.assertEqual(self.validate(), self.meta['generation'])

    def test_missing_components_and_bad_probe(self):
        for key in self.meta['snapshots']:
            meta = copy.deepcopy(self.meta)
            del meta['snapshots'][key]
            with self.assertRaises(ValueError): self.validate(meta=meta)
        self.meta['probe_sha256'] = 'bad'
        with self.assertRaises(ValueError): self.validate()

    def test_service_failure_or_in_progress(self):
        for k,v in [('Result','exit-code'),('ActiveState','active'),('ExecMainStatus','1'),('ExecMainCode','2')]:
            props = dict(self.props, **{k:v})
            with self.assertRaises(ValueError): self.validate(props=props)

    def test_stale_generation_and_previous_invocation(self):
        self.meta['completed_at'] = '2026-11-10T15:59:00+00:00'
        with self.assertRaises(ValueError): self.validate()
        self.setUp()
        self.meta['generation'] = '20261110T153000Z'
        with self.assertRaises(ValueError): self.validate()
        self.setUp()
        with self.assertRaises(ValueError): self.validate(mtime=self.now-86400)

    def test_partial_retention_is_failure(self):
        self.meta['retention_applied'] = False
        with self.assertRaises(ValueError): self.validate()

    def test_window_earliest_schedule_no_jitter_credit(self):
        for hour in (0, 3, 16, 23):
            now = dt.datetime(2026,11,11,hour,tzinfo=c.UTC).timestamp()
            timer=dict(self.timer,NextElapseUSecRealtime=now+86400,LastTriggerUSec=now-3600 if hour<3 else dt.datetime(2026,11,11,2,30,tzinfo=c.UTC).timestamp())
            end = c.deadline(now,timer)
            self.assertLessEqual(end-now, 12*3600)
            self.assertGreater(end, now)
        now = dt.datetime(2026,11,11,2,20,tzinfo=c.UTC).timestamp()
        with self.assertRaises(ValueError): c.deadline(now,self.timer)
        now = dt.datetime(2026,11,11,2,0,tzinfo=c.UTC).timestamp()
        self.assertEqual(c.deadline(now,dict(self.timer,LastTriggerUSec=now-23*3600,NextElapseUSecRealtime=now+1800))-now,1200)

    def test_resume_retains_only_proven_prefix(self):
        rec = {'release_id': '6d78e633-74be-463b-b41e-cfc8431163da', 'run_status':'failed',
               'succeeded':c.STAGES[:3]}
        self.assertEqual(c.resume_args(rec)[-1], 'import-battlenet-quests')
        rec['succeeded'] = c.STAGES[:1] + c.STAGES[2:]
        self.assertEqual(c.resume_args(rec)[-1], 'import-raidbots')
        rec['run_status'] = 'running'
        with self.assertRaises(ValueError): c.resume_args(rec)

    def test_real_lock_contention_and_entire_command(self):
        with tempfile.TemporaryDirectory() as tmp:
            lockpath = str(Path(tmp)/'job.lock')
            with open(lockpath, 'a') as lock:
                fcntl.flock(lock, fcntl.LOCK_EX|fcntl.LOCK_NB)
                code = "import fcntl,sys; f=open(sys.argv[1],'a'); fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)"
                self.assertNotEqual(sp.run([sys.executable,'-c',code,lockpath],stderr=sp.DEVNULL).returncode,0)
                runner = c.Runner(time.time()+5,lock.fileno())
                runner.run([sys.executable,'-c',code,lockpath], allowed=(1,))
            self.assertEqual(sp.run([sys.executable,'-c',code,lockpath]).returncode,0)

    def test_real_command_failure_timeout_and_retry(self):
        with tempfile.TemporaryDirectory() as tmp, open(Path(tmp)/'lock','w') as lock:
            with self.assertRaises(RuntimeError):
                c.Runner(time.time()+3,lock.fileno()).run([sys.executable,'-c','raise SystemExit(7)'])
            before = time.time()
            with self.assertRaises(sp.TimeoutExpired):
                c.Runner(before+.4,lock.fileno()).run([sys.executable,'-c','import time; time.sleep(60)'])
            self.assertLess(time.time()-before, 1.5)
            c.Runner(time.time()+3,lock.fileno()).run([sys.executable,'-c','pass'])

    def test_success_duplicate_failure_last_good_and_resume(self):
        with tempfile.TemporaryDirectory() as tmp:
            base, state = Path(tmp)/'base', Path(tmp)/'state'
            base.mkdir()
            state.mkdir()
            (base/'latest.json').write_text(json.dumps(self.meta))
            os.utime(base/'latest.json', (self.now-60,self.now-60))
            calls = []
            fail = [False]
            def fake_run(runner, argv, **kw):
                calls.append(argv)
                if argv[0].endswith('systemctl') and 'gildra-server-backup.timer' in argv:
                    return '\n'.join(k+'='+str(v) for k,v in self.timer.items())
                if argv[0].endswith('gildra-restic'):
                    snaps=copy.deepcopy(self.snapshots)
                    for snap in snaps: snap['tags']=[x for x in snap['tags'] if not x.startswith('generation=')]+['generation='+self.meta['generation']]
                    return json.dumps(snaps)
                if argv[0].endswith('systemctl'):
                    return '\n'.join(k+'='+v for k,v in self.props.items())
                if argv[0].endswith('catalog-build-check'):
                    return '{"remote_build":"12.1.5.70783"}'
                if argv[0].endswith('catalog-pipeline') and fail[0]:
                    raise RuntimeError('mock importer failed')
            rec = {'release_id':'6d78e633-74be-463b-b41e-cfc8431163da','run_status':'failed','succeeded':c.STAGES[:3]}
            with patch.object(c.time,'time',return_value=self.now), patch.object(c.time,'monotonic',return_value=3000), \
                 patch.object(c.Runner,'run',fake_run), patch.object(c,'resume_record',return_value=rec), patch.object(c,'verify_published'), patch.object(c,'reconcile_writers'), patch.object(c.IncidentMonitor,'from_environment'), patch.object(c,'check_capacity',return_value=()), patch.object(c,'verify_native_binaries'), patch.object(c,'query_json',side_effect=lambda run,q,url=None: {'system_id':'restore' if 'restore' in url else 'source','database':'catalog','bytes':104*1024**3}), patch.dict(c.os.environ, {'DATABASE_URL':'postgres://localhost/source','CATALOG_BACKUP_RESTORE_DATABASE_URL':'postgres://localhost/restore','MIDNIGHT_RESTORE_SYSTEM_ID':'restore','MIDNIGHT_RESTORE_DATABASE':'catalog','CATALOG_BACKUP_LOCAL_DIRECTORY':str(base),'MIDNIGHT_RESTORE_FILESYSTEM_PATH':str(base)}):
                c.consume(base,state,Path('/mock'))
                original = (state/'last-good.json').read_bytes()
                n = len(calls)
                c.consume(base,state,Path('/mock'))
                self.assertEqual(len(calls), n+3) # timer/service/restic read-only checks
                for proof in base.glob("midnight-proof-*"): shutil.rmtree(proof) # simulated owner reclamation
                self.meta['generation'] = '20261111T153100Z'
                (base/'latest.json').write_text(json.dumps(self.meta))
                os.utime(base/'latest.json',(self.now-60,self.now-60))
                fail[0] = True
                with self.assertRaises(RuntimeError): c.consume(base,state,Path('/mock'))
                self.assertEqual((state/'last-good.json').read_bytes(),original)
                self.assertEqual(json.loads((state/'attempt.json').read_text())['status'],'failed')
                fail[0] = False
                for proof in base.glob("midnight-proof-*"): shutil.rmtree(proof) # explicit test-only owner reclamation
                c.consume(base,state,Path('/mock'))
                self.assertNotEqual((state/'last-good.json').read_bytes(), original)
            imports = [x for x in calls if x[0].endswith('catalog-pipeline')]
            self.assertTrue(all(x[x.index('-product')+1]=='wow' for x in imports))
            self.assertTrue(all('-resume-release' in x and '-recovery-policy' in x for x in imports))

    def test_exit_zero_without_publication_is_failure(self):
        with patch.object(c,'query_json',return_value=False):
            with self.assertRaises(ValueError): c.verify_published(None,'12.1.5.70783',self.now)
        with patch.object(c,'query_json',return_value=True):
            c.verify_published(None,'12.1.5.70783',self.now)

    def test_timeout_kills_descendant_writer(self):
        with tempfile.TemporaryDirectory() as tmp, open(Path(tmp)/'lock','w') as lock:
            marker = Path(tmp)/'escaped'
            child = "import time; from pathlib import Path; time.sleep(1); Path(%r).touch()" % str(marker)
            parent = "import subprocess,sys,time; subprocess.Popen([sys.executable,'-c',%r]); time.sleep(60)" % child
            with self.assertRaises(sp.TimeoutExpired):
                c.Runner(time.time()+.5,lock.fileno()).run([sys.executable,'-c',parent])
            time.sleep(1.1)
            self.assertFalse(marker.exists())

    def test_busy_consumer_fails_without_touching_state(self):
        with tempfile.TemporaryDirectory() as tmp:
            base, state = Path(tmp)/'base', Path(tmp)/'state'
            base.mkdir()
            with (base/'job.lock').open('a') as lock:
                fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
                with self.assertRaises(BlockingIOError): c.consume(base,state)
                self.assertFalse((state/'last-good.json').exists())


class OwnerRegressionTests(unittest.TestCase):
    setUp=ConsumerTests.setUp
    validate=ConsumerTests.validate
    def test_producer_eight_character_ids_resolve_without_weakening_identity(self):
        self.meta['snapshots']={k:v[:8] for k,v in self.meta['snapshots'].items()}
        self.assertEqual(self.validate(),self.meta['generation'])
        resolved=c.resolve_snapshots(self.meta,self.snapshots)
        self.assertEqual({len(v) for v in resolved.values()},{64})
        for mutation in ('ambiguous','component','generation','host','duplicate'):
            snaps=copy.deepcopy(self.snapshots)
            if mutation=='ambiguous': snaps.append(dict(snaps[0],id=snaps[0]['id'][:8]+'a'*56))
            if mutation=='component': snaps[0]['tags'][-1]='component=images'
            if mutation=='generation': snaps[0]['tags'][1]='generation=20261110T153000Z'
            if mutation=='host': snaps[0]['hostname']='other'
            if mutation=='duplicate': snaps[1]['id']=snaps[0]['id']
            with self.assertRaises(ValueError,msg=mutation): c.resolve_snapshots(self.meta,snaps)

    def test_pending_jitter_catchup_and_termination_margin(self):
        def at(day,h,m): return dt.datetime(2026,11,day,h,m,tzinfo=c.UTC).timestamp()
        pending={'ActiveState':'active','SubState':'waiting','NextElapseUSecRealtime':at(11,2,35),'LastTriggerUSec':at(10,2,31)}
        for minute in (20,29,31,34):
            with self.assertRaises(ValueError):c.deadline(at(11,2,minute),pending)
        fired=dict(pending,NextElapseUSecRealtime=at(12,2,31),LastTriggerUSec=at(11,2,30))
        self.assertEqual(c.deadline(at(11,2,34),fired),at(11,14,34))
        for change in ({'NextElapseUSecRealtime':at(11,2,33)}, {'LastTriggerUSec':at(9,2,30)}, {'LastTriggerUSec':at(12,2,30)}, {'ActiveState':'inactive'}):
            with self.assertRaises(ValueError):c.deadline(at(11,2,34),dict(fired,**change))
        with self.assertRaises(ValueError):c.deadline(at(11,2,16),pending) # <5m startup+termination after reserve
        self.assertEqual(c.timestamp('Thu 2026-11-12 02:33:00 UTC'),at(12,2,33))

    def test_capacity_main_database_rejected_before_native_proof(self):
        with tempfile.TemporaryDirectory() as tmp:
            usage=shutil.disk_usage(tmp)
            with patch.object(c.shutil,'disk_usage',return_value=usage._replace(free=45*1024**3)):
                with self.assertRaises(ValueError):c.check_capacity(104*1024**3,tmp,tmp)
            with patch.object(c.shutil,'disk_usage',return_value=usage._replace(free=333*1024**3)):
                self.assertEqual(len(c.check_capacity(104*1024**3,tmp,tmp)),2)
            with patch.object(c.shutil,'disk_usage',return_value=usage._replace(free=c.RESERVE-1)):
                with self.assertRaises(ValueError):c.check_reserve([tmp])
                with open(Path(tmp)/'lock','w') as lock:
                    run=c.Runner(time.time()+5,lock.fileno());run.reserve_paths=(tmp,)
                    with patch.object(c.sp,'Popen') as child:
                        with self.assertRaises(ValueError):run.run(['/must/not/run'])
                        child.assert_not_called()

    def test_database_terminal_is_required_even_after_process_exit(self):
        tag='midnight-'+'a'*32
        with patch.object(c,'query_json',side_effect=[True,False]):
            self.assertFalse(c.writers_terminal(None,tag,('source','restore')))
        with tempfile.TemporaryDirectory() as tmp, open(Path(tmp)/'lock','w') as lock:
            run=c.Runner(time.time()+10,lock.fileno())
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            def waiting(_):
                with open(Path(tmp)/'lock') as rival:
                    with self.assertRaises(BlockingIOError):fcntl.flock(rival,fcntl.LOCK_EX|fcntl.LOCK_NB)
            with patch.object(c,'writers_terminal',side_effect=[False,RuntimeError('observer outage'),True]), patch.object(c.time,'sleep',side_effect=waiting):
                c.reconcile_writers(run,tag,('source','restore'),Path(tmp))
            self.assertEqual(json.loads((Path(tmp)/'reconciliation-required.json').read_text())['status'],'db_terminal')

    def test_writer_tag_overrides_connection_string(self):
        value=c.tagged_url('postgres://localhost/db?application_name=other&sslmode=require','midnight-'+'a'*32)
        self.assertIn('application_name=midnight-',value)
        self.assertNotIn('application_name=other',value)
        with self.assertRaises(ValueError):c.tagged_url('host=localhost','test')

    def test_clock_jump_stops_child(self):
        with tempfile.TemporaryDirectory() as tmp, open(Path(tmp)/'lock','w') as lock:
            run=c.Runner(time.time()+5,lock.fileno())
            run.wall_origin-=5
            with self.assertRaises(ValueError): run.run([sys.executable,'-c','import time;time.sleep(10)'])

    def test_reserve_abort_during_child(self):
        with tempfile.TemporaryDirectory() as tmp, open(Path(tmp)/'lock','w') as lock:
            run=c.Runner(time.time()+5,lock.fileno())
            with patch.object(c,'check_reserve',side_effect=[None,ValueError('reserve')]):
                with self.assertRaises(ValueError):run.run([sys.executable,'-c','import time;time.sleep(10)'])

    def test_interrupted_attempt_is_reconciled_before_admission(self):
        with tempfile.TemporaryDirectory() as tmp:
            base,state=Path(tmp)/'base',Path(tmp)/'state';base.mkdir();state.mkdir()
            (state/'attempt.json').write_text(json.dumps({'status':'running','application_name':'midnight-'+'a'*32}))
            with patch.dict(c.os.environ,{'DATABASE_URL':'postgres://localhost/source','CATALOG_BACKUP_RESTORE_DATABASE_URL':'postgres://localhost/restore'}), patch.object(c,'reconcile_writers') as reconcile,patch.object(c.IncidentMonitor,'from_environment'),patch.object(c.Runner,'run') as run:
                with self.assertRaises(ValueError):c.consume(base,state)
                reconcile.assert_called_once()
                run.assert_not_called()

if __name__ == '__main__': unittest.main()
