import { expect } from "playwright/test";
import { test, type QuickHarness } from "./ui-quick-support";

// Synthetic jobs exercise the actual component, including durable browser intent.
const choice = (app: QuickHarness, mode: string) => app.panel.getByRole("radio").filter({ has: app.page.locator(`[data-auction-build-mode="${mode}"]`) });
async function idle(app: QuickHarness) {
  await expect(app.find).toBeEnabled();
  await expect.poll(async () => (await app.cache()).orchestration?.phase).toBe("done");
}

test("build modes: three visible choices explain the longer enhanced calculation", async ({ quick, page }, info) => {
  await quick.open();
  for (const mode of ["quick", "full", "enhanced"]) await expect(choice(quick, mode)).toBeVisible();
  await choice(quick, "enhanced").click();
  await expect(quick.panel).toContainText(/долгий расчёт|longer calculation/i);
  await expect(quick.find).toBeEnabled();
  const help = await quick.panel.locator("#auction-build-mode-help").boundingBox();
  for (const mode of ["quick", "full", "enhanced"]) {
    const box = await choice(quick, mode).boundingBox();
    expect(box!.y + box!.height, "mode buttons must not overlap their explanation").toBeLessThanOrEqual(help!.y);
  }
  const budget = await quick.panel.locator('input[name="budgetGold"]').boundingBox();
  expect(help!.y + help!.height).toBeLessThanOrEqual(budget!.y);
  expect(quick.requests).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("enhanced-mode-warning.png"), fullPage: true });
});

test("build modes: quick sends equipment only and keeps its bounded turn budget", async ({ quick }) => {
  await quick.open(); await quick.find.click(); await expect(quick.result).toBeVisible(); await idle(quick);
  expect(quick.requests[0]).toMatchObject({ action: "search", enhancementMode: "equipment" });
  expect(quick.requests.map(body => body.action)).toEqual(["search", "resume", "resume", "assemble"]);
  await expect(quick.result).not.toContainText(/Полная стоимость неизвестна|Full cost is unknown/);
});

test("build modes: full equipment starts directly and continues assembly until complete", async ({ quick }) => {
  quick.completeSearchAt = 4; quick.completeAssemblyAt = 3;
  await quick.open(); await choice(quick, "full").click(); await quick.find.click();
  await expect(quick.result).toHaveAttribute("data-exhaustive", "true"); await idle(quick);
  expect(quick.requests[0]).toMatchObject({ action: "search", enhancementMode: "equipment" });
  expect(quick.requests.map(body => body.action)).toEqual(["search", "resume", "resume", "resume", "assemble", "assemble", "assemble"]);
  expect((await quick.cache()).orchestration?.kind).toBe("full");
});

test("build modes: enhanced waits beyond finished equipment and returns gems and enchants", async ({ quick, page }, info) => {
  quick.completeSearch = true; quick.completeAssemblyAt = 1; quick.completeEnhancementsAt = 3;
  await quick.open(); await choice(quick, "enhanced").click(); await quick.find.click();
  await expect(quick.result.locator("[data-auction-shopping-list]")).toContainText("Synthetic ruby"); await idle(quick);
  expect(quick.requests[0]).toMatchObject({ action: "search", enhancementMode: "enhanced" });
  expect(quick.requests.map(body => body.action)).toEqual(["search", "assemble", "assemble", "assemble"]);
  await expect(quick.result.locator("[data-auction-shopping-list]")).toContainText("Synthetic armor enchant");
  expect(quick.assembly?.budgetCopper).toBe(100000000);
  expect(quick.search?.baseline.iterations).toBe(750);
  for (const body of quick.requests) { expect(body).not.toHaveProperty("iterations"); expect(body).not.toHaveProperty("precision"); }
  await page.screenshot({ path: info.outputPath("enhanced-shopping-ready.png"), fullPage: true });
  const count = quick.requests.length;
  await page.reload({ waitUntil: "networkidle" }); await expect(quick.result).toBeVisible();
  await expect(choice(quick, "enhanced")).toHaveAttribute("aria-checked", "true");
  await page.clock.install(); await page.clock.fastForward(120_000);
  expect(quick.requests).toHaveLength(count);
});

for (const status of ["unavailable", "no_affordable_configuration"] as const) {
  test(`build modes: enhanced ${status} terminates honestly without fabricated purchases`, async ({ quick, page }) => {
    quick.completeSearch = true; quick.completeAssemblyAt = 1; quick.enhancementStatus = status;
    await quick.open(); await choice(quick, "enhanced").click(); await quick.find.click(); await idle(quick);
    await expect(quick.panel.locator(`[data-auction-enhancement-status="${status}"]`)).toBeVisible();
    await expect(quick.panel.locator(`[data-auction-enhancement-status="${status}"]`)).toContainText(status === "unavailable" ? /не хватает данных|недоступ|не удалось|unavailable|could not/i : /бюджет|budget/i);
    await expect(quick.panel).not.toContainText("Synthetic ruby");
    await page.clock.install(); await page.clock.fastForward(120_000);
    expect(quick.requests.map(body => body.action)).toEqual(["search", "assemble"]);
  });
}

test("build modes: changing from equipment to enhanced starts a new search with the new goal", async ({ quick }) => {
  quick.completeSearch = true; quick.completeAssemblyAt = 1;
  await quick.open(); await quick.find.click(); await expect(quick.result).toBeVisible(); await idle(quick);
  await choice(quick, "enhanced").click(); await quick.find.click();
  await expect(quick.result.locator("[data-auction-shopping-list]")).toContainText("Synthetic ruby"); await idle(quick);
  expect(quick.requests.filter(body => body.action === "search").map(body => body.enhancementMode)).toEqual(["equipment", "enhanced"]);
});

test("build modes: pending enhancements survive reload and cancellation prevents more work", async ({ quick, page }) => {
  quick.completeSearch = true; quick.completeAssemblyAt = 1; quick.completeEnhancementsAt = 3; quick.runningAction = "assemble";
  await quick.open(); await choice(quick, "enhanced").click(); await quick.find.click();
  await expect.poll(() => quick.requests.length).toBe(2);
  await page.reload({ waitUntil: "networkidle" });
  await expect(choice(quick, "enhanced")).toHaveAttribute("aria-checked", "true");
  const cancel = quick.panel.getByRole("button", { name: /^(Отменить сборку|Cancel assembly)$/ });
  await expect(cancel).toBeVisible(); await cancel.click(); await expect(quick.find).toBeEnabled();
  expect(quick.deletes).toHaveLength(1);
  await page.clock.install(); await page.clock.fastForward(120_000);
  expect(quick.requests).toHaveLength(2);
});

test("build modes: explicit enhanced submit replaces a legacy search that never recorded an enhancement goal", async ({ quick }) => {
  quick.completeSearch = true; quick.completeAssemblyAt = 1;
  await quick.seed({ kind: "quick", phase: "done", startedAt: Date.now(), searchTurns: 1, assemblyTurns: 1 });
  quick.assembly = quick.makeAssembly();
  await quick.open(); await expect(quick.result).toBeVisible();
  expect(quick.requests).toHaveLength(0);
  await choice(quick, "enhanced").click(); await quick.find.click();
  await expect(quick.result.locator("[data-auction-shopping-list]")).toContainText("Synthetic ruby"); await idle(quick);
  expect(quick.requests[0]).toMatchObject({ action: "search", enhancementMode: "enhanced" });
});
