#!/usr/bin/env node
// Browser check (real Chromium) of the first-owner "create" flow without a site
// selection: production CMS build + scratch database in the isolated TEST Postgres.
//   PLAYWRIGHT_MODULE=<path to playwright-core> PLAYWRIGHT_BROWSERS_PATH=<browsers> \
//   node tests/browser/select-site.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import path from 'node:path';

const CMS = path.resolve(import.meta.dirname, '../..');
const require = createRequire(path.join(CMS, 'package.json'));
const pg = require('pg');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');

const base = new URL(process.env.PAYLOAD_DATABASE_URL ?? '');
if (!['localhost', '127.0.0.1'].includes(base.hostname) || !/^\/payload_[a-z0-9_]*test[a-z0-9_]*$/.test(base.pathname)) {
  throw new Error('Refusing: PAYLOAD_DATABASE_URL must point at the local payload_*test* database.');
}
const DB = `${base.pathname.slice(1)}__select_site`;
const dbUrl = new URL(base.toString());
dbUrl.pathname = `/${DB}`;
const admin = async (sql) => { const c = new pg.Client({ connectionString: base.toString() }); await c.connect(); try { await c.query(sql); } finally { await c.end(); } };
const freePort = () => new Promise((r) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const run = (args, env) => new Promise((resolve, reject) => {
  const p = spawn(process.execPath, args, { cwd: CMS, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d));
  p.on('exit', (c) => (c === 0 ? resolve(out) : reject(new Error(out.slice(-1500)))));
});

let server;
let browser;
const checks = [];
const ok = (n) => { checks.push(n); console.log(`ok - ${n}`); };
try {
  await admin(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
  await admin(`CREATE DATABASE "${DB}"`);
  const env = { ...process.env, PAYLOAD_DATABASE_URL: dbUrl.toString(), NODE_OPTIONS: '--no-deprecation' };
  await run([path.join(CMS, 'node_modules/payload/bin.js'), 'migrate'], env);
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [path.join(CMS, 'node_modules/next/dist/bin/next'), 'start', '-p', String(port), '-H', '127.0.0.1'], {
    cwd: CMS, env: { ...env, NODE_ENV: 'production', PAYLOAD_PUBLIC_URL: origin, CMS_JOBS_AUTORUN: 'false' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = ''; server.stdout.on('data', (d) => (log += d)); server.stderr.on('data', (d) => (log += d));
  for (let i = 0; i < 120; i++) { try { await fetch(`${origin}/api/public/gildra/settings`); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }
  const first = await fetch(`${origin}/api/admins/first-register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@test.local', password: 'local-test-password-1', name: 'Owner' }) });
  assert.equal(first.status, 200);

  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
  const context = await browser.newContext();
  await context.addCookies([{ name: "payload-lng", value: "en", url: origin }]);
  const page = await context.newPage();
  await page.goto(`${origin}/admin/login`);
  await page.fill('input[name="email"]', 'owner@test.local');
  await page.fill('input[name="password"]', 'local-test-password-1');
  await page.click('button[type="submit"]');
  await page.waitForURL(`${origin}/admin`);
  assert.equal((await context.cookies()).some((c) => c.name === 'payload-tenant'), false);
  ok('owner signed in with no site selection cookie');

  for (const [collection, field] of [['guides', 'title'], ['pages', 'title']]) {
    await page.goto(`${origin}/admin/collections/${collection}/create`);
    await page.waitForURL(`${origin}/admin/select-site?collection=${collection}`);
    await page.getByRole('heading', { name: 'Choose a site' }).waitFor();
    const buttons = page.getByRole('button', { name: /^Create the (article|page) on / });
    assert.equal(await buttons.count(), 2);
    assert.equal(await page.getByRole('button', { name: /on Gildra$/ }).count(), 1);
    assert.equal(await page.getByRole('button', { name: /on Riftden$/ }).count(), 1);
    ok(`${collection}/create without a site shows "Choose a site" with both sites (nothing guessed)`);

    // Keyboard only: focus the Riftden choice and press Enter.
    await page.getByRole('button', { name: /on Riftden$/ }).focus();
    await page.keyboard.press('Enter');
    // Choosing a site opens the "new" step; nothing is created until it is submitted.
    const step = collection === 'guides' ? 'new-article' : 'new-page';
    await page.waitForURL(new RegExp(`/admin/${step}`));
    const cookie = (await context.cookies()).find((c) => c.name === 'payload-tenant');
    assert.ok(cookie, 'site cookie set');
    const total = (await (await page.request.get(`${origin}/api/${collection}?draft=true&limit=1`, { headers: { 'sec-fetch-site': 'same-origin' } })).json()).totalDocs;
    assert.equal(total, 0);
    ok(`${collection}: choosing Riftden with the keyboard opens the ${step} step and creates no draft`);

    // With a valid selection create goes straight to the same step.
    await page.goto(`${origin}/admin/collections/${collection}/create`);
    await page.waitForURL(new RegExp(`/admin/${step}`));
    ok(`${collection}: with a selected site, create opens the ${step} step directly`);
    await context.clearCookies({ name: 'payload-tenant' });
  }

  await page.goto(`${origin}/admin/collections/media/create`);
  await page.waitForURL(`${origin}/admin/select-site?collection=media`);
  ok('media/create without a site also asks for the site');
  if (/Error: |ValidationError/.test(log)) console.log('server log mentions errors:', log.match(/.*(Error: |ValidationError).*/g)?.slice(0, 3));
  console.log(`\n${checks.length} browser checks passed.`);
} finally {
  await browser?.close();
  if (server) server.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 800));
  await admin(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`).catch(() => {});
}
