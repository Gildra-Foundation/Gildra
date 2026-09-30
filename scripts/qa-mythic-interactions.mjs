import { chromium } from "playwright";
import assert from "node:assert/strict";

const baseUrl = process.env.MYTHIC_BASE_URL ?? "http://127.0.0.1:5173";
const routePath = process.env.MYTHIC_ROUTE_PATH ?? "/ru/wow/mythic-plus/midnight-season-2/ruby-life-pools";
const routeUrl = new URL(routePath, baseUrl).toString();

const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const failedRequests = [];
  const browserErrors = [];
  page.on("requestfailed", (request) => {
    failedRequests.push(`${request.url()}: ${request.failure()?.errorText ?? "unknown failure"}`);
  });
  page.on("pageerror", (error) => browserErrors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
  page.setDefaultTimeout(30_000);
  const response = await page.goto(routeUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
  assert.equal(response?.status(), 200, `Expected route HTTP 200, got ${response?.status() ?? "no response"}`);
  assert.match(await page.locator('meta[name="robots"]').getAttribute("content") ?? "", /noindex/i, "Unverified tactical draft must remain noindex");
  await page.locator('main[data-interactive="true"]').waitFor();
  await page.getByText("Статус: тактический черновик, не проверен для игры.", { exact: true }).waitFor();
  await page.locator("[data-demo-party]").getByText("Демонстрационные тестовые данные.", { exact: true }).waitFor();

  const visibleCopy = await page.locator("main").textContent() ?? "";
  for (const term of ["PUG", "пулл", "ILVL", "SCORE", "LOADOUT", "LIVE ROUTE", "TACTICAL", "колл", "Кик", "Диспел", "Пурж"]) {
    assert.ok(!visibleCopy.toLocaleLowerCase("ru").includes(term.toLocaleLowerCase("ru")), `Unexplained jargon is visible: ${term}`);
  }
  for (const meaning of ["Цель:", "Что делать по порядку", "Кого победить", "На что реагировать", "Команда и план действий", "Кто, где и когда"]) {
    assert.ok(visibleCopy.includes(meaning), `Missing novice-facing information: ${meaning}`);
  }

  const routeStepSelect = page.locator('[aria-label="Тактические назначения"] select').first();
  for (let step = 1; step <= 15; step += 1) {
    await routeStepSelect.selectOption(String(step));
    const stepDetails = page.locator('aside[aria-live="polite"]');
    const enemySection = stepDetails.locator("section").filter({ hasText: "Кого победить" }).first();
    const abilitySection = stepDetails.locator("section").filter({ hasText: "На что реагировать" }).first();
    for (const card of await enemySection.locator('[data-intel-card="enemy"]').all()) {
      const copy = await card.textContent() ?? "";
      assert.ok(copy.includes("Чем опасен") && copy.includes("Что делает"), `Enemy intel is incomplete at step ${step}`);
      assert.match(copy, /NPC #\d+|NPC ID не проверен/, `Enemy identity status is missing at step ${step}`);
      const portraitStatus = await card.getAttribute("data-portrait-status");
      const portrait = card.locator("[data-intel-trigger] img");
      if (portraitStatus === "verified") {
        assert.ok(copy.includes("Портрет проверен"), `Verified portrait is not labelled at step ${step}`);
        await portrait.waitFor({ state: "visible" });
        await portrait.evaluate((image) => image instanceof HTMLImageElement && image.decode ? image.decode().catch(() => undefined) : undefined);
        assert.ok(await portrait.evaluate((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0), `Verified portrait failed to load at step ${step}`);
      } else if (portraitStatus === "model-unavailable") {
        assert.ok(copy.includes("Модель недоступна · placeholder"), `Verified model-unavailable placeholder is not labelled at step ${step}`);
        assert.equal(await portrait.count(), 0, `Model-unavailable placeholder rendered an image at step ${step}`);
      } else {
        assert.equal(portraitStatus, "unverified", `Unknown portrait status at step ${step}`);
        assert.ok(copy.includes("Портрет не проверен"), `Unverified portrait is not labelled at step ${step}`);
        assert.equal(await portrait.count(), 0, `Unverified portrait image is visible at step ${step}`);
      }
      assert.ok(!copy.includes("undefined"), `Enemy intel is missing at step ${step}`);
    }
    for (const card of await abilitySection.locator('[data-intel-card="ability"]').all()) {
      const copy = await card.textContent() ?? "";
      assert.ok(copy.includes("Кто применяет") && copy.includes("Кто отвечает") && copy.includes("Что сделать"), `Ability intel is incomplete at step ${step}`);
      assert.match(copy, /Spell #\d+/i, `Spell catalog ID is missing at step ${step}`);
      const spellIcon = card.locator("[data-intel-trigger] img");
      await spellIcon.waitFor({ state: "visible" });
      await spellIcon.evaluate((image) => image instanceof HTMLImageElement && image.decode ? image.decode().catch(() => undefined) : undefined);
      assert.match(await spellIcon.getAttribute("src") ?? "", /^(?:https:\/\/render\.worldofwarcraft\.com\/|\/assets\/wow\/mythic\/spells\/)/, `Verified spell icon is missing at step ${step}`);
      assert.ok(await spellIcon.evaluate((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0), `Spell icon failed to load at step ${step}`);
      assert.ok(!copy.includes("undefined"), `Ability intel is missing at step ${step}`);
    }
  }
  await routeStepSelect.selectOption("1");
  const firstEnemyCard = page.locator('aside[aria-live="polite"] [data-intel-card="enemy"]').first();
  const enemyCardBefore = await firstEnemyCard.boundingBox();
  await firstEnemyCard.locator("[data-intel-trigger]").click();
  await firstEnemyCard.getByText("Чем опасен", { exact: true }).waitFor();
  const enemyCardAfter = await firstEnemyCard.boundingBox();
  assert.equal(Math.round(enemyCardAfter?.height ?? 0), Math.round(enemyCardBefore?.height ?? 0), "Enemy tooltip shifted the route layout");
  assert.equal(await firstEnemyCard.locator(":popover-open").evaluate((element) => getComputedStyle(element).position), "fixed", "Enemy tooltip is not in the overlay layer");
  await firstEnemyCard.locator("[data-intel-trigger]").click();
  const firstAbilityCard = page.locator('aside[aria-live="polite"] [data-intel-card="ability"]').first();
  const abilityCardBefore = await firstAbilityCard.boundingBox();
  await firstAbilityCard.locator("[data-intel-trigger]").click();
  await firstAbilityCard.getByText("Кто применяет", { exact: true }).waitFor();
  const abilityCardAfter = await firstAbilityCard.boundingBox();
  assert.equal(Math.round(abilityCardAfter?.height ?? 0), Math.round(abilityCardBefore?.height ?? 0), "Ability tooltip shifted the route layout");
  await firstAbilityCard.locator("[data-intel-trigger]").click();

  const backdrop = page.getByTestId("dungeon-backdrop");
  const sceneAnimation = await backdrop.evaluate((element) => getComputedStyle(element).animationName);
  assert.match(sceneAnimation, /dungeonBreath/);
  await page.mouse.move(80, 180);
  await page.waitForFunction(() => document.querySelector("main")?.style.getPropertyValue("--scene-x"));
  const sceneOffset = await page.locator("main").evaluate((element) => element.style.getPropertyValue("--scene-x"));
  assert.notEqual(sceneOffset, "", "Pointer parallax did not update the dungeon scene");
  const routeAnimation = await page.getByTestId("route-line").locator("polyline").last().evaluate((element) => getComputedStyle(element).animationName);
  assert.match(routeAnimation, /routeFlow/);

  const completeButton = page.getByRole("button", { name: "Отметить шаг выполненным" });
  await completeButton.click();
  const changedButton = page.getByRole("button", { name: "Вернуть шаг в план" });
  await changedButton.waitFor({ state: "visible" });

  await page.getByRole("button", { name: "Добавить смерть" }).click();
  await page.getByText("Каждая добавляет 15 секунд", { exact: true }).waitFor();

  await page.getByRole("button", { name: "Редактировать" }).click();
  await page.getByRole("button", { name: "Готово" }).waitFor();

  await page.getByText("Зал инкубации", { exact: true }).first().click();
  await page.getByRole("heading", { name: "Зал инкубации", level: 2 }).first().waitFor();

  await page.getByRole("button", { name: "2F", exact: true }).click();
  await page.getByAltText("Карта Ruby Life Pools, этаж 2").waitFor();

  await page.getByRole("button", { name: "Увеличить" }).click();
  assert.equal(await page.locator('[aria-label="Масштаб карты"] output b').textContent(), "110%");

  await page.getByRole("button", { name: "Развернуть карту" }).click();
  await page.getByRole("button", { name: "Свернуть карту" }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Развернуть карту" }).waitFor();

  await page.getByRole("button", { name: "Добавить заметку" }).click();
  const note = page.getByLabel("Заметка группы");
  await note.fill("QA: второй кик после Nova");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.getByText("Маршрут и прогресс сохранены", { exact: true }).waitFor();

  await page.getByRole("button", { name: "Разделить врагов" }).click();
  await page.getByText("Группа врагов разделена на две части", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  await page.getByText("Последнее изменение отменено", { exact: true }).waitFor();

  await page.getByRole("button", { name: "Импорт", exact: true }).click();
  await page.getByRole("heading", { name: "Вставьте JSON маршрута Gildra" }).waitFor();
  await page.getByRole("button", { name: "Закрыть" }).click();

  await page.locator('[aria-label="Состав группы"]').getByText("ShadowNova", { exact: true }).click();
  await page.locator('[aria-label="Таланты ShadowNova"]').waitFor();
  await page.getByRole("button", { name: "Специализация", exact: true }).click();
  await page.getByText("Arcane Surge", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Все", exact: true }).click();
  await page.getByText("Spellslinger", { exact: true }).waitFor();

  await page.getByPlaceholder("Например: прервать второе заклинание").fill("QA назначение");
  await page.getByRole("button", { name: "Добавить действие", exact: true }).click();
  await page.getByText("Назначение добавлено", { exact: true }).waitFor();

  assert.deepEqual(failedRequests, [], `Failed network requests: ${failedRequests.join(", ")}`);
  assert.deepEqual(browserErrors, [], `Browser errors: ${browserErrors.join(", ")}`);
  console.log(`MYTHIC_INTERACTION PASS ${routeUrl}`);
} catch (error) {
  console.error(`MYTHIC_INTERACTION FAIL ${routeUrl}`);
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
