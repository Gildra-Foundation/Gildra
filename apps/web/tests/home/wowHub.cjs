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
      assert.equal(await page.locator(`#mythic a[href^="${prefix}/wow/mythic-plus/midnight-season-2/"]`).count(), 8);
      assert.equal(await page.locator('main header nav li a[href^="#"]').count(), 5);
      assert.equal(await page.locator('#raids ul').first().locator('li a').count(), 8);
      assert.equal(await page.locator('#hero article li a').count(), 13);
      const list = head.graph.find(e => e['@type'] === 'ItemList');
      const bodyHrefs = await page.locator('main section a[href]').evaluateAll(links => links.map(a => a.getAttribute('href')));
      assert.equal(new Set(list.itemListElement.map(item => item.url)).size, list.itemListElement.length);
      for (const item of list.itemListElement) assert.equal(bodyHrefs.filter(href => href === new URL(item.url).pathname).length, 1, `Feature must appear once: ${item.url}`);
      for (const path of new Set(bodyHrefs.filter(href => href.startsWith("/")).map(href => href.split("#")[0]))) {
        const response = await page.request.get(`${process.env.BASE_URL || "http://127.0.0.1:3137"}${path}`, { timeout: 120000 });
        assert.equal(response.status(), 200, `Broken hub destination: ${path}`);
        const html = await response.text();
        if (!path.endsWith("/wow/characters")) assert(!/<meta name="robots" content="[^"]*noindex/i.test(html), `Private hub destination: ${path}`);
      }
      assert.equal(await page.locator('main section[id]').count(), 5);
      assert.equal(await page.locator(`main section a[href="${prefix}/wow/stories"]`).count(), locale === 'ru' ? 1 : 0);
      // The full list must remain clickable above the recent-hero/action slot.
      const realms = [
        { slug: "azuregos", en: "Azuregos", ru: "Азурегос" },
        { slug: "borean-tundra", en: "Borean Tundra", ru: "Борейская тундра" },
        { slug: "eversong", en: "Eversong", ru: "Вечная Песня" },
        { slug: "gordunni", en: "Gordunni", ru: "Гордунни" },
      ];
      await page.route("**/api/wow/auction?*", route => {
        const lang = new URL(route.request().url()).searchParams.get("lang") === "ru" ? "ru" : "en";
        return route.fulfill({ json: { realms: realms.map(realm => ({ slug: realm.slug, name: realm[lang] })) } });
      });
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.locator("#hub-realm").focus();
        for (const realm of realms) {
          await page.locator("#hub-realm").fill("");
          const option = page.locator("#hub-realm-options").getByText(realm[locale], { exact: true });
          await option.waitFor();
          await option.click();
          assert.equal(await page.locator("#hub-realm").inputValue(), realm[locale]);
        }
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      // A returning player can change region before the deferred picker has loaded.
      await page.evaluate(label => localStorage.setItem("gildra:hero-lookup", JSON.stringify({ region: "eu", realm: "gordunni", label })), realms[3][locale]);
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForFunction(label => document.querySelector("#hub-realm")?.value === label, realms[3][locale]);
      assert.equal(await page.locator("#hub-realm").getAttribute("data-slug"), "gordunni", "The remembered realm keeps its slug behind the name");
      await page.locator("#hub-region").selectOption("us");
      assert.equal(await page.locator("#hub-realm").inputValue(), "", "Changing region must clear the remembered realm immediately");
      console.log(`${locale}: metadata / JSON-LD / H1 / alt / hreflang / crawlable links PASS`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
