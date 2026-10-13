import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseURL = process.env.HOME_ENTRY_BASE_URL ?? "http://127.0.0.1:4186";
const browser = await chromium.launch({ headless: true });
const errors = [];
const reports = [];

async function instrument(context) {
  context.setDefaultNavigationTimeout(30000);
  await context.addInitScript(() => {
    window.entryOpenCount = 0;
    const showModal = HTMLDialogElement.prototype.showModal;
    HTMLDialogElement.prototype.showModal = function () {
      if (this.hasAttribute("data-home-entry")) window.entryOpenCount++;
      return showModal.call(this);
    };
  });
}

async function homeIsConfirmed(page, soundEnabled, count, playbackRequired = true) {
  await page.waitForFunction(() => document.querySelector("[data-home-scene]")?.dataset.sceneStarted === "true");
  await page.waitForTimeout(350);
  assert.equal(await page.locator("[data-home-entry][open]").count(), 0);
  assert.equal(await page.evaluate(() => window.entryOpenCount), count, "Entry must not flash open during navigation");
  assert.equal(await page.evaluate(() => document.body.style.overflow), "");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("gildra-home-music")));
  assert.equal(saved.confirmed, true);
  assert.equal(saved.enabled, soundEnabled);
  if (soundEnabled && playbackRequired) {
    await page.waitForFunction(() => {
      const audio = document.querySelector("[data-scene-audio]");
      return audio && !audio.paused && audio.currentTime > 0;
    });
  } else if (!soundEnabled) {
    assert.equal(await page.locator("[data-scene-audio]").evaluate(audio => audio.paused), true);
  }
}

try {
  for (const soundEnabled of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await instrument(context);
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${baseURL}/ru`, { waitUntil: "networkidle" });
    const entry = page.locator("[data-home-entry]");
    await page.locator("[data-home-entry][open]").waitFor();
    if (soundEnabled) {
      await entry.getByRole("radio", { name: "Разрешить статистику" }).check();
      // Saving a cookie draft must not count as continuing into the site.
      await page.reload({ waitUntil: "networkidle" });
      await page.locator("[data-home-entry][open]").waitFor();
      assert.equal(await page.locator("[data-home-scene]").getAttribute("data-scene-started"), "false");
    }
    await entry.getByRole("radio", { name: soundEnabled ? /Включить звук/ : "Без звука" }).click();
    await entry.getByRole("button", { name: "Продолжить", exact: true }).click();
    await homeIsConfirmed(page, soundEnabled, 1);
    if (soundEnabled) {
      const volume = page.locator("[data-home-music] input[type=range]");
      await volume.press("Home");
      await volume.press("ArrowRight");
      await page.waitForFunction(() => JSON.parse(localStorage.getItem("gildra-home-music")).volume === 1);
    }

    // Change language in both directions without opening the entry again.
    await page.getByRole("navigation", { name: "Язык", exact: true }).getByRole("link", { name: "EN", exact: true }).click();
    await page.waitForURL(`${baseURL}/`);
    await homeIsConfirmed(page, soundEnabled, 1);
    await page.getByRole("navigation", { name: "Language", exact: true }).getByRole("link", { name: "RU", exact: true }).click();
    await page.waitForURL(`${baseURL}/ru`);
    await homeIsConfirmed(page, soundEnabled, 1);

    // Leave the homepage, return using browser history, then return through
    // the site's book navigation. Both paths can remount the whole scene.
    await page.getByRole("link", { name: "Персонажи", exact: true }).click();
    await page.waitForURL(`${baseURL}/ru/wow/characters`);
    await page.goBack();
    await page.waitForURL(`${baseURL}/ru`);
    await homeIsConfirmed(page, soundEnabled, 1);
    await page.goForward();
    await page.waitForURL(`${baseURL}/ru/wow/characters`);
    await page.getByRole("button", { name: "Открыть оглавление книги", exact: true }).click();
    await page.getByRole("link", { name: "Игровой портал", exact: true }).click();
    await page.waitForURL(`${baseURL}/ru`);
    await homeIsConfirmed(page, soundEnabled, 1);

    // Explicit settings access remains available after confirmation.
    await page.getByRole("button", { name: "Настройки cookies", exact: true }).click();
    await page.locator("[data-home-entry][open]").waitFor();
    await entry.getByRole("radio", { name: soundEnabled ? "Только необходимые" : "Разрешить статистику" }).check();
    await entry.getByRole("button", { name: "Сохранить настройки", exact: true }).click();
    await homeIsConfirmed(page, soundEnabled, 2);

    // Full document loads, new tabs and restored browser storage all keep the
    // confirmation, sound, volume and cookie choice without opening a dialog.
    await page.reload({ waitUntil: "networkidle" });
    await homeIsConfirmed(page, soundEnabled, 0, false);
    assert.equal(await page.locator("[data-home-music] input[type=range]").inputValue(), soundEnabled ? "1" : "20");
    const expectedConsent = soundEnabled ? "declined" : "accepted";
    assert.equal(await page.evaluate(() => localStorage.getItem("gildra-consent")), expectedConsent);
    await page.goto(`${baseURL}/ru/wow/characters`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Открыть оглавление книги", exact: true }).click();
    await page.getByRole("link", { name: "Игровой портал", exact: true }).click();
    await page.waitForURL(`${baseURL}/ru`);
    await homeIsConfirmed(page, soundEnabled, 0, false);
    const tab = await context.newPage();
    tab.on("pageerror", error => errors.push(error.message));
    await tab.goto(`${baseURL}/`, { waitUntil: "networkidle" });
    await homeIsConfirmed(tab, soundEnabled, 0, false);
    const restarted = await browser.newContext({ storageState: await context.storageState() });
    await instrument(restarted);
    const returnPage = await restarted.newPage();
    returnPage.on("pageerror", error => errors.push(error.message));
    await returnPage.goto(`${baseURL}/ru`, { waitUntil: "networkidle" });
    await homeIsConfirmed(returnPage, soundEnabled, 0, false);
    assert.equal(await returnPage.locator("[data-home-music] input[type=range]").inputValue(), soundEnabled ? "1" : "20");
    assert.equal(await returnPage.evaluate(() => localStorage.getItem("gildra-consent")), expectedConsent);
    reports.push(`${soundEnabled ? "Sound enabled" : "Silent"}: language, history, book menu, hard reload, new tab and browser restart retain confirmation and preferences`);
    await restarted.close();
    await context.close();
  }

  for (const soundEnabled of [false, true]) {
    const context = await browser.newContext();
    await instrument(context);
    await context.addInitScript(enabled => {
      localStorage.setItem("gildra-home-music", JSON.stringify({ enabled, volume: 29, lastVolume: 41 }));
      localStorage.setItem("gildra-consent", "declined");
    }, soundEnabled);
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${baseURL}/ru`, { waitUntil: "networkidle" });
    await homeIsConfirmed(page, soundEnabled, 0, false);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("gildra-home-music")));
    assert.equal(saved.volume, 29);
    assert.equal(await page.evaluate(() => localStorage.getItem("gildra-consent")), "declined");
    await context.close();
  }
  reports.push("Previously saved sound and cookie choices migrate without another entry prompt");
  assert.deepEqual(errors, [], "Browser runtime errors");
  console.log(JSON.stringify({ status: "passed", reports }, null, 2));
} finally {
  await browser.close();
}
