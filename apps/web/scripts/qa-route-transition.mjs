// Browser QA of the page-to-page transition (components/motion/RouteTransitionRuntime.tsx).
// ROUTE_TRANSITION_ORIGIN=http://127.0.0.1:3100 node scripts/qa-route-transition.mjs
import assert from "node:assert/strict";
import { chromium } from "playwright";

const origin = process.env.ROUTE_TRANSITION_ORIGIN ?? "http://127.0.0.1:5173";
const browser = await chromium.launch({ headless: true });
const errors = [];
const states = (page) => page.evaluate(() => window.routeQA.events);
const idle = (page) => page.waitForFunction(() => document.querySelector('[data-route-state="idle"][data-book-navigation="idle"]'), null, { timeout: 20000 });

async function open(options = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, ...options });
  page.on("pageerror", (error) => errors.push(error.stack));
  await page.addInitScript(() => {
    window.routeQA = { id: Math.random(), events: [], veil: [], viewTransitions: 0, arrivals: 0 };
    // The route runtime owns every hand-over: no document View Transition may start.
    const start = Document.prototype.startViewTransition;
    if (start) Document.prototype.startViewTransition = function (...args) { window.routeQA.viewTransitions += 1; return start.apply(this, args); };
    new MutationObserver(() => {
      if (document.querySelector("[data-route-arrived]")) window.routeQA.arrivals += 1;
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-route-arrived"] });
    // The rune veil: every phase it passes through (covering → covered → revealing → gone).
    new MutationObserver(() => {
      const phase = document.querySelector("[data-route-veil]")?.getAttribute("data-veil") ?? "gone";
      if (window.routeQA.veil.at(-1) !== phase) window.routeQA.veil.push(phase);
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-veil"] });
    let last = "";
    new MutationObserver(() => {
      const state = document.querySelector("[data-book-route-frame]")?.getAttribute("data-route-state") ?? "none";
      if (state !== last) { window.routeQA.events.push(state); last = state; }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-route-state"] });
  });
  return page;
}

try {
  const page = await open();
  await page.goto(origin + "/ru/wow", { waitUntil: "networkidle", timeout: 60000 });
  const documentId = await page.evaluate(() => window.routeQA.id);
  assert.equal(await page.locator("[data-book-route-scene]").count(), 0, "No overlay scene is drawn");

  // A normal link: leaving → idle, same document, new page fades in.
  await page.locator('a[href="/ru/wow/raids"]').first().click();
  await page.waitForURL(origin + "/ru/wow/raids");
  await idle(page);
  assert.equal(await page.evaluate(() => window.routeQA.id), documentId, "Navigation must keep the app shell");
  assert.ok((await states(page)).includes("leaving"), "The leaving state must be set on click");
  const handOver = await page.evaluate(() => window.routeQA);
  assert.equal(handOver.viewTransitions, 0, "Atlas pages hand over without a document View Transition");
  assert.ok(handOver.arrivals > 0, "The new page's hero must arrive as a cascade");
  assert.equal(await page.locator("[data-themed-transition][data-phase]").count(), 0, "Between atlas pages the character effect stays idle");
  await page.waitForFunction(() => !document.querySelector("[data-route-veil]")?.hasAttribute("data-veil"));
  assert.deepEqual((await page.evaluate(() => window.routeQA.veil)).slice(0, 3), ["covering", "covered", "revealing"], "A link closes the rune veil, then it sweeps on");

  // Query and hash changes on the same page do not transition.
  const before = (await states(page)).length;
  await page.evaluate(() => { const a = document.createElement("a"); a.href = "?filter=qa#top"; document.body.append(a); a.click(); a.remove(); });
  await page.waitForTimeout(300);
  assert.equal((await states(page)).length, before, "Filters and anchors must not transition");

  // A slow route keeps the leaving state and the progress line until it commits.
  let release; const hold = new Promise((resolve) => { release = resolve; }); let blocked = false;
  await page.route("**/ru/search?**", async (route) => {
    if (route.request().headers()["rsc"] === "1") { blocked = true; await hold; }
    await route.continue();
  });
  await page.evaluate(() => { const a = document.createElement("a"); a.href = "/ru/search?q=qa"; document.body.append(a); a.click(); a.remove(); });
  await page.waitForTimeout(1200);
  assert.equal(blocked, true, "The test must intercept a real route request");
  assert.equal(await page.locator("[data-book-route-frame]").getAttribute("data-route-state"), "leaving");
  const progress = await page.evaluate(() => getComputedStyle(document.querySelector('[class*="progress"]')).opacity);
  assert.equal(progress, "1", "The progress line must be visible on a slow route");
  release();
  await page.waitForURL(origin + "/ru/search?q=qa");
  await idle(page);

  // History.
  await page.goBack();
  await idle(page);
  assert.equal(new URL(page.url()).pathname, "/ru/wow/raids");

  // Reduced motion: no dimming transition and no fade animation.
  const reduced = await open({ reducedMotion: "reduce" });
  await reduced.goto(origin + "/ru/wow", { waitUntil: "networkidle" });
  await reduced.locator('a[href="/ru/wow/lairs"]').first().click();
  await reduced.waitForURL(origin + "/ru/wow/lairs");
  await idle(reduced);
  assert.equal(await reduced.evaluate(() => document.querySelector("[data-book-route-frame]").getAnimations().length), 0);
  assert.deepEqual(await reduced.evaluate(() => window.routeQA.veil), [], "Reduced motion navigates without the veil");

  // Narrow screen.
  const mobile = await open({ viewport: { width: 390, height: 844 } });
  await mobile.goto(origin + "/ru/wow", { waitUntil: "networkidle" });
  // Below 1180 px the realms live in the menu sheet: take the hub's own link.
  await mobile.locator('main a[href="/ru/wow/mythic-plus"]').first().click();
  await mobile.waitForURL(origin + "/ru/wow/mythic-plus");
  await idle(mobile);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);

  assert.deepEqual(errors, []);
  console.log("PASS route transition: shell kept, rune veil (cover → reveal), no document view transition + arrival cascade, leaving/progress, query+hash stable, slow route, history, reduced motion, mobile, no page errors.");
} finally {
  await browser.close();
}
