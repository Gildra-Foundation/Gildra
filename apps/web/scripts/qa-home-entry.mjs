import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const baseURL = process.env.HOME_ENTRY_BASE_URL ?? "http://127.0.0.1:4184";
const output = process.env.HOME_ENTRY_OUTPUT ?? ".artifacts/home-entry";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
const reports = [];

async function visit(path, options = {}, saved) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...options });
  if (saved) await context.addInitScript(value => {
    localStorage.setItem("gildra-home-music", JSON.stringify(value));
    localStorage.setItem("gildra-consent", "accepted");
  }, saved);
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${baseURL}${path}`, { waitUntil: "networkidle" });
  await page.locator("[data-home-entry][open]").waitFor();
  await page.evaluate(() => document.fonts.ready);
  return { page, context, dialog: page.locator("[data-home-entry]") };
}

async function state(page) {
  return page.evaluate(() => {
    const scene = document.querySelector("[data-home-scene]");
    const audio = document.querySelector("[data-scene-audio]");
    return { started: scene.dataset.sceneStarted, phase: scene.dataset.scenePhase, paused: audio.paused, time: audio.currentTime };
  });
}

try {
  // Fresh visitors and unfinished choices still need explicit confirmation.
  for (const saved of [undefined, { enabled: true, volume: 32, lastVolume: 32, confirmed: false }]) {
    const { page, context, dialog } = await visit("/ru", {}, saved);
    await page.waitForTimeout(5500);
    assert.deepEqual(await state(page), { started: "false", phase: "waiting", paused: true, time: 0 });
    assert.equal(await page.locator(".cookie").count(), 0);
    await page.keyboard.press("Escape");
    assert.equal(await dialog.evaluate(element => element.open), true);
    // Native modal focus containment, including wraparound in both directions.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press(i % 2 ? "Shift+Tab" : "Tab");
      assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true);
    }
    assert.equal(await dialog.getByRole("button", { name: "Продолжить", exact: true }).isDisabled(), true);
    await dialog.getByRole("radio", { name: /Включить звук/ }).click();
    assert.equal((await state(page)).started, "false");
    assert.equal((await state(page)).paused, true);
    await dialog.getByRole("button", { name: "Продолжить", exact: true }).click();
    await page.waitForFunction(() => {
      const audio = document.querySelector("[data-scene-audio]");
      return !audio.paused && audio.currentTime > 0.3;
    });
    assert.equal(await dialog.evaluate(element => element.open), false);
    assert.equal(await page.evaluate(() => document.body.style.overflow), "");
    await page.waitForFunction(() => document.querySelector("[data-home-scene]").dataset.scenePhase === "writing");
    await page.locator("[data-home-music]").getByRole("button", { name: "Выключить звук" }).click();
    assert.equal((await state(page)).paused, true);
    assert.equal((await state(page)).phase, "writing");
    await page.waitForTimeout(250);
    await page.locator("[data-home-music]").getByRole("button", { name: "Включить звук" }).click();
    assert.equal((await state(page)).phase, "writing");
    reports.push(saved ? "Unconfirmed preferences wait; sound toggle preserves writing" : "Fresh visitor waits; sound starts after choice");
    await context.close();
  }

  const { page, context, dialog } = await visit("/ru");
  await dialog.getByRole("radio", { name: "Разрешить статистику" }).check();
  assert.equal((await state(page)).started, "false");
  await dialog.getByRole("link", { name: "English", exact: true }).click();
  await page.waitForURL(`${baseURL}/`);
  await page.locator("[data-home-entry][open]").getByRole("heading", { name: "Before the chronicles begin" }).waitFor();
  assert.equal((await state(page)).started, "false");
  assert.equal(await dialog.getByRole("radio", { name: "Allow usage statistics" }).isChecked(), true);
  await dialog.getByRole("radio", { name: "Necessary only" }).check();
  await dialog.getByRole("radio", { name: "Without sound" }).click();
  assert.equal((await state(page)).started, "false");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-home-scene]").dataset.scenePhase === "writing");
  assert.equal((await state(page)).paused, true);
  assert.equal(await page.evaluate(() => localStorage.getItem("gildra-consent")), "declined");
  await page.getByRole("button", { name: "Cookie settings" }).click();
  assert.equal(await dialog.evaluate(element => element.open), true);
  await dialog.getByRole("radio", { name: "Allow usage statistics" }).check();
  await page.keyboard.press("Escape");
  assert.equal(await page.evaluate(() => localStorage.getItem("gildra-consent")), "declined");
  await page.getByRole("button", { name: "Cookie settings" }).click();
  await dialog.getByRole("radio", { name: "Allow usage statistics" }).check();
  await dialog.getByRole("button", { name: "Save preferences" }).click();
  assert.equal(await page.evaluate(() => localStorage.getItem("gildra-consent")), "accepted");
  assert.equal(await page.getByRole("button", { name: "Cookie settings" }).evaluate(element => element === document.activeElement), true);
  reports.push("Language and consent changes keep scene waiting; silent writing and cookie settings work");
  await context.close();

  for (const [width, height] of [[320, 740], [390, 844], [768, 1024], [1280, 900], [1440, 1000]]) {
    for (const path of ["/", "/ru"]) {
      const { page, context, dialog } = await visit(path, { viewport: { width, height } });
      const geometry = await dialog.evaluate(element => ({ width: element.clientWidth, scrollWidth: element.scrollWidth, height: element.getBoundingClientRect().height }));
      assert.ok(geometry.scrollWidth <= geometry.width, `${path}: dialog overflow at ${width}`);
      assert.ok(geometry.height <= height, `${path}: dialog too tall at ${width}`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path}: page overflow at ${width}`);
      await page.screenshot({ path: `${output}/entry-${path === "/ru" ? "ru" : "en"}-${width}.png` });
      await context.close();
    }
  }
  reports.push("EN/RU screenshots: 320, 390, 768, 1280, 1440px; no horizontal overflow");

  // Missing storage and missing audio must not make entry unusable.
  const fallback = await browser.newContext({ reducedMotion: "reduce" });
  await fallback.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error("Storage disabled"); };
    Storage.prototype.setItem = () => { throw new Error("Storage disabled"); };
  });
  const fallbackPage = await fallback.newPage();
  fallbackPage.on("pageerror", error => errors.push(error.message));
  await fallbackPage.route("**/*.mp3", route => route.abort());
  await fallbackPage.goto(`${baseURL}/ru`, { waitUntil: "networkidle" });
  const fallbackDialog = fallbackPage.locator("[data-home-entry][open]");
  await fallbackDialog.waitFor();
  assert.equal((await state(fallbackPage)).started, "false");
  await fallbackDialog.getByRole("radio", { name: /Включить звук/ }).click();
  await fallbackDialog.getByRole("button", { name: "Продолжить", exact: true }).click();
  await fallbackPage.waitForFunction(() => document.querySelector("[data-home-music]").dataset.musicStatus === "error");
  assert.equal((await state(fallbackPage)).started, "true");
  assert.equal(await fallbackPage.locator('[data-writing="done"]').count(), 1);
  await fallback.close();
  reports.push("Storage disabled, audio failure and reduced motion preserve usable entry");
  assert.deepEqual(errors, [], "Browser runtime errors");
  console.log(JSON.stringify({ status: "passed", reports }, null, 2));
} finally {
  await browser.close();
}
