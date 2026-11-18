import { test, expect, type Page, type TestInfo } from "playwright/test";
import { searchResult, completedJob } from "../reliability/ui-fixtures";
const lang = (info: TestInfo) => info.project.metadata.language as string;
const open = async (page: Page, info: TestInfo, mode = "") => {
  await page.route("**/api/wow/auction-gear-plans**", route => route.fulfill({ json: { activeJob: null, job: null, formIntent: null } }));
  await page.goto(`/?lang=${lang(info)}&mode=${mode}`);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("[data-auction-shopping-list] input[type=checkbox]").first()).toBeEnabled();
};
test("coherent selected result, alternatives, visible objective and responsive focus", async ({ page }, info) => {
  await open(page, info);
  const primary = page.locator("[data-auction-assembly-result]");
  await expect(primary).toHaveAttribute("data-selected-result", "enhanced:synthetic-enhanced-config");
  await expect(primary.locator("[data-auction-primary-cost]")).toContainText(lang(info) === "ru" ? "120" : "120");
  await expect(primary.locator("[data-auction-primary-dps]")).toContainText("50");
  await expect(primary.locator("[data-auction-shopping-row]")).toHaveCount(2);
  await page.locator("[data-auction-advanced-settings] > summary").click();
  const objective = page.locator("[data-auction-objective]");
  await expect(objective).toBeVisible();
  await objective.getByRole("radio").last().focus();
  await page.keyboard.press("ArrowLeft");
  await expect(objective.getByRole("radio").first()).toBeChecked();
  await primary.locator("[data-auction-result-alternatives] summary").click();
  await primary.locator("[data-auction-result-alternatives] button").first().click();
  await expect(primary).toHaveAttribute("data-selected-result", /^items:/);
  await expect(primary.locator("[data-auction-primary-cost]")).toContainText(lang(info) === "ru" ? "Неизвестна" : "Unknown");
  await expect(primary.locator("[data-auction-primary-dps]")).toContainText("20");
  await expect(primary.locator("[data-auction-shopping-row]")).toHaveCount(1);
  await expect(primary.locator("[data-auction-primary-title]")).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("selected-result.png"), fullPage: true });
});
test("shopping copy, purchase reload, exact scope and current quote check", async ({ page }, info) => {
  await open(page, info);
  const list = page.locator("[data-auction-shopping-list]");
  const boxes = list.locator("input[type=checkbox]");
  await list.getByRole("button", { name: /Copy name: Synthetic Exact Helm|Скопировать название: Synthetic Exact Helm/ }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("Synthetic Exact Helm");
  await boxes.first().check();
  await expect(list.locator("[data-purchased=true]")).toHaveCount(1);
  await page.reload();
  await expect(boxes.first()).toBeChecked();
  await page.route("**/api/wow/auction-shopping-list", async route => {
    const input = route.request().postDataJSON();
    expect(input.recommendationKey).toBe("enhanced:synthetic-enhanced-config");
    expect(input.purchasedKeys).toHaveLength(1);
    await route.fulfill({ json: { checkedAt: new Date().toISOString(), sourceUpdatedAt: new Date().toISOString(), commoditySourceUpdatedAt: new Date().toISOString(), remainingCopper: 250000,
      rows: [{ key: "item:7001:synthetic-exact-variant:1", kind: "item", itemId: 7001, name: "Synthetic Exact Helm", quantity: 1, variantKey: "synthetic-exact-variant", status: "purchased", currentCopper: 0 },
        { key: "gem:7010:2", kind: "gem", itemId: 7010, name: "Synthetic Exact Gem", quantity: 2, status: "repriced", currentCopper: 250000 }] } });
  });
  await list.getByRole("button", { name: /Check availability and prices|Проверить наличие и цены/ }).click();
  await expect(list.locator("[data-shopping-status=repriced]")).toBeVisible();
  await page.getByRole("button", { name: "Private quote change" }).click();
  await expect(list.locator("[data-shopping-status]")).toHaveCount(0);
  await expect(boxes.first()).toBeChecked();
  await page.getByRole("button", { name: "Private snapshot change" }).click();
  await expect(boxes.first()).not.toBeChecked();
});
test("late shopping response cannot overwrite purchased state", async ({ page }, info) => {
  await open(page, info);
  const list = page.locator("[data-auction-shopping-list]");
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/wow/auction-shopping-list", async route => {
    await delayed;
    try { await route.fulfill({ json: { rows: [], remainingCopper: 1, checkedAt: new Date().toISOString() } }); } catch { /* the actual component aborted this obsolete request */ }
  });
  await list.getByRole("button", { name: /Check availability and prices|Проверить наличие и цены/ }).click();
  await list.locator("input[type=checkbox]").first().check();
  release();
  await expect(list.locator("[data-shopping-status]")).toHaveCount(0);
  await expect(list.locator("input[type=checkbox]").first()).toBeChecked();
});
test("repriced purchases exceeding budget keep calculation and checked prices explicit", async ({ page }, info) => {
  await open(page, info);
  await page.route("**/api/wow/auction-shopping-list", route => route.fulfill({ json: { checkedAt: new Date().toISOString(), sourceUpdatedAt: new Date().toISOString(), commoditySourceUpdatedAt: new Date().toISOString(), remainingCopper: 12000000,
    rows: [{ key: "item:7001:synthetic-exact-variant:1", kind: "item", itemId: 7001, name: "Synthetic Exact Helm", quantity: 1, variantKey: "synthetic-exact-variant", status: "repriced", currentCopper: 11800000 },
      { key: "gem:7010:2", kind: "gem", itemId: 7010, name: "Synthetic Exact Gem", quantity: 2, status: "available", currentCopper: 200000 }] } }));
  const result = page.locator("[data-auction-assembly-result]"), list = result.locator("[data-auction-shopping-list]");
  await list.getByRole("button", { name: /Check availability and prices|Проверить наличие и цены/ }).click();
  await expect(list.locator("[data-shopping-status=repriced]")).toBeVisible();
  await expect(result.locator("[data-auction-price-context]")).toHaveText(lang(info) === "ru" ? "Цены на момент расчёта" : "Prices at calculation time");
  await expect(result).toHaveAttribute("data-price-state", "calculated");
  await expect(list.locator("dl")).toContainText(/1[\s,.]?200/);
  await expect(list.locator("dl")).toContainText(lang(info) === "ru" ? "по проверенным ценам" : "checked prices");
  await page.screenshot({ path: info.outputPath("repriced-over-budget.png"), fullPage: true });
});
test("objective persists as scoped draft, travels in request and clears old result", async ({ page }, info) => {
  await open(page, info);
  await page.locator("[data-auction-advanced-settings] > summary").click();
  const objective = page.locator("[data-auction-objective]"), choices = objective.getByRole("radio");
  await choices.last().click();
  await expect(choices.last()).toBeChecked();
  await page.reload();
  await page.locator("[data-auction-advanced-settings] > summary").click();
  await expect(choices.last()).toBeChecked();
  let requests = 0;
  await page.route("**/api/wow/auction-gear-plans**", async route => {
    if (route.request().method() !== "POST") return route.fulfill({ json: { activeJob: null, job: null, formIntent: null } });
    const input = route.request().postDataJSON();
    expect(input.objective).toBe("dps"); requests++;
    const result = { ...searchResult(), searchId: "synthetic-objective-search", selectedSlots: input.selectedSlots, objective: input.objective,
      budgetCopper: Number(input.budgetGold) * 10000, items: [], optionsConsidered: 0, scenario: input.scenario, fightLengthSeconds: input.fightLengthSeconds,
      targets: input.targets, compareScenarios: input.compareScenarios,
      ...(input.enhancementMode !== undefined ? { enhancementMode: input.enhancementMode } : {}) };
    return route.fulfill({ json: completedJob(lang(info), result) });
  });
  await page.locator("[data-auction-gear] button[type=submit]").click();
  await expect(page.locator("[data-auction-search-result]")).toBeVisible();
  expect(requests).toBe(1);
  await choices.first().click();
  await expect(page.locator("[data-auction-search-result]")).toHaveCount(0);
  await expect(choices.first()).toBeChecked();
  await choices.last().click();
  await page.getByRole("button", { name: "Private snapshot change" }).click();
  await page.locator("[data-auction-advanced-settings] > summary").click();
  await expect(choices.first()).toBeChecked();
});
test("objective nonce recovery skips old checkpoint and polls new owned search", async ({ page }, info) => {
  const language = lang(info), characterSlug = "eu--synthetic-result--synthetic";
  await page.addInitScript(({ language, characterSlug }) => {
    sessionStorage.setItem(`gildra:auction:v1:${encodeURIComponent(characterSlug)}:fury-warrior:${language}`, JSON.stringify({ version: 1,
      profileKey: "synthetic:0", mode: "search", searchId: "synthetic-previous-search", clientRequestId: "synthetic-request-123456789", excludedOptionIds: [],
      formIntent: { characterSlug, locale: language, budgetGold: "10000", objective: "dps", scenario: "single-target", selectedSlots: ["HEAD"] } }));
  }, { language, characterSlug });
  const previous = { ...searchResult(), searchId: "synthetic-previous-search", selectedSlots: ["HEAD"], objective: "value" };
  const next = { ...previous, searchId: "synthetic-new-search", objective: "dps", items: [], optionsConsidered: 0 };
  let polled = 0;
  await page.route("**/api/wow/auction-gear-plans**", async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.has("clientRequestId")) return route.fulfill({ json: { ...completedJob(language, next), id: "synthetic-next-job", mode: "search" } });
    if (url.searchParams.has("searchId")) return route.fulfill({ json: { kind: "recovery", search: previous, assembly: null, excludedOptionIds: [], activeJob: null, needsRefresh: true } });
    if (url.searchParams.has("id")) { polled++; return route.fulfill({ json: { ...completedJob(language, next), id: "synthetic-next-job", mode: "search" } }); }
    return route.fulfill({ json: { activeJob: null, job: null, formIntent: null } });
  });
  await page.goto(`/?lang=${language}`);
  await expect(page.locator("[data-auction-search-result]")).toBeVisible();
  await page.locator("[data-auction-advanced-settings] > summary").click();
  await expect(page.locator("[data-auction-objective]").getByRole("radio").last()).toBeChecked();
  expect(polled).toBeGreaterThan(0);
});
for (const mode of ["unknown", "insignificant", "stale", "partial-negative", "incomplete-data"]) test(`${mode} result remains honest`, async ({ page }, info) => {
  await open(page, info, mode);
  const result = page.locator("[data-auction-assembly-result]");
  if (mode === "unknown") await expect(result.locator("[data-auction-primary-cost]")).toContainText(lang(info) === "ru" ? "Неизвестна" : "Unknown");
  if (mode === "insignificant") await expect(result).toContainText(lang(info) === "ru" ? "Покупка не рекомендована" : "Buying is not recommended");
  if (mode === "stale") await expect(result).toContainText(lang(info) === "ru" ? "Цены устарели" : "Prices are out of date");
  if (mode === "partial-negative") {
    await expect(result).toContainText(lang(info) === "ru" ? "Проверена часть вариантов" : "Only some options have been checked");
    await expect(result).toContainText(lang(info) === "ru" ? "Покупка не рекомендована" : "Buying is not recommended");
  }
  if (mode === "incomplete-data") await expect(result).toContainText(lang(info) === "ru" ? "Часть предметов не удалось оценить" : "Some items could not be evaluated");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("comparison switches the DPS, cost and shopping list together", async ({ page }, info) => {
  await open(page, info, "tradeoff");
  const result = page.locator("[data-private-result] [data-auction-assembly-result]");
  const comparison = result.locator("[data-auction-loadout-comparison]");
  await expect(comparison).toBeVisible();
  for (const [option, name, dps, gold] of [
    ["dps", "Synthetic Stronger Helm", "60", "500"],
    ["value", "Synthetic Exact Helm", "20", "100"],
  ]) {
    await comparison.locator(`[data-auction-select-comparison="${option}"]`).click();
    await expect(result.locator("[data-auction-primary-dps]")).toContainText(dps);
    await expect(result.locator("[data-auction-primary-cost]")).toContainText(gold);
    await expect(result.locator("[data-auction-shopping-row]")).toHaveCount(1);
    await expect(result.locator("[data-auction-shopping-row]")).toContainText(name);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("one winning loadout has a single actionable shopping list", async ({ page }, info) => {
  await open(page, info, "same-winner");
  const result = page.locator("[data-private-result]");
  await expect(result.locator("[data-auction-loadout-comparison]")).toHaveCount(0);
  await expect(result.locator("[data-auction-shopping-row]")).toHaveCount(1);
});
