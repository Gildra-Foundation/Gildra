#!/usr/bin/env node
// Browser check (real Chromium) of /admin/analytics attribution while the selection changes:
// production CMS build + scratch database in the isolated TEST Postgres + a local HTTP
// Plausible Stats API v2 fixture (synthetic numbers, per-request delays).
//   PLAYWRIGHT_MODULE=<path to playwright-core> PLAYWRIGHT_BROWSERS_PATH=<browsers> \
//   node tests/browser/analytics-switch.mjs
// Every committed DOM state is recorded (MutationObserver) and must satisfy:
//   - numbers are shown only for the selected site AND period, with that site's label;
//   - each number equals the fixture value for exactly that (site, period);
//   - without numbers for the selection, the panel says it is loading (or shows an error).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createHttp } from 'node:http';
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
const DB = `${base.pathname.slice(1)}__analytics_ui`;
const dbUrl = new URL(base.toString());
dbUrl.pathname = `/${DB}`;
const admin = async (sql) => { const c = new pg.Client({ connectionString: base.toString() }); await c.connect(); try { await c.query(sql); } finally { await c.end(); } };
const freePort = () => new Promise((r) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (args, env) => new Promise((resolve, reject) => {
  const p = spawn(process.execPath, args, { cwd: CMS, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d));
  p.on('exit', (c) => (c === 0 ? resolve(out) : reject(new Error(out.slice(-1500)))));
});

// --- Plausible fixture: visitors per (site, period); distinct everywhere --------------
const VISITORS = {
  'gildra.net': { '30d': 17, '7d': 7, month: 23, '6mo': 61 },
  'riftden.com': { '30d': 9, '7d': 4, month: 31, '6mo': 66 },
};
const NAMES = { 'gildra.net': 'Gildra', 'riftden.com': 'Riftden' };
const API_KEY = 'fixture-only-key';
const delays = new Map(); // `${site}|${period}` → ms
const requests = [];
const plausible = createHttp((req, res) => {
  let raw = '';
  req.on('data', (d) => (raw += d));
  req.on('end', async () => {
    if (req.url !== '/api/v2/query' || req.headers.authorization !== `Bearer ${API_KEY}`) { res.writeHead(401).end(); return; }
    const body = JSON.parse(raw);
    const key = `${body.site_id}|${body.date_range}`;
    if (!body.dimensions) requests.push(key);
    await sleep(delays.get(key) ?? 0);
    const visitors = VISITORS[body.site_id]?.[body.date_range];
    const results = body.dimensions
      ? []
      : [{ metrics: body.metrics.map((m) => (m === 'visitors' ? visitors : m === 'pageviews' ? visitors * 3 : null)), dimensions: [] }];
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ results }));
  });
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
  const plausiblePort = await new Promise((r) => plausible.listen(0, '127.0.0.1', () => r(plausible.address().port)));
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [path.join(CMS, 'node_modules/next/dist/bin/next'), 'start', '-p', String(port), '-H', '127.0.0.1'], {
    cwd: CMS,
    env: { ...env, NODE_ENV: 'production', PAYLOAD_PUBLIC_URL: origin, CMS_JOBS_AUTORUN: 'false', PLAUSIBLE_URL: `http://127.0.0.1:${plausiblePort}`, PLAUSIBLE_API_KEY: API_KEY },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = ''; server.stdout.on('data', (d) => (log += d)); server.stderr.on('data', (d) => (log += d));
  for (let i = 0; i < 120; i++) { try { await fetch(`${origin}/api/public/gildra/settings`); break; } catch { await sleep(500); } }

  const json = { 'content-type': 'application/json' };
  assert.equal((await fetch(`${origin}/api/admins/first-register`, { method: 'POST', headers: json, body: JSON.stringify({ email: 'owner@test.local', password: 'local-test-password-1', name: 'Owner' }) })).status, 200);
  const { token } = await (await fetch(`${origin}/api/admins/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: 'owner@test.local', password: 'local-test-password-1' }) })).json();
  const auth = { ...json, Authorization: `JWT ${token}` };
  const sites = (await (await fetch(`${origin}/api/sites?limit=10`, { headers: auth })).json()).docs;
  const siteIds = {};
  for (const s of sites) {
    const domain = s.slug === 'gildra' ? 'gildra.net' : 'riftden.com';
    siteIds[domain] = String(s.id);
    assert.equal((await fetch(`${origin}/api/sites/${s.id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ plausibleSiteId: domain }) })).status, 200);
  }
  const domainOf = Object.fromEntries(Object.entries(siteIds).map(([d, id]) => [id, d]));

  browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${origin}/admin/login`);
  await page.fill('input[name="email"]', 'owner@test.local');
  await page.fill('input[name="password"]', 'local-test-password-1');
  await page.click('button[type="submit"]');
  await page.waitForURL(`${origin}/admin`);

  // Record every committed DOM state of the panel.
  await page.addInitScript(() => {
    // Text-based reading of the panel (independent of implementation details).
    window.__panel = () => {
      const labelled = (name) => [...document.querySelectorAll('label')].find((l) => l.querySelector('select') && l.textContent.trim().startsWith(name))?.querySelector('select');
      const visitorTile = [...document.querySelectorAll('div')].find((d) => d.children.length === 2 && d.firstElementChild.textContent.startsWith('Unique visitors ·'));
      const tiles = document.querySelector('[data-analytics-site]');
      return {
        site: labelled('Site')?.value,
        period: labelled('Period')?.value,
        tileSite: tiles?.getAttribute('data-analytics-site') ?? null,
        tilePeriod: tiles?.getAttribute('data-analytics-period') ?? null,
        label: visitorTile?.firstElementChild.textContent ?? null,
        value: visitorTile?.lastElementChild.textContent ?? null,
        loading: [...document.querySelectorAll('span')].some((n) => /^Loading/.test(n.textContent)),
        status: document.querySelector('p[role="status"]')?.textContent ?? null,
      };
    };
    window.__frames = [];
    new MutationObserver(() => window.__frames.push(window.__panel())).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
  });
  const frames = async () => page.evaluate(() => window.__frames.splice(0));
  const nameOf = (id) => NAMES[domainOf[id]];
  const assertFrames = (list, what) => {
    let shown = 0;
    for (const f of list) {
      if (f.site === undefined) continue;
      if (f.value !== null) {
        shown++;
        // The label must name the selected site and the number must be that site's number
        // for the selected period — whatever the component does internally.
        assert.equal(f.label, `Unique visitors · ${nameOf(f.site)}`, `${what}: label does not name the selected site (${JSON.stringify(f)})`);
        assert.equal(f.value, String(VISITORS[domainOf[f.site]][f.period]), `${what}: number is not the selected site/period's (${JSON.stringify(f)})`);
        if (f.tileSite !== null) assert.deepEqual([f.tileSite, f.tilePeriod], [f.site, f.period], `${what}: tiles bound to another selection`);
      } else {
        assert.ok(f.loading || f.status, `${what}: neither numbers nor loading/status for the selection (${JSON.stringify(f)})`);
      }
    }
    return shown;
  };
  const panel = () => page.evaluate(() => window.__panel());
  const tileValue = (v) => page.waitForFunction((want) => window.__panel().value === want, String(v), { timeout: 15000 });
  const selects = page.locator('label:has-text("Site") select');
  const periodSelect = page.locator('label:has-text("Period") select');

  await page.goto(`${origin}/admin/analytics`);
  await tileValue(17);
  assert.equal(await selects.inputValue(), siteIds['gildra.net']);
  assertFrames(await frames(), 'initial');
  ok('Gildra · Last 30 days shows 17 visitors');

  // 1. Delayed site switch (the reported defect).
  delays.set('riftden.com|30d', 1200);
  await selects.selectOption(siteIds['riftden.com']);
  const firstRender = await panel();
  assert.equal(firstRender.value, null, `numbers rendered right after switching to Riftden: ${firstRender.label} = ${firstRender.value}`);
  assert.equal(firstRender.loading, true);
  assert.equal(await page.getByText('Loading Riftden · Last 30 days…', { exact: true }).count(), 1);
  await tileValue(9);
  const shown1 = assertFrames(await frames(), 'delayed site switch');
  ok(`delayed switch to Riftden: no Gildra number under the Riftden selection, loading shown, then 9 (${shown1} frames with numbers checked)`);

  // 2. Rapid switches: a slow, aborted older request must not change result or loading.
  delays.set('riftden.com|month', 2000);
  delays.set('gildra.net|month', 900);
  await periodSelect.selectOption('month'); // Riftden · month (slow, will be superseded)
  await sleep(100);
  await selects.selectOption(siteIds['gildra.net']); // Gildra · month
  await sleep(400);
  const midway = await panel();
  assert.equal(midway.value, null);
  assert.equal(midway.loading, true, 'aborted older request ended the loading state early');
  assert.equal(await page.getByText('Loading Gildra · This month…', { exact: true }).count(), 1);
  await tileValue(23);
  await sleep(2000); // the superseded Riftden · month answer completes upstream meanwhile
  assert.deepEqual(await panel().then((f) => [f.label, f.value, f.loading]), ['Unique visitors · Gildra', '23', false]);
  const shown2 = assertFrames(await frames(), 'rapid switch');
  assert.ok(requests.includes('riftden.com|month'), 'the superseded request really reached the fixture');
  ok(`rapid Riftden→month→Gildra: the aborted Riftden request never shows or clears loading; Gildra · month = 23 stays (${shown2} frames)`);

  // Several switches in a row, every answer delayed differently; only the last selection may render.
  delays.set('riftden.com|6mo', 1500);
  delays.set('gildra.net|6mo', 300);
  delays.set('riftden.com|7d', 700);
  await periodSelect.selectOption('6mo'); // Gildra · 6mo
  await selects.selectOption(siteIds['riftden.com']); // Riftden · 6mo
  await periodSelect.selectOption('7d'); // Riftden · 7d
  await tileValue(4);
  await sleep(1800);
  assert.deepEqual(await panel().then((f) => [f.label, f.value, f.loading]), ['Unique visitors · Riftden', '4', false]);
  const shown3 = assertFrames(await frames(), 'burst');
  ok(`burst of three switches with out-of-order answers ends on Riftden · Last 7 days = 4 (${shown3} frames)`);

  // 3. Period switch on the same site.
  delays.set('riftden.com|6mo', 1200);
  await periodSelect.selectOption('6mo');
  const afterPeriod = await panel();
  assert.equal(afterPeriod.value, null, `7-day number rendered under "Last 6 months": ${afterPeriod.value}`);
  await tileValue(66);
  const shown4 = assertFrames(await frames(), 'period switch');
  ok(`period switch on Riftden: no 7-day number under "Last 6 months", then 66 (${shown4} frames)`);

  // 4. Honest error state stays bound to its selection too.
  plausible.close();
  plausible.closeAllConnections?.();
  await periodSelect.selectOption('12mo');
  await page.locator('p[role="status"]').filter({ hasText: /No numbers are shown/ }).waitFor();
  assert.equal((await panel()).value, null);
  assertFrames(await frames(), 'error');
  ok('an unreachable Plausible shows the honest error for the new selection, no numbers');

  if (/TypeError|ReferenceError/.test(log)) console.log('# server log mentions errors (not printed)');
  console.log(`\n${checks.length} analytics browser checks passed.`);
} finally {
  await browser?.close();
  if (server) server.kill('SIGTERM');
  plausible.close();
  await sleep(800);
  await admin(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`).catch(() => {});
}
