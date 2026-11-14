// Browser check of the Forever class pages and tier lists against a running app:
//   CLASSES_BASE=http://127.0.0.1:3413 node apps/web/tests/forever-classes/browser.mjs
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const base = process.env.CLASSES_BASE ?? 'http://127.0.0.1:3353';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const results = [], errors = [];
const slugs = ['druid', 'hunter', 'mage', 'paladin', 'priest', 'rogue', 'shaman', 'warlock', 'warrior'];
const words = {
  en: { next: 'Next', previous: 'Previous', empty: 'Nothing found', tanks: 'Tanks', mine: 'Make my list', healers: 'Dungeon healers' },
  ru: { next: 'Дальше', previous: 'Назад', empty: 'Ничего не найдено', tanks: 'Танки', mine: 'Составить свой', healers: 'Лекари подземелий' },
};
function watch(page) {
  page.on('pageerror', e => errors.push(`${page.url()} ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${page.url()} ${m.text().slice(0, 300)}`); });
}
async function visit(page, path) {
  const res = await page.goto(`${base}${path}`, { waitUntil: 'networkidle', timeout: 180000 });
  assert.equal(res.status(), 200, path);
  await page.locator('h1:visible').waitFor();
  // Hydrated: a click before that is the reader's own change of the page, not a defect.
  await page.waitForFunction(() => { const el = document.querySelector('[data-forever] h1'); return el && Object.keys(el).some(k => k.startsWith('__react')); });
  await page.evaluate(async () => { await document.fonts.ready; });
  const consent = page.getByRole('button', { name: /^(Decline|Отклонить)$/ });
  if (await consent.isVisible()) await consent.click();
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); } scrollTo(0, 0); });
  await page.waitForTimeout(200);
  assert.equal(await page.locator('h1:visible').count(), 1, path);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `overflow ${path}`);
  assert.deepEqual(await page.evaluate(() => [...document.images].filter(i => i.complete && !i.naturalWidth).map(i => i.src)), [], `broken images ${path}`);
  // No word is cut by its box: names of classes, trees and changes wrap or fit.
  const clipped = await page.evaluate(() => [...document.querySelectorAll('main h2, main h3, main h4, main strong, main [data-role]')]
    .filter(el => el.offsetParent && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible').map(el => el.textContent.trim().slice(0, 40)));
  assert.deepEqual(clipped, [], `clipped text ${path}`);
  const main = await page.locator('main').innerText().catch(() => page.locator('body').innerText());
  assert.doesNotMatch(main, /1\.60\.1|1\.15\.9|coming soon|импортировано|source:|sources|источники|data checked/i, path);
  results.push(path);
}
try {
  for (const lang of ['en', 'ru']) {
    const prefix = lang === 'ru' ? '/ru' : '', w = words[lang];
    for (const width of [1440, 390, 320]) {
      const ctx = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce', hasTouch: width < 500 });
      const page = await ctx.newPage(); watch(page);
      for (const route of ['/wow/forever/classes', '/wow/forever/changes', '/wow/forever/classes/warlock', '/wow/forever/tier-lists']) await visit(page, prefix + route);
      if (width !== 320) {
        // The roster: nine classes with three trees each; the role filter leaves the tanks.
        await visit(page, `${prefix}/wow/forever/classes`);
        assert.equal(await page.locator('#forever-roster > li').count(), 9);
        assert.equal(await page.locator('#forever-roster li[data-roles]').count(), 27);
        await page.getByRole('radio', { name: w.tanks }).click({ force: true });
        await page.waitForFunction(() => document.getElementById('forever-roster').dataset.roleFilter === 'tank');
        assert.equal(await page.locator('#forever-roster > li:visible').count(), 3);
        assert.equal(await page.locator('#forever-roster li[data-roles]:visible').count(), 3);
        // The class page: three tree cards into the calculator, the changes fold and unfold.
        await visit(page, `${prefix}/wow/forever/classes/warrior`);
        assert.deepEqual(await page.locator('#talents a').evaluateAll(links => links.map(a => new URL(a.href).hash)), ['#tree-arms', '#tree-fury', '#tree-protection']);
        assert.equal(await page.locator('#combat li img').count(), 2);
        const first = page.locator('#changes li > details').first();
        assert.equal(await first.evaluate(el => el.open), false);
        await first.locator('> summary').click();
        await first.locator('[data-side="after"]').first().waitFor();
        // Classic text is English: the changed words are marked where both sides are in one language.
        if (lang === 'en') assert.ok(await first.locator('del').count() && await first.locator('ins').count());
        // Paging, a filter with a second page, search, the empty state.
        await visit(page, `${prefix}/wow/forever/changes?class=warrior`);
        assert.equal(await page.locator('#changes li > details').count(), 18);
        await page.getByRole('link', { name: w.next }).click();
        await page.waitForURL(/page=2/);
        await page.getByRole('link', { name: w.previous }).waitFor();
        await visit(page, `${prefix}/wow/forever/changes?class=warrior&kind=talent&page=2`);
        assert.ok(await page.locator('#changes li > details').count());
        await visit(page, `${prefix}/wow/forever/changes?class=warrior&kind=talent&q=Bloodthrill`);
        assert.match(await page.locator('#changes').innerText(), /Bloodthrill/);
        await page.locator('#changes input[type=search]').fill('zzzzzzzz');
        await page.locator('#changes form button[type=submit]').click();
        await page.waitForURL(/q=zzzzzzzz/);
        await page.getByText(w.empty).waitFor();
        await visit(page, `${prefix}/wow/forever/changes?class=paladin&status=removed`);
        assert.ok(await page.locator('#changes li > details').count());
        await page.locator('#changes form button[type=submit]').focus();
        await page.keyboard.press('Tab');
        assert.ok(await page.evaluate(() => document.activeElement.matches(':focus-visible') && parseFloat(getComputedStyle(document.activeElement).outlineWidth) > 0), 'visible keyboard focus');
        // Tier lists: both boards, a class link, the reader's own board.
        await visit(page, `${prefix}/wow/forever/tier-lists`);
        assert.equal(await page.locator('#ranking section li').count(), 9);
        await page.getByRole('link', { name: w.healers }).click();
        await page.waitForURL(/mode=dungeon-healing-forecast/);
        await page.waitForFunction(() => document.querySelectorAll('#ranking section li').length === 4);
        await visit(page, `${prefix}/wow/forever/tier-lists?mode=dungeon-healing-forecast`);
        await page.getByRole('button', { name: w.mine }).click();
        await page.locator('#mine .ui-tier-list').waitFor();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'overflow with the board');
      }
      await ctx.close();
    }
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage(); watch(page);
    for (const slug of slugs) await visit(page, `${prefix}/wow/forever/classes/${slug}`);
    await ctx.close();
  }
  // With JavaScript disabled the page still carries the GET filter form and the folded lines (native <details>).
  const nojs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } });
  const p = await nojs.newPage();
  await p.goto(`${base}/ru/wow/forever/changes?class=mage&kind=spellbook`, { waitUntil: 'load' });
  assert.ok(await p.locator('#changes li > details').count());
  assert.equal(await p.locator('#changes form[method=get] select[name=kind]').inputValue(), 'spellbook');
  await nojs.close();
  assert.deepEqual(errors, []);
  console.log(`PASS ${results.length} page loads: layout, clipped text, roster filter, changes, paging, empty, keyboard, tier boards, no-JS`);
} finally { await browser.close(); }
