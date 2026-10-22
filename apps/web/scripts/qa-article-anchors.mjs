#!/usr/bin/env node
// Run against an isolated candidate with GILDRA_DEV_GALLERY=1.
import assert from "node:assert/strict";
import { chromium } from "playwright";
const index = process.argv.indexOf("--base");
const base = index >= 0 ? process.argv[index + 1] : "http://127.0.0.1:3150";
const browser = await chromium.launch();
const results = [];
try {
  for (const locale of ["en", "ru"]) {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
      await page.goto(`${base}/dev/article?lang=${locale}`, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      const headings = await page.locator("nav ol a[href^='#']").evaluateAll(links => links.map(a => {
        const heading = document.getElementById(decodeURIComponent(a.hash.slice(1)));
        return { id: heading.id, label: a.textContent };
      }));
      assert.ok(headings.length >= 3, "dev article fixture must contain chapters");
      const active = () => page.locator("nav ol a[aria-current='location']").textContent();
      for (let chapter = 1; chapter < 3; chapter++) {
        const target = headings[chapter];
        const landing = await page.evaluate(id => parseFloat(getComputedStyle(document.getElementById(id)).scrollMarginTop), target.id);
        // Well inside the viewport, but the reader has not reached this chapter.
        await page.evaluate(({ id, top }) => {
          scrollTo(0, scrollY + document.getElementById(id).getBoundingClientRect().top - top);
        }, { id: target.id, top: landing + 190 });
        await page.waitForTimeout(100);
        assert.equal(await active(), headings[chapter - 1].label, `${locale}/${width}: next chapter must not activate early`);
        await page.evaluate(id => {
          const heading = document.getElementById(id);
          scrollTo(0, scrollY + heading.getBoundingClientRect().top - parseFloat(getComputedStyle(heading).scrollMarginTop));
        }, target.id);
        await page.waitForTimeout(100);
        assert.equal(await active(), target.label, `${locale}/${width}: activate at heading landing`);
      }
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(100);
      assert.equal(await active(), headings.at(-1).label, `${locale}/${width}: final chapter at bottom`);
      results.push({ locale, width, chapterCount: headings.length, status: "pass" });
      await page.close();
    }
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
