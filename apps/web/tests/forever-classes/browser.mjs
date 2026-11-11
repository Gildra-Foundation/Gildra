import { chromium } from 'playwright-core';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const base = process.env.CLASSES_BASE ?? 'http://127.0.0.1:3353';
const out = '/tmp/forever-platform-20261111/CLASSES';
fs.mkdirSync(`${out}/screenshots`, { recursive: true });
const browser = await chromium.launch({ executablePath: '/home/debian/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', headless: true, args: ['--no-sandbox','--disable-dev-shm-usage'] });
const results = [], errors = [];
const slugs = ['druid','hunter','mage','paladin','priest','rogue','shaman','warlock','warrior'];
async function visit(page, path) {
  const res = await page.goto(`${base}${path}`, { waitUntil: 'load', timeout: 180000 });
  assert.equal(res.status(), 200, path);
  await page.locator('h1:visible').waitFor();
  await page.evaluate(async () => { await document.fonts.ready; const imgs = [...document.images].filter(i => i.complete); await Promise.race([Promise.all(imgs.map(i => i.decode().catch(() => {}))), new Promise(r => setTimeout(r, 10000))]); });
  const consent = page.getByRole('button', { name: /^(Decline|Отклонить)$/ });
  if (await consent.isVisible()) await consent.click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('h1:visible').count(), 1, path);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  assert.equal(overflow, false, `overflow ${path}`);
  const main = await page.locator('main').innerText().catch(() => page.locator('body').innerText());
  assert.doesNotMatch(main, /1\.60\.1|1\.15\.9|coming soon|импортировано|source:|data checked/i);
  results.push({ path, viewport: page.viewportSize(), status: 200, overflow });
}
try {
  for (const lang of ['en','ru']) {
    const prefix = lang === 'ru' ? '/ru' : '';
    for (const width of [1440,390,320]) {
      const ctx = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce', hasTouch: width < 500 });
      const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));page.on('console', m => { if (m.type() === 'error' && /hydrat|server rendered/i.test(m.text())) errors.push(m.text()); });
      for (const route of ['/wow/forever/classes','/wow/forever/changes','/wow/forever/classes/warlock']) {
        await visit(page, prefix + route);
        await page.screenshot({ path: `${out}/screenshots/${lang}-${width}-${route.split('/').at(-1)}.png`, fullPage: true });
      }
      if (width === 390) {
        await visit(page, `${prefix}/wow/forever/changes?class=warrior`);
        await page.getByRole('link', { name: lang === 'ru' ? 'Следующая' : 'Next', exact: true }).click();
        await page.waitForURL(/page=2/);
        await page.getByRole('link', { name: lang === 'ru' ? 'Предыдущая' : 'Previous', exact: true }).waitFor();
        await visit(page, `${prefix}/wow/forever/changes?class=warrior&kind=talent&q=Bloodthrill`);
        assert.match(await page.locator('main').innerText(), /Bloodthrill/);
        await page.locator('#change-search').fill('zzzzzzzz');
        await page.locator('form button[type=submit]').click();
        await page.waitForURL(/q=zzzzzzzz/);
        await page.getByRole('status').filter({ hasText: lang === 'ru' ? 'Изменений по этому запросу нет.' : 'No matching changes.' }).waitFor();
        await visit(page, `${prefix}/wow/forever/changes?class=paladin&status=removed`);
        const rows = page.locator('form + div > details');
        assert.ok(await rows.count());
        await page.locator('form button[type=submit]').focus();
        assert.equal(await page.evaluate(() => document.activeElement.tagName), 'BUTTON');
        await page.keyboard.press('Tab');
        assert.ok(await page.evaluate(() => ['A','SUMMARY','BUTTON','INPUT','SELECT'].includes(document.activeElement.tagName)));
        assert.ok(await page.evaluate(() => document.activeElement.matches(':focus-visible') && parseFloat(getComputedStyle(document.activeElement).outlineWidth) > 0), 'visible keyboard focus');
        await page.emulateMedia({ forcedColors: 'active' });
        await page.screenshot({ path: `${out}/screenshots/${lang}-390-forced-colors.png` });
      }
      await ctx.close();
    }
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();page.on('pageerror', e => errors.push(e.message));page.on('console', m => { if (m.type() === 'error' && /hydrat|server rendered/i.test(m.text())) errors.push(m.text()); });
    for (const slug of slugs) await visit(page, `${prefix}/wow/forever/classes/${slug}`);
    await ctx.close();
  }
  // With JavaScript disabled, real GET filters and disclosures remain usable.
  const nojs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } });
  const p = await nojs.newPage();await visit(p, '/ru/wow/forever/changes?class=mage&kind=spellbook');
  assert.ok(await p.locator('details').count());await nojs.close();
  assert.deepEqual(errors, []);
  fs.writeFileSync(`${out}/browser.json`, JSON.stringify({ results, errors }, null, 2));
  console.log(`PASS ${results.length} route/layout cases, keyboard, filters, empty, forced-colors, no-JS`);
} finally { await browser.close(); fs.writeFileSync(`${out}/browser-progress.json`, JSON.stringify({ results, errors },null,2)); }
