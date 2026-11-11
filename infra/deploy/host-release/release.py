#!/usr/bin/env python3
"""Web-only release of one revision to wowarcana.com, end to end, without questions.

    python3 release.py <label> <worktree> <rev> <step>

steps: build | candidate | check | remove_candidate | deploy | observe | all
  build      disk >= 25 GB, <rev> into the shared build checkout, pinned node image, docker build,
             build cache kept warm (no per-release prune)
  candidate  run the image on 127.0.0.1:<port> next to production (read-only, own env)
  check      whole-site check of the candidate (site-check.cjs), fails on any problem
  deploy     prod locks, live == the image's base, deploy-web.sh (smoke, auto-rollback), verify
  observe    120 s of verify with the whole-site check of production running alongside, locks released
  all        build, candidate, check, remove_candidate, deploy, observe

Runs as debian; docker and /opt/gildra go through `sudo -n`. State lives in
/home/debian/gildra-releases/<label>/ (candidate.json, deploy-plan.json, checks, reports,
timings.json: seconds per step).
Optional <state>/checks.tsv: one "path<TAB>substring" per line, checked on the candidate and on
production after the deploy (markers of this release, e.g. "/ru/wow/auction\tdata-auction-hub").
Rollback: the printed /opt/gildra/<label>-previous.env (deploy-web.sh rolls back by itself on failure).
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import datetime, fcntl, hashlib, json, os, re, secrets, shutil, socket, subprocess, sys, time

HERE = Path(__file__).resolve().parent
TEAM = '/home/debian/.codex/skills/gildra-engineering-symbiosis/scripts/team_state.py'
REMOTE = 'git@github.com:Gildra-Foundation/Gildra.git'
NODE = os.path.expanduser('~/.local/node-v22.23.2/bin')
PINNED = 'node@sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85'
MANIFEST = '/opt/gildra/current-release.env'
MIN_FREE_GB = 25
# Shared by every release. BuildKit keys its copy of the build context by the directory name and
# resends only files whose time or size changed, so the checkout keeps one path and git rewrites
# only what differs from the previous build.
BUILD = Path('/home/debian/gildra-releases/.build')
SRC = BUILD / 'gildra-web-src'
# Do not prune after releases: that evicts reusable layers/cache mounts and
# adds cleanup latency. Host GC and the existing disk preflight bound usage.

label, worktree, rev_arg, step = (sys.argv[1:5] + [None] * 4)[:4]
if not step:
    sys.exit(__doc__)
assert re.fullmatch(r'[a-z0-9][a-z0-9-]{2,60}', label), 'label: lowercase-dashes, e.g. auction-filters-20261028'
STATE = Path('/home/debian/gildra-releases') / label
STATE.mkdir(parents=True, exist_ok=True)
SESSION = label + '-release'
CANDIDATE = 'gildra-candidate-' + label


def run(args, **kw):
    return subprocess.check_output(args, text=True, timeout=kw.pop('timeout', 300), **kw)


def docker(*args, **kw):
    return run(['sudo', '-n', 'docker', *args], **kw)


def inspect(name):
    return json.loads(docker('inspect', name))[0]


def sha(b):
    return hashlib.sha256(b).hexdigest()


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')


def save(name, data):
    (STATE / name).write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')


def read(name):
    return json.loads((STATE / name).read_text())


def git(*args):
    return run(['git', '-C', worktree, *args]).strip()


def manifest():
    return run(['sudo', '-n', 'cat', MANIFEST])


def free_gb():
    return shutil.disk_usage('/').free / 1e9


def team(*args):
    env = {**os.environ, 'CODEX_PROJECT_REMOTE': REMOTE}
    return subprocess.run(['python3', TEAM, *args], cwd=worktree, env=env, text=True, capture_output=True, timeout=60)


def checks():
    f = STATE / 'checks.tsv'
    if not f.exists():
        return []
    return [tuple(line.split('\t', 1)) for line in f.read_text().splitlines() if '\t' in line and not line.startswith('#')]


# GATE: what is checked before the deploy (on the candidate) and after it (on production, during
# observation, without screenshots). fast (default): every template once before and once after —
# together English at 1440 and Russian at 390 for each. half: both of those before, the other two
# variants after. full: all four before. Use half or full for releases that touch shared layout.
GATES = {'fast': ('one', 'other'), 'half': ('half', 'rest'), 'full': ('full', 'rest')}
GATE = GATES[os.environ.get('GATE', 'fast')]


def site_check(base, out, matrix='full', shots=True):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, 'BASE': base, 'OUT': str(out), 'MATRIX': matrix, 'SHOTS': '1' if shots else '0',
           'PATH': NODE + ':' + os.environ['PATH']}
    script = str(HERE / 'site-check.cjs')
    for cmd in ['discover', 'capture']:
        subprocess.run(['node', script, cmd], cwd='/home/debian/Gildra-atlas', env=env, check=True, timeout=3600,
                       stdout=open(out / (cmd + '.log'), 'w'), stderr=subprocess.STDOUT)
    res = subprocess.run(['node', script, 'summary'], cwd='/home/debian/Gildra-atlas', env=env, text=True, capture_output=True)
    (out / 'summary.txt').write_text(res.stdout + res.stderr)
    print(res.stdout.strip())
    if res.returncode:
        sys.exit(f'site check failed: {out}/summary.txt, shots in {out}/shots')


def checkout(rev):
    common = git('rev-parse', '--path-format=absolute', '--git-common-dir')
    env = {**os.environ, 'GIT_DIR': common, 'GIT_WORK_TREE': str(SRC), 'GIT_INDEX_FILE': str(BUILD / 'index')}
    for _ in range(2):
        SRC.mkdir(parents=True, exist_ok=True)
        subprocess.run(['git', 'read-tree', '--reset', '-u', rev], env=env, cwd=SRC, check=True, timeout=1800)
        subprocess.run(['git', 'update-index', '-q', '--refresh'], env=env, cwd=SRC, timeout=600)
        changed = subprocess.run(['git', 'diff-files', '--quiet'], env=env, cwd=SRC, timeout=600).returncode
        extra = subprocess.check_output(['git', 'ls-files', '--others'], env=env, cwd=SRC, text=True, timeout=600)
        if not changed and not extra:
            return
        # Someone touched the checkout: start from an empty one.
        shutil.rmtree(SRC)
        (BUILD / 'index').unlink(missing_ok=True)
    sys.exit(f'{SRC} does not match {rev[:8]} after a clean checkout')


def reuse_candidate(rev, live, key):
    """Reuse only the exact recorded image and inputs, never a mutable tag alone."""
    if not (STATE / 'candidate.json').exists():
        return False
    info = read('candidate.json')
    if (info.get('revision') != rev or info.get('build_key') != key
            or info.get('previous_image') != live['Image']):
        return False
    try:
        image = json.loads(docker('image', 'inspect', info['image']))[0]
    except subprocess.CalledProcessError:
        return False
    labels = image['Config'].get('Labels') or {}
    if (image['Id'] != info.get('image_id')
            or labels.get('org.opencontainers.image.revision') != rev
            or labels.get('net.gildra.patch') != label):
        return False
    print('Reusing verified image ' + info['image'])
    return True


def build():
    rev = git('rev-parse', rev_arg)
    assert free_gb() >= MIN_FREE_GB, f'{free_gb():.1f} GB free < {MIN_FREE_GB}: wait (catalog import / other builds) or free space'
    assert not git('status', '--porcelain', '--untracked-files=no'), 'worktree has uncommitted changes: commit first'
    live = inspect('gildra-web-1')
    live_rev = (live['Config'].get('Labels') or {}).get('org.opencontainers.image.revision', '')
    if live_rev:
        assert subprocess.run(['git', '-C', worktree, 'merge-base', '--is-ancestor', live_rev, rev]).returncode == 0, \
            f'{rev[:8]} does not contain LIVE {live_rev[:8]}: rebase on LIVE first'
    BUILD.mkdir(parents=True, exist_ok=True)
    lock = open(BUILD / 'lock', 'w')
    waiting = time.monotonic()
    fcntl.flock(lock, fcntl.LOCK_EX)  # one build at a time: the checkout is shared
    phases = {'lock_wait': round(time.monotonic() - waiting, 3)}
    allowed = {'PLAUSIBLE_SCRIPT_URL', 'PLAUSIBLE_API_URL', 'PLAUSIBLE_SITE_DOMAIN', 'NEXT_PUBLIC_SENTRY_DSN'}
    env = {k: v for item in live['Config']['Env'] for k, v in [item.split('=', 1)] if k in allowed}
    key = sha(json.dumps({'revision': rev, 'node': PINNED, 'env': env,
                          'recipe': sha(Path(__file__).read_bytes())}, sort_keys=True).encode())
    if reuse_candidate(rev, live, key):
        lock.close()
        save('build-phases.json', {**phases, 'reused': True})
        return
    started = time.monotonic()
    checkout(rev)
    phases['checkout'] = round(time.monotonic() - started, 3)
    dockerfile = (SRC / 'Dockerfile').read_text()
    assert 'FROM node:22.23.2-alpine' in dockerfile, 'Dockerfile base changed: update PINNED'
    (STATE / 'Dockerfile.pinned').write_text(dockerfile.replace('FROM node:22.23.2-alpine', 'FROM ' + PINNED))
    image = f'gildra-web:{label}-{rev[:12]}'
    # The map tiles come from a prebuilt image keyed by their git tree and stay out of the context.
    extra = []
    if 'FROM scratch AS maps' in dockerfile:
        tiles = 'gildra-web-maps:' + git('rev-parse', rev + ':apps/web/public/maps')[:16]
        if subprocess.run(['sudo', '-n', 'docker', 'image', 'inspect', tiles], capture_output=True).returncode:
            subprocess.run(['sudo', '-n', 'docker', 'build', '-q', '-t', tiles, '-f', '-', str(SRC / 'apps/web/public/maps')],
                           input='FROM scratch\nCOPY . /\n', text=True, check=True, timeout=1800)
        ignore = (SRC / '.dockerignore').read_text() if (SRC / '.dockerignore').exists() else ''
        (STATE / 'Dockerfile.pinned.dockerignore').write_text(ignore.rstrip('\n') + '\napps/web/public/maps\n')
        extra = ['--build-context', 'maps=docker-image://' + tiles]
    # zstd level 3 instead of gzip for the new layers (≈400 MB a release): seconds instead of ~20 s.
    args = ['build', '--progress=plain', '-f', str(STATE / 'Dockerfile.pinned'), *extra,
            '--output', f'type=image,name={image},compression=zstd,compression-level=3',
            '--label', 'org.opencontainers.image.revision=' + rev, '--label', 'net.gildra.patch=' + label,
            '--build-arg', 'GILDRA_BUILD_CPUS=6']  # host build 2026-11-11: 1598 pages in 20 s with 6 workers, 168 s with 2
    for k, v in sorted(env.items()):
        args += ['--build-arg', f'{k}={v}']
    started = time.monotonic()
    with open(STATE / 'build.log', 'w') as log:
        subprocess.run(['sudo', '-n', 'docker', *args, str(SRC)], check=True, timeout=3600, stdout=log, stderr=subprocess.STDOUT)
    phases['docker_build'] = round(time.monotonic() - started, 3)
    lock.close()
    info = json.loads(docker('image', 'inspect', image))[0]
    save('build-phases.json', {**phases, 'reused': False})
    rec = {'image': image, 'image_id': info['Id'], 'revision': rev, 'previous_image': live['Image'],
           'previous_revision': live_rev, 'build_key': key, 'built_at': utc(), 'free_gb_after': round(free_gb(), 1)}
    save('candidate.json', rec)
    print(json.dumps(rec, indent=1))


def free_port():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    port = s.getsockname()[1]
    s.close()
    return port


def candidate():
    info = read('candidate.json')
    live = inspect('gildra-web-1')
    port = free_port()
    allowed = {'API_INTERNAL_URL', 'CATALOG_ACCESS_MODE', 'WOW_META_API_ENABLED'}
    env = {k: v for i in live['Config']['Env'] for k, v in [i.split('=', 1)] if k in allowed}
    env.update(SITE_PUBLIC_ORIGIN=f'http://127.0.0.1:{port}', AUTH_SECRET=secrets.token_urlsafe(48), AUTH_URL=f'http://127.0.0.1:{port}',
               BATTLENET_CLIENT_ID='local-verification', BATTLENET_CLIENT_SECRET='local-verification', SENTRY_TRACES_SAMPLE_RATE='0',
               PLAUSIBLE_SCRIPT_URL='', PLAUSIBLE_API_URL='', PLAUSIBLE_SITE_DOMAIN='')
    subprocess.run(['sudo', '-n', 'docker', 'rm', '-f', CANDIDATE], capture_output=True)
    docker('run', '-d', '--name', CANDIDATE, '--label', 'net.gildra.owner=' + SESSION, '--network', 'gildra_default', '--read-only',
           '--cap-drop=ALL', '--security-opt', 'no-new-privileges:true', '--memory', '2g', '--cpus', '4',
           '--tmpfs', '/tmp:rw,nosuid,nodev,size=64m', '--tmpfs', '/app/.next/cache:rw,nosuid,nodev,size=128m',
           '--env-file', '/dev/stdin', '-p', f'127.0.0.1:{port}:3000', info['image'],
           input='\n'.join(f'{k}={v}' for k, v in env.items()) + '\n')
    for _ in range(60):
        if subprocess.run(['curl', '-sf', '-o', '/dev/null', f'http://127.0.0.1:{port}/ru'], timeout=30).returncode == 0:
            break
        time.sleep(3)
    else:
        sys.exit('candidate did not answer /ru in 180 s: ' + docker('logs', '--tail', '40', CANDIDATE, stderr=subprocess.STDOUT))
    info['candidate_port'] = port
    save('candidate.json', info)
    print(f'candidate on http://127.0.0.1:{port}')


def marker_check(base, curl_extra=()):
    bad = []
    for path, needle in checks():
        body = subprocess.run(['curl', '-s', '--max-time', '30', *curl_extra, base + path], capture_output=True, text=True).stdout
        if needle not in body:
            bad.append(f'{path} lacks {needle!r}')
    return bad


def check():
    info = read('candidate.json')
    base = f"http://127.0.0.1:{info['candidate_port']}"
    bad = marker_check(base)
    assert not bad, bad
    site_check(base, STATE / 'candidate-check', GATE[0])


def remove_candidate():
    row = inspect(CANDIDATE)
    assert row['Config']['Labels'].get('net.gildra.owner') == SESSION
    docker('rm', '-f', CANDIDATE)
    print('candidate removed')


LOCKS = ['prod:production', 'service:web', 'service:nginx']


def claim():
    team('register', '--session', SESSION, '--branch', git('rev-parse', '--abbrev-ref', 'HEAD'), '--scope', 'web-only release ' + label, '--ttl', '7200')
    for r in LOCKS:
        res = team('claim', '--session', SESSION, '--resource', r, '--reason', 'web-only release ' + label, '--ttl', '3600')
        if res.returncode:
            unlock()
            sys.exit(f'{r} is held by someone else, try later:\n{res.stdout}{res.stderr}')


def unlock():
    for r in LOCKS:
        team('unlock', '--session', SESSION, '--resource', r)
    team('release-session', '--session', SESSION)


def identity(row):
    host = {k: row['HostConfig'].get(k) for k in ['ReadonlyRootfs', 'Memory', 'NanoCpus', 'CapDrop', 'SecurityOpt', 'Tmpfs', 'PortBindings']}
    return {'env': sha(json.dumps(sorted(row['Config']['Env'])).encode()), 'mounts': row['Mounts'], 'host': host,
            'networks': sorted(row['NetworkSettings']['Networks'])}


def deploy():
    info = read('candidate.json')
    claim()
    try:
        live = inspect('gildra-web-1')
        assert live['State']['Health']['Status'] == 'healthy', 'production web is not healthy'
        prev = re.findall(r'^WEB_IMAGE=(.+)$', manifest(), re.M)
        assert len(prev) == 1
        assert json.loads(docker('image', 'inspect', prev[0]))[0]['Id'] == live['Image'] == info['previous_image'], \
            'LIVE changed since this image was built: rebase on the new LIVE and run build again'
        backup = f'/opt/gildra/{label}-previous.env'
        assert subprocess.run(['sudo', '-n', 'test', '-e', backup]).returncode != 0, f'{backup} exists: label already released, pick a new label'
        plan = {'image': info, 'previous_ref': prev[0], 'runtime_identity': identity(live), 'manifest_sha256': sha(manifest().encode()),
                'backup': backup, 'at': utc()}
        save('deploy-plan.json', plan)
        tsv = STATE / 'checks.tsv'
        subprocess.run(['sudo', '-n', 'bash', str(HERE / 'deploy-web.sh'), info['image'], label, prev[0], str(tsv) if tsv.exists() else '/dev/null'],
                       check=True, timeout=900)
        verify()
    except BaseException:
        unlock()
        raise
    print(f'LIVE {info["image"]}; rollback: {backup}')


def verify():
    plan = read('deploy-plan.json')
    info = read('candidate.json')
    live = inspect('gildra-web-1')
    assert live['Image'] == info['image_id'] and live['State']['Health']['Status'] == 'healthy' and live['RestartCount'] == 0
    assert identity(live) == plan['runtime_identity'], 'web runtime config changed'
    before = run(['sudo', '-n', 'cat', plan['backup']]).splitlines()
    after = manifest().splitlines()
    assert [x for x in before if not x.startswith('WEB_')] == [x for x in after if not x.startswith('WEB_')], 'non-web manifest lines changed'
    bad = marker_check('https://wowarcana.com', ['--cacert', str(HERE / 'origin-ca.pem'), '--resolve', 'wowarcana.com:443:127.0.0.1'])
    assert not bad, bad
    logs = docker('logs', '--since', live['State']['StartedAt'], '--tail', '500', 'gildra-web-1', stderr=subprocess.STDOUT)
    fatal = {p: logs.count(p) for p in ['FATAL', 'panic:', 'Uncaught', 'UnhandledPromiseRejection', 'TypeError:']}
    assert sum(fatal.values()) == 0, fatal


def observe():
    with ThreadPoolExecutor(1) as pool:
        shots = pool.submit(site_check, 'https://wowarcana.com', STATE / 'production-check', GATE[1], False)
        try:
            start = time.monotonic()
            while time.monotonic() - start < 120:
                verify()
                time.sleep(15)
            verify()
            print('PASS 120 s observation')
        finally:
            unlock()
        shots.result()
    save('released.json', {**read('candidate.json'), 'released_at': utc(), 'rollback': read('deploy-plan.json')['backup']})


def timed(fn):
    start = time.monotonic()
    try:
        return fn()
    finally:
        f = STATE / 'timings.json'
        save('timings.json', {**(read('timings.json') if f.exists() else {}), fn.__name__: round(time.monotonic() - start)})


def all_steps():
    timed(build); timed(candidate)
    try:
        timed(check)
    finally:
        remove_candidate()
    timed(deploy); timed(observe)


timed({'build': build, 'candidate': candidate, 'check': check, 'remove_candidate': remove_candidate,
       'deploy': deploy, 'verify': verify, 'observe': observe, 'all': all_steps}[step])
