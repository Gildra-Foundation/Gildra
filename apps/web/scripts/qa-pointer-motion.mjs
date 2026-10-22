#!/usr/bin/env node
// Exercise runtime preference changes, not just the reduced-motion CSS census.
// node apps/web/scripts/qa-pointer-motion.mjs --base http://127.0.0.1:3150
import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseIndex = process.argv.indexOf("--base");
const base = baseIndex >= 0 ? process.argv[baseIndex + 1] : "http://127.0.0.1:3100";
const browser = await chromium.launch();
const results = [];
try {
  for (const route of ["/wow/lairs", "/ru/wow/lairs"]) {
    for (const touch of [false, true]) {
      const context = await browser.newContext({ viewport: { width: touch ? 390 : 1440, height: 900 }, isMobile: touch, hasTouch: touch });
      await context.addInitScript(() => {
        localStorage.setItem("gildra-consent", "declined");
        window.pointerWork = { geometry: 0, spotlight: 0, tilt: 0 };
        const rect = Element.prototype.getBoundingClientRect;
        Element.prototype.getBoundingClientRect = function (...args) {
          if (this.matches("[data-spotlight]")) window.pointerWork.geometry++;
          return rect.apply(this, args);
        };
        const set = CSSStyleDeclaration.prototype.setProperty;
        CSSStyleDeclaration.prototype.setProperty = function (key, ...args) {
          if (key.startsWith("--spot-")) window.pointerWork.spotlight++;
          if (key.startsWith("--tilt-")) window.pointerWork.tilt++;
          return set.call(this, key, ...args);
        };
      });
      const page = await context.newPage();
      await page.goto(base + route, { waitUntil: "networkidle" });
      const card = page.locator("[data-tilt]").first();
      await card.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      const move = async () => {
        const box = await card.boundingBox();
        await page.evaluate(() => { window.pointerWork = { geometry: 0, spotlight: 0, tilt: 0 }; });
        for (let step = 0; step < 20; step++) await page.mouse.move(box.x + 30 + step, box.y + 30 + step / 2);
        await page.waitForTimeout(50);
        return page.evaluate(() => ({ ...window.pointerWork }));
      };
      const cleared = () => card.evaluate(el => !el.style.getPropertyValue("--tilt-x") && !el.style.getPropertyValue("--tilt-y"));
      const setSiteReduced = reduced => page.evaluate(value => {
        if (value) document.documentElement.dataset.motion = "reduced";
        else delete document.documentElement.dataset.motion;
        window.dispatchEvent(new Event("gildra-motion-change"));
      }, reduced);
      const normal = await move();
      assert.equal(normal.tilt > 0, !touch, `${route}: normal pointer capability`);
      await setSiteReduced(true);
      assert.ok(await cleared(), `${route}: tilt clears immediately on site preference`);
      const siteReduced = await move();
      assert.deepEqual(siteReduced, { geometry: 0, spotlight: 0, tilt: 0 });
      await setSiteReduced(false);
      const restored = await move();
      assert.equal(restored.tilt > 0, !touch, `${route}: site preference restores motion`);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.waitForTimeout(100);
      assert.ok(await cleared(), `${route}: OS preference clears tilt`);
      const osReduced = await move();
      assert.deepEqual(osReduced, { geometry: 0, spotlight: 0, tilt: 0 });
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.waitForTimeout(100);
      const resumed = await move();
      assert.equal(resumed.tilt > 0, !touch, `${route}: OS preference restores motion`);
      // Preference can change after a pointer event has queued a frame.
      await card.evaluate(el => {
        el.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 50, clientY: 50 }));
        document.documentElement.dataset.motion = "reduced";
        window.dispatchEvent(new Event("gildra-motion-change"));
      });
      await page.waitForTimeout(50);
      assert.ok(await cleared(), `${route}: queued frame must not restore tilt`);
      results.push({ route, touch, normal, siteReduced, restored, osReduced, resumed });
      await context.close();
    }
  }
  console.log(JSON.stringify(results, null, 2));
  console.log("qa:pointer-motion — live preferences stop pointer work and restore it correctly");
} finally {
  await browser.close();
}
