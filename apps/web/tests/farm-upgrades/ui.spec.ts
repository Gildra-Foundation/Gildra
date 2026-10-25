import { test, expect } from "playwright/test";
const start = /Подобрать места фарма|Find farming locations/;
const good = { itemId: 999001, entityId: "synthetic", name: "Synthetic useful proc", slotType: "TRINKET_1", currentItemId: 99,
  currentItemLevel: 200, encounterId: 1, encounterName: "Synthetic boss", verification: "simulated", itemLevel: 139, requiredLevel: 78,
  deltaDps: 1000, deltaPercent: 10, marginPercent: 0.3, stats: {}, effectsVerified: false };
const bad = [{ ...good, name: "Junk downgrade", itemId: 999002, deltaDps: -10 },
  { ...good, name: "Junk noise", itemId: 999003, deltaPercent: 0.1 },
  { ...good, name: "Junk unmeasured", itemId: 999004, verification: "variant_verified" },
  { ...good, name: "Junk ilvl", itemId: 999005, verification: "item_level", itemLevel: 300 }];
const location = { id: "synthetic", name: "Synthetic accessible dungeon", slug: "synthetic", difficulty: "normal", access: "level_condition_met",
  group: "dungeon", minLevel: 78, sourceUrl: "https://example.invalid", sourceVerifiedAt: "2026-10-24", lootItemsChecked: 5, variantsUnverified: 1 };
const result = (targets: unknown[]) => ({ character: { name: "Synthetic", level: 81, equippedItemLevel: 200, specId: 72 },
  activities: [{ ...location, targets }, { ...location, id: "locked", name: "Synthetic locked dungeon", access: "level_locked", minLevel: 90, targets: [good] }],
  coverage: { instancesChecked: 2, lootItemsChecked: 6, exactVariants: 5, simulations: 6, searchLimited: true },
  checkedAt: "2026-10-24T17:00:00Z", baselineDps: 10000, engine: "SimulationCraft synthetic-ui", profileFingerprint: "synthetic" });
const job = (value: unknown) => ({ id: "synthetic-job", status: "completed", result: value, progress: null, error: null });
test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", route => route.abort());
});
test("show only significant attainable upgrades and preserve coverage", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/wow/gear-farm-plans**", route => route.fulfill({ json: job(result([good, ...bad])) }));
  await page.goto(`/?lang=${info.project.metadata.locale}`);
  await page.getByRole("button", { name: start }).focus(); await page.keyboard.press("Enter");
  await expect(page.locator("[data-farm-verification]")).toHaveCount(1);
  await expect(page.getByText("Synthetic useful proc", { exact: true })).toBeVisible();
  await expect(page.getByText(/Junk/)).toHaveCount(0);
  await expect(page.getByText(/Проверены не все варианты|Some loot variants/)).toBeVisible();
  await expect(page.getByText("Synthetic locked dungeon")).not.toBeVisible();
  await page.locator("details").last().locator("summary").click();
  await expect(page.getByText("Synthetic locked dungeon")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: info.outputPath("confirmed-farm.png"), fullPage: true });
  expect(errors).toEqual([]);
});
test("empty results never suggest farming junk", async ({ page }, info) => {
  await page.route("**/api/wow/gear-farm-plans**", route => route.fulfill({ json: job(result(bad)) }));
  await page.goto(`/?lang=${info.project.metadata.locale}`); await page.getByRole("button", { name: start }).click();
  await expect(page.getByRole("status")).toContainText(/не найдено|No compatible upgrades/);
  await expect(page.locator("[data-farm-verification]")).toHaveCount(0);
  await expect(page.getByText("Synthetic accessible dungeon")).toHaveCount(0);
  await expect(page.getByText(/Junk/)).toHaveCount(0);
});
test("progress cancellation and server errors stay usable", async ({ page }, info) => {
  let mode = "running", deletes = 0;
  await page.route("**/api/wow/gear-farm-plans**", route => {
    if (route.request().method() === "DELETE") { deletes++; return route.fulfill({ json: {} }); }
    return route.fulfill({ json: mode === "error" ? { ...job(null), status: "failed", error: "simulation_unavailable" } :
      { ...job(null), status: "running", progress: { phase: "simulating", completed: 2, total: 31 } } });
  });
  await page.goto(`/?lang=${info.project.metadata.locale}`); await page.getByRole("button", { name: start }).click();
  await expect(page.getByRole("status")).toContainText("2 / 31");
  const cancel = page.getByRole("button", { name: /^(Отменить|Cancel)$/ });
  await cancel.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText(/Подбор отменён|Search cancelled/);
  await expect.poll(() => deletes).toBe(1);
  mode = "error"; await page.getByRole("button", { name: start }).click();
  await expect(page.locator("[data-gear-farm]").getByRole("alert")).toContainText(/недоступен|unavailable/);
  await expect(page.getByRole("button", { name: start })).toBeEnabled();
});
