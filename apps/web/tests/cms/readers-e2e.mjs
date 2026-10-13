#!/usr/bin/env node
// Reader flows (and one published article) end to end, with real services and no external mail:
//   real CMS (production build, scratch database in the isolated TEST Postgres)
//   ← real SMTP over loopback (a tiny in-process SMTP sink; nodemailer delivers to it)
//   ← Gildra `next start` /api/readers proxy (CSRF, httpOnly cookie)
//   ← the same proxy core bound to "riftden" (credential-confirmed enrollment)
//
// Needs `npm run build` in cms/ and in the repo root, and PAYLOAD_DATABASE_URL /
// PAYLOAD_SECRET of the isolated test environment (refuses non-local/non-test DBs).
//   node --experimental-strip-types tests/cms/readers-e2e.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createTcp } from 'node:net';
import { createRequire } from 'node:module';
import path from 'node:path';

import { handleReader } from '../../lib/cms/readers.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CMS = path.join(ROOT, 'cms');
const requireCms = createRequire(path.join(CMS, 'package.json'));
const pg = requireCms('pg');

// --- isolated database --------------------------------------------------------
const base = new URL(process.env.PAYLOAD_DATABASE_URL ?? '');
if (!['localhost', '127.0.0.1'].includes(base.hostname) || !/^\/payload_[a-z0-9_]*test[a-z0-9_]*$/.test(base.pathname)) {
  throw new Error('Refusing: PAYLOAD_DATABASE_URL must point at the local payload_*test* database.');
}
const DB = `${base.pathname.slice(1)}__readers_e2e`;
const dbUrl = new URL(base.toString());
dbUrl.pathname = `/${DB}`;
async function admin(sql) {
  const c = new pg.Client({ connectionString: base.toString() });
  await c.connect();
  try { await c.query(sql); } finally { await c.end(); }
}

// --- loopback SMTP sink ------------------------------------------------------
const mails = [];
const smtp = createTcp((socket) => {
  let data = false;
  let buffer = '';
  socket.write('220 sink ESMTP\r\n');
  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    if (data) {
      const end = buffer.indexOf('\r\n.\r\n');
      if (end < 0) return;
      mails.push(buffer.slice(0, end).replace(/=\r\n/g, '').replace(/=3D/g, '='));
      buffer = buffer.slice(end + 5);
      data = false;
      socket.write('250 queued\r\n');
    }
    let i;
    while (!data && (i = buffer.indexOf('\r\n')) >= 0) {
      const line = buffer.slice(0, i);
      buffer = buffer.slice(i + 2);
      const verb = line.slice(0, 4).toUpperCase();
      if (verb === 'EHLO' || verb === 'HELO') socket.write('250 sink\r\n');
      else if (verb === 'DATA') { data = true; socket.write('354 go\r\n'); }
      else if (verb === 'QUIT') { socket.end('221 bye\r\n'); }
      else socket.write('250 ok\r\n');
    }
  });
});

const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const freePort = async () => { const s = createTcp(); const p = await listen(s); await new Promise((r) => s.close(r)); return p; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function run(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('exit', (code) => (code === 0 ? resolve(out) : reject(new Error(`${args.join(' ')} failed:\n${out.slice(-2000)}`))));
  });
}
function serve(cwd, port, env) {
  const p = spawn(process.execPath, [path.join(cwd, 'node_modules/next/dist/bin/next'), 'start', '-p', String(port), '-H', '127.0.0.1'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  p.stdout.on('data', (d) => (log += d));
  p.stderr.on('data', (d) => (log += d));
  procs.push({ p, log: () => log });
  return p;
}
async function waitFor(url) {
  for (let i = 0; i < 120; i++) {
    try { await fetch(url); return; } catch { await sleep(500); }
  }
  throw new Error(`not ready: ${url}`);
}
const tokenFrom = (mail, route) => {
  const m = mail.match(new RegExp(`${route}\\?token=([A-Za-z0-9._~-]+)`));
  assert.ok(m, `no ${route} link in email`);
  return m[1];
};

const checks = [];
const ok = (name) => { checks.push(name); console.log(`ok - ${name}`); };

try {
  await admin(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
  await admin(`CREATE DATABASE "${DB}"`);
  const cmsEnvBase = { ...process.env, PAYLOAD_DATABASE_URL: dbUrl.toString(), NODE_OPTIONS: '--no-deprecation' };
  await run(process.execPath, [path.join(CMS, 'node_modules/payload/bin.js'), 'migrate'], { cwd: CMS, env: cmsEnvBase });
  await run(process.execPath, [path.join(CMS, 'node_modules/payload/bin.js'), 'run', 'src/scripts/seed.ts'], { cwd: CMS, env: cmsEnvBase });

  const smtpPort = await listen(smtp);
  const cmsPort = await freePort();
  const sitePort = await freePort();
  const CMS_URL = `http://127.0.0.1:${cmsPort}`;
  const SITE = `http://127.0.0.1:${sitePort}`;
  serve(CMS, cmsPort, {
    ...cmsEnvBase, NODE_ENV: 'production', PAYLOAD_PUBLIC_URL: CMS_URL, CMS_JOBS_AUTORUN: 'false',
    EMAIL_TRANSPORT: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtpPort), SMTP_SECURE: 'false', EMAIL_FROM_ADDRESS: 'cms@test.local',
  });
  serve(ROOT, sitePort, {
    ...process.env, NODE_ENV: 'production', CMS_INTERNAL_URL: CMS_URL, CMS_READERS_ENABLED: '1', SITE_PUBLIC_ORIGIN: SITE,
  });
  await waitFor(`${CMS_URL}/api/public/gildra/settings`);
  await waitFor(`${SITE}/api/readers/availability`);

  // Owner opens registration on both sites (owner-only bootstrap through the CMS REST API).
  const first = await fetch(`${CMS_URL}/api/admins/first-register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@test.local', password: 'local-test-password-1', name: 'Owner' }) });
  const ownerToken = (await first.json()).token;
  const sites = await (await fetch(`${CMS_URL}/api/sites?depth=0`, { headers: { authorization: `JWT ${ownerToken}` } })).json();
  for (const s of sites.docs) {
    await fetch(`${CMS_URL}/api/sites/${s.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', authorization: `JWT ${ownerToken}` }, body: JSON.stringify({ registrationEnabled: true }) });
  }

  // --- browser-like client for the Gildra proxy -------------------------------
  let cookie = '';
  async function reader(action, body, method) {
    const headers = { origin: SITE, 'sec-fetch-site': 'same-origin' };
    if (body) headers['content-type'] = 'application/json';
    if (cookie) headers.cookie = cookie;
    const res = await fetch(`${SITE}/api/readers/${action}`, { method: method ?? (body ? 'POST' : 'GET'), headers, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = /Max-Age=0/.test(set) ? '' : set.split(';')[0];
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, raw: text, setCookie: set };
  }

  assert.deepEqual((await reader('availability')).body, { registration: 'open', email: 'configured' });
  ok('availability reflects the per-site setting and real SMTP configuration');

  const EMAIL = 'reader@test.local';
  const r1 = await reader('register', { email: EMAIL, password: 'reader-password-1', displayName: 'Reader One' });
  assert.equal(r1.status, 202);
  for (let i = 0; i < 20 && mails.length === 0; i++) await sleep(250);
  assert.equal(mails.length, 1);
  assert.match(mails[0], /https:\/\/gildra\.net\/reader\/verify\?token=/);
  ok('registration sends a verification email over SMTP with a /reader/verify link');

  assert.equal((await reader('login', { email: EMAIL, password: 'reader-password-1' })).body.status, 'email-not-verified');
  assert.equal((await reader('verify', { token: tokenFrom(mails[0], '/reader/verify') })).body.status, 'verified');
  ok('login waits for verification; the emailed token verifies through the proxy');

  const noOrigin = await fetch(`${SITE}/api/readers/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: 'reader-password-1' }) });
  assert.equal(noOrigin.status, 403);
  const login = await reader('login', { email: EMAIL, password: 'reader-password-1' });
  assert.equal(login.status, 200);
  assert.match(login.setCookie, /^gildra_reader=[^;]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=\d+$/);
  assert.ok(!login.raw.includes(cookie.split('=')[1]), 'token leaked in body');
  ok('login without Origin is refused; with Origin it sets an httpOnly SameSite cookie and returns no token');

  const session = await reader('session');
  assert.deepEqual(session.body, { authenticated: true, membership: 'active', profile: { handle: session.body.profile.handle, displayName: 'Reader One', visibility: 'public' } });
  assert.ok(!session.raw.includes(EMAIL));
  const saved = await reader('profile', { displayName: 'Reader Renamed', bio: 'Hello' }, 'PATCH');
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal((await reader('profile')).body.profile.displayName, 'Reader Renamed');
  assert.equal((await reader('profile', { email: 'x@test.local' }, 'PATCH')).status, 400);
  ok('session and profile work for the signed-in reader; non-whitelisted fields are refused');

  assert.equal((await reader('logout', {})).status, 200);
  assert.deepEqual((await reader('session')).body, { authenticated: false });
  ok('logout clears the cookie and ends the session');

  mails.length = 0;
  assert.equal((await reader('forgot', { email: EMAIL })).status, 202);
  for (let i = 0; i < 20 && mails.length === 0; i++) await sleep(250);
  assert.match(mails[0], /https:\/\/gildra\.net\/reader\/reset-password\?token=/);
  assert.equal((await reader('reset', { token: tokenFrom(mails[0], '/reader/reset-password'), password: 'reader-password-2' })).body.status, 'reset');
  assert.equal((await reader('login', { email: EMAIL, password: 'reader-password-2' })).status, 200);
  ok('password reset email (/reader/reset-password) and the new password work');

  // --- the same network account on RiftDen (proxy core bound to "riftden") ----
  const rift = { cmsUrl: CMS_URL, site: 'riftden', publicOrigin: 'https://riftden.com', secure: true, cookieBase: 'riftden_reader' };
  const riftLogin = (extra = {}) =>
    handleReader('login', new Request('https://riftden.com/api/readers/login', { method: 'POST', headers: { origin: 'https://riftden.com', 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: 'reader-password-2', ...extra }) }), rift);
  const offer = await riftLogin();
  assert.equal(offer.status, 409);
  assert.deepEqual(await offer.json(), { status: 'enrollment-available' });
  const enrolled = await riftLogin({ enroll: true });
  assert.equal(enrolled.status, 200);
  assert.deepEqual(await enrolled.json(), { status: 'ok', enrolled: true });
  const riftCookie = enrolled.headers.get('set-cookie').split(';')[0];
  const riftSession = await handleReader('session', new Request('https://riftden.com/api/readers/session', { headers: { cookie: riftCookie } }), rift);
  assert.equal((await riftSession.json()).membership, 'active');
  ok('a verified network account joins the second site only after confirming credentials');

  // --- a real published CMS article rendered by Gildra's article pages -------
  const gildraID = sites.docs.find((x) => x.slug === 'gildra').id;
  const text = (t, format = 0) => ({ type: 'text', version: 1, text: t, format, detail: 0, mode: 'normal', style: '' });
  const el = (type, children, extra = {}) => ({ type, version: 1, direction: 'ltr', format: '', indent: 0, children, ...extra });
  const content = { root: el('root', [
    el('heading', [text('Opening rotation')], { tag: 'h2' }),
    el('paragraph', [text('Read the '), el('link', [text('raid page')], { fields: { linkType: 'custom', url: '/wow/raids', newTab: false } }), text(' first.')]),
    el('paragraph', [el('link', [text('bad')], { fields: { linkType: 'custom', url: 'javascript:alert(1)', newTab: false } })]),
    { type: 'block', version: 2, format: '', fields: { blockType: 'dataTable', caption: 'Stats', columns: [{ label: 'Spec' }], rows: [{ cells: [{ value: 'Fire <b>' }] }] } },
  ]) };
  const created = await fetch(`${CMS_URL}/api/guides?locale=en`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `JWT ${ownerToken}` },
    body: JSON.stringify({ site: gildraID, slug: 'real-cms-article', title: 'Real CMS article', summary: 'Rendered end to end', content, _status: 'published' }),
  });
  assert.equal(created.status, 201, await created.clone().text());
  const en = await fetch(`${SITE}/wow/articles/real-cms-article`);
  const enHtml = await en.text();
  assert.equal(en.status, 200);
  assert.match(enHtml, /<h1[^>]*>Real CMS article<\/h1>/);
  assert.match(enHtml, /<h2 id="opening-rotation">Opening rotation<\/h2>/);
  assert.match(enHtml, /<a href="\/wow\/raids">raid page<\/a>/);
  assert.doesNotMatch(enHtml, /javascript:alert/);
  assert.match(enHtml, /<td>Fire &lt;b&gt;<\/td>/);
  assert.match(enHtml, /<link rel="canonical" href="https:\/\/gildra\.net\/wow\/articles\/real-cms-article"\/>/);
  assert.doesNotMatch(enHtml, /hrefLang="ru"/);
  const ru = await (await fetch(`${SITE}/ru/wow/articles/real-cms-article`)).text();
  assert.match(ru, /Перевода на русский пока нет/);
  assert.match(ru, /<link rel="canonical" href="https:\/\/gildra\.net\/wow\/articles\/real-cms-article"\/>/);
  assert.match(ru, /<meta name="robots" content="noindex, follow"\/>/);
  assert.match(ru, /<a href="\/ru\/wow\/raids">raid page<\/a>/);
  const index = await (await fetch(`${SITE}/wow/articles`)).text();
  assert.match(index, /href="\/wow\/articles\/real-cms-article"/);
  ok('a real published CMS article renders safely on /wow/articles with honest canonical/hreflang and RU fallback');

  console.log(`\n${checks.length} reader and article checks passed.`);
} catch (error) {
  for (const { log } of procs) console.error(log().split('\n').slice(-15).join('\n'));
  throw error;
} finally {
  for (const { p } of procs) p.kill('SIGTERM');
  smtp.close();
  await sleep(500);
  await admin(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`).catch(() => {});
}
