/** Production integration contract. BASE_URL=http://127.0.0.1:3137 node tests/home/wowHub.cjs */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  try {
    for (const locale of ['en', 'ru']) {
      const prefix = locale === 'ru' ? '/ru' : '';
      const page = await browser.newPage();
      await page.goto(`${process.env.BASE_URL || 'http://127.0.0.1:3137'}${prefix}/wow`, { waitUntil: 'networkidle' });
      assert.equal(await page.locator('h1').count(), 1);
      assert.match(await page.locator('h1').innerText(), /WowArcana[\s\S]*World of Warcraft/);
      const head = await page.evaluate(() => ({
        title: document.title, description: document.querySelector('meta[name=description]').content,
        canonical: document.querySelector('link[rel=canonical]').href,
        langs: [...document.querySelectorAll('link[rel=alternate][hreflang]')].map(e => e.hreflang).sort(),
        graph: [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap(e => JSON.parse(e.textContent)),
        images: [...document.querySelectorAll('main img')].every(e => e.hasAttribute('alt') && e.hasAttribute('width') && e.hasAttribute('height')),
      }));
      assert(head.title.length <= 60);
      assert(head.description.length >= 140 && head.description.length <= 160);
      assert(head.canonical.endsWith(`${prefix}/wow`));
      assert.deepEqual(head.langs, ['en', 'ru', 'x-default']);
      assert(head.images);
      for (const type of ['WebSite', 'Organization', 'CollectionPage', 'BreadcrumbList', 'ItemList']) assert(head.graph.some(e => e['@type'] === type), type);
      assert.equal(await page.locator('#season article').first().locator('li a').count(), 8);
      assert.equal(await page.locator('#season article').last().locator('li a').count(), 8);
      assert.equal(await page.locator('#explore li a').count(), 13);
      console.log(`${locale}: metadata / JSON-LD / H1 / alt / hreflang / crawlable links PASS`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
