import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('consumer',Path(__file__).with_name('consumer.py'))
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)

class IncidentTests(unittest.TestCase):
    def test_local_ack_immediate_age_escalation_and_resolution(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);events=root/'events.jsonl';hook=root/'hook'
            hook.write_text('#!/usr/bin/python3\nimport json,sys\np=json.load(sys.stdin)\nwith open('+repr(str(events))+',"a") as f:f.write(json.dumps(p)+"\\n")\nprint(json.dumps({"accepted":True,"incident_id":p["incident_id"]}))\n');hook.chmod(0o700)
            (root/'latest.json').write_text('{"completed_at":"2026-11-11T00:00:00+00:00"}')
            env={'MIDNIGHT_INCIDENT_EXECUTABLE':str(hook),'MIDNIGHT_INCIDENT_SHA256':hashlib.sha256(hook.read_bytes()).hexdigest(),'MIDNIGHT_INCIDENT_OPERATOR':'isolated-test-operator'}
            with patch.dict(c.os.environ,env):monitor=c.IncidentMonitor.from_environment(root,root)
            with patch.object(c.time,'monotonic',return_value=0):
                self.assertTrue(monitor.emit('started','midnight-'+'a'*32,force=True))
            with patch.object(c.time,'monotonic',return_value=30):monitor.emit('ongoing','midnight-'+'a'*32)
            with patch.object(c.time,'monotonic',return_value=301):self.assertTrue(monitor.emit('ongoing','midnight-'+'a'*32))
            self.assertTrue(monitor.emit('resolved','midnight-'+'a'*32,force=True))
            payloads=[json.loads(x) for x in events.read_text().splitlines()]
            self.assertEqual([x['event'] for x in payloads],['started','ongoing','resolved'])
            self.assertEqual(payloads[1]['blocker_age_seconds'],301)
            self.assertEqual(payloads[1]['severity'],'critical')
            self.assertIsInstance(payloads[1]['backup_generation_age_seconds'],int)
            self.assertTrue(json.loads((root/'incident.json').read_text())['delivery_acknowledged'])
            with patch.dict(c.os.environ,dict(env,MIDNIGHT_INCIDENT_SHA256='0'*64)):
                with self.assertRaises(ValueError):c.IncidentMonitor.from_environment(root,root)

    def test_hook_failure_is_not_reported_as_delivery(self):
        with tempfile.TemporaryDirectory() as tmp:
            monitor=c.IncidentMonitor(tmp,tmp,'/bin/false','isolated-test-operator')
            self.assertFalse(monitor.emit('started','midnight-'+'b'*32,force=True))
            self.assertFalse(json.loads((Path(tmp)/'incident.json').read_text())['delivery_acknowledged'])

    def test_native_provenance_missing_or_changed_binary_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);manifest={'contract_version':1,'source_base':'a'*40,'source_patch_sha256':'b'*64,'go_version':'go1.26.6','binaries':{}}
            for name in c.REQUIRED_NATIVE:
                target=root/name;target.write_text('fixture');target.chmod(0o700)
                manifest['binaries'][name]=hashlib.sha256(target.read_bytes()).hexdigest()
            file=root/'manifest.json';file.write_text(json.dumps(manifest))
            env={'MIDNIGHT_NATIVE_MANIFEST':str(file),'MIDNIGHT_NATIVE_MANIFEST_SHA256':hashlib.sha256(file.read_bytes()).hexdigest()}
            with patch.dict(c.os.environ,env):
                with self.assertRaisesRegex(ValueError,'PostgreSQL tool pins'):c.verify_native_binaries(root)
                (root/'catalog-backup').write_text('changed')
                with self.assertRaisesRegex(ValueError,'binary digest'):c.verify_native_binaries(root)
            with patch.dict(c.os.environ,dict(env,MIDNIGHT_NATIVE_MANIFEST_SHA256='0'*64)):
                with self.assertRaisesRegex(ValueError,'manifest digest'):c.verify_native_binaries(root)

    def test_reconciliation_notifies_before_wait_and_resolves(self):
        with tempfile.TemporaryDirectory() as tmp, open(Path(tmp)/'lock','w') as lock:
            events=[]
            class Monitor:
                def emit(self,event,tag,force=False):events.append(event)
            def wait(_):
                self.assertIn('started',events)
            with patch.object(c,'writers_terminal',side_effect=[False,RuntimeError('observer outage'),True]),patch.object(c.time,'sleep',wait):
                c.reconcile_writers(c.Runner(c.time.time()+10,lock.fileno()),'midnight-'+'c'*32,('source','restore'),Path(tmp),Monitor())
            self.assertEqual(events,['started','ongoing','resolved'])
