#!/usr/bin/python3
"""Backup-success consumer. Native foreground binaries only; no Docker CLI jobs."""
import datetime as dt
import hashlib
import fcntl
import json
import os
from pathlib import Path
import re
import signal
import shutil
import uuid
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
import subprocess as sp
import sys
import time

UTC = dt.timezone.utc
BASE = Path('/var/lib/gildra-server-backup')
STATE = Path('/var/lib/gildra-catalog-midnight')
BIN = Path('/usr/local/lib/gildra-catalog/bin')
STAGES = ['import-wago', 'import-raidbots', 'import-db2', 'import-battlenet-quests',
          'import-battlenet', 'import-battlenet-media', 'import-listfile',
          'enrich-battlenet-quests', 'enrich-battlenet-missing', 'rebuild-descriptions',
          'rebuild-item-variants', 'rebuild-spell-effects', 'rebuild-projections',
          'rebuild-entity-graph', 'refresh-coverage']


def atomic(path, data):
    tmp = path.with_suffix('.new')
    with tmp.open('w') as out:
        json.dump(data, out)
        out.flush()
        os.fsync(out.fileno())
    os.replace(tmp, path)
    fd = os.open(path.parent, os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def validate(meta, props, now, monotonic, mtime):
    if any(props.get(k) != v for k, v in {'Result': 'success', 'ActiveState': 'inactive',
            'ExecMainStatus': '0', 'ExecMainCode': '1'}.items()):
        raise ValueError('backup service did not exit successfully')
    start = now - monotonic + int(props['ExecMainStartTimestampMonotonic']) / 1e6
    end = now - monotonic + int(props['InactiveEnterTimestampMonotonic']) / 1e6
    completed = dt.datetime.fromisoformat(meta['completed_at']).timestamp()
    generation = dt.datetime.strptime(meta['generation'], '%Y%m%dT%H%M%SZ').replace(tzinfo=UTC).timestamp()
    if not (0 <= now - completed <= 3600 and start - 2 <= generation <= completed <= end + 2
            and start - 2 <= mtime <= end + 2 and 0 <= now - generation <= 26 * 3600):
        raise ValueError('stale or mismatched backup generation/invocation')
    if meta.get('host') != 'ns3122102' or meta.get('retention_applied') is not True:
        raise ValueError('backup host/retention unverified')
    ids = meta.get('snapshots', {})
    if any(not re.fullmatch('[0-9a-f]{8}|[0-9a-f]{64}', ids.get(k, ''))
           for k in ['application', 'images', 'host', 'manifest']):
        raise ValueError('missing/invalid component snapshot')
    if len(set(ids.values())) != len(ids) or not re.fullmatch('[0-9a-f]{64}', meta.get('probe_sha256', '')):
        raise ValueError('invalid probe or duplicate snapshot')
    return meta['generation']


def resolve_snapshots(meta, snapshots):
    """Consumer contract v2: producer prefixes are hints, never identities."""
    resolved = {}
    for component in ('application', 'images', 'host', 'manifest'):
        prefix = meta['snapshots'][component]
        candidates = [s for s in snapshots if s.get('id', '').startswith(prefix)]
        if len(candidates) != 1:
            raise ValueError('ambiguous or missing snapshot prefix')
        snap = candidates[0]
        required = {'server-backup', 'generation=' + meta['generation'], 'component=' + component}
        if (not re.fullmatch('[0-9a-f]{64}', snap.get('id', ''))
                or snap.get('hostname') != meta['host'] or not required <= set(snap.get('tags', []))
                or {t for t in snap.get('tags', []) if t.startswith('component=')} != {'component=' + component}
                or {t for t in snap.get('tags', []) if t.startswith('generation=')} != {'generation=' + meta['generation']}):
            raise ValueError('snapshot identity/provenance mismatch')
        resolved[component] = snap['id']
    if len(set(resolved.values())) != 4:
        raise ValueError('component snapshots must be distinct')
    return resolved


def timestamp(value):
    if isinstance(value, (int, float)) or re.fullmatch(r'[0-9]+(?:\.[0-9]+)?',str(value)):
        return float(value)
    for pattern in ('%a %Y-%m-%d %H:%M:%S.%f %Z', '%a %Y-%m-%d %H:%M:%S %Z'):
        try:
            return dt.datetime.strptime(value, pattern).replace(tzinfo=UTC).timestamp()
        except ValueError:
            pass
    raise ValueError('timer timestamp unavailable')


def deadline(now, timer):
    if timer.get('ActiveState') != 'active' or timer.get('SubState') != 'waiting':
        raise ValueError('backup timer is not waiting; activation/catch-up review required')
    next_actual = timestamp(timer['NextElapseUSecRealtime'])
    last = timestamp(timer['LastTriggerUSec'])
    current = dt.datetime.fromtimestamp(now, UTC)
    today = current.replace(hour=2, minute=30, second=0, microsecond=0).timestamp()
    if last > now or next_actual <= now or now-last > 26*3600:
        raise ValueError('timer clock/catch-up state unsafe')
    if now >= today and last < today:
        raise ValueError('today backup is pending, including randomized delay')
    earliest = today if now < today else today + 86400
    end = min(now + 12*3600, earliest-600, next_actual-600)
    if end-now < 300:
        raise ValueError('no safe startup/write/termination window')
    return end


RESERVE = 20 * 1024**3


def check_capacity(source_bytes, dump_path, restore_path):
    if not isinstance(source_bytes, int) or source_bytes <= 0:
        raise ValueError('source size not proven')
    # Conservative uncompressed dump plus full restore and index/work headroom.
    budgets = {}
    for path, size in ((dump_path, source_bytes), (restore_path, source_bytes*2)):
        path = Path(path)
        device = path.stat().st_dev
        entry = budgets.setdefault(device, [path, 0])
        entry[1] += size
    for path, size in budgets.values():
        if shutil.disk_usage(path).free < size + RESERVE:
            raise ValueError('full dump/restore capacity plus 20GiB reserve not provisioned')
    return tuple(str(p) for p in (dump_path, restore_path))


def check_reserve(paths):
    if any(shutil.disk_usage(p).free < RESERVE for p in paths):
        raise ValueError('20GiB reserve breached; aborting owned process')


def tagged_url(value, tag):
    parsed = urlsplit(value)
    if parsed.scheme not in ('postgres', 'postgresql'):
        raise ValueError('explicit PostgreSQL URI required for writer attribution')
    query = [(k,v) for k,v in parse_qsl(parsed.query) if k != 'application_name']
    return urlunsplit(parsed._replace(query=urlencode(query + [('application_name', tag)])))


class Runner:
    def __init__(self, end, lock_fd):
        self.end, self.lock_fd = end, lock_fd
        self.reserve_paths = ()
        self.wall_origin, self.mono_origin = time.time(), time.monotonic()

    def run(self, argv, *, capture=False, allowed=(0,)):
        check_reserve(self.reserve_paths)
        remaining = self.end - time.time()
        if remaining <= 0:
            raise TimeoutError('write window exhausted')
        # Inherited lock prevents backup admission if the supervisor dies first.
        p = sp.Popen(argv, start_new_session=True, pass_fds=(self.lock_fd,),
                     stdout=sp.PIPE if capture else None, text=True)
        try:
            grace = min(30, remaining / 2)
            monotonic_stop = time.monotonic() + remaining - grace
            while True:
                check_reserve(self.reserve_paths)
                if abs((time.time()-self.wall_origin)-(time.monotonic()-self.mono_origin)) > 2:
                    raise ValueError("clock moved during write window")
                wait = min(self.end - time.time() - grace, monotonic_stop - time.monotonic())
                if wait <= 0:
                    raise sp.TimeoutExpired(Path(argv[0]).name, remaining)
                try:
                    output, _ = p.communicate(timeout=min(1, wait))
                    break
                except sp.TimeoutExpired:
                    continue
            if p.returncode not in allowed:
                raise RuntimeError('command failed: ' + Path(argv[0]).name)
            return output
        finally:
            # Also reap unexpected descendants after nominal parent exit.
            try:
                os.killpg(p.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            if p.poll() is None:
                try:
                    p.wait(timeout=min(30, max(.01, self.end - time.time())))
                except sp.TimeoutExpired:
                    pass
            try:
                os.killpg(p.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            p.wait()


def resume_args(record):
    if not record:
        return []
    if record['run_status'] == 'running':
        raise ValueError('interrupted running release needs operator reconciliation')
    import uuid
    release = str(uuid.UUID(record['release_id']))
    succeeded = record.get('succeeded', [])
    first = next((stage for stage in STAGES if stage not in succeeded), STAGES[-1])
    return ['-resume-release', release, '-resume-from', first]


def resume_record(run, version):
    # Version already matched digits; psql credentials stay in environment, not argv.
    query = """BEGIN READ ONLY; SET LOCAL statement_timeout='20s';
SELECT coalesce((SELECT json_build_object('release_id',r.id,'run_status',p.status,
 'succeeded',(SELECT coalesce(json_agg(DISTINCT s.stage_key),'[]'::json)
 FROM catalog_pipeline_stages s JOIN catalog_pipeline_stages a ON a.run_id=s.run_id
 AND a.stage_key='release-start' WHERE a.counters->>'release_id'=r.id::text
 AND s.status='succeeded')) FROM catalog_releases r
 JOIN game_products g ON g.id=r.product_id
 JOIN catalog_pipeline_runs p ON p.id=r.pipeline_run_id
 WHERE g.slug='wow' AND r.build_version='%s' AND r.status IN ('failed','staging')
 ORDER BY r.created_at DESC LIMIT 1),'null'::json); ROLLBACK;""" % version
    return query_json(run, query)


def query_json(run, query, url=None):
    env_url = url or os.environ.get('DATABASE_URL')
    if not env_url:
        raise ValueError('explicit DATABASE_URL required')
    # libpq accepts a conninfo string via PGDATABASE; never print it.
    old = os.environ.get('PGDATABASE')
    os.environ['PGDATABASE'] = tagged_url(env_url, 'midnight-observer')
    try:
        value = run.run(['/usr/bin/psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', query], capture=True)
        return json.loads(value)
    finally:
        if old is None:
            os.environ.pop('PGDATABASE', None)
        else:
            os.environ['PGDATABASE'] = old


def verify_published(run, version, started):
    # Do not equate exit zero with PublicationReady (already-published retry can return zero).
    result = query_json(run, """BEGIN READ ONLY; SET LOCAL statement_timeout='20s';
SELECT to_json(EXISTS(SELECT 1 FROM game_products g
 JOIN catalog_public_release_state p ON p.product_id=g.id
 JOIN catalog_releases r ON r.id=p.release_id
 JOIN catalog_read_model_state m ON m.product_id=g.id
 WHERE g.slug='wow' AND r.build_version='%s' AND r.status='published'
 AND m.refreshed_at>=to_timestamp(%f)
 AND (SELECT status='succeeded' AND publication_ready FROM catalog_pipeline_runs
      WHERE product='wow' AND build_version='%s' AND mode='apply'
      ORDER BY id DESC LIMIT 1)));
ROLLBACK;""" % (version, started, version))
    if result is not True:
        raise ValueError('publication/read-model confirmation missing')


REQUIRED_NATIVE = {'catalog-backup','catalog-build-check','catalog-pipeline','db2-import',
                   'catalog-import','raidbots-import','listfile-import','catalog-index'}

def verify_native_binaries(binary):
    path=Path(os.environ['MIDNIGHT_NATIVE_MANIFEST'])
    raw=path.read_bytes()
    if hashlib.sha256(raw).hexdigest()!=os.environ['MIDNIGHT_NATIVE_MANIFEST_SHA256']:
        raise ValueError('native manifest digest mismatch')
    manifest=json.loads(raw)
    if (manifest.get('contract_version')!=1 or not re.fullmatch('[0-9a-f]{40}',manifest.get('source_base',''))
            or not re.fullmatch('[0-9a-f]{64}',manifest.get('source_patch_sha256',''))
            or not manifest.get('go_version') or not REQUIRED_NATIVE<=set(manifest.get('binaries',{}))):
        raise ValueError('native build provenance incomplete')
    for name,expected in manifest['binaries'].items():
        target=Path(binary)/name
        if Path(name).name!=name or target.is_symlink() or not os.access(target,os.X_OK):
            raise ValueError('invalid native binary path')
        if hashlib.sha256(target.read_bytes()).hexdigest()!=expected:
            raise ValueError('native binary digest mismatch')
    if set(manifest.get('pg_tools',{}))!={'psql','pg_dump','pg_restore'}:
        raise ValueError('matching PostgreSQL tool pins missing')
    for name,pin in manifest['pg_tools'].items():
        target=Path(pin['path'])
        actual='/usr/bin/psql' if name=='psql' else shutil.which(name)
        if not actual or target.resolve()!=Path(actual).resolve() or hashlib.sha256(target.read_bytes()).hexdigest()!=pin['sha256']:
            raise ValueError('PostgreSQL tool digest/path mismatch')
    return manifest


def consume(base=BASE, state=STATE, binary=BIN):
    os.environ["TZ"]="UTC"
    os.environ["LC_ALL"]="C"
    state.mkdir(parents=True, exist_ok=True)
    with (base / 'job.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        run = Runner(time.time()+60, lock.fileno())
        incident_error = None
        try:
            incident = IncidentMonitor.from_environment(state, base)
        except (OSError, ValueError, KeyError) as exc:
            incident, incident_error = None, exc
        # A previous supervisor may have been killed without updating attempt.json.
        # Reconcile its exact writer identity before any new admission or retry.
        attempt = state / 'attempt.json'
        if attempt.exists():
            previous = json.loads(attempt.read_text())
            if previous.get('status') == 'running':
                reconcile_writers(run, previous['application_name'],
                    (os.environ['DATABASE_URL'], os.environ['CATALOG_BACKUP_RESTORE_DATABASE_URL']), state, incident)
                raise ValueError('previous interrupted attempt requires operator pipeline reconciliation')
        if incident_error is not None:
            raise incident_error
        timer = dict(line.split("=",1) for line in run.run(["/usr/bin/systemctl","show","gildra-server-backup.timer","--property=ActiveState,SubState,NextElapseUSecRealtime,LastTriggerUSec"],capture=True).splitlines())
        end = deadline(time.time(),timer)
        run.end = end
        props = dict(line.split('=', 1) for line in run.run([
            '/usr/bin/systemctl', 'show', 'gildra-server-backup.service',
            '--property=Result,ActiveState,ExecMainStatus,ExecMainCode,ExecMainStartTimestampMonotonic,InactiveEnterTimestampMonotonic'], capture=True).splitlines())
        with (base / 'latest.json').open() as stream:
            meta = json.load(stream)
            mtime = os.fstat(stream.fileno()).st_mtime
        generation = validate(meta, props, time.time(), time.monotonic(), mtime)
        snapshots = json.loads(run.run(['/usr/local/sbin/gildra-restic','snapshots','--json'],capture=True))
        resolved = resolve_snapshots(meta,snapshots)
        done = state / 'last-good.json'
        if done.exists() and json.loads(done.read_text())['generation'] == generation:
            return
        tag = 'midnight-' + uuid.uuid4().hex
        source_url = os.environ['DATABASE_URL']
        restore_url = os.environ['CATALOG_BACKUP_RESTORE_DATABASE_URL']
        identity_sql = "BEGIN READ ONLY; SET LOCAL statement_timeout='20s'; SELECT json_build_object('system_id',(SELECT system_identifier::text FROM pg_control_system()),'database',current_database(),'bytes',pg_database_size(current_database())); ROLLBACK;"
        source = query_json(run,identity_sql,source_url)
        restore = query_json(run,identity_sql,restore_url)
        if (source['system_id'],source['database']) == (restore['system_id'],restore['database']):
            raise ValueError('restore target is production database')
        if (restore['system_id'] != os.environ['MIDNIGHT_RESTORE_SYSTEM_ID'] or restore['database'] != os.environ['MIDNIGHT_RESTORE_DATABASE']):
            raise ValueError('restore target identity not provisioned')
        dump_root=Path(os.environ['CATALOG_BACKUP_LOCAL_DIRECTORY'])
        restore_path=Path(os.environ['MIDNIGHT_RESTORE_FILESYSTEM_PATH'])
        run.reserve_paths=check_capacity(source['bytes'],dump_root,restore_path)
        verify_native_binaries(binary)
        # One owned proof generation at most. No deletion/retention change is implied.
        if list(dump_root.glob('midnight-proof-*')):
            raise ValueError('previous owned proof requires agreed reclamation before another attempt')
        proof_dir=dump_root / ('midnight-proof-' + generation)
        proof_dir.mkdir(mode=0o700)
        os.environ['CATALOG_BACKUP_LOCAL_DIRECTORY']=str(proof_dir)
        os.environ['DATABASE_URL']=tagged_url(source_url,tag)
        os.environ['CATALOG_BACKUP_RESTORE_DATABASE_URL']=tagged_url(restore_url,tag)
        atomic(state / 'attempt.json', {'contract_version':2,'generation': generation, 'status': 'running', 'deadline': end,'application_name':tag,'resolved_snapshots':resolved})
        try:
            # Retained supported legacy recovery implementation. It records REAL catalog manifests.
            # Operator provisions an isolated scratch restore DB and native pg tools beforehand.
            run.run([str(binary / 'catalog-backup'), '-product', 'wow', '-restore-proof', 'full', '-skip-local-retention',
                     '-timeout', str(max(1, int(end-time.time()-60)))+'s'])
            check = json.loads(run.run([str(binary / 'catalog-build-check'), '-product', 'wow'], capture=True))
            version = check['remote_build']
            if not re.fullmatch(r'12\.\d+\.\d+\.\d+', version):
                raise ValueError('current live build is outside Midnight; operator review required')
            resume = resume_args(resume_record(run, version))
            # Battle.net enrichment shares one hourly quota with the live site.
            pace = os.environ.get('MIDNIGHT_ENRICHMENT_REQUESTS_PER_HOUR', '').strip()
            if pace:
                if not pace.isdigit() or int(pace) <= 0:
                    raise ValueError('MIDNIGHT_ENRICHMENT_REQUESTS_PER_HOUR must be a positive integer')
                resume = ['-enrichment-requests-per-hour', pace] + resume
            started = time.time()
            run.run([str(binary / 'catalog-pipeline'), '-mode', 'apply', '-trigger', 'schedule',
                     '-product', 'wow', '-profile', 'retail-foundation', '-version', version,
                     '-sources', 'wago,raidbots,db2,battlenet,listfile', '-bin-dir', str(binary),
                     '-max-records', '0', '-confirm-full-import', '-publication-environment', 'production',
                     '-recovery-policy', 'verified_same_host', '-timeout',
                     str(max(1, int(end-time.time()-60)))+'s'] + resume)
            verify_published(run, version, started)
            reconcile_writers(run, tag, (source_url,restore_url), state, incident)
            atomic(done, {'generation': generation, 'version': version, 'completed_at': time.time()})
            atomic(state / 'attempt.json', {'generation': generation, 'status': 'succeeded'})
        except Exception as exc:
            reconcile_writers(run, tag, (source_url,restore_url), state, incident)
            atomic(state / 'attempt.json', {'generation': generation, 'application_name':tag, 'status': 'failed',
                                           'error': type(exc).__name__, 'failed_at': time.time()})
            raise
        finally:
            os.environ['DATABASE_URL']=source_url
            os.environ['CATALOG_BACKUP_RESTORE_DATABASE_URL']=restore_url
            os.environ['CATALOG_BACKUP_LOCAL_DIRECTORY']=str(dump_root)


def writers_terminal(run, tag, urls):
    if not re.fullmatch('midnight-[0-9a-f]{32}',tag):
        raise ValueError('invalid writer identity')
    query = "BEGIN READ ONLY; SET LOCAL statement_timeout='5s'; SELECT to_json(NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='%s' AND pid<>pg_backend_pid())); ROLLBACK;" % tag
    return all(query_json(run,query,url) is True for url in urls)


def reconcile_writers(run, tag, urls, state, incident=None):
    # Fail closed under the same EX lock, including observer outage. Systemd
    # must not force-kill this holder while server completion is unproven.
    old_term=signal.signal(signal.SIGTERM,signal.SIG_IGN)
    old_int=signal.signal(signal.SIGINT,signal.SIG_IGN)
    pending=False
    while True:
        try:
            if writers_terminal(Runner(time.time()+30,run.lock_fd),tag,urls):
                if pending:
                    if incident: incident.emit('resolved', tag, force=True)
                    atomic(state/'reconciliation-required.json',{'application_name':tag,'status':'db_terminal'})
                signal.signal(signal.SIGTERM,old_term)
                signal.signal(signal.SIGINT,old_int)
                return
        except Exception:
            pass
        if incident:
            incident.emit('started' if not pending else 'ongoing', tag, force=not pending)
        if not pending:
            try:
                atomic(state/'reconciliation-required.json',{'application_name':tag,'status':'awaiting_db_terminal'})
                pending=True
            except OSError:
                # Disk failure is not permission to release the backup exclusion.
                print('Midnight writer reconciliation pending; state unavailable',file=sys.stderr)
        time.sleep(5)


class IncidentMonitor:
    """Local executable contract; destination/operator must be provisioned separately.

    It is not an alert sink itself. A JSON file or journal line is not delivery.
    The configured executable must synchronously acknowledge delivery/queueing.
    """
    def __init__(self, state, base, executable, operator):
        self.state, self.base = Path(state), Path(base)
        self.executable, self.operator = executable, operator
        self.started, self.last_attempt = time.monotonic(), None
        self.incident_id = uuid.uuid4().hex

    @classmethod
    def from_environment(cls, state, base):
        executable=Path(os.environ['MIDNIGHT_INCIDENT_EXECUTABLE'])
        expected=os.environ['MIDNIGHT_INCIDENT_SHA256']
        operator=os.environ['MIDNIGHT_INCIDENT_OPERATOR'].strip()
        if not operator or not executable.is_absolute() or not os.access(executable,os.X_OK):
            raise ValueError('named incident operator/executable not provisioned')
        if not re.fullmatch('[0-9a-f]{64}',expected) or hashlib.sha256(executable.read_bytes()).hexdigest()!=expected:
            raise ValueError('incident executable digest mismatch')
        return cls(state,base,str(executable),operator)

    def emit(self, event, tag, force=False):
        now=time.monotonic()
        if not force and self.last_attempt is not None and now-self.last_attempt<60:
            return
        if self.last_attempt is None:
            self.started=now
        self.last_attempt=now
        age=max(0,int(now-self.started))
        backup_age=None
        try:
            meta=json.loads((self.base/'latest.json').read_text())
            backup_age=max(0,int(time.time()-dt.datetime.fromisoformat(meta['completed_at']).timestamp()))
        except (OSError,ValueError,KeyError):
            pass
        payload={'contract_version':1,'incident_id':self.incident_id,'event':event,
                 'application_name':tag,'operator':self.operator,'blocker_age_seconds':age,
                 'backup_generation_age_seconds':backup_age,
                 'severity':'critical' if age>=300 or backup_age is None or backup_age>26*3600 else 'error',
                 'runbook':'infra/catalog-refresh-midnight/OPERATIONS.md'}
        delivered=False
        try:
            result=sp.run([self.executable],input=json.dumps(payload),text=True,capture_output=True,
                          timeout=5,env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'},check=True)
            receipt=json.loads(result.stdout)
            delivered=receipt.get('accepted') is True and receipt.get('incident_id')==self.incident_id
        except (OSError,ValueError,sp.SubprocessError):
            pass
        # No credentials, destinations or raw hook output enter local status.
        try:
            atomic(self.state/'incident.json',dict(payload,delivery_acknowledged=delivered))
        except OSError:
            pass
        if not delivered:
            print('Midnight incident delivery unconfirmed; operator escalation required',file=sys.stderr)
        return delivered


def main():
    os.umask(0o077)
    def stopped(*_):
        raise InterruptedError('consumer stopped')
    signal.signal(signal.SIGTERM, stopped)
    signal.signal(signal.SIGINT, stopped)
    try:
        consume()
    except Exception as exc:
        # Avoid dumping process arguments/environment/credentials to logs or state.
        print('Midnight refresh failed: ' + type(exc).__name__, file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
