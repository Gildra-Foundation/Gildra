import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const web = path.resolve(import.meta.dirname, "..");
const output = path.join(web, ".artifacts/site-theme");
fs.mkdirSync(output, { recursive: true });
const base = process.env.BASE_URL || "http://127.0.0.1:5187";
let server, browser;
if (process.argv.includes("--serve")) {
  const log = fs.openSync(path.join(output, "preview.log"), "w");
  server = spawn(process.execPath, [path.resolve(web, "../../node_modules/next/dist/bin/next"), process.argv.includes("--production") ? "start" : "dev", "--hostname", "127.0.0.1", "--port", "5187"], {
    cwd: web, detached: true, stdio: ["ignore", log, log], env: { ...process.env, PATH: `${path.dirname(process.execPath)}:${process.env.PATH}` },
  });
}
async function ready(route) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    if (server?.exitCode !== null && server?.exitCode !== undefined) throw Error(`Preview exited: ${server.exitCode}`);
    try { const response = await fetch(base + route, { signal: AbortSignal.timeout(60000) }); if (response.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw Error(`Preview not ready: ${route}`);
}
async function idle(page) {
  await page.waitForFunction(() => !document.querySelector("[data-themed-transition][data-phase]"), null, { timeout: 15000 });
}
async function link(page, href, attrs = {}) {
  await page.evaluate(({ href, attrs }) => {
    document.querySelector("#qa-navigation")?.remove();
    const a = document.createElement("a");
    a.id = "qa-navigation"; a.href = href; a.textContent = "QA route";
    for (const [key, value] of Object.entries(attrs)) a.setAttribute(key, value);
    document.body.append(a);
    a.click();
  }, { href, attrs });
}
try {
  for (const route of ["/privacy", "/login", "/", "/ru/privacy"]) { await ready(route); console.log(`Ready: ${route}`); }
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
  await context.addInitScript(() => {
    localStorage.setItem("gildra-home-music", JSON.stringify({ volume: 0, lastVolume: 20, enabled: false, confirmed: true }));
  });
  context.setDefaultTimeout(20000);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => { errors.push(e.message); console.error("PAGE ERROR", e.message); });
  page.on("console", e => { if (e.type() === "error" && /hydration|hydrated|didn't match|does not match/i.test(e.text())) errors.push(e.text()); });
  await page.goto(base + "/privacy", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await page.goto(base + "/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Choose theme:/ }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  for (const theme of ["arthas", "illidan", "garek", "varok"]) {
    await page.getByRole("button", { name: /Choose theme:/ }).click();
    await page.locator(`[data-theme-choice="${theme}"]`).click();
    assert.equal(await page.locator("html").getAttribute("data-site-theme"), theme);
    assert.equal(await page.locator("[data-grimoire-home]").getAttribute("data-home-theme"), theme);
    if (theme === "arthas") await page.evaluate(() => {
      window.__qaTimeout = window.setTimeout;
      window.setTimeout = (callback, delay, ...args) => window.__qaTimeout(callback, delay === 760 ? 4000 : delay, ...args);
    });
    await page.evaluate(() => {
      window.__qaPhases = [];
      window.__qaPhaseObserver?.disconnect();
      const host = document.querySelector("[data-themed-transition]");
      window.__qaPhaseObserver = new MutationObserver(() => window.__qaPhases.push({ phase:host.dataset.phase, at:performance.now() }));
      window.__qaPhaseObserver.observe(host, { attributes:true, attributeFilter:["data-phase"] });
    });
    await link(page, "/privacy");
    await page.waitForFunction(() => document.querySelector("[data-themed-transition]")?.getAttribute("data-phase") === "cracking", null, { timeout: 15000 }).catch(async error => { await page.screenshot({ path: path.join(output, `failure-${theme}.png`) }); console.error(await page.evaluate(() => ({ url:location.href, phase:document.querySelector("[data-themed-transition]")?.outerHTML.slice(0,500), theme:document.documentElement.dataset.siteTheme }))); throw error; });
    assert.equal(await page.locator("[data-themed-transition]").getAttribute("data-effect"), theme);
    if (theme === "arthas") {
      assert.equal(await page.locator("[data-themed-transition] > div").count(), 12);
      assert.equal(await page.locator("[data-themed-transition]").evaluate(el => getComputedStyle(el).backgroundColor), "rgba(0, 0, 0, 0)", "fragment gaps must reveal the destination");

      await page.waitForFunction(() => document.querySelector("[data-themed-transition]")?.getAttribute("data-phase") === "shattering", null, { timeout: 15000 });
      await page.evaluate(() => document.querySelector("[data-themed-transition]").getAnimations({ subtree: true }).forEach(animation => { animation.pause(); animation.currentTime = 230; }));
      await page.screenshot({ path: path.join(output, "arthas-shattering.png") });
      await page.evaluate(() => { window.setTimeout = window.__qaTimeout; delete window.__qaTimeout; });
    }
    await page.waitForURL(base + "/privacy"); await idle(page);
    const phases = await page.evaluate(() => window.__qaPhases);
    const crack = phases.find(item => item.phase === "cracking"), shatter = phases.find(item => item.phase === "shattering");
    assert.ok(crack && shatter && shatter.at - crack.at >= 200, `${theme} must paint its cracks before shattering`);
    assert.equal(await page.locator("html").getAttribute("data-site-theme"), theme);
    const accent = await page.locator(".gildra-atlas").evaluate(el => getComputedStyle(el).getPropertyValue("--atlas-accent").trim());
    const expected = { arthas: "#80cdef", illidan: "#c4a3f3", garek: "#a5dba7", varok: "#f0a28f" };
    assert.equal(accent, expected[theme]);
    await page.screenshot({ path: path.join(output, `${theme}-privacy-desktop.png`) });
    await page.reload({ waitUntil: "domcontentloaded" });
    assert.equal(await page.locator("html").getAttribute("data-site-theme"), theme);
    await link(page, "/"); await page.waitForURL(base + "/"); await idle(page);
    await page.getByRole("button", { name: /Choose theme:/ }).waitFor();
    console.log(`Theme passed: ${theme}, scene/chrome/transition/reload`);
  }
  await page.getByRole("button", { name: /Choose theme:/ }).click();
  await page.locator('[data-theme-choice="arthas"]').click();
  await link(page, "/privacy"); await page.waitForURL(base + "/privacy"); await idle(page);
  await link(page, "/login"); await page.waitForURL(base + "/login"); await idle(page);
  await page.goBack(); await page.waitForURL(base + "/privacy"); await idle(page);
  await page.goForward(); await page.waitForURL(base + "/login"); await idle(page);
  await link(page, "/privacy", { "data-no-book-transition": "" });
  await page.waitForURL(base + "/privacy"); await idle(page);
  await link(page, "/privacy?tab=1#policy");
  await page.waitForURL(base + "/privacy?tab=1#policy");
  assert.equal(await page.locator("[data-themed-transition]").getAttribute("data-phase"), null);
  await page.goto(base + "/ru/privacy", { waitUntil: "domcontentloaded" });
  assert.equal(await page.locator("html").getAttribute("lang"), "ru");
  assert.equal(await page.locator("html").getAttribute("data-site-theme"), "arthas");
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false, `overflow at ${width}`);
    await page.screenshot({ path: path.join(output, `arthas-ru-${width}.png`) });
  }
  await link(page, "/privacy"); await page.waitForURL(base + "/privacy"); await idle(page);
  await page.locator("[data-book-route-frame][data-view-transitions]").waitFor();
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route("**/wow/raids*", async route => { await held; await route.continue(); });
  await link(page, "/wow/raids?hold=1");
  await page.waitForFunction(() => document.querySelector("[data-themed-transition]")?.dataset.phase === "cracking", null, { timeout: 10000 });
  await page.waitForTimeout(900);
  assert.equal(await page.locator("[data-themed-transition]").getAttribute("data-phase"), "cracking");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("[data-themed-transition]").getAttribute("data-phase"), null);
  release(); await page.waitForURL(base + "/wow/raids?hold=1"); await idle(page);
  await page.unroute("**/wow/raids*");
  console.log("Passed: delayed route holds ice; Escape clears it; late arrival recovers.");
  const other = await context.newPage();
  await other.goto(base + "/privacy", { waitUntil: "domcontentloaded" });
  await other.evaluate(() => localStorage.setItem("gildra-home-theme", "illidan"));
  await page.waitForFunction(() => document.documentElement.dataset.siteTheme === "illidan");
  await other.close();
  await page.evaluate(() => { localStorage.setItem("gildra-home-theme", "arthas"); window.dispatchEvent(new StorageEvent("storage", { key:"gildra-home-theme",newValue:"arthas" })); });
  console.log("Passed: theme synchronizes across tabs.");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await link(page, "/login"); await page.waitForURL(base + "/login");
  assert.equal(await page.locator("[data-themed-transition]").getAttribute("data-phase"), null);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(() => { document.documentElement.dataset.motion = "reduced"; });
  await link(page, "/privacy"); await page.waitForURL(base + "/privacy");
  assert.equal(await page.locator("[data-themed-transition]").getAttribute("data-phase"), null);
  const soundContext = await browser.newContext({ viewport: { width: 1024, height: 768 }, reducedMotion: "no-preference" });
  await soundContext.addInitScript(() => {
    localStorage.setItem("gildra-home-music", JSON.stringify({ volume: 20, enabled: false, confirmed: true }));
    window.__qaAudio = [];
    const OriginalAudio = window.AudioContext;
    window.AudioContext = class extends OriginalAudio {
      constructor(...args) { super(...args); window.__qaAudio.push(this); }
    };
  });
  const soundPage = await soundContext.newPage();
  soundPage.on("pageerror", error => errors.push(error.message));
  await soundPage.goto(base + "/privacy", { waitUntil: "domcontentloaded" });
  await soundPage.locator("[data-book-route-frame][data-view-transitions]").waitFor();
  await link(soundPage, "/login"); await soundPage.waitForURL(base + "/login"); await idle(soundPage);
  assert.equal(await soundPage.evaluate(() => window.__qaAudio.length), 0);
  await soundPage.evaluate(() => localStorage.setItem("gildra-home-music", JSON.stringify({ volume: 20, enabled: true, confirmed: true })));
  await link(soundPage, "/privacy"); await soundPage.waitForURL(base + "/privacy"); await idle(soundPage);
  assert.equal(await soundPage.evaluate(() => window.__qaAudio.length), 1);
  assert.deepEqual(await soundPage.evaluate(() => window.__qaAudio.map(audio => audio.state)), ["closed"]);
  await soundContext.close();
  console.log("Passed: muted transition creates no audio; enabled sound creates and releases one AudioContext.");
  assert.deepEqual(errors, []);
  console.log("Passed: history, opt-out, filters/anchors, RU/EN, 320–1440px, system/site reduced motion; no page/hydration errors.");
  fs.writeFileSync(path.join(output, "result.json"), JSON.stringify({ passed: true, errors, base }, null, 2));
} finally {
  await browser?.close();
  server?.kill("SIGTERM");
}
