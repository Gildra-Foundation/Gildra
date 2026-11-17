import { expect, type TestInfo } from "playwright/test";
import { test, type QuickHarness } from "./ui-quick-support";

// Actual components, private loopback page, synthetic market and measurements.
// These checks verify presentation and orchestration, never live account results.
const advanced = (app: QuickHarness) => app.panel.locator("[data-auction-advanced-settings]");
async function capture(app: QuickHarness, info: TestInfo, state: string) {
  await app.page.evaluate(() => document.fonts.ready);
  expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const path = info.outputPath(`synthetic-${state}.png`);
  await app.page.screenshot({ path, fullPage: true });
  await info.attach(`synthetic-${state}`, { path, contentType: "image/png" });
}
async function ready(app: QuickHarness) {
  app.completeSearch = true;
  await app.open();
  await app.find.click();
  await expect(app.result).toBeVisible();
  await expect(app.find).toBeEnabled();
  expect(app.requests.map(body => body.action)).toEqual(["search", "assemble"]);
}

test("ux flow: initial budget and encounter lead to one primary action", async ({ quick }, info) => {
  await quick.open();
  await expect(quick.find).toHaveText(quick.language === "ru" ? "Быстро подобрать вещи" : "Find gear quickly");
  await expect(quick.panel.locator('input[name="budgetGold"]')).toBeVisible();
  await expect(quick.panel.getByRole("combobox", { name: quick.language === "ru" ? "Бой" : "Encounter", exact: true })).toBeVisible();
  await expect(advanced(quick)).not.toHaveAttribute("open", "");
  await expect(quick.panel.locator("[data-auction-objective]")).not.toBeVisible();
  await expect(quick.full).toHaveCount(0);
  await expect(quick.result).toHaveCount(0);
  await capture(quick, info, "initial");
});

test("ux flow: working state has cancellation and no premature recommendation", async ({ quick, page }, info) => {
  quick.runningAction = "search";
  await quick.open(); await quick.find.click();
  const cancel = quick.panel.getByRole("button", { name: /^(Отменить поиск|Cancel search)$/ });
  await expect(cancel).toBeVisible();
  await expect(quick.find).toBeDisabled();
  await expect(quick.panel.locator('input[name="budgetGold"]')).toBeDisabled();
  await expect(quick.panel.getByRole("status")).toBeVisible();
  await expect(quick.result).toHaveCount(0);
  await capture(quick, info, "working");
  await cancel.click(); await expect(quick.find).toBeEnabled();
  expect(quick.deletes).toHaveLength(1);
  await page.clock.install(); await page.clock.fastForward(60_000);
  expect(quick.requests).toHaveLength(1);
});

test("ux flow: recommendation leads directly to shopping and alternatives stay lower", async ({ quick }, info) => {
  await ready(quick);
  const result = quick.result, shopping = result.locator("[data-auction-shopping-list]");
  await expect(result.locator("[data-auction-primary-title]")).toHaveText(/Рекомендуемый комплект|Recommended loadout/);
  await expect(result).toHaveAttribute("data-exhaustive", "false");
  await expect(result).toContainText(/по проверенным вариантам|from the options checked/);
  await expect(result.locator("[data-auction-primary-cost]")).toBeVisible();
  await expect(result.locator("[data-auction-primary-dps]")).toBeVisible();
  await expect(shopping).toBeVisible();
  const check = shopping.getByRole("button", { name: /Check availability and prices|Проверить наличие и цены/ });
  const firstRow = shopping.locator("[data-auction-shopping-row]").first();
  expect((await check.boundingBox())!.y).toBeLessThan((await firstRow.boundingBox())!.y);
  await expect(result.locator("[data-auction-calculation-details]")).not.toHaveAttribute("open", "");
  await expect(quick.panel.locator("[data-auction-single-options]")).not.toHaveAttribute("open", "");
  expect(await quick.panel.evaluate(panel => {
    const recommendation = panel.querySelector("[data-auction-assembly-result]")!;
    const singles = panel.querySelector("[data-auction-single-options]")!;
    return Boolean(recommendation.compareDocumentPosition(singles) & Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);
  await shopping.getByRole("checkbox").first().check();
  await expect(shopping.locator("[data-purchased=true]")).toHaveCount(1);
  await shopping.getByRole("button", { name: /Copy name:|Скопировать название:/ }).first().click();
  expect(await quick.page.evaluate(() => navigator.clipboard.readText())).toMatch(/^Synthetic exact item /);
  await capture(quick, info, "recommendation-shopping");
});

test("ux flow: empty completed search stays honest and idle", async ({ quick, page }, info) => {
  quick.empty = true; quick.completeSearch = true;
  await quick.open(); await quick.find.click();
  await expect(quick.panel.locator("[data-auction-search-result]")).toBeVisible();
  await expect(quick.panel.locator("[data-assembly-disabled-reason]")).toContainText(/Вариантов для сборки не найдено|No options found for a loadout/);
  await expect(quick.result).toHaveCount(0);
  await expect(quick.panel.locator("[data-auction-shopping-list]")).toHaveCount(0);
  await expect(quick.find).toBeEnabled();
  await page.clock.install(); await page.clock.fastForward(180_000);
  expect(quick.requests.map(body => body.action)).toEqual(["search"]);
  await capture(quick, info, "empty");
});

test("ux flow: server error keeps a clear retry without a purchase claim", async ({ quick, page }, info) => {
  await page.route("**/api/wow/auction-gear-plans**", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({ status: 503, json: { error: "market_unavailable" } });
  });
  await quick.open(); await quick.find.click();
  await expect(quick.panel.getByRole("alert")).toContainText(quick.language === "ru" ? "Не удалось загрузить рынок аукциона" : "The auction market could not be loaded");
  await expect(quick.find).toBeEnabled();
  await expect(quick.result).toHaveCount(0);
  await expect(quick.panel.locator("[data-auction-shopping-list]")).toHaveCount(0);
  await capture(quick, info, "error");
});

test("ux flow: stale recommendation retains facts and visibly requires refresh", async ({ quick, page }, info) => {
  await page.clock.install(); await ready(quick);
  await page.clock.fastForward(2 * 60 * 60_000 + 60_000);
  await expect(quick.result).toHaveAttribute("data-price-state", "stale");
  await expect(quick.result.getByRole("status").first()).toContainText(/Цены устарели|Prices are out of date/);
  await expect(quick.result.locator("[data-auction-primary-dps]")).toBeVisible();
  await expect(quick.panel.getByRole("button", { name: /Обновить и пересобрать сет|Refresh and rebuild loadout/ })).toBeVisible();
  expect(quick.requests).toHaveLength(2);
  await capture(quick, info, "stale");
});

test("ux flow: keyboard opens advanced settings and invalid hidden input is revealed", async ({ quick, page }, info) => {
  await quick.open();
  const budget = quick.panel.locator('input[name="budgetGold"]');
  await budget.focus(); await page.keyboard.press("Tab");
  await expect(quick.panel.getByRole("combobox", { name: quick.language === "ru" ? "Бой" : "Encounter", exact: true })).toBeFocused();
  const summary = advanced(quick).locator(":scope > summary");
  await summary.focus(); await page.keyboard.press("Enter");
  await expect(advanced(quick)).toHaveAttribute("open", "");
  const duration = advanced(quick).getByLabel(quick.language === "ru" ? "Длительность, с" : "Duration, seconds");
  await duration.fill("1");
  await summary.focus(); await page.keyboard.press("Enter");
  await quick.find.click();
  await expect(advanced(quick)).toHaveAttribute("open", "");
  await expect(duration).toBeFocused();
  expect(quick.requests).toHaveLength(0);
  await capture(quick, info, "keyboard-validation");
});

test("ux flow: reduced motion and folded slot validation remain usable", async ({ quick, page }, info) => {
  await quick.open();
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  const outer = advanced(quick); await outer.locator(":scope > summary").click();
  const inner = outer.locator("details"); await inner.locator(":scope > summary").click();
  for (const checkbox of await inner.getByRole("checkbox").all()) await checkbox.uncheck();
  await inner.locator(":scope > summary").click(); await outer.locator(":scope > summary").click();
  await quick.find.click();
  await expect(outer).toHaveAttribute("open", ""); await expect(inner).toHaveAttribute("open", "");
  await expect(inner.getByRole("checkbox").first()).toBeFocused();
  expect(quick.requests).toHaveLength(0);
  expect(await page.evaluate(() => document.getAnimations().some(animation => {
    const timing = animation.effect?.getComputedTiming(); return timing?.iterations === Infinity && animation.playState === "running";
  }))).toBe(false);
  await capture(quick, info, "reduced-motion-slot-validation");
});
