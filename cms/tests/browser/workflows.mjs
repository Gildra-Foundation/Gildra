#!/usr/bin/env node
// Production build + a fresh, local payload_*test* database; never live accounts.
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
  throw new Error('Refusing: a local payload_*test* database is required.');
}
const dbUrl = new URL(base);
dbUrl.pathname = `${base.pathname}__workflow_browser`;
const run = (args, env) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, { cwd: CMS, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (data) => { log += data; });
  child.stderr.on('data', (data) => { log += data; });
  child.on('exit', (code) => code === 0 ? resolve(log) : reject(new Error(log.slice(-2000))));
});
const freePort = () => new Promise((resolve) => {
  const socket = createServer();
  socket.listen(0, '127.0.0.1', () => { const port = socket.address().port; socket.close(() => resolve(port)); });
});
const poll = async (condition) => {
  for (let n = 0; n < 100; n++) { if (await condition()) return; await new Promise((resolve) => setTimeout(resolve, 150)); }
  throw new Error('Timed out waiting for the saved state');
};
let server, browser, page;
let serverLog = '';
const mutations = [];
let checks = 0;
const ok = (message) => { console.log(`ok - ${message}`); checks++; };
try {
  const fixtureLog = await run([path.join(CMS, 'node_modules/payload/bin.js'), 'run', 'tests/browser/workflows-fixture.ts'], { ...process.env, NODE_ENV: 'test' });
  const fixture = JSON.parse(/WORKFLOW_FIXTURE (.+)/.exec(fixtureLog)[1]);
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [path.join(CMS, 'node_modules/next/dist/bin/next'), 'start', '-p', String(port), '-H', '127.0.0.1'], {
    cwd: CMS, env: { ...process.env, PAYLOAD_DATABASE_URL: dbUrl.toString(), PAYLOAD_PUBLIC_URL: origin, NODE_ENV: 'production', EMAIL_TRANSPORT: 'disabled', CMS_JOBS_AUTORUN: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  server.stdout.on('data', (data) => { serverLog += data; });
  server.stderr.on('data', (data) => { serverLog += data; });
  await poll(async () => { try { return (await fetch(`${origin}/admin/login`)).ok; } catch { return false; } });
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
  const context = await browser.newContext();
  await context.addCookies([{ name: 'payload-lng', value: 'en', url: origin }]);
  page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', async (response) => {
    if (response.request().method() === 'PATCH' && new URL(response.url()).pathname.startsWith('/api/guides/')) {
      const body = await response.json().catch(() => ({}));
      mutations.push({ status: response.status(), url: new URL(response.url()).pathname + new URL(response.url()).search,
        title: body.doc?.title, summary: body.doc?.summary, error: body.errors?.[0]?.message });
    }
  });
  const openLogin = async () => {
    const initialized = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/admins/me');
    await page.goto(`${origin}/admin/login`);
    await initialized;
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  const login = async (email, password = 'local-test-password-1') => {
    await openLogin();
    await page.locator('input[name=email]').fill(email);
    await page.locator('input[name=password]').fill(password);
    assert.equal(await page.locator('input[name=email]').inputValue(), email);
    const authenticated = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/admins/login');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    assert.equal((await authenticated).status(), 200);
    await page.waitForURL(`${origin}/admin`);
  };
  const document = async (id, locale, draft = true) => {
    const response = await page.request.get(`${origin}/api/guides/${id}?locale=${locale}&fallback-locale=none&draft=${draft}&depth=0`, { headers: { 'sec-fetch-site': 'same-origin' } });
    assert.equal(response.status(), 200);
    return response.json();
  };
  const select = async (label, option) => {
    await page.getByRole('combobox', { name: label, exact: true }).click();
    await page.getByRole('option', { name: option, exact: true }).click();
  };
  const workspace = page.locator('.gd-workspace');

  await openLogin();
  await page.getByRole('heading', { name: 'Editorial sign-in' }).waitFor();
  assert.match(await page.locator('.gd-auth-intro').innerText(), /recovery is currently unavailable/);
  await page.locator('input[name=email]').fill('owner@workflow.test');
  await page.locator('input[name=password]').fill('wrong-password-123');
  const failed = page.waitForResponse((response) => response.url().endsWith('/api/admins/login'));
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  assert.equal((await failed).status(), 401);
  await login('owner@workflow.test');
  ok('native staff login rejects a wrong password and accepts the correct one');

  await page.goto(`${origin}/admin/users`);
  await workspace.getByRole('heading', { name: 'Users', exact: true }).waitFor();
  assert.equal(await workspace.locator('tbody tr').count(), 4);
  await workspace.getByRole('button', { name: 'Readers', exact: true }).click();
  await workspace.getByRole('link', { name: 'Workflow Reader', exact: true }).waitFor();
  assert.equal(await workspace.locator('tbody tr').count(), 2);
  await workspace.getByRole('textbox', { name: 'Reader email', exact: true }).fill('dual@');
  await poll(async () => await workspace.locator('tbody tr').count() === 1);
  assert.match(await workspace.locator('tbody').innerText(), /dual@workflow.test/);
  ok('users registry switches staff/readers, searches and links to real profiles');

  await page.goto(`${origin}/admin/articles`);
  await workspace.getByRole('heading', { name: 'Articles', exact: true }).waitFor();
  assert.equal(await workspace.locator('tbody tr').count(), 25);
  await workspace.getByRole('button', { name: 'Next', exact: true }).click();
  await poll(async () => await workspace.locator('tbody tr').count() === 2);
  await workspace.getByRole('textbox', { name: 'Title or address', exact: true }).fill('Needle');
  await workspace.getByRole('link', { name: 'Needle published article', exact: true }).waitFor();
  assert.equal(await workspace.locator('tbody tr').count(), 1);
  assert.match(await workspace.locator('tbody').innerText(), /Changes not on the site/);
  assert.equal(await workspace.getByRole('link', { name: 'Live ↗' }).getAttribute('href'), 'https://gildra.net/wow/articles/workflow-published');
  ok('article pagination and search run on the server and preserve the real live link');

  await page.goto(`${origin}/admin/collections/guides/${fixture.articleID}?locale=ru`);
  const fill = page.getByRole('button', { name: 'Fill empty fields from the English version', exact: true });
  await fill.waitFor();
  await fill.click();
  const editor = page.locator('[contenteditable=true]').first();
  await poll(async () => (await editor.innerText()).includes('Published English body'));
  assert.equal(await page.locator('input[name=title]').inputValue(), 'Needle published article');
  await page.locator('input[name=title]').fill('Русская статья');
  await page.locator('textarea[name=summary]').fill('Описание русской статьи');
  await editor.fill('Русский текст статьи после копирования и редактирования.');
  await page.locator('input[name=title]').click();
  await poll(async () => (await document(fixture.articleID, 'ru')).title === 'Русская статья');
  const draft = await document(fixture.articleID, 'ru');
  assert.match(JSON.stringify(draft.content), /Русский текст статьи/);
  assert.equal(draft._status, 'draft');
  assert.equal((await document(fixture.articleID, 'ru', false)).title || '', '');
  assert.equal((await document(fixture.articleID, 'en', false)).title, 'Needle published article');
  assert.equal(await page.locator('.gd-article-panel__live a').count(), 1);
  assert.match(await page.locator('.gd-article-panel__live').innerText(), /EN/);
  ok('copying visibly updates Lexical; edits autosave as a draft without publishing the RU translation');

  await page.getByRole('button', { name: /^Publish (changes|RU and EN)$/i }).click();
  await poll(async () => (await document(fixture.articleID, 'ru', false)).title === 'Русская статья');
  assert.equal((await document(fixture.articleID, 'en', false)).title, 'Needle published article');
  await poll(async () => await page.locator('.gd-article-panel__live a').count() === 2);
  ok('an explicit publish releases the translation and refreshes both genuine public links');

  await context.clearCookies({ name: 'payload-tenant' });
  await page.goto(`${origin}/admin/articles`);
  await select('Content language', 'Russian');
  await workspace.getByRole('link', { name: 'New article', exact: true }).click();
  await page.getByRole('button', { name: 'Create the article on Gildra', exact: true }).click();
  await page.waitForURL(/\/admin\/collections\/guides\/\d+\?locale=ru$/);
  const newID = /guides\/(\d+)/.exec(page.url())[1];
  await page.locator('input[name=title]').fill('Новая черновая статья');
  await page.locator('textarea[name=summary]').fill('Краткое описание нового материала');
  await page.locator('[contenteditable=true]').first().fill('Текст новой статьи, сохранённый в редакторе.');
  await page.locator('input[name=title]').click();
  await poll(async () => (await document(newID, 'ru')).title === 'Новая черновая статья');
  assert.equal((await document(newID, 'ru')).site, fixture.gildra);
  assert.equal((await document(newID, 'ru'))._status, 'draft');
  ok('creating from the workbench preserves the chosen language and site and saves authored text');

  await context.clearCookies({ name: 'payload-token' });
  await login('gadmin@workflow.test');
  await page.goto(`${origin}/admin/users`);
  await workspace.getByRole('button', { name: 'Readers', exact: true }).click();
  await workspace.getByRole('link', { name: 'Workflow Reader', exact: true }).waitFor();
  assert.doesNotMatch(await workspace.locator('tbody').innerText(), /Riftden|foreign-reader/);
  await workspace.getByRole('link', { name: 'Open', exact: true }).click();
  await page.locator('.array-field__row').first().getByRole('combobox').last().click();
  await page.getByRole('option', { name: 'Blocked on this site', exact: true }).click();
  const saved = page.waitForResponse((response) => response.request().method() === 'PATCH' && new URL(response.url()).pathname === `/api/members/${fixture.readerID}`);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  assert.equal((await saved).status(), 200);
  const reader = await (await page.request.get(`${origin}/api/members/${fixture.readerID}?depth=0`, { headers: { 'sec-fetch-site': 'same-origin' } })).json();
  assert.equal(reader.memberships.find((row) => row.site === fixture.gildra).status, 'blocked');
  assert.equal(reader.memberships.find((row) => row.site === fixture.riftden).status, 'active');
  ok('site admin saves the native reader form and changes only the permitted site membership');

  await context.clearCookies({ name: 'payload-token' });
  await login('author@workflow.test');
  await page.goto(`${origin}/admin/users`);
  await workspace.getByRole('heading', { name: 'Users', exact: true }).waitFor();
  assert.equal(await workspace.getByRole('button', { name: 'Readers', exact: true }).count(), 0);
  assert.equal(await workspace.locator('tbody tr').count(), 1);
  assert.equal((await page.request.get(`${origin}/api/admin/users?kind=readers`, { headers: { 'sec-fetch-site': 'same-origin' } })).status(), 403);
  assert.equal((await page.request.get(`${origin}/api/admin/articles?site=${fixture.riftden}`, { headers: { 'sec-fetch-site': 'same-origin' } })).status(), 403);
  ok('author sees their own account, cannot enumerate readers or forge another site filter');
  await context.clearCookies({ name: 'payload-tenant' });
  await page.goto(`${origin}/admin/articles`);
  await workspace.getByRole('link', { name: 'New article', exact: true }).click();
  await page.getByRole('button', { name: 'Create the article on Gildra', exact: true }).click();
  await page.waitForURL(/\/admin\/collections\/guides\/\d+\?locale=en$/);
  const authorID = /guides\/(\d+)/.exec(page.url())[1];
  await page.locator('input[name=title]').fill('Article written by an author');
  await page.locator('textarea[name=summary]').fill('An author saves a draft for editorial review.');
  await page.locator('[contenteditable=true]').first().fill('An authored draft from the native editor.');
  await page.locator('input[name=title]').click();
  await poll(async () => (await document(authorID, 'en')).title === 'Article written by an author');
  const authored = await document(authorID, 'en');
  assert.equal(authored._status, 'draft');
  assert.equal(authored.author, fixture.authorID);
  const publish = await page.request.patch(`${origin}/api/guides/${authorID}?locale=en`, {
    headers: { 'sec-fetch-site': 'same-origin' }, data: { _status: 'published' },
  });
  assert.equal(publish.status(), 403);
  ok('author creates and writes their own draft, with publication restricted to editors');
  assert.deepEqual(errors, []);
  console.log(`\n${checks} workflow browser checks passed.`);
} catch (error) {
  console.error('Server log tail:', serverLog.slice(-1500));
  console.error('Article mutation diagnostics:', JSON.stringify(mutations));
  if (page?.url().includes('/collections/guides/')) console.error('Saved article diagnostics:', await page.evaluate(async () => {
    const id = /guides\/(\d+)/.exec(location.pathname)?.[1];
    const data = await (await fetch(`/api/guides/${id}?locale=ru&fallback-locale=none&draft=true&depth=0`)).json();
    return { title: data.title, summary: data.summary, status: data._status, error: data.errors?.[0]?.message };
  }).catch(() => null));
  await page?.screenshot({ path: '/tmp/gildra-cms-workflow-browser-error.png', fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  if (server) {
    const stopped = new Promise((resolve) => server.once('exit', resolve));
    server.kill('SIGTERM');
    await stopped;
  }
  const client = new pg.Client({ connectionString: base.toString() });
  await client.connect();
  try { await client.query(`DROP DATABASE IF EXISTS "${dbUrl.pathname.slice(1)}" WITH (FORCE)`); }
  finally { await client.end(); }
}
