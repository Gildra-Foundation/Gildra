import { expect } from "playwright/test";
import { decodeAuctionGearSelectionTransport } from "../../../lib/wow/auctionGearSelectionTransport";
import { searchResult, wrist } from "../reliability/ui-fixtures";
import { test, type QuickHarness } from "./ui-quick-support";

async function assertIdle(quick: QuickHarness) {
  await expect(quick.find).toBeEnabled();
  await expect.poll(async () => (await quick.cache()).orchestration?.phase).toBe("done");
  const count = quick.requests.length;
  await quick.page.clock.install(); await quick.page.clock.fastForward(180_000);
  expect(quick.requests).toHaveLength(count);
}

test("quick/full: default stops after three search turns and one partial assembly without claiming exhaustive completion", async ({ quick, page }, info) => {
  await quick.open(); await quick.find.click();
  await expect(quick.result).toHaveAttribute("data-exhaustive", "false");
  await assertIdle(quick);
  expect(quick.requests.map(body => body.action)).toEqual(["search", "resume", "resume", "assemble"]);
  expect((await quick.cache()).orchestration).toMatchObject({ kind: "quick", phase: "done", searchTurns: 3, assemblyTurns: 1 });
  await expect(quick.full).toBeVisible(); await quick.full.focus(); await expect(quick.full).toBeFocused();
  await expect(quick.panel).not.toContainText(/Все сочетания проверены|All combinations checked|global optimum/i);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: info.outputPath("quick-partial-result.png"), fullPage: true });
});

test("quick/full: a completed search automatically assembles measured negative single replacements", async ({ quick }) => {
  quick.completeSearch = true; quick.negativeOnly = true;
  await quick.open(); await quick.find.click();
  await expect(quick.result).toBeVisible(); await assertIdle(quick);
  expect(quick.requests.map(body => body.action)).toEqual(["search", "assemble"]);
  expect(quick.search?.items.every(item => item.comparison && item.evaluation === "not_upgrade")).toBe(true);
  expect(quick.search?.baseline).toMatchObject({ iterations: 750, confidence: 95, dpsError: 0.1 });
  for (const body of quick.requests) {
    expect(body).not.toHaveProperty("iterations"); expect(body).not.toHaveProperty("precision");
  }
});

test("quick/full: no measured options stops after its search budget without an empty assembly loop", async ({ quick }) => {
  quick.empty = true; await quick.open(); await quick.find.click();
  await assertIdle(quick);
  expect(quick.requests.map(body => body.action)).toEqual(["search", "resume", "resume"]);
  await expect(quick.result).toHaveCount(0); await expect(quick.full).toBeVisible();
  await expect(quick.panel).not.toContainText(/Поиск продолжается|search is continuing|Search continues/);
});

test("quick/full: eligible combination-only options still trigger one assembly", async ({ quick }) => {
  quick.combinationsOnly = true;
  await quick.open(); await quick.find.click(); await expect(quick.result).toBeVisible(); await assertIdle(quick);
  expect(quick.requests.map(body => body.action)).toEqual(["search", "resume", "resume", "assemble"]);
  expect(quick.search?.items.every(item => !item.comparison && item.evaluation === "requires_combination")).toBe(true);
});

test("quick/full: elapsed quick budget waits for the active job then transitions once to assembly", async ({ quick, page }) => {
  quick.runningAction = "search";
  await quick.open(); await page.clock.install(); await quick.find.click();
  await expect.poll(() => quick.requests.length).toBe(1);
  await page.clock.setSystemTime(new Date(Date.now() + 46_000));
  quick.completeActive(); await page.clock.runFor(500);
  await expect(quick.result).toBeVisible(); await expect(quick.find).toBeEnabled();
  expect(quick.requests.map(body => body.action)).toEqual(["search", "assemble"]);
  await page.clock.fastForward(180_000); expect(quick.requests).toHaveLength(2);
});

test("quick/full: explicit full search reuses the same search and exact exclusions until assembly finishes", async ({ quick, page }, info) => {
  await quick.open();
  await quick.panel.getByRole("textbox", { name: /Бюджет, золото|Budget, gold/ }).fill(quick.language === "ru" ? "10 000,1234" : "10,000.1234");
  await quick.find.click(); await expect(quick.result).toBeVisible(); await expect(quick.find).toBeEnabled();
  await quick.panel.getByText(/^(Отдельные улучшения по слотам|Individual slot upgrades)$/).click();
  await quick.panel.locator("[data-auction-option] summary").click();
  await quick.panel.getByRole("checkbox", { name: new RegExp(`(?:Учитывать вариант при сборке|Allow variant in assembly): ${wrist.name}`) }).focus();
  // Excluding removes this card, so assert the resulting selection instead of
  // asking Playwright to re-find the now-unmounted checkbox after uncheck().
  await page.keyboard.press("Space");
  const excluded = [JSON.stringify([wrist.itemId, wrist.variantKey])];
  expect((await quick.cache()).excludedVariantKeys).toEqual(excluded);
  quick.completeSearch = true; quick.completeAssemblyAt = 4;
  const start = quick.requests.length;
  await quick.full.click(); await expect(quick.result).toHaveAttribute("data-exhaustive", "true");
  await expect(quick.find).toBeEnabled();
  const full = quick.requests.slice(start);
  expect(full.map(body => body.action)).toEqual(["resume", "assemble", "assemble", "assemble"]);
  expect(quick.requests.filter(body => body.action === "search")).toHaveLength(1);
  expect(quick.requests[0].budgetGold).toBe("10000.1234");
  for (const body of full) {
    expect(body.searchId).toBe(searchResult().searchId);
    if (body.action === "assemble") expect(decodeAuctionGearSelectionTransport(body).excludedVariantKeys).toEqual(excluded);
  }
  expect(new Set(quick.requests.map(body => body.clientRequestId)).size).toBe(quick.requests.length);
  expect((await quick.cache()).orchestration).toMatchObject({ kind: "full", phase: "done" });
  await page.screenshot({ path: info.outputPath("explicit-full-result.png"), fullPage: true });
});

test("quick/full: reloading a completed quick result restores it without upgrading to full", async ({ quick, page }) => {
  await quick.open(); await quick.find.click(); await expect(quick.result).toBeVisible(); await expect(quick.find).toBeEnabled();
  const count = quick.requests.length;
  await page.reload({ waitUntil: "networkidle" });
  await expect(quick.result).toHaveAttribute("data-exhaustive", "false");
  await assertIdle(quick);
  expect(quick.requests).toHaveLength(count); expect((await quick.cache()).orchestration?.kind).toBe("quick");
  await expect(quick.full).toBeVisible();
});

test("quick/full: recovering active quick work keeps its consumed turn budget", async ({ quick, page }) => {
  await quick.seed({ kind: "quick", phase: "search", startedAt: Date.now(), searchTurns: 2, assemblyTurns: 0,
    lastCompletedJobId: "synthetic-quick-previous-job" }, true);
  await quick.open();
  await expect.poll(() => quick.lookups.some(query => query.includes("synthetic-quick-recovered"))).toBe(true);
  quick.completeActive();
  await expect(quick.result).toBeVisible(); await assertIdle(quick);
  expect(quick.requests.map(body => body.action)).toEqual(["assemble"]);
  expect((await quick.cache()).orchestration).toMatchObject({ kind: "quick", phase: "done", searchTurns: 3, assemblyTurns: 1 });
  await page.reload({ waitUntil: "networkidle" }); await expect(quick.result).toBeVisible();
  expect(quick.requests).toHaveLength(1);
});

test("quick/full: legacy completed recovery displays retained facts without automatically starting full search", async ({ quick, page }) => {
  await quick.seed(); quick.assembly = quick.makeAssembly();
  await quick.open(); await expect(quick.result).toHaveAttribute("data-exhaustive", "false");
  await expect(quick.full).toBeVisible();
  await page.clock.install(); await page.clock.fastForward(180_000);
  expect(quick.requests).toHaveLength(0);
});

test("quick/full: cancellation during automatic assembly prevents further steps", async ({ quick, page }) => {
  quick.runningAction = "assemble";
  await quick.open(); await quick.find.click();
  const cancel = quick.panel.getByRole("button", { name: /^(Отменить сборку|Cancel assembly)$/ });
  await expect(cancel).toBeVisible(); await cancel.click();
  await expect.poll(() => quick.deletes.length).toBeGreaterThan(0);
  await expect(quick.find).toBeEnabled();
  const count = quick.requests.length;
  quick.completeActive(); await page.clock.install(); await page.clock.fastForward(180_000);
  expect(quick.requests).toHaveLength(count);
  expect(quick.requests.map(body => body.action)).toEqual(["search", "resume", "resume", "assemble"]);
  await expect(quick.panel.getByRole("status").filter({ hasText: /Расчёт остановлен|Calculation stopped/ })).toBeVisible();
});

test("quick/full: lost automatic assembly response recovers the same request without escalating or duplicating work", async ({ quick }) => {
  quick.completeSearch = true; quick.dropAssemblyOnce = true;
  await quick.open(); await quick.find.click();
  const recover = quick.panel.getByRole("button", { name: /^(Повторить восстановление|Retry recovery)$/ });
  await expect(recover).toBeVisible(); await recover.click();
  await expect(quick.result).toHaveAttribute("data-exhaustive", "false");
  await assertIdle(quick);
  expect(quick.requests.map(body => body.action)).toEqual(["search", "assemble"]);
  const nonce = quick.requests[1].clientRequestId!;
  expect(quick.lookups.some(query => query.includes(nonce))).toBe(true);
  expect((await quick.cache()).orchestration?.kind).toBe("quick");
});

test("quick/full: explicit full after a lost quick assembly first recovers ownership then resumes discovery", async ({ quick }) => {
  quick.dropAssemblyOnce = true;
  await quick.open(); await quick.find.click();
  await expect(quick.panel.getByRole("button", { name: /^(Повторить восстановление|Retry recovery)$/ })).toBeVisible();
  const nonce = quick.requests.at(-1)!.clientRequestId!;
  quick.completeSearch = true; quick.completeAssemblyAt = 2;
  await quick.full.click();
  await expect(quick.result).toHaveAttribute("data-exhaustive", "true");
  await expect(quick.find).toBeEnabled();
  expect(quick.lookups.some(query => query.includes(nonce))).toBe(true);
  expect(quick.requests.map(body => body.action)).toEqual(["search", "resume", "resume", "assemble", "resume", "assemble"]);
  expect(quick.requests.filter(body => body.action === "search")).toHaveLength(1);
  expect((await quick.cache()).orchestration).toMatchObject({ kind: "full", phase: "done" });
});

test("quick/full: full retries failed saved-context recovery without cancelling it or starting a new search", async ({ quick }) => {
  await quick.seed({ kind: "quick", phase: "search", startedAt: Date.now(), searchTurns: 2, assemblyTurns: 0 });
  quick.failContextRecovery = true;
  await quick.open();
  await expect(quick.panel.getByRole("button", { name: /^(Повторить восстановление|Retry recovery)$/ })).toBeVisible({ timeout: 15_000 });
  expect(quick.requests).toHaveLength(0); expect(quick.deletes).toHaveLength(0);
  quick.failContextRecovery = false; quick.completeAssemblyAt = 1;
  // The retained context is incomplete, while the next fresh server turn finishes discovery.
  quick.completeSearch = true;
  await quick.full.click();
  await expect(quick.result).toHaveAttribute("data-exhaustive", "true");
  await expect(quick.find).toBeEnabled();
  expect(quick.requests.map(body => body.action)).toEqual(["resume", "assemble"]);
  expect(quick.deletes).toHaveLength(0);
  expect(quick.requests.every(body => body.searchId === searchResult().searchId)).toBe(true);
  expect((await quick.cache()).orchestration).toMatchObject({ kind: "full", phase: "done" });
});
