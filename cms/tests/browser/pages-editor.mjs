#!/usr/bin/env node
// Block page editor (CMS stages 1–2) against a production build and a fresh, local payload_*test* database.
//   PAYLOAD_DATABASE_URL=postgres://…/payload_x_test PLAYWRIGHT_EXECUTABLE_PATH=… node tests/browser/pages-editor.mjs
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
dbUrl.pathname = `${base.pathname}__pages_browser`;
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
const poll = async (condition, what = 'condition') => {
  for (let n = 0; n < 120; n++) { if (await condition()) return; await new Promise((resolve) => setTimeout(resolve, 250)); }
  throw new Error(`Timed out waiting for ${what}`);
};
let server, browser, page;
let checks = 0;
const ok = (message) => { console.log(`ok - ${message}`); checks++; };
try {
  const fixtureLog = await run([path.join(CMS, 'node_modules/payload/bin.js'), 'run', 'tests/browser/pages-fixture.ts'], { ...process.env, NODE_ENV: 'test' });
  const fixture = JSON.parse(/PAGES_FIXTURE (.+)/.exec(fixtureLog)[1]);
  const port = await freePort();
  const origin = `http://localhost:${port}`;
  server = spawn(process.execPath, [path.join(CMS, 'node_modules/next/dist/bin/next'), 'start', '-p', String(port), '-H', '127.0.0.1'], {
    cwd: CMS, env: { ...process.env, PAYLOAD_DATABASE_URL: dbUrl.toString(), PAYLOAD_PUBLIC_URL: origin, NODE_ENV: 'production', EMAIL_TRANSPORT: 'disabled', CMS_JOBS_AUTORUN: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await poll(async () => { try { return (await fetch(`${origin}/admin/login`)).ok; } catch { return false; } }, 'the CMS server');
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: 'payload-lng', value: 'ru', url: origin }, { name: 'payload-tenant', value: String(fixture.gildra), url: origin }]);
  page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const login = await page.request.post(`${origin}/api/admins/login`, { data: { email: 'owner@pages-browser.test', password: 'local-test-password-1' } });
  assert.equal(login.status(), 200);
  // API reads outside the page carry the token (cookie auth needs the browser's Origin).
  const headers = { Authorization: `JWT ${(await login.json()).token}` };
  const draft = async (locale) => (await (await page.request.get(`${origin}/api/pages/${fixture.pageID}?locale=${locale}&fallback-locale=none&draft=true&depth=0`, { headers })).json()).blocks;
  const blocks = page.locator('.gd-blocks > .gd-blocklist > ul > li');

  // The page id is picked from the site's list.
  // "Create" opens the choose-a-page step; the draft is made only by its submit button.
  await page.goto(`${origin}/admin/collections/pages/create`);
  await page.waitForURL(/\/admin\/new-page/);
  await page.locator('.gd-workspace form button').first().click();
  const options = await page.getByRole('option').allInnerTexts();
  assert.ok(options.some((o) => o.includes('wow/tier-lists')) && options.some((o) => o.includes('wow/privacy')), options.join(' | '));
  await page.keyboard.press('Escape');
  ok('page id is chosen from the overridable pages of the site');

  // Russian version: empty, so the site keeps its code page; build a legal block with the form.
  await page.goto(`${origin}/admin/collections/pages/${fixture.pageID}?locale=ru`);
  await page.locator('.gd-pageside__urls').waitFor();
  assert.match(await page.locator('.gd-pageside__urls').innerText(), /\/privacy · \/ru\/privacy/);
  assert.equal(await blocks.count(), 0);
  await page.getByRole('button', { name: /Добавить блок/ }).click();
  assert.equal(await blocks.count(), 1);
  const card = blocks.first();
  const inputs = card.locator('.gd-bform__pair input');
  await inputs.nth(0).fill('Политика конфиденциальности');
  await inputs.nth(1).fill('Обновлено: 22 октября 2026');
  for (const [heading, text] of [['Что мы храним', 'Настройки интерфейса.'], ['Контакты', 'Обращение в репозитории.']]) {
    await card.getByRole('button', { name: 'Раздел', exact: true }).click();
    const section = card.locator('.gd-blist__row').last();
    await section.locator('.ui-accordion__trigger').click();
    await section.locator('input').fill(heading);
    await section.locator('textarea').fill(text);
  }
  await card.locator('.gd-bform > .gd-bfield').last().locator('input').fill('← Назад на Gildra');
  assert.match(await card.locator('.gd-block__status').innerText(), /проверен/);
  await poll(async () => (await draft('ru'))?.[0]?.props?.sections?.length === 2, 'the Russian autosave');
  const ru = await draft('ru');
  assert.deepEqual(ru, [{ type: 'legal', props: { title: 'Политика конфиденциальности', updated: 'Обновлено: 22 октября 2026', sections: [{ heading: 'Что мы храним', text: 'Настройки интерфейса.' }, { heading: 'Контакты', text: 'Обращение в репозитории.' }], backLabel: '← Назад на Gildra' } }]);
  assert.equal((await draft('en'))[0].props.title, 'Privacy Policy');
  ok('legal block built from the form autosaves as BlockInstance[] in Russian only');

  // Reorder sections with the keyboard (Sortable handle), autosaved.
  await card.locator('.gd-blist__row').last().locator('.gd-handle').focus();
  await page.keyboard.press('Space'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Space');
  await poll(async () => (await draft('ru'))?.[0]?.props?.sections?.[0]?.heading === 'Контакты', 'the reordered autosave');
  ok('sections reorder by drag handle (keyboard) and save');

  // Read-only JSON mirrors the stored value.
  await page.getByRole('button', { name: /Показать JSON/ }).click();
  assert.match(await page.locator('.gd-json').innerText(), /"type": "legal"/);
  await page.keyboard.press('Escape');
  ok('read-only JSON shows the stored blocks');

  // Publishing makes the Russian blocks public; English stays English.
  const published = page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes(`/api/pages/${fixture.pageID}`) && !r.url().includes('autosave=true'));
  await page.getByRole('button', { name: /Опубликовать/ }).first().click();
  assert.equal((await published).status(), 200);
  const pub = async (locale) => (await (await page.request.get(`${origin}/api/public/gildra/page?slug=wow/privacy&locale=${locale}`)).json()).blocks?.[0]?.props?.title;
  assert.equal(await pub('ru'), 'Политика конфиденциальности');
  assert.equal(await pub('en'), 'Privacy Policy');
  ok('publishing serves Russian blocks on RU and English on EN');

  // Removing asks first.
  await card.getByRole('button', { name: 'Удалить блок' }).click();
  await page.getByRole('button', { name: 'Отмена' }).click();
  assert.equal(await blocks.count(), 1);
  await card.getByRole('button', { name: 'Удалить блок' }).click();
  await page.getByRole('button', { name: 'Удалить', exact: true }).click();
  assert.equal(await blocks.count(), 0);
  ok('removing a block needs confirmation');

  // A typo cannot be stored, even as a draft, and the error names block and reason.
  const typo = await page.request.patch(`${origin}/api/pages/${fixture.pageID}?locale=ru&draft=true`, { data: { blocks: [{ type: 'legall' }] }, headers });
  assert.equal(typo.status(), 400);
  assert.match(JSON.stringify(await typo.json()), /legall/);
  ok('a "legall" typo is refused with a message');

  assert.deepEqual(errors, []);
  console.log(`\n${checks} page editor browser checks passed.`);
} catch (error) {
  await page?.screenshot({ path: '/tmp/gildra-cms-pages-browser-error.png', fullPage: true }).catch(() => {});
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
