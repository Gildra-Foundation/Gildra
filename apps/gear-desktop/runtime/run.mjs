import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { context, dataResponse, handleRead, send } from './bridge.mjs';
import { routes } from './planner.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const site = 'https://wowarcana.com';
const engineKey = randomBytes(32).toString('hex');
const windows = process.platform === 'win32';
const suffix = windows ? '.exe' : '';
process.env.API_INTERNAL_URL = site;
const engine = spawn(join(root, 'gear-engine' + suffix), [], {
  windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'],
  env: { ...process.env, GEAR_ENGINE_KEY: engineKey, SIMC_BINARY: join(root, 'simc' + suffix),
    SIMC_PROFILE_DIR: join(root, 'profiles'), SIMC_FURY_PROFILE: join(root, 'profiles', 'MID2_Warrior_Fury.simc') },
});
engine.once('error', () => process.exit(1));
engine.once('exit', () => process.exit(1));
const [port] = await new Promise(resolve => createInterface({ input: engine.stdout }).once('line', line => resolve([line])));
if (!/^\d{1,5}$/.test(port)) throw Error('engine_start_failed');
const engineUrl = 'http://127.0.0.1:' + port;
process.env.ROTATION_WORKER_URL = engineUrl;
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.origin === engineUrl) {
    const headers = new Headers(options.headers);
    headers.set('Authorization', 'Bearer ' + engineKey);
    return nativeFetch(url, { ...options, headers, redirect: 'error' });
  }
  // Anonymous published catalog. No session or authorization headers leave the bridge.
  if (url.origin === site && url.pathname.startsWith('/v1/game/')) {
    return nativeFetch(url, { ...options, headers: { Accept: 'application/json' }, redirect: 'error' });
  }
  const host = /^(eu|us|kr|tw)\.api\.blizzard\.com$/.exec(url.hostname);
  if (host && url.protocol === 'https:') {
    const region = host[1];
    const item = /^\/data\/wow\/(media\/)?item\/(\d+)$/.exec(url.pathname);
    if (item) return dataResponse({ read: item[1] ? 'icon' : 'item', region, id: item[2], locale: url.searchParams.get('locale') || 'en_GB' }, options.signal);
    const equipped = /^\/profile\/wow\/character\/([^/]+)\/([^/]+)\/equipment$/.exec(url.pathname);
    if (equipped) return dataResponse({ read: 'equipment', slug: region + '--' + equipped[1] + '--' + equipped[2] }, options.signal);
  }
  throw Error('unsupported_desktop_source');
};
const requests = new Map();
async function handle(packet) {
  if (packet.type === 'data') { handleRead(packet); return; }
  if (packet.type === 'cancel') { requests.get(packet.id)?.abort(); return; }
  const url = new URL(packet.path, site);
  const handlers = routes.get(url.pathname);
  if (url.origin !== site || !handlers || !['GET', 'POST', 'DELETE'].includes(packet.method) || typeof handlers[packet.method] !== 'function') throw Error('invalid_route');
  const controller = new AbortController();
  requests.set(packet.id, controller);
  try {
    const request = new Request(url, { method: packet.method, headers: { origin: site, host: url.host, 'content-type': 'application/json' },
      body: packet.method === 'POST' ? packet.body : undefined, signal: controller.signal });
    const response = await context.run({}, () => handlers[packet.method](request));
    send({ type: 'response', id: packet.id, status: response.status, body: await response.text() });
  } finally { requests.delete(packet.id); }
}
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on('line', line => {
  let packet;
  try { packet = JSON.parse(line); } catch { return; }
  void handle(packet).catch(() => send({ type: 'response', id: packet.id, status: 503, body: '{"error":"desktop_unavailable"}' }));
});
lines.on('close', () => { engine.stdin.end(); engine.kill(); process.exit(0); });
send({ type: 'ready' });
