import { test, expect, type CompletionHarness } from "./ui-support";
import { assemblyResult, characterSlug, completedJob, market, searchResult } from "../reliability/ui-fixtures";

async function expectExcludedRecommendations(auction: CompletionHarness) {
  await expect(auction.panel.locator('[data-auction-option]')).toHaveCount(0);
  await expect(auction.panel.locator('[data-auction-exclusions] > summary')).toBeVisible();
  const keys = await auction.page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith('gildra:auction:v1:')).flatMap(([, value]) => JSON.parse(value).excludedVariantKeys ?? []));
  expect(keys.length).toBeGreaterThan(0);
}

for (const expired of [false, true]) test(`repeat-audit regression: restored completed loadout keeps ${expired ? "expired" : "unrefreshed"} prices stale`, async ({ auction, page }, info) => {
  const now = Date.now();
  const sourceTime = now - (expired ? 121 : 1) * 60_000;
  const completedAt = now - (expired ? 15 : 0.5) * 60_000;
  const recoveredMarket = { ...market, updatedAt: new Date(sourceTime).toISOString(), validatedAt: new Date(completedAt).toISOString() };
  const recoveredSearch = { ...searchResult(), market: recoveredMarket };
  const recoveredAssembly = { ...assemblyResult(), market: recoveredMarket };
  const requests: string[] = [];
  await page.addInitScript(({ language, characterSlug }) => {
    sessionStorage.setItem(`gildra:auction:v1:${encodeURIComponent(characterSlug)}:fury-warrior:${language}`, JSON.stringify({
      version: 1, profileKey: "synthetic-reliability:0", searchId: "synthetic-reliability-search", jobId: "old-completed-assembly",
      clientRequestId: "synthetic-old-completed-assembly-nonce", mode: "assembly", excludedOptionIds: [], excludedVariantKeys: [],
    }));
  }, { language: auction.language, characterSlug });
  await page.route("**/api/wow/auction-gear-plans**", async route => {
    const request = route.request(), url = new URL(request.url()); requests.push(request.method());
    if (url.searchParams.has("searchId")) {
      await route.fulfill({ json: { kind: "recovery", search: recoveredSearch, assembly: recoveredAssembly,
        excludedOptionIds: [], excludedVariantKeys: [], activeJob: null, needsRefresh: true } });
    } else await route.fulfill({ json: { ...completedJob(auction.language, recoveredAssembly), id: "old-completed-assembly", mode: "assembly", completedAt } });
  });
  await auction.open();
  await expect(auction.result).toBeVisible();
  await expect(auction.find).toBeEnabled();
  expect(requests).not.toContain("POST");
  await expect(auction.result).toHaveAttribute("data-price-state", "stale");
  await page.screenshot({ path: info.outputPath(`restored-${expired ? "expired" : "unrefreshed"}.png`), fullPage: true });
});

test("repeat-audit regression: changing parameters retires background discovery and focuses the budget", async ({ auction, page }, info) => {
  await auction.open(); auction.incompleteSearchOnce = true; auction.holdContinuation = true;
  await auction.search(); await expect.poll(() => auction.requests.some(body => body.action === "resume")).toBe(true);
  const budget = auction.panel.getByRole("textbox", { name: /Бюджет, золото|Budget, gold/ });
  auction.holdCancel = true;
  const edit = auction.panel.getByRole("button", { name: /Изменить параметры|Change parameters/, exact: true });
  await expect(edit).toBeVisible(); await edit.click();
  await expect.poll(() => auction.cancellationRequests.length).toBeGreaterThan(0);
  await expect(budget).toBeDisabled();
  expect(auction.requests.filter(body => body.action === "search")).toHaveLength(1);
  auction.release();
  await expect(budget).toBeEnabled(); await expect(budget).toBeFocused();
  await expect(auction.panel.locator("[data-auction-search-result]")).toBeVisible();
  await budget.fill("9000");
  await auction.panel.locator("summary").filter({ hasText: /Слоты экипировки и цель подбора|Equipment slots and objective/ }).click();
  await auction.panel.getByRole("combobox", { name: /Цель подбора|Selection objective/ }).selectOption("dps");
  await auction.search();
  expect(auction.requests.filter(body => body.action === "search")).toHaveLength(2);
  expect(auction.requests.at(-1)).toMatchObject({ action: "search", budgetGold: "9000", objective: "dps" });
  await page.screenshot({ path: info.outputPath("changed-background-parameters.png"), fullPage: true });
});

test("repeat-audit regression: a warm queued result appears within the first simulated second", async ({ auction, page }) => {
  await auction.open(); auction.pendingInitial = true;
  await page.clock.install(); await page.clock.pauseAt(new Date());
  await auction.find.click();
  await expect.poll(() => auction.requests.length).toBe(1);
  // Only the server completion changes. The paused browser clock controls polling exactly.
  auction.pendingInitial = false;
  await page.clock.runFor(1000);
  await expect(auction.panel.locator("[data-auction-search-result]")).toBeVisible();
});

test("repeat-audit regression: an open loadout becomes stale when its market expires", async ({ auction, page }) => {
  await page.clock.install();
  await auction.open(); await auction.search(); await auction.build.click();
  await expect(auction.result).toHaveAttribute("data-price-state", "verified");
  const requests = auction.requests.length;
  await page.clock.fastForward(2 * 60 * 60_000 + 60_000);
  await expect(auction.result).toHaveAttribute("data-price-state", "stale");
  expect(auction.requests).toHaveLength(requests);
});

test("repeat-audit control: a recovered active job can finish before its first poll with fresh prices", async ({ auction, page }) => {
  const freshMarket = { ...market, updatedAt: new Date().toISOString(), validatedAt: new Date().toISOString() };
  const freshSearch = { ...searchResult(), market: freshMarket };
  const freshAssembly = { ...assemblyResult({ complete: true }), market: freshMarket, updatedSearch: freshSearch };
  let polls = 0;
  await page.addInitScript(({ language, characterSlug }) => {
    sessionStorage.setItem(`gildra:auction:v1:${encodeURIComponent(characterSlug)}:fury-warrior:${language}`, JSON.stringify({
      version: 1, profileKey: "synthetic-reliability:0", searchId: "synthetic-reliability-search", jobId: "still-active-assembly",
      clientRequestId: "synthetic-active-assembly-nonce", mode: "assembly", excludedOptionIds: [], excludedVariantKeys: [],
    }));
  }, { language: auction.language, characterSlug });
  await page.route("**/api/wow/auction-gear-plans**", async route => {
    const url = new URL(route.request().url());
    const running = { id: "still-active-assembly", status: "running", mode: "assembly", result: null, progress: null, error: null };
    if (url.searchParams.has("searchId")) {
      await route.fulfill({ json: { kind: "recovery", search: freshSearch, assembly: null, excludedOptionIds: [], excludedVariantKeys: [], activeJob: running, needsRefresh: true } });
    } else if (url.searchParams.has("clientRequestId")) await route.fulfill({ json: running });
    else { polls++; await route.fulfill({ json: { ...completedJob(auction.language, freshAssembly), id: running.id, mode: "assembly" } }); }
  });
  await auction.open();
  await expect(auction.result).toHaveAttribute("data-price-state", "verified");
  expect(polls).toBe(1);
});

test("repeat-audit control: rejected parameter-change cancellation keeps the form locked until retry", async ({ auction }) => {
  await auction.open(); auction.incompleteSearchOnce = true; auction.holdContinuation = true;
  await auction.search(); await expect.poll(() => auction.requests.some(body => body.action === "resume")).toBe(true);
  auction.cancelFailure = true;
  await auction.panel.getByRole("button", { name: /Изменить параметры|Change parameters/, exact: true }).click();
  const retry = auction.panel.getByRole("button", { name: /Повторить отмену|Retry cancellation/ });
  await expect(retry).toBeVisible();
  await expect(auction.panel.getByRole("textbox", { name: /Бюджет, золото|Budget, gold/ })).toBeDisabled();
  await expect(auction.find).toBeDisabled();
  expect(auction.requests).toHaveLength(2);
  auction.cancelFailure = false; await retry.click(); auction.release();
  await expect(auction.find).toBeEnabled();
  expect(auction.requests).toHaveLength(2);
});

test("regression: locale grouped budget preserves four decimal places in the actual POST", async ({ auction }) => {
  await auction.open();
  await auction.panel.locator('[name="budgetGold"]').fill(auction.t("10\u00a0000,1234", "10,000.1234"));
  await auction.search();
  expect(auction.requests[0].budgetGold).toBe("10000.1234");
  await expect(auction.assembly).toContainText(auction.t("10\u00a0000,1234", "10,000.1234"));
});

test("regression: cancelling saved-search recovery unlocks the form immediately", async ({ auction, page }) => {
  await auction.open(); await auction.seedRecovery(); auction.holdRecovery = true;
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect.poll(() => auction.searchLookups, { timeout: 15000 }).toBeGreaterThan(0);
  await auction.panel.getByRole("button", { name: auction.t("Отменить поиск", "Cancel search"), exact: true }).click();
  await expect(auction.find).toBeEnabled();
  await expect(auction.panel.locator('[name="budgetGold"]')).toBeEnabled();
  await expect(auction.panel.getByRole("status")).toContainText(/отмен|cancel/i);
  auction.release();
  await expect(auction.panel.locator("[data-auction-search-result]")).toHaveCount(0);
});

test("regression: lost assembly response reconnects to its accepted job without another POST", async ({ auction }) => {
  await auction.open(); await auction.search(); auction.dropAction = "assemble";
  await auction.build.click();
  const retry = auction.assembly.getByRole("button", { name: /Повторить восстановление|Retry recovery|Повторить подключение|Reconnect to calculation/ });
  await expect(retry).toBeVisible(); await retry.click();
  await expect(auction.result).toBeVisible();
  expect(auction.requests.filter(body => body.action === "assemble")).toHaveLength(1);
  expect(auction.requests.at(-1)?.clientRequestId).toMatch(/^[A-Za-z0-9_-]{16,100}$/);
  expect(auction.requestLookups).toContain(auction.requests.at(-1)!.clientRequestId);
});

test("completed incomplete-data search can refresh its options without starting a new search", async ({ auction }) => {
  await auction.open(); auction.empty = true; auction.incompleteData = true; await auction.search();
  await expect(auction.build).toBeDisabled();
  auction.empty = false; auction.incompleteData = false;
  const refresh = auction.panel.getByRole("button", { name: /Обновить варианты|Refresh options/, exact: true });
  await expect(refresh).toBeVisible(); await refresh.click();
  await expect(auction.panel.locator("[data-auction-option]")).toHaveCount(1);
  expect(auction.requests.map(body => body.action)).toEqual(["search", "resume"]);
  expect(auction.requests[1].searchId).toBe("synthetic-reliability-search");
  expect(auction.requests[1].clientRequestId).toMatch(/^[A-Za-z0-9_-]{16,100}$/);
});

test("lost automatic resume response reconnects with its own nonce and no duplicate continuation", async ({ auction }) => {
  await auction.open(); auction.incompleteSearchOnce = true; auction.dropAction = "resume"; await auction.search();
  const retry = auction.panel.getByRole("button", { name: /Повторить восстановление|Retry recovery/ });
  await expect(retry).toBeVisible(); await retry.click();
  await expect(auction.panel.getByText(/Проверка найденных вариантов завершена|Evaluation of discovered options is complete/)).toBeVisible();
  expect(auction.requests.map(body => body.action)).toEqual(["search", "resume"]);
  expect(auction.requests[1].clientRequestId).not.toBe(auction.requests[0].clientRequestId);
  expect(auction.requestLookups).toContain(auction.requests[1].clientRequestId);
});

test("owner conflict reconnects to the active owned search job", async ({ auction }) => {
  await auction.open(); await auction.search(); auction.seedBusyAssembly();
  await auction.build.click(); await expect(auction.result).toBeVisible();
  expect(auction.searchLookups).toBeGreaterThan(0);
  await expect(auction.panel.getByRole("alert")).toHaveCount(0);
  expect(auction.requests.filter(body => body.action === "assemble")).toHaveLength(1);
});

test("snapshot unmount retires an accepted late assembly before the replacement scope starts", async ({ auction, page }) => {
  await auction.open(true); await auction.search(); auction.holdPost = true; await auction.build.click();
  await expect.poll(() => auction.requests.length).toBe(2);
  await page.getByRole("button", { name: "Private snapshot change", exact: true }).click();
  await auction.find.click(); expect(auction.requests).toHaveLength(2);
  auction.release(); await expect.poll(() => auction.deletes).toContain("completion-job-2");
  await expect.poll(() => auction.requests.length).toBe(3);
});

for (const action of ["assemble", "resume"] as const) test(`late ${action} response is cancelled before the next search can start`, async ({ auction, page }) => {
  await auction.open(true); await auction.search(); auction.holdPost = true;
  if (action === "assemble") await auction.build.click();
  else {
    // Restore an unfinished owned search so the actual Continue action is offered.
    await page.route("**/api/wow/auction-gear-plans?searchId=**", async route => {
      const { searchResult } = await import("../reliability/ui-fixtures");
      await route.fulfill({ json: { kind: "recovery", search: { ...searchResult(), searchComplete: false, pendingItems: 1 }, assembly: null, excludedOptionIds: [], activeJob: null, needsRefresh: true } });
    });
    await auction.seedRecovery(); await page.reload({ waitUntil: "networkidle" });
    await auction.panel.getByRole("button", { name: /Продолжить проверку вещей|Continue item comparisons/ }).click();
  }
  await expect.poll(() => auction.requests.length).toBe(2);
  await auction.panel.getByRole("button", { name: action === "assemble" ? /Отменить сборку|Cancel assembly/ : /Отменить поиск|Cancel search/ }).click();
  await auction.find.click(); expect(auction.requests).toHaveLength(2);
  auction.release(); await expect.poll(() => auction.deletes).toContain("completion-job-2");
  await expect.poll(() => auction.requests.length).toBe(3);
  expect(auction.requests[1].clientRequestId).toMatch(/^[A-Za-z0-9_-]{16,100}$/);
});

test("locale formats reject mixed separators and preserve the old result until a valid new search", async ({ auction }) => {
  await auction.open();
  for (const invalid of auction.language === "en" ? ["10,00", "10.000,1234", "1,000.12345"] : ["10 00", "10,000.1234", "1 000,12345"]) {
    await auction.panel.locator('[name="budgetGold"]').fill(invalid); await expect(auction.find).toBeDisabled();
    await expect(auction.panel.getByRole("alert")).toContainText(/золот|gold/i);
  }
  expect(auction.requests).toHaveLength(0);
});

test("responsive real-font empty, error and keyboard focus states remain usable", async ({ auction, page }) => {
  await auction.open();
  expect(await page.evaluate(() => document.fonts.check("16px Inter") && document.fonts.check("16px Alegreya"))).toBe(true);
  auction.fail = true; await auction.find.click(); await expect(auction.panel.getByRole("alert")).toContainText("SimulationCraft");
  auction.fail = false; auction.empty = true; await auction.search();
  await expect(auction.panel.getByRole("status")).toContainText(/улучшений|upgrades/i);
  await expect(auction.build).toBeDisabled();
  await auction.find.focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
  await expect(auction.find).toBeFocused();
  expect(await auction.find.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
  expect(await page.evaluate(() => document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("prominent Build reconnects to a pending assembly without cancelling or replacing it", async ({ auction }) => {
  await auction.open(); await auction.search(); auction.dropAction = "assemble"; await auction.build.click();
  await expect(auction.assembly.getByRole("button", { name: /Повторить восстановление|Retry recovery/ })).toBeVisible();
  await auction.build.click(); await expect(auction.result).toBeVisible();
  expect(auction.requests.filter(body => body.action === "assemble")).toHaveLength(1);
  expect(auction.deletes).toEqual([]); expect(auction.nonceDeletes).toEqual([]);
});

test("changing exclusions after a lost response retires the old nonce before a new filtered assembly", async ({ auction }) => {
  await auction.open(); await auction.search(); auction.dropAction = "assemble"; await auction.build.click();
  await expect(auction.assembly.getByRole("button", { name: /Повторить восстановление|Retry recovery/ })).toBeVisible();
  const oldNonce = auction.requests[1].clientRequestId!;
  await auction.panel.locator('[data-auction-option] summary').click();
  await auction.panel.locator('[data-auction-option] input[type="checkbox"]').click();
  await expectExcludedRecommendations(auction);
  const expectedVariant = JSON.stringify([880003, "synthetic-exact-780003"]);
  const selected = await auction.page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith("gildra:auction:v1:")).map(([, value]) => JSON.parse(value))[0]);
  expect(selected.excludedOptionIds).toEqual([]); expect(selected.excludedVariantKeys).toEqual([expectedVariant]);
  await auction.build.click(); await expect(auction.result).toBeVisible();
  await expectExcludedRecommendations(auction);
  expect(auction.nonceDeletes).toContain(oldNonce);
  expect(auction.requests.filter(body => body.action === "assemble")).toHaveLength(2);
  expect(auction.requests[2].excludedOptionIds).toEqual([]);
  expect(auction.requests[2].excludedVariantKeys).toEqual([JSON.stringify([880003, "synthetic-exact-780003"])]);
  expect(auction.requests[2].clientRequestId).not.toBe(oldNonce);
});

test("pending assembly recovery has a cancellable loading state before its search is restored", async ({ auction, page }) => {
  await auction.open(); await auction.search(); auction.dropAction = "assemble"; await auction.build.click();
  await expect(auction.assembly.getByRole("button", { name: /Повторить восстановление|Retry recovery/ })).toBeVisible();
  // Opaque per-search recovery must still cancel the exact nonce if a separate
  // active-handle entry was lost or replaced.
  await page.evaluate(() => sessionStorage.removeItem("gildra:auction-active:v1"));
  auction.holdRequestRecovery = true; await page.reload({ waitUntil: "domcontentloaded" });
  const cancel = auction.panel.getByRole("button", { name: /Отменить сборку|Cancel assembly/ });
  await expect(cancel).toBeVisible({ timeout: 15000 });
  await expect(auction.panel.getByRole("status")).toBeVisible(); await cancel.click();
  await expect(auction.find).toBeEnabled(); auction.release();
  await expect.poll(() => auction.nonceDeletes).toContain(auction.requests[1].clientRequestId!);
  await expect(auction.result).toHaveCount(0);
});

test("cancelled nonce prevents work when the POST reaches server admission only after cancellation", async ({ auction }) => {
  await auction.open(); await auction.search(); auction.holdAcceptance = true; await auction.build.click();
  await expect.poll(() => auction.requests.length).toBe(2);
  const pendingNonce = auction.requests[1].clientRequestId!;
  await auction.assembly.getByRole("button", { name: /Отменить сборку|Cancel assembly/ }).click();
  await expect.poll(() => auction.nonceDeletes).toContain(pendingNonce);
  expect(auction.requestLookups).not.toContain(pendingNonce);
  await auction.find.click(); expect(auction.requests).toHaveLength(2);
  auction.release(); await expect.poll(() => auction.requests.length).toBe(3);
  expect(auction.workStarted.filter(action => action === "assemble")).toHaveLength(0);
});

test("confirmed loadout shopping list remains visible with real fonts and no page overflow", async ({ auction, page }, info) => {
  await auction.open(); await auction.search(); await auction.build.click(); await expect(auction.result).toBeVisible();
  await expect(auction.result.getByRole("heading", { name: /Что купить для сета|Items to buy for this loadout/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  const screenshot = info.outputPath("confirmed-loadout.png");
  await page.screenshot({ path: screenshot, fullPage: true }); await info.attach("confirmed-loadout", { path: screenshot, contentType: "image/png" });
});

test("expired nonce retains a still-valid owned search checkpoint after durable cancellation", async ({ auction, page }) => {
  await auction.open(); await auction.search(); auction.dropAction = "assemble"; await auction.build.click();
  await expect(auction.assembly.getByRole("button", { name: /Повторить восстановление|Retry recovery/ })).toBeVisible();
  const nonce = auction.requests[1].clientRequestId!; auction.requestRecoveryMissing = true;
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect.poll(() => auction.nonceDeletes, { timeout: 15000 }).toContain(nonce);
  await expect(auction.panel.locator("[data-auction-search-result]")).toBeVisible();
  await expect(auction.result).toHaveAttribute("data-price-state", "stale");
  await expect(auction.build).toBeEnabled();
  const saved = await page.evaluate(() => JSON.parse(Object.entries(sessionStorage).find(([key]) => key.startsWith("gildra:auction:v1:"))![1]));
  expect(saved.searchId).toBe("synthetic-reliability-search"); expect(saved.clientRequestId).toBeUndefined();
  expect(auction.requests).toHaveLength(2);
  await auction.build.click(); await expect(auction.result).toHaveAttribute("data-price-state", "verified");
  expect(auction.requests[2].action).toBe("assemble"); expect(auction.requests[2].searchId).toBe(saved.searchId);
});

test("missing nonce keeps its recovery handle when durable cancellation acknowledgement fails", async ({ auction, page }) => {
  await auction.open(); await auction.search(); auction.dropAction = "assemble"; await auction.build.click();
  await expect(auction.assembly.getByRole("button", { name: /Повторить восстановление|Retry recovery/ })).toBeVisible();
  const nonce = auction.requests[1].clientRequestId!; auction.requestRecoveryMissing = true; auction.cancelFailure = true;
  await page.reload({ waitUntil: "domcontentloaded" });
  const retry = auction.panel.getByRole("button", { name: /Повторить восстановление|Retry recovery/ });
  await expect(retry).toBeVisible({ timeout: 15000 });
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage }))).toContain(nonce);
  expect(auction.requests).toHaveLength(2);
  auction.requestRecoveryMissing = false; auction.cancelFailure = false;
  await retry.click(); await expect(auction.result).toBeVisible(); expect(auction.requests).toHaveLength(2);
});

test("expired nonce cannot restore an unavailable or foreign-scope search checkpoint", async ({ auction, page }) => {
  await auction.open(); await auction.search(); auction.dropAction = "assemble"; await auction.build.click();
  await expect(auction.assembly.getByRole("button", { name: /Повторить восстановление|Retry recovery/ })).toBeVisible();
  const nonce = auction.requests[1].clientRequestId!; auction.requestRecoveryMissing = true; auction.recoveryFailure = true;
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect.poll(() => auction.nonceDeletes, { timeout: 15000 }).toContain(nonce);
  await expect(auction.panel.getByRole("alert")).toBeVisible(); await expect(auction.panel.locator("[data-auction-search-result]")).toHaveCount(0);
  await expect(auction.find).toBeEnabled(); expect(auction.requests).toHaveLength(2);
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith("gildra:auction:v1:")))).toEqual([]);
});

test("owner conflict never displays a loadout for a different active exclusion selection", async ({ auction }) => {
  await auction.open(); await auction.search(); auction.seedBusyAssembly(["synthetic-780003:WRIST"]);
  await auction.build.click(); await expect(auction.assembly.getByRole("alert")).toContainText(/выполняется|still running/);
  await expect(auction.result).toHaveCount(0); expect(auction.requests.filter(body => body.action === "assemble")).toHaveLength(1);
});

for (const [cachedMode, activeMode] of [["assembly", "search"], ["search", "assembly"]] as const) test(`mode regression: cached ${cachedMode} reconnects to an active owned ${activeMode}`, async ({ auction, page }) => {
  await auction.open(); await auction.seedRecoveryMode(cachedMode, activeMode);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(auction.panel.locator("[data-auction-search-result]")).toContainText(`MODE ${activeMode.toUpperCase()} COMPLETED`, { timeout: 10000 });
  await expect(auction.panel.getByRole("alert")).toHaveCount(0);
  expect(auction.requests).toEqual([]); expect(auction.deletes).toEqual([]);
  if (activeMode === "assembly") await expect(auction.result).toHaveAttribute("data-price-state", "verified");
});

test("mode regression: assembly 409 reconnects to an active owned search", async ({ auction }) => {
  await auction.open(); await auction.search(); auction.seedBusyMode("search", [], true);
  await auction.build.click();
  await expect(auction.panel.locator("[data-auction-search-result]")).toContainText("MODE SEARCH COMPLETED", { timeout: 10000 });
  await expect(auction.panel.getByRole("alert")).toHaveCount(0);
  expect(auction.requests.map(body => body.action)).toEqual(["search", "assemble"]);
});

test("mode regression: resume 409 reconnects to an active owned assembly", async ({ auction }) => {
  await auction.open(); auction.incompleteSearchOnce = true; auction.conflictResumeMode = "assembly"; await auction.search();
  await expect(auction.result).toBeVisible({ timeout: 10000 });
  await expect(auction.panel.locator("[data-auction-search-result]")).toContainText("MODE ASSEMBLY COMPLETED");
  await expect(auction.panel.getByRole("alert")).toHaveCount(0);
  expect(auction.requests.map(body => body.action)).toEqual(["search", "resume"]);
});


test("value: one efficient choice per slot, two alternatives on demand and complete assembly domain", async ({ auction, page }, info) => {
  await auction.open(); auction.valueChoices = true; await auction.search();
  const main = auction.panel.locator('[data-best-value]');
  await expect(main).toHaveAttribute('data-auction-option', 'value-best');
  await page.evaluate(() => window.scrollTo(0, 0));
  expect((await main.boundingBox())!.y).toBeLessThan(1000);
  await expect(auction.panel.getByRole('link', { name: auction.t('К сборке сета', 'Build a loadout'), exact: true })).toBeVisible();
  await expect(auction.panel.locator('[data-auction-option]')).toHaveCount(1);
  await expect(main).toContainText(auction.t('Цена за +1 DPS', 'Cost per +1 DPS'));
  await expect(main).toContainText('20 DPS');
  await expect(main).toContainText(auction.t('0,2 зол.', '0.2 gold'));
  const alternatives = auction.panel.getByRole('button', { name: /альтернативы|alternatives/i });
  await expect(alternatives).toHaveAttribute('aria-expanded', 'false');
  await alternatives.focus(); await page.keyboard.press('Enter');
  await expect(alternatives).toHaveAttribute('aria-expanded', 'true');
  await expect(auction.panel.locator('[data-auction-option]')).toHaveCount(3);
  await expect(auction.panel.locator('[data-auction-option="duplicate"]')).toHaveCount(0);
  await expect(main.locator('input[type="checkbox"]')).toBeHidden();
  await main.locator('summary').click();
  await expect(main.locator('input[type="checkbox"]')).toBeVisible();
  await main.locator('input[type="checkbox"]').click();
  await expect(auction.panel.locator('[data-auction-option="value-best"]')).toHaveCount(0);
  await expect(main).toHaveAttribute('data-auction-option', 'strong');
  await expect(auction.panel.locator('[data-auction-option="duplicate"]')).toHaveCount(0);
  const selected = await page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith("gildra:auction:v1:")).map(([, value]) => JSON.parse(value))[0]);
  expect(selected.excludedOptionIds).toEqual([]); expect(selected.excludedVariantKeys).toEqual([JSON.stringify([880002, "synthetic-value-base"])]);
  await auction.panel.locator('[data-auction-exclusions] > summary').click();
  await auction.panel.locator('[data-excluded-restore]').click();
  await expect(main).toHaveAttribute('data-auction-option', 'value-best');
  await expect(auction.panel.locator('[data-auction-option]')).toHaveCount(3);
  await expect(auction.panel.locator('[data-auction-option="duplicate"]')).toHaveCount(0);
  await alternatives.click();
  await expect(auction.panel.locator('[data-auction-option]')).toHaveCount(1);
  await info.attach('value-interface', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await auction.build.click(); await expect(auction.result).toBeVisible();
  const assembled = auction.requests.find(body => body.action === 'assemble');
  expect(assembled?.excludedOptionIds).toEqual([]); expect(assembled?.excludedVariantKeys).toEqual([]);
  expect(assembled).not.toHaveProperty('allowedOptionIds');
  expect(auction.requests.map(body => body.action)).toEqual(['search', 'assemble']);
});

test("value: slot controls start collapsed and remain usable on a narrow screen", async ({ auction, page }) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  await auction.open();
  const slot = auction.panel.locator('[name="selectedSlots"]').first();
  await expect(slot).toBeHidden();
  await auction.panel.locator('summary').filter({ hasText: /Слоты экипировки|Equipment slots/ }).click();
  await expect(slot).toBeVisible(); await slot.uncheck();
  auction.valueChoices = true; await auction.search();
  await expect(auction.panel.locator('[data-auction-option]')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});


test("value: build immediately from published choices safely retires background discovery", async ({ auction }) => {
  await auction.open(); auction.incompleteSearchOnce = true; auction.holdContinuation = true;
  await auction.search();
  await expect.poll(() => auction.requests.map(body => body.action)).toEqual(['search', 'resume']);
  await expect(auction.build).toBeEnabled();
  await auction.build.click(); auction.release();
  await expect(auction.result).toBeVisible();
  expect(auction.requests.map(body => body.action)).toEqual(['search', 'resume', 'assemble']);
  expect(auction.deletes).toContain('completion-job-2');
  await expect(auction.panel.getByRole('alert')).toHaveCount(0);
});


test("audit fixes: variant checkbox excludes every slot alias, survives reload and reaches assembly", async ({ auction, page }) => {
  auction.aliasVariants = true; await auction.open(); await auction.search();
  const cards = auction.panel.locator('[data-auction-option]');
  for (const card of await cards.all()) await card.locator('summary').click();
  await cards.first().getByRole('checkbox').click();
  await expectExcludedRecommendations(auction);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(auction.panel.locator('[data-auction-search-result]')).toBeVisible();
  for (const card of await cards.all()) await card.locator('summary').click();
  await expectExcludedRecommendations(auction);
  await expect(auction.build).toBeDisabled();
  await auction.assembly.locator('summary').filter({ hasText: /Исключения|Exclusions/ }).click();
  await auction.panel.locator('[data-excluded-restore]').click();
  await expect(cards).toHaveCount(2);
  for (const restoredCard of await cards.all()) await restoredCard.locator('summary').click();
  await expect(cards.nth(1).getByRole('checkbox')).toBeChecked();
  await auction.build.click(); await expect(auction.result).toBeVisible();
  expect(auction.requests.find(body => body.action === 'assemble')?.excludedVariantKeys).toEqual([]);
});

test("audit fixes: selecting during background discovery retires it before assembling", async ({ auction }) => {
  auction.valueChoices = true; auction.incompleteSearchOnce = true; auction.holdContinuation = true;
  await auction.open(); await auction.search();
  await expect.poll(() => auction.requests.map(body => body.action)).toEqual(['search', 'resume']);
  const card = auction.panel.locator('[data-best-value]'); await card.locator('summary').click();
  await expect(card.getByRole('checkbox')).toBeEnabled(); await card.getByRole('checkbox').click();
  await auction.build.click(); auction.release(); await expect(auction.result).toBeVisible();
  expect(auction.deletes).toContain('completion-job-2');
  expect(auction.requests.find(body => body.action === 'assemble')?.excludedVariantKeys).toEqual([JSON.stringify([880002, 'synthetic-value-base'])]);
});

test("audit fixes: hundreds of excluded duplicates stay folded and restore together", async ({ auction, page }) => {
  auction.manyDuplicateLots = true; await auction.open(); await auction.search();
  await auction.assembly.locator('summary').filter({ hasText: /Настроить варианты|Loadout options/ }).click();
  await auction.assembly.getByRole('button', { name: /Исключить все варианты|Exclude all options/, exact: true }).click();
  await expect(auction.build).toBeDisabled();
  await expect(auction.assembly.locator('[data-assembly-disabled-reason]')).toBeVisible();
  await expect(auction.panel.locator('[data-excluded-restore]')).toHaveCount(0);
  await auction.assembly.locator('summary').filter({ hasText: /Исключения|Exclusions/ }).click();
  await expect(auction.panel.locator('[data-excluded-restore]')).toHaveCount(1);
  expect((await auction.panel.boundingBox())!.height).toBeLessThan(4500);
  await auction.panel.locator('[data-excluded-restore]').click(); await expect(auction.build).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("audit fixes: value is default objective and maximum DPS is an explicit search choice", async ({ auction }) => {
  await auction.open();
  await auction.panel.locator('summary').filter({ hasText: /Слоты экипировки|Equipment slots/ }).click();
  const objective = auction.panel.locator('select[name="objective"]'); await expect(objective).toHaveValue('value');
  await objective.selectOption('dps'); await auction.search();
  expect(auction.requests[0].objective).toBe('dps');
  await expect(auction.assembly).toContainText(auction.t('наибольший подтверждённый DPS', 'highest confirmed DPS'));
});


for (const maximum of ["confirmed", "unconfirmed"] as const) test(`audit fixes: value result explains a ${maximum} maximum-DPS diagnostic accurately`, async ({ auction }) => {
  auction.valueMaximum = maximum; await auction.open(); await auction.search();
  await expect(auction.assembly).toContainText(auction.t('Иногда выгоднее одна замена', 'Sometimes one replacement offers better value'));
  await auction.build.click(); await expect(auction.result).toBeVisible();
  await auction.result.locator('summary').filter({ hasText: /максимальным измеренным DPS|highest measured DPS/ }).click();
  await expect(auction.result).toContainText(maximum === 'confirmed'
    ? auction.t('сет выгоднее по цене за прирост DPS', 'offers better value per DPS gained')
    : auction.t('Его прирост не подтверждён', 'Its gain is not confirmed'));
  await expect(auction.result).toContainText(auction.t('Цена за +1 DPS всего сета', 'Whole-loadout cost per +1 DPS'));
});


for (const handle of ["job", "nonce"] as const) test(`postfix fixes: pending ${handle} recovery preserves original form intent before a result`, async ({ auction, page }, info) => {
  await auction.open();
  await auction.panel.locator('[name="budgetGold"]').fill(auction.t('333,33', '333.33'));
  await auction.panel.locator('form select').first().selectOption('aoe');
  await auction.panel.locator('summary').filter({ hasText: /Слоты экипировки|Equipment slots/ }).click();
  await auction.panel.locator('[name="objective"]').selectOption('dps');
  await auction.panel.getByRole('button', { name: /Снять выбор|Clear selection/, exact: true }).click();
  await auction.panel.locator('[name="selectedSlots"][value="WRIST"]').check();
  auction.pendingInitial = true; auction.holdPost = handle === 'nonce'; await auction.find.click();
  await expect.poll(() => auction.requests.length).toBe(1);
  if (handle === 'job') await expect.poll(() => page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith('gildra:auction:v1:')).some(([, value]) => Boolean(JSON.parse(value).jobId)))).toBe(true);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(auction.panel.locator('[name="budgetGold"]')).toHaveValue('333.33');
  await expect(auction.panel.locator('form select').first()).toHaveValue('aoe');
  await auction.panel.locator('summary').filter({ hasText: /Слоты экипировки|Equipment slots/ }).click();
  await expect(auction.panel.locator('[name="objective"]')).toHaveValue('dps');
  await expect(auction.panel.locator('[name="selectedSlots"]:checked')).toHaveCount(1);
  await expect(auction.panel.locator('[name="selectedSlots"][value="WRIST"]')).toBeChecked();
  await info.attach(`pending-${handle}-intent`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await auction.panel.getByRole('button', { name: /Отменить поиск|Cancel search/ }).click();
  auction.pendingInitial = false; auction.release(); await auction.find.click();
  await expect.poll(() => auction.requests.length).toBe(2);
  expect(auction.requests[1]).toMatchObject({ budgetGold: '333.33', scenario: 'aoe', objective: 'dps', selectedSlots: ['WRIST'] });
});

for (const levels of ["same", "different"] as const) test(`postfix fixes: excluded ${levels}-level exact variants remain distinguishable with keyboard details`, async ({ auction, page }, info) => {
  auction.excludedVariantLevels = levels; await auction.open(); await auction.search();
  await auction.assembly.locator('summary').filter({ hasText: /Настроить варианты|Loadout options/ }).click();
  await auction.assembly.getByRole('button', { name: /Исключить все варианты|Exclude all options/, exact: true }).click();
  await auction.assembly.locator('summary').filter({ hasText: /Исключения|Exclusions/ }).click();
  const rows = auction.assembly.locator('[data-excluded-restore]').locator('..'); await expect(rows).toHaveCount(2);
  const restores = auction.panel.locator('[data-excluded-restore]');
  const names = await restores.evaluateAll(elements => elements.map(element => element.getAttribute('aria-label') ?? element.textContent));
  expect(new Set(names).size).toBe(2);
  await expect(rows.nth(0)).toContainText(auction.t('Критический удар', 'Critical strike'));
  await expect(rows.nth(1)).toContainText(auction.t('Скорость', 'Haste'));
  await info.attach(`identified-exclusion-pair-${levels}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  const details = rows.nth(1).getByRole('button', { name: /Описание предмета|Item details/ });
  await details.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toContainText(auction.t('Скорость', 'Haste'));
  await info.attach(`excluded-exact-tooltip-${levels}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await page.keyboard.press('Escape'); await restores.nth(1).focus(); await page.keyboard.press('Enter');
  await expect(restores).toHaveCount(1); await expect(auction.build).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await info.attach(`identified-exclusions-${levels}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
});


test("postfix fixes: pending form intent remains bound to character locale and profile", async ({ auction, page }) => {
  await auction.open();
  for (const binding of ['character', 'locale', 'profile']) {
    auction.pendingInitial = true;
    await auction.panel.locator('[name="budgetGold"]').fill('333.33'); await auction.find.click();
    await expect.poll(() => page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith('gildra:auction:v1:')).some(([, value]) => Boolean(JSON.parse(value).jobId)))).toBe(true);
    await page.evaluate(binding => {
      const [key, json] = Object.entries(sessionStorage).find(([key]) => key.startsWith('gildra:auction:v1:'))!;
      const value = JSON.parse(json);
      if (binding === 'character') value.formIntent.characterSlug = 'synthetic-other-character';
      else if (binding === 'locale') value.formIntent.locale = value.formIntent.locale === 'en' ? 'ru' : 'en';
      else value.profileKey = 'synthetic-other-profile';
      sessionStorage.setItem(key, JSON.stringify(value));
    }, binding);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(auction.panel.locator('[name="budgetGold"]')).toHaveValue('10000');
    await expect(auction.panel.locator('form select').first()).toHaveValue('single-target');
    const cancel = auction.panel.getByRole('button', { name: /Отменить поиск|Cancel search/ });
    if (binding !== 'profile') await cancel.click();
    await expect(auction.find).toBeEnabled();
    auction.pendingInitial = false; auction.release();
  }
});


test("postfix fixes: new search intent survives reload while a prior job is still retiring", async ({ auction, page }) => {
  await auction.open();
  await page.evaluate(locale => sessionStorage.setItem('gildra:auction-active:v1', JSON.stringify({ characterSlug:'eu--synthetic-reliability--synthetic', locale, id:'prior-held-job' })), auction.language);
  await auction.panel.locator('[name="budgetGold"]').fill('333.33');
  await auction.panel.locator('form select').first().selectOption('aoe');
  await auction.panel.locator('summary').filter({ hasText: /Слоты экипировки|Equipment slots/ }).click();
  await auction.panel.locator('[name="objective"]').selectOption('dps');
  auction.holdPriorDelete = true; await auction.find.click();
  await expect.poll(() => auction.deletes).toContain('prior-held-job'); expect(auction.requests).toHaveLength(0);
  const storedIntent = await page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith('gildra:auction:v1:')).map(([, json]) => JSON.parse(json).formIntent)[0]);
  expect(storedIntent).toMatchObject({ budgetGold:'333.33', scenario:'aoe', objective:'dps' });
  await page.reload({ waitUntil: 'networkidle' });
  await expect(auction.panel.locator('[name="budgetGold"]')).toHaveValue('333.33');
  await expect(auction.panel.locator('form select').first()).toHaveValue('aoe');
  auction.release();
  // Reload can abort the old keepalive DELETE before its acknowledgement arrives.
  // The preserved owner must then be explicitly retired, rather than silently unlocked.
  const retryCancellation = auction.panel.getByRole('button', { name: /Повторить отмену|Retry cancellation/ });
  await expect.poll(async () => await auction.find.isEnabled() || await retryCancellation.isVisible(), { timeout: 15000 }).toBe(true);
  if (await retryCancellation.isVisible()) {
    await expect(auction.find).toBeDisabled(); expect(auction.requests).toHaveLength(0);
    await retryCancellation.click();
  }
  await expect(auction.find).toBeEnabled(); const beforeRetry = auction.requests.length; await auction.find.click();
  await expect.poll(() => auction.requests.length).toBe(beforeRetry + 1);
  expect(auction.requests.at(-1)).toMatchObject({ budgetGold:'333.33', scenario:'aoe', objective:'dps' });
  expect(auction.nonceDeletes).not.toContain(auction.requests.at(-1)!.clientRequestId);
});

for (const source of ["known job", "unaccepted nonce"] as const) test(`regression: rejected cancellation retains ${source}, blocks replacement POST and retries after reload`, async ({ auction, page }, info) => {
  auction.pendingInitial = source === "known job"; auction.holdAcceptance = source === "unaccepted nonce";
  await auction.open(); await auction.find.click(); await expect.poll(() => auction.requests.length).toBe(1);
  if (source === "known job") await expect.poll(() => page.evaluate(() => Object.entries(sessionStorage).some(([k,v]) => k.startsWith("gildra:auction:v1:") && Boolean(JSON.parse(v).jobId)))).toBe(true);
  const nonce = auction.requests[0].clientRequestId!;
  auction.cancelFailure = true; await auction.panel.getByRole("button", { name: /Отменить поиск|Cancel search/ }).click();
  const retry = auction.panel.getByRole("button", { name: /Повторить отмену|Retry cancellation/ });
  await expect(retry).toBeVisible(); await expect(auction.find).toBeDisabled();
  await expect(auction.panel.getByRole("alert")).toContainText(/не подтверждена|not confirmed/i);
  const saved = await page.evaluate(() => Object.entries(sessionStorage).filter(([k]) => k.startsWith("gildra:auction:v1:")).map(([,v]) => JSON.parse(v)));
  expect(saved).toHaveLength(1); expect(saved[0].clientRequestId).toBe(nonce); expect(saved[0].cancellationRequested).toBe(true);
  expect(auction.requests).toHaveLength(1);
  if (source === "known job") { await page.reload({ waitUntil: "networkidle" }); await expect(retry).toBeVisible(); await expect(auction.find).toBeDisabled(); }
  await info.attach("unconfirmed-cancellation", { body: await page.screenshot({fullPage:true}), contentType:"image/png" });
  auction.cancelFailure = false; await retry.focus(); await page.keyboard.press("Enter"); await expect(auction.find).toBeEnabled();
  await auction.find.click(); auction.release(); await expect.poll(() => auction.requests.length).toBe(2);
  expect(auction.requests[1].clientRequestId).not.toBe(nonce);
  expect(auction.workStarted.filter(action => action === "search")).toHaveLength(source === "known job" ? 2 : 1);
});

for (const change of ["select all", "equivalent budget"] as const) test(`regression: no-op ${change} preserves completed set, exact exclusions and recovery`, async ({ auction, page }) => {
  await auction.open(); await auction.search(); const card = auction.panel.locator('[data-auction-option]'); await card.locator('summary').click(); await card.getByRole('checkbox').click();
  await auction.build.click(); await expect(auction.result).toBeVisible();
  const before = await page.evaluate(() => Object.fromEntries(Object.entries(sessionStorage)));
  if (change === "select all") { await auction.panel.locator('summary').filter({hasText:/Слоты экипировки|Equipment slots/}).click(); await auction.panel.getByRole('button',{name:/Выбрать все|Select all/,exact:true}).click(); }
  else await auction.panel.locator('[name="budgetGold"]').fill(auction.t('10 000','10,000'));
  await expect(auction.result).toBeVisible(); await expectExcludedRecommendations(auction);
  expect(await page.evaluate(() => Object.fromEntries(Object.entries(sessionStorage)))).toEqual(before); expect(auction.requests).toHaveLength(2);
  await page.reload({waitUntil:'networkidle'}); await expect(auction.result).toBeVisible(); await expectExcludedRecommendations(auction);
});

test("regression: cancellation waits for the DELETE acknowledgement before unlocking", async ({ auction, page }) => {
 auction.pendingInitial = true; await auction.open(); await auction.find.click();
 await expect.poll(() => page.evaluate(() => Object.entries(sessionStorage).some(([k,v]) => k.startsWith('gildra:auction:v1:') && Boolean(JSON.parse(v).jobId)))).toBe(true);
 auction.holdCancel = true; await auction.panel.getByRole('button',{name:/Отменить поиск|Cancel search/}).click();
 await expect(auction.find).toBeDisabled(); await expect(auction.panel.getByRole('status')).toContainText(/Подтверждаем|Confirming/);
 expect(await page.evaluate(() => Object.entries(sessionStorage).filter(([k])=>k.startsWith('gildra:auction:v1:')).map(([,v])=>JSON.parse(v))[0].jobId)).toBe('completion-job-1');
 auction.release(); await expect(auction.find).toBeEnabled(); await expect(auction.panel.getByRole('status')).toContainText(/отменён|cancelled/); expect(auction.requests).toHaveLength(1);
});
test("regression: prior scope retirement failure keeps its global owner and blocks a fresh POST", async ({ auction, page }) => {
 await auction.open(); await page.evaluate(() => sessionStorage.setItem('gildra:auction-active:v1',JSON.stringify({characterSlug:'older-scope',locale:'en',id:'prior-held-job'})));
 auction.cancelFailure = true; await auction.find.click(); const retry = auction.panel.getByRole('button',{name:/Повторить отмену|Retry cancellation/});
 await expect(retry).toBeVisible(); await expect(auction.find).toBeDisabled(); expect(auction.requests).toHaveLength(0);
 expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('gildra:auction-active:v1')!).id)).toBe('prior-held-job');
 auction.cancelFailure = false; await retry.click(); await expect(auction.find).toBeEnabled(); await auction.search(); expect(auction.requests).toHaveLength(1); expect(auction.deletes).toContain('prior-held-job');
});
test("regression: actual budget changes clear results while invalid drafts suspend actions", async ({ auction }) => {
 await auction.open(); await auction.search(); await auction.build.click(); await expect(auction.result).toBeVisible();
 await auction.panel.locator('[name="budgetGold"]').fill('9999'); await expect(auction.result).toHaveCount(0); await expect(auction.panel.locator('[data-auction-search-result]')).toHaveCount(0);
 await auction.search(); expect(auction.requests.at(-1)?.budgetGold).toBe('9999');
 await auction.panel.locator('[name="budgetGold"]').fill('invalid'); await expect(auction.find).toBeDisabled(); await expect(auction.build).toBeDisabled(); await expect(auction.panel.getByRole('alert')).toContainText(/золот|gold/); await expect(auction.panel.locator('[data-auction-search-result]')).toBeVisible();
});
test("regression: oversized selection provides an actionable localized message", async ({ auction }) => {
 await auction.open(); await auction.search(); auction.oversizedNext = true; await auction.build.click();
 await expect(auction.panel.getByRole('alert')).toContainText(/Список исключений слишком велик|exclusion list is too large/);
 await expect(auction.panel.getByRole('alert')).toContainText(/Уменьшите|Reduce/); await expect(auction.build).toBeEnabled();
});

test("regression: canonical wire exclusions stay compact while409 and reload use exact original keys", async ({ auction, page }) => {
 auction.canonicalVariant = true; await auction.open(); await auction.search(); const card = auction.panel.locator('[data-auction-option]'); await card.locator('summary').click(); await card.getByRole('checkbox').click();
 const key = JSON.stringify([880003,`auction:${'a'.repeat(32)}`]); auction.seedBusyAssembly(); auction.serverVariantExclusions = [key];
 await auction.build.click(); await expect(auction.result).toBeVisible(); const sent = auction.requests.at(-1)!;
 expect(sent.excludedVariantKeys).toEqual([]); expect(sent.excludedVariantIds).toEqual([[880003,'a'.repeat(32)]]); expect(sent.excludedOptionIds).toEqual([]);
 expect(await page.evaluate(() => Object.entries(sessionStorage).filter(([k])=>k.startsWith('gildra:auction:v1:')).map(([,v])=>JSON.parse(v))[0].excludedVariantKeys)).toEqual([key]);
 await page.reload({waitUntil:'networkidle'}); await expect(auction.result).toBeVisible(); await expect(auction.panel.getByRole('alert')).toHaveCount(0); await expectExcludedRecommendations(auction);
 expect(auction.requests.filter(body=>body.action==='assemble')).toHaveLength(1);
});
test("regression: cancellation retry after reload preserves its existing search checkpoint and exclusions", async ({ auction, page }) => {
 await auction.open(); await auction.search(); const card = auction.panel.locator('[data-auction-option]'); await card.locator('summary').click(); await card.getByRole('checkbox').click();
 auction.holdAcceptance = true; await auction.build.click(); await expect.poll(()=>auction.requests.length).toBe(2); const nonce = auction.requests[1].clientRequestId!;
 auction.cancelFailure = true; await auction.assembly.getByRole('button',{name:/Отменить сборку|Cancel assembly/}).click(); const retry = auction.panel.getByRole('button',{name:/Повторить отмену|Retry cancellation/}); await expect(retry).toBeVisible();
 await page.reload({waitUntil:'networkidle'}); await expect(retry).toBeVisible(); await expect(auction.find).toBeDisabled(); auction.cancelFailure = false; await retry.click(); auction.release();
 await expect(auction.panel.locator('[data-auction-search-result]')).toBeVisible(); await expectExcludedRecommendations(auction); await expect(auction.build).toBeEnabled();
 expect(auction.requests).toHaveLength(2); expect(auction.nonceDeletes).toContain(nonce);
 const saved = await page.evaluate(()=>Object.entries(sessionStorage).filter(([k])=>k.startsWith('gildra:auction:v1:')).map(([,v])=>JSON.parse(v))[0]); expect(saved.searchId).toBe('synthetic-reliability-search'); expect(saved.cancellationRequested).toBeUndefined(); expect(saved.excludedVariantKeys).toHaveLength(1);
});

for (const rejected of [true,false]) test(`regression: changed form preserves scoped-only retirement and new draft after ${rejected ? 'rejected' : 'successful'} acknowledgement`, async ({ auction, page }) => {
 await auction.open(); await auction.search(); auction.pendingInitial=true; auction.dropAction='assemble'; await auction.build.click(); await expect(auction.panel.getByRole('button',{name:/Повторить восстановление|Retry recovery/})).toBeVisible(); const nonce=auction.requests[1].clientRequestId!;
 await page.evaluate(()=>sessionStorage.removeItem('gildra:auction-active:v1')); auction.cancelFailure=rejected;
 await auction.panel.locator('[name="budgetGold"]').fill('9999');
 const retry=auction.panel.getByRole('button',{name:/Повторить отмену|Retry cancellation/});
 if(rejected){
  await expect(retry).toBeVisible(); await expect(auction.find).toBeDisabled();
  const saved=await page.evaluate(()=>Object.entries(sessionStorage).filter(([k])=>k.startsWith('gildra:auction:v1:')).map(([,v])=>JSON.parse(v))[0]); expect(saved.clientRequestId).toBe(nonce); expect(saved.cancellationRequested).toBe(true); expect(saved.formIntent.budgetGold).toBe('9999');
  await page.reload({waitUntil:'networkidle'}); await expect(retry).toBeVisible(); await expect(auction.find).toBeDisabled(); await expect(auction.panel.locator('[name="budgetGold"]')).toHaveValue('9999'); expect(auction.requests).toHaveLength(2);
  auction.cancelFailure=false; await retry.click();
 }
 await expect(auction.find).toBeEnabled(); await page.reload({waitUntil:'networkidle'}); await expect(auction.find).toBeEnabled();
 await expect(auction.panel.locator('[name="budgetGold"]')).toHaveValue('9999'); await expect(auction.panel.locator('[data-auction-search-result]')).toHaveCount(0); expect(auction.requests).toHaveLength(2);
 expect(auction.nonceDeletes).toContain(nonce); auction.pendingInitial=false; await auction.search(); expect(auction.requests).toHaveLength(3); expect(auction.requests[2].budgetGold).toBe('9999'); expect(auction.requests[2].clientRequestId).not.toBe(nonce);
});

for (const spelling of ["fractional-zero", "leading-zero", "fractional-precision"] as const) test(`three-fix regression: equal budget ${spelling} preserves completed loadout and explicit choices`, async ({ auction, page }, info) => {
  const initial = spelling === "fractional-precision" ? auction.t("10000,12", "10000.12") : "10000";
  await auction.open(); await auction.panel.locator('[name="budgetGold"]').fill(initial); await auction.search();
  await auction.build.click(); await expect(auction.result).toBeVisible();
  // A physical-lot exclusion is cached independently of the currently displayed set.
  await auction.panel.getByRole("button", { name: /Исключить лот из сборки|Exclude lot from loadout/ }).first().click();
  const before = await page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith("gildra:auction:v1:")));
  expect(JSON.parse(before[0][1]).excludedOptionIds.length).toBeGreaterThan(0);
  const draft = spelling === "fractional-zero" ? auction.t("10000,0", "10000.0") : spelling === "leading-zero" ? "010000" : auction.t("10000,1200", "10000.1200");
  await auction.panel.locator('[name="budgetGold"]').fill(draft);
  await expect(auction.panel.locator('[data-auction-search-result]')).toBeVisible();
  expect(await page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith("gildra:auction:v1:")))).toEqual(before);
  await expect(auction.panel.locator('summary').filter({ hasText: /Исключения|Exclusions/ })).toBeVisible();
  await auction.build.click(); await expect(auction.result).toBeVisible();
  const resultBefore = await auction.result.textContent(); const requestsBefore = auction.requests.length;
  await auction.panel.locator('[name="budgetGold"]').fill(initial);
  expect(await auction.result.textContent()).toBe(resultBefore); expect(auction.requests).toHaveLength(requestsBefore);
  await page.screenshot({ path: info.outputPath(`equal-${spelling}.png`), fullPage: true });
});

for (const control of ["Private optimizer unmount", "Private snapshot change", "Private locale change"] as const) test(`three-fix regression: acknowledged cancellation cannot start assembly after ${control}`, async ({ auction, page }, info) => {
  await auction.open(true); auction.incompleteSearchOnce = true; auction.holdContinuation = true;
  await auction.search(); await expect.poll(() => auction.requests.some(body => body.action === "resume")).toBe(true);
  auction.holdCancel = true; await auction.build.click();
  await expect.poll(() => auction.cancellationRequests.length).toBeGreaterThan(0);
  const before = auction.requests.length;
  await page.getByRole("button", { name: control, exact: true }).click();
  if (control === "Private optimizer unmount") await expect(auction.panel).toHaveCount(0);
  else await expect(auction.find).toBeEnabled();
  auction.release();
  await expect.poll(() => auction.deletes).toContain("completion-job-2");
  // Observe beyond the normal polling interval: no detached POST or delayed poll may appear.
  await page.waitForTimeout(1800);
  expect(auction.requests).toHaveLength(before);
  expect(auction.requests.filter(body => body.action === "assemble")).toEqual([]);
  await info.attach("retired-scope-network", { body: JSON.stringify({ requests: auction.requests, cancellationRequests: auction.cancellationRequests, deletes: auction.deletes }), contentType: "application/json" });
  await page.screenshot({ path: info.outputPath("retired-scope.png"), fullPage: true });
});

test("three-fix control: acknowledged cancellation builds once while its scope remains mounted", async ({ auction }) => {
  await auction.open(); auction.incompleteSearchOnce = true; auction.holdContinuation = true;
  await auction.search(); await expect.poll(() => auction.requests.some(body => body.action === "resume")).toBe(true);
  auction.holdCancel = true; await auction.build.click(); await expect.poll(() => auction.cancellationRequests.length).toBeGreaterThan(0);
  expect(auction.requests.filter(body => body.action === "assemble")).toEqual([]);
  auction.release(); await expect(auction.result).toBeVisible();
  expect(auction.requests.filter(body => body.action === "assemble")).toHaveLength(1);
});

test("three-fix stale-ACK regression: retired cancellation cannot overwrite a newer snapshot intent before POST or reload", async ({ auction, page }, info) => {
  await auction.open(true); auction.incompleteSearchOnce = true; auction.holdContinuation = true;
  await auction.search(); await expect.poll(() => auction.requests.some(body => body.action === "resume")).toBe(true);
  const oldNonce = auction.requests[1].clientRequestId!;
  let holdAcknowledgements = true; const acknowledgements: Array<() => void> = [];
  await page.route("**/api/wow/auction-gear-plans**", async route => {
    if (route.request().method() === "DELETE" && holdAcknowledgements) await new Promise<void>(resolve => acknowledgements.push(resolve));
    await route.fallback();
  });
  await auction.build.click(); await expect.poll(() => acknowledgements.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Private snapshot change", exact: true }).click(); await expect(auction.find).toBeEnabled();
  await auction.panel.locator('[name="budgetGold"]').fill("9000"); await auction.find.click();
  const readCache = () => page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith("gildra:auction:v1:")).map(([, value]) => JSON.parse(value))[0]);
  const newer = await readCache(); expect(newer.profileKey).toBe("synthetic-reliability:1"); expect(newer.formIntent.budgetGold).toBe("9000");
  expect(newer.clientRequestId).not.toBe(oldNonce); expect(auction.requests).toHaveLength(2);
  holdAcknowledgements = false; for (const acknowledge of acknowledgements.splice(0)) acknowledge();
  await expect.poll(() => auction.nonceDeletes).toContain(oldNonce); await page.waitForTimeout(100);
  const after = await readCache();
  await info.attach("old-ACK-new-intent", { body: JSON.stringify({ newer, after, requests: auction.requests, deletes: auction.nonceDeletes }), contentType: "application/json" });
  expect(after).toEqual(newer); expect(auction.requests).toHaveLength(2);
  // Keep the prior POST held; reload into the same server-side snapshot to recover the newer intent.
  await page.goto(`/?lang=${auction.language}&controls=1&snapshot=1`, { waitUntil: "networkidle" });
  await expect(auction.find).toBeEnabled(); await expect(auction.panel.locator('[name="budgetGold"]')).toHaveValue("9000");
  expect(auction.requests).toHaveLength(2); auction.release(); await auction.search();
  expect(auction.requests.at(-1)?.budgetGold).toBe("9000"); expect(auction.requests.some(body => body.action === "assemble")).toBe(false);
});

test("three-fix late-error regression: retired POST503 preserves a newer retired snapshot intent", async ({ auction, page }, info) => {
  await auction.open(true); auction.incompleteSearchOnce = true; auction.holdContinuation = true; auction.lateResumeHttpError = true;
  await auction.search(); await expect.poll(() => auction.requests.some(body => body.action === "resume")).toBe(true);
  const oldNonce = auction.requests[1].clientRequestId!;
  await auction.build.click(); await expect.poll(() => auction.nonceDeletes).toContain(oldNonce);
  await page.getByRole("button", { name: "Private snapshot change", exact: true }).click(); await expect(auction.find).toBeEnabled();
  await auction.panel.locator('[name="budgetGold"]').fill("9000"); await auction.find.click();
  const readCache = () => page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith("gildra:auction:v1:")).map(([, value]) => JSON.parse(value))[0]);
  const newer = await readCache(); expect(newer.profileKey).toBe("synthetic-reliability:1"); expect(newer.formIntent.budgetGold).toBe("9000"); expect(newer.clientRequestId).not.toBe(oldNonce);
  await page.getByRole("button", { name: "Private optimizer unmount", exact: true }).click(); await expect(auction.panel).toHaveCount(0);
  auction.release(); await expect.poll(() => auction.resumeHttpErrorsServed).toBe(1); await page.waitForTimeout(100);
  const after = await readCache(); await info.attach("retired-late-503", { body: JSON.stringify({ newer, after, requests: auction.requests }), contentType: "application/json" });
  expect(after).toEqual(newer); expect(auction.requests).toHaveLength(2);
  await page.goto(`/?lang=${auction.language}&controls=1&snapshot=1`, { waitUntil: "networkidle" });
  await expect(auction.find).toBeEnabled(); await expect(auction.panel.locator('[name="budgetGold"]')).toHaveValue("9000");
});

for (const rejected of [false, true]) test(`three-fix late-error regression: retired failed-job cleanup ${rejected ? '503' : '200'} preserves newer snapshot intent`, async ({ auction, page }, info) => {
  await auction.open(true); await auction.search(); auction.fail = true; auction.holdCancel = true;
  await auction.build.click(); await expect.poll(() => auction.cancellationRequests.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Private snapshot change", exact: true }).click(); await expect(auction.find).toBeEnabled();
  await auction.panel.locator('[name="budgetGold"]').fill("9000"); await auction.find.click();
  const readCache = () => page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith("gildra:auction:v1:")).map(([, value]) => JSON.parse(value))[0]);
  const newer = await readCache(); expect(newer.profileKey).toBe("synthetic-reliability:1"); expect(newer.formIntent.budgetGold).toBe("9000");
  await page.getByRole("button", { name: "Private optimizer unmount", exact: true }).click(); await expect(auction.panel).toHaveCount(0);
  auction.fail = false; auction.cancelFailure = rejected; auction.release(); await page.waitForTimeout(300);
  const after = await readCache(); await info.attach("retired-catch-cleanup", { body: JSON.stringify({ rejected, newer, after, requests: auction.requests, cancellationRequests: auction.cancellationRequests }), contentType: "application/json" });
  expect(after).toEqual(newer); expect(auction.requests).toHaveLength(2);
  auction.cancelFailure = false;
  await page.goto(`/?lang=${auction.language}&controls=1&snapshot=1`, { waitUntil: "networkidle" });
  await expect(auction.find).toBeEnabled(); await expect(auction.panel.locator('[name="budgetGold"]')).toHaveValue("9000");
});


test("five-speed regression: typed equivalent decimal keeps completed result and cache across invalid intermediate draft", async ({ auction, page }, info) => {
  await auction.open(); await auction.search(); await auction.build.click(); await expect(auction.result).toBeVisible();
  const input = auction.panel.locator('[name="budgetGold"]');
  const beforeResult = await auction.result.textContent();
  const readCache = () => page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith("gildra:auction:v1:")));
  const beforeCache = await readCache(); const beforeRequests = auction.requests.length;
  // Pasted/fill equivalent is a control for the earlier atomic normalization fix.
  await input.fill(auction.t("10000,0", "10000.0")); await expect(auction.result).toBeVisible(); await input.fill("10000");
  await input.press("End"); await input.pressSequentially(auction.t(",", "."));
  await expect(auction.result).toBeVisible();
  await expect(input).toHaveAttribute("aria-invalid", "true"); await expect(auction.find).toBeDisabled(); await expect(auction.build).toBeDisabled();
  expect(await readCache()).toEqual(beforeCache);
  await input.pressSequentially("0");
  await expect(input).not.toHaveAttribute("aria-invalid", "true"); await expect(auction.find).toBeEnabled(); await expect(auction.build).toBeEnabled();
  expect(await auction.result.textContent()).toBe(beforeResult); expect(await readCache()).toEqual(beforeCache); expect(auction.requests).toHaveLength(beforeRequests);
  await page.screenshot({ path: info.outputPath("typed-equivalent-preserved.png"), fullPage: true });
});

test("five-speed regression: pinned item remains in viewport and interactive after portrait to landscape rotation", async ({ auction, page }, info) => {
  await auction.open(); await auction.search(); await auction.build.click(); await expect(auction.result).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const actualTrigger = auction.result.getByRole("button", { name: /Описание предмета|Item details/ }).first();
  await actualTrigger.click(); const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  const close = dialog.getByRole("button", { name: /Закрыть описание предмета|Close item details/ });
  await expect(close).toBeVisible();
  await expect.poll(() => dialog.evaluate(node => { const r = node.getBoundingClientRect(); return r.top >= 11 && r.bottom <= innerHeight - 11 && r.left >= 11 && r.right <= innerWidth - 11; })).toBe(true);
  await expect.poll(() => dialog.evaluate(node => getComputedStyle(node).pointerEvents)).toBe("auto");
  await page.screenshot({ path: info.outputPath("landscape-pinned-accessible.png") });
  await close.click(); await expect(dialog).toHaveCount(0); await expect(actualTrigger).toBeFocused();
});


test("five-speed control: invalid budget preserves excluded variants through correction and reload, changed amount clears them", async ({ auction, page }) => {
  await auction.open(); await auction.search(); const card = auction.panel.locator('[data-auction-option]');
  await card.locator("summary").click(); await card.getByRole("checkbox").click();
  const readCache = () => page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith("gildra:auction:v1:")).map(([,value]) => JSON.parse(value))[0]);
  const saved = await readCache(); expect(saved.excludedVariantKeys).toHaveLength(1);
  const input = auction.panel.locator('[name="budgetGold"]'); await input.fill(auction.t("10000,", "10000."));
  await expectExcludedRecommendations(auction); await expect(auction.find).toBeDisabled(); expect(await readCache()).toEqual(saved);
  await input.pressSequentially("0000"); await expectExcludedRecommendations(auction); await expect(auction.find).toBeEnabled();
  await page.reload({ waitUntil: "networkidle" }); await expectExcludedRecommendations(auction);
  await expect(input).toHaveValue("10000"); expect(auction.requests).toHaveLength(1);
  await input.fill(auction.t("10000,", "10000.")); await input.pressSequentially("1");
  await expect(auction.panel.locator('[data-auction-search-result]')).toHaveCount(0); await expect(auction.find).toBeEnabled();
  await auction.search(); expect(auction.requests.at(-1)?.budgetGold).toBe("10000.1");
  await expect(auction.panel.locator('[data-auction-option] input[type="checkbox"]')).toBeChecked();
});

test("five-speed control: empty or invalid draft disables submit, resume and assembly without losing previous facts", async ({ auction, page }) => {
  await auction.open(); await auction.search(); await auction.build.click(); await expect(auction.result).toBeVisible();
  const input = auction.panel.locator('[name="budgetGold"]'); const count = auction.requests.length;
  for (const value of ["", "wrong", auction.t("10000,", "10000.")]) {
    await input.fill(value); await expect(auction.find).toBeDisabled(); await expect(auction.build).toBeDisabled(); await expect(input).toHaveAttribute("aria-invalid", "true");
    // The controller must guard even a programmatic/native form submit, not just disabled button clicks.
    await input.evaluate(node => (node as HTMLInputElement).form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await expect(auction.result).toBeVisible(); expect(auction.requests).toHaveLength(count);
  }
  await input.fill("10000"); await expect(auction.find).toBeEnabled(); await expect(auction.build).toBeEnabled();
});

test("five-speed control: invalid draft preserves accepted lost-response nonce and blocks reconnect until corrected", async ({ auction, page }) => {
  await auction.open(); await auction.search(); auction.dropAction = "assemble"; await auction.build.click();
  const retry = auction.panel.getByRole("button", { name: /Повторить восстановление|Retry recovery/ }); await expect(retry).toBeVisible();
  const before = await page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith("gildra:auction:v1:")));
  const input = auction.panel.locator('[name="budgetGold"]'); await input.fill(auction.t("10000,", "10000."));
  await expect(retry).toBeDisabled(); expect(await page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith("gildra:auction:v1:")))).toEqual(before);
  expect(auction.cancellationRequests).toHaveLength(0); await input.pressSequentially("0"); await retry.click(); await expect(auction.result).toBeVisible();
  expect(auction.requests.filter(body => body.action === "assemble")).toHaveLength(1);
});

for (const motion of ["reduce", "no-preference"] as const) test(`five-speed control: pinned weapon supports short viewport scrolling and keyboard dismissal with motion ${motion}`, async ({ auction, page }, info) => {
  await page.emulateMedia({ reducedMotion: motion });
  await page.goto(`/?lang=${auction.language}&tooltip=1&weapon=1`, { waitUntil: "networkidle" }); await page.evaluate(() => document.fonts.ready);
  const trigger = page.getByRole("button", { name: /Synthetic exact weapon/ }); await trigger.focus(); await trigger.press("Enter");
  const dialog = page.getByRole("dialog"), close = dialog.getByRole("button", { name: /Закрыть описание предмета|Close item details/ });
  await expect(close).toBeFocused();
  for (const viewport of [{width:844,height:390},{width:1440,height:320},{width:390,height:260}]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => dialog.evaluate(node => { const r = node.getBoundingClientRect(); return r.top >= 11 && r.bottom <= innerHeight - 11 && r.left >= 11 && r.right <= innerWidth - 11; })).toBe(true);
    await expect(close).toBeVisible();
  }
  const metrics = await dialog.evaluate(node => ({ height: node.clientHeight, content: node.scrollHeight })); expect(metrics.content).toBeGreaterThan(metrics.height);
  const box = await dialog.boundingBox(); await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2); await page.mouse.wheel(0, 500);
  await expect.poll(() => dialog.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath(`short-scroll-${motion}.png`) });
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
});

test("five-speed control: hover description clamps at a short viewport edge and Escape closes it", async ({ auction, page }) => {
  await page.setViewportSize({ width: 844, height: 320 });
  await page.goto(`/?lang=${auction.language}&tooltip=1&weapon=1`, { waitUntil: "networkidle" }); await page.evaluate(() => document.fonts.ready);
  const trigger = page.getByRole("button", { name: /Synthetic exact weapon/ }); await trigger.focus(); const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible(); await expect.poll(() => tooltip.evaluate(node => { const r = node.getBoundingClientRect(); return r.top >= 11 && r.bottom <= innerHeight - 11; })).toBe(true);
  await page.keyboard.press("Escape"); await expect(tooltip).toHaveCount(0); await expect(trigger).toBeFocused();
});


for (const countKey of ["unsupportedModifierLots", "variantsRejected", "referenceItemsRejected", "catalogItemsMissing", "catalogUnmatchedItemIds", "eligibilityUnverifiedItems", "generic"] as const) test(`four-fix regression: unverified coverage explains ${countKey}`, async ({ auction, page }, info) => {
  await page.route("**/api/wow/auction-gear-plans**", async route => {
    const source = searchResult();
    source.coverage = { ...source.coverage, unsupportedModifierLots: 0, variantsRejected: 0, referenceItemsRejected: 0, catalogItemsMissing: 0, catalogUnmatchedItemIds: 0, eligibilityUnverifiedItems: 0, ...(countKey === "generic" ? {} : { [countKey]: 7 }) };
    source.dataComplete = false;
    await route.fulfill({ status: 202, json: completedJob(auction.language, source) });
  });
  await auction.open(); await auction.search();
  const details = auction.panel.locator("details").filter({ has: page.getByText(auction.t("Часть рынка пока не проверена", "Part of the market is unverified"), { exact: true }) });
  await details.locator("summary").click();
  await expect(details.locator(":scope > p")).not.toHaveCount(0);
  if (countKey !== "generic") await expect(details).toContainText("7");
  await details.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  if (countKey === "unsupportedModifierLots") await page.screenshot({ path: info.outputPath("coverage-explanation.png"), fullPage: true });
});

test("four-fix regression: excluding the best variant reranks cards and keeps an explicit restore action", async ({ auction }) => {
  auction.valueChoices = true; await auction.open(); await auction.search();
  const best = auction.panel.locator("[data-best-value=true]");
  const oldId = await best.getAttribute("data-auction-option");
  await best.locator("summary").click();
  await best.getByRole("checkbox").click();
  await expect(auction.panel.locator(`[data-best-value=true][data-auction-option=${JSON.stringify(oldId)}]`)).toHaveCount(0);
  await expect(auction.panel.locator("[data-best-value=true]")).toHaveCount(1);
  const exclusions = auction.assembly.locator("details").filter({ has: auction.page.getByText(/^Исключения:|^Exclusions:/) });
  await exclusions.locator("summary").click();
  await exclusions.getByRole("button", { name: /Вернуть вариант в подбор|Restore variant to assembly/ }).click();
  await expect(auction.panel.locator("[data-best-value=true]")).toHaveAttribute("data-auction-option", oldId!);
});

test("four-fix regression: cold-tab conflict offers explicit recovery with the original budget and selection", async ({ auction, page }, info) => {
  const requests: string[] = [], job = { id: "cold-tab-active", status: "queued", mode: "search", result: null, progress: null, error: null, scope: { characterSlug, locale: auction.language } };
  const formIntent = { ...job.scope, budgetCopper: 3333300, scenario: "aoe", objective: "dps", selectedSlots: ["WRIST"] };
  const result = { ...searchResult(), budgetCopper: formIntent.budgetCopper, scenario: formIntent.scenario, objective: formIntent.objective, selectedSlots: formIntent.selectedSlots };
  await page.route("**/api/wow/auction-gear-plans**", async route => {
    requests.push(route.request().method() + new URL(route.request().url()).search);
    if (route.request().method() === "POST") await route.fulfill({ status: 409, json: { error: "plan_already_running", activeJob: job, formIntent } });
    else await route.fulfill({ json: { ...completedJob(auction.language, result), id: job.id, mode: "search" } });
  });
  await auction.open(); await auction.find.click();
  const open = auction.panel.getByRole("button", { name: /Открыть расчёт|Open calculation/, exact: true });
  await expect(open).toBeVisible(); await expect(auction.find).toBeDisabled();
  expect(requests).toHaveLength(1);
  await open.click(); await expect(auction.panel.locator("[data-auction-search-result]")).toBeVisible();
  await expect(auction.panel.locator('[name="budgetGold"]')).toHaveValue("333.33");
  await auction.panel.locator("summary").filter({ hasText: /Слоты экипировки и цель подбора|Equipment slots and objective/ }).click();
  await expect(auction.panel.locator('[name="objective"]')).toHaveValue("dps");
  await expect(auction.panel.getByRole("combobox", { name: /Сценарий|Encounter/ })).toHaveValue("aoe");
  await expect(auction.panel.locator('[name="selectedSlots"]:checked')).toHaveCount(1);
  await expect(auction.panel.locator('[name="selectedSlots"][value="WRIST"]')).toBeChecked();
  expect(requests.filter(x => x.startsWith("POST"))).toHaveLength(1);
  await page.screenshot({ path: info.outputPath("cold-tab-original-intent-restored.png"), fullPage: true });
});

for (const foreign of ["character", "locale"] as const) test(`four-fix regression: a cold-tab ${foreign} mismatch cannot silently open the wrong calculation`, async ({ auction, page }) => {
  const foreignScope = { characterSlug: foreign === "character" ? "eu--synthetic-other--different" : characterSlug, locale: foreign === "locale" ? auction.language === "ru" ? "en" : "ru" : auction.language };
  const job = { id: "foreign-owned-active", status: "queued", mode: "search", result: null, progress: null, error: null, scope: foreignScope };
  const requests: string[] = [];
  await page.route("**/api/wow/auction-gear-plans**", async route => {
    requests.push(route.request().method());
    if (route.request().method() === "DELETE") await route.fulfill({ json: { ...job, status: "cancelled" } });
    else await route.fulfill({ status: 409, json: { error: "plan_already_running", activeJob: job, formIntent: { ...foreignScope, budgetCopper: 200000, scenario: "aoe", objective: "dps", selectedSlots: ["WRIST"] } } });
  });
  await auction.open(); await auction.find.click();
  await expect(auction.panel.getByRole("button", { name: /Открыть расчёт|Open calculation/, exact: true })).toHaveCount(0);
  const cancel = auction.panel.getByRole("button", { name: /Отменить и изменить параметры|Cancel and change parameters/, exact: true });
  await expect(cancel).toBeVisible(); expect(requests).toEqual(["POST"]);
  await cancel.click(); await expect(auction.find).toBeEnabled();
  await expect(auction.panel.locator('[name="budgetGold"]')).toHaveValue("10000");
  expect(requests).toEqual(["POST", "DELETE"]);
});

test("four-fix regression: cold-tab cancellation retains ownership until a retry is acknowledged", async ({ auction, page }) => {
  let reject = true, deletes = 0, posts = 0;
  const job = { id: "owned-active-to-cancel", status: "queued", mode: "search", result: null, progress: null, error: null, scope: { characterSlug, locale: auction.language } };
  await page.route("**/api/wow/auction-gear-plans**", async route => {
    if (route.request().method() === "POST") { posts++; await route.fulfill({ status: 409, json: { error: "plan_already_running", activeJob: job, formIntent: null } }); }
    else if (route.request().method() === "DELETE") { deletes++; await route.fulfill(reject ? { status: 503, json: { error: "auction_storage_unavailable" } } : { json: { ...job, status: "cancelled" } }); }
  });
  await auction.open(); await auction.find.click();
  await auction.panel.getByRole("button", { name: /Отменить и изменить параметры|Cancel and change parameters/, exact: true }).click();
  await expect(auction.find).toBeDisabled();
  await expect(auction.panel.getByRole("button", { name: /Повторить отмену|Retry cancellation/ })).toBeVisible();
  expect(await page.evaluate(() => Object.entries(sessionStorage).some(([, value]) => value.includes('"cancellationRequested":true') && value.includes('owned-active-to-cancel')))).toBe(true);
  reject = false; await auction.panel.getByRole("button", { name: /Повторить отмену|Retry cancellation/ }).click();
  await expect(auction.find).toBeEnabled(); await expect(auction.panel.locator('[name="budgetGold"]')).toBeFocused();
  expect(posts).toBe(1); expect(deletes).toBeGreaterThan(1);
});

// Covers the minimum supported phone width independently of the ordinary 390/1440 matrix.
test("four-fix regression: 320px recovery, exclusions and explanation stay readable with keyboard focus", async ({ auction, page }, info) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  const job = { id: "phone-owned-active", status: "queued", mode: "search", result: null, progress: null, error: null, scope: { characterSlug, locale: auction.language } };
  const source = searchResult(); source.dataComplete = false; source.coverage = { ...source.coverage, unsupportedModifierLots: 7 };
  await page.route("**/api/wow/auction-gear-plans**", async route => {
    if (route.request().method() === "POST") await route.fulfill({ status: 409, json: { error: "plan_already_running", activeJob: job, formIntent: { ...job.scope, budgetCopper: source.budgetCopper, scenario: source.scenario, objective: "dps", selectedSlots: source.selectedSlots } } });
    else await route.fulfill({ json: { ...completedJob(auction.language, source), id: job.id, mode: "search" } });
  });
  await auction.open(); await auction.find.click();
  await expect(auction.panel.locator("[data-auction-owned-recovery]")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: info.outputPath("320px-owned-recovery.png"), fullPage: true });
  const open = auction.panel.getByRole("button", { name: /Открыть расчёт|Open calculation/, exact: true });
  await open.focus(); await page.keyboard.press("Enter");
  await expect(auction.panel.locator("[data-auction-search-result]")).toBeVisible();
  const card = auction.panel.locator("[data-best-value=true]"); await card.locator("summary").click();
  await card.getByRole("checkbox").focus(); await page.keyboard.press("Space");
  await expectExcludedRecommendations(auction);
  const exclusions = auction.panel.locator("[data-auction-exclusions] > summary");
  await expect(exclusions).toBeFocused();
  await expect(auction.panel).toContainText(auction.t("Найденные подтверждённые улучшения исключены", "The confirmed upgrades found are excluded"));
  await exclusions.click(); await auction.panel.locator("[data-excluded-restore]").click();
  await expect(auction.panel.locator("[data-best-value=true] summary")).toBeFocused();
  const coverage = auction.panel.locator("summary").filter({ hasText: /Часть рынка пока не проверена|Part of the market is unverified/ });
  await coverage.click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: info.outputPath("320px-restored-explanation.png"), fullPage: true });
});

test("four-fix regression: cold-tab assembly restores durable current exclusions before continuing", async ({ auction, page }) => {
  const source = { ...searchResult(), budgetCopper: 3333300, scenario: "execute", objective: "value", selectedSlots: ["HEAD", "WRIST"] };
  const exactVariant = JSON.stringify([source.items[3].itemId, source.items[3].variantKey]);
  const blockedLot = source.items[0].optionId;
  const result = { ...assemblyResult(), budgetCopper: source.budgetCopper, scenario: source.scenario, objective: source.objective, selectedSlots: source.selectedSlots, updatedSearch: source };
  const job = { id: "parked-owned-assembly", searchId: source.searchId, status: "queued", mode: "assembly", result: null, progress: null, error: null, scope: { characterSlug, locale: auction.language } };
  const bodies: Array<Record<string, unknown>> = [], reads: string[] = [];
  await page.route("**/api/wow/auction-gear-plans**", async route => {
    const request = route.request(), query = new URL(request.url()).searchParams;
    if (request.method() === "POST") {
      const body = request.postDataJSON(); bodies.push(body);
      if (body.action === "search") await route.fulfill({ status: 409, json: { error: "plan_already_running", activeJob: job, formIntent: { ...job.scope, budgetCopper: source.budgetCopper, scenario: source.scenario, objective: source.objective, selectedSlots: source.selectedSlots } } });
      else await route.fulfill({ status: 202, json: { ...completedJob(auction.language, { ...result, exhaustiveComplete: true, searchLimited: false }), id: "continued-same-selection", mode: "assembly" } });
    } else if (query.has("searchId")) {
      reads.push("search"); await route.fulfill({ json: { kind: "recovery", search: source, assembly: null, excludedOptionIds: [blockedLot], excludedVariantKeys: [exactVariant], activeJob: job, needsRefresh: true } });
    } else { reads.push("job"); await route.fulfill({ json: { ...completedJob(auction.language, result), id: job.id, mode: "assembly" } }); }
  });
  await auction.open(); await auction.find.click(); expect(reads).toEqual([]);
  await auction.panel.getByRole("button", { name: /Открыть расчёт|Open calculation/, exact: true }).click();
  await expect(auction.result).toBeVisible(); expect(reads).toEqual(["search", "job"]);
  await expect(auction.panel.locator('[name="budgetGold"]')).toHaveValue("333.33");
  const cache = await page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith("gildra:auction:v1:")).map(([, json]) => JSON.parse(json))[0]);
  expect(cache.excludedOptionIds).toEqual([blockedLot]); expect(cache.excludedVariantKeys).toEqual([exactVariant]);
  await expect(auction.panel.locator("[data-best-value=true]")).toHaveCount(0);
  await expect(auction.result).toHaveAttribute("data-exhaustive", "true");
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1]).toMatchObject({ action: "assemble", searchId: source.searchId, excludedOptionIds: [blockedLot], excludedVariantKeys: [exactVariant] });
});

// A search persists its ID before the first public search DTO exists. After a
// service restart only an explicit scoped job lookup can resume this phase.
test("four-fix midflight regression: cold-tab initial search resumes by exact job when its first DTO is not ready", async ({ auction, page }, info) => {
  const result = { ...searchResult(), budgetCopper: 3333300, scenario: "aoe", objective: "value", selectedSlots: ["WRIST"] };
  const job = { id: "initial-search-before-first-dto", searchId: result.searchId, status: "queued", mode: "search", result: null, error: null, progress: null, scope: { characterSlug, locale: auction.language } };
  const reads: Array<{ id: string | null; searchId: string | null; characterSlug: string | null; locale: string | null }> = [];
  let posts = 0;
  await page.route("**/api/wow/auction-gear-plans**", async route => {
    const request = route.request(), query = new URL(request.url()).searchParams;
    if (request.method() === "POST") { posts++; await route.fulfill({ status: 409, json: { error: "plan_already_running", activeJob: job, formIntent: { ...job.scope, budgetCopper: result.budgetCopper, scenario: result.scenario, objective: result.objective, selectedSlots: result.selectedSlots } } }); }
    else {
      reads.push({ id: query.get("id"), searchId: query.get("searchId"), characterSlug: query.get("characterSlug"), locale: query.get("locale") });
      if (query.has("searchId")) await route.fulfill({ status: 404, json: { error: "search_not_found" } });
      else await route.fulfill({ json: { ...completedJob(auction.language, result), id: job.id, mode: "search" } });
    }
  });
  await auction.open(); await auction.find.click(); expect(reads).toEqual([]);
  await auction.panel.getByRole("button", { name: /Открыть расчёт|Open calculation/, exact: true }).click();
  await expect(auction.panel.locator("[data-auction-search-result]")).toBeVisible();
  expect(posts).toBe(1);
  expect(reads).toEqual([{ id: null, searchId: result.searchId, characterSlug, locale: auction.language }, { id: job.id, searchId: null, characterSlug, locale: auction.language }]);
  await expect(auction.panel.locator('[name="budgetGold"]')).toHaveValue("333.33");
  await expect(auction.panel.getByRole("combobox", { name: /Сценарий|Encounter/ })).toHaveValue("aoe");
  await expect(auction.panel.locator("[data-auction-owned-recovery]")).toHaveCount(0);
  await info.attach("midflight-scoped-reads", { body: JSON.stringify({ reads, posts }), contentType: "application/json" });
});

for (const fault of ["assembly-missing", "wrong-status", "other-code", "malformed", "null-dto", "network"] as const) test(`four-fix midflight control: ${fault} keeps context recovery explicit and preserves assembly exclusions`, async ({ auction, page }) => {
  const source = { ...searchResult(), budgetCopper: 3333300, scenario: "execute", objective: "value", selectedSlots: ["WRIST"] };
  const variant = JSON.stringify([source.items[3].itemId, source.items[3].variantKey]);
  const mode = fault === "assembly-missing" ? "assembly" : "search";
  const job = { id: `midflight-guard-${fault}`, searchId: source.searchId, status: "queued", mode, result: null, error: null, progress: null, scope: { characterSlug, locale: auction.language } };
  let faultActive = true, posts = 0, jobReads = 0, contextReads = 0, releaseFault!: () => void;
  const faultDelivered = new Promise<void>(resolve => { releaseFault = resolve; });
  await page.route("**/api/wow/auction-gear-plans**", async route => {
    const request = route.request(), query = new URL(request.url()).searchParams;
    if (request.method() === "POST") { posts++; await route.fulfill({ status: 409, json: { error: "plan_already_running", activeJob: job, formIntent: { ...job.scope, budgetCopper: source.budgetCopper, scenario: source.scenario, objective: source.objective, selectedSlots: source.selectedSlots } } }); }
    else if (query.has("searchId")) {
      contextReads++;
      if (faultActive) {
        if (fault === "malformed") await route.fulfill({ json: { kind: "invalid-recovery" } });
        else if (fault === "null-dto") await route.fulfill({ contentType: "application/json", body: "null" });
        else await route.fulfill({ status: fault === "network" ? 503 : fault === "wrong-status" ? 400 : 404, json: { error: fault === "other-code" ? "invalid_plan_result" : fault === "network" ? "auction_storage_unavailable" : "search_not_found" } });
        if (fault !== "network" || contextReads === 4) releaseFault();
      } else await route.fulfill({ json: { kind: "recovery", search: source, assembly: null, excludedOptionIds: [], excludedVariantKeys: [variant], activeJob: job, needsRefresh: true } });
    } else {
      jobReads++;
      const result = mode === "assembly" ? { ...assemblyResult({ complete: true }), budgetCopper: source.budgetCopper, scenario: source.scenario, objective: source.objective, selectedSlots: source.selectedSlots, updatedSearch: source } : source;
      await route.fulfill({ json: { ...completedJob(auction.language, result), id: job.id, mode } });
    }
  });
  await auction.open(); await auction.find.click();
  const open = auction.panel.getByRole("button", { name: /Открыть расчёт|Open calculation/, exact: true });
  await open.click(); await faultDelivered;
  await expect(open).toBeEnabled(); await expect(auction.find).toBeDisabled();
  await expect(auction.panel.getByRole("alert")).toBeVisible();
  await expect(auction.panel.locator("[data-auction-owned-recovery]")).toBeVisible();
  expect(jobReads).toBe(0); expect(posts).toBe(1);
  faultActive = false; await open.click();
  await expect(auction.panel.locator("[data-auction-search-result]")).toBeVisible();
  expect(jobReads).toBe(1); expect(posts).toBe(1);
  const saved = await page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith("gildra:auction:v1:")).map(([, json]) => JSON.parse(json))[0]);
  expect(saved.excludedVariantKeys).toEqual([variant]);
  await expect(auction.panel.locator("[data-best-value=true]")).toHaveCount(0);
  await expect(auction.panel.locator("[data-auction-exclusions] > summary")).toBeVisible();
});

for (const status of [404, 503]) test(`four-fix reload regression: failed assembly context HTTP${status} never leaves a context-less job handle`, async ({ auction, page }) => {
  const source = { ...searchResult(), budgetCopper: 3333300, scenario: "aoe", objective: "value", selectedSlots: ["WRIST"] };
  const variant = JSON.stringify([source.items[3].itemId, source.items[3].variantKey]);
  const result = { ...assemblyResult({ complete: true }), budgetCopper: source.budgetCopper, scenario: source.scenario, objective: source.objective, selectedSlots: source.selectedSlots, updatedSearch: source };
  const job = { id: `assembly-context-before-reload-${status}`, searchId: source.searchId, status: "queued", mode: "assembly", result: null, error: null, progress: null, scope: { characterSlug, locale: auction.language } };
  let failedContext = true, jobReads = 0, contextReads = 0, posts = 0, releaseFault!: () => void;
  const faultDelivered = new Promise<void>(resolve => { releaseFault = resolve; });
  await page.route("**/api/wow/auction-gear-plans**", async route => {
    const request = route.request(), query = new URL(request.url()).searchParams;
    if (request.method() === "POST") { posts++; await route.fulfill({ status: 409, json: { error: "plan_already_running", activeJob: job, formIntent: { ...job.scope, budgetCopper: source.budgetCopper, scenario: source.scenario, objective: source.objective, selectedSlots: source.selectedSlots } } }); }
    else if (query.has("searchId")) {
      contextReads++;
      if (failedContext) { await route.fulfill({ status, json: { error: status === 404 ? "search_not_found" : "auction_storage_unavailable" } }); if (contextReads === (status === 503 ? 4 : 1)) releaseFault(); }
      else await route.fulfill({ json: { kind: "recovery", search: source, assembly: null, excludedOptionIds: [], excludedVariantKeys: [variant], activeJob: job, needsRefresh: true } });
    } else { jobReads++; await route.fulfill({ json: { ...completedJob(auction.language, result), id: job.id, mode: "assembly" } }); }
  });
  await auction.open(); await auction.find.click();
  const open = auction.panel.getByRole("button", { name: /Открыть расчёт|Open calculation/, exact: true });
  await open.click(); await faultDelivered; await expect(open).toBeEnabled();
  await page.reload({ waitUntil: "networkidle" });
  expect(jobReads).toBe(0);
  expect(posts).toBe(1);
  await expect(auction.find).toBeEnabled();
  const stored = await page.evaluate(() => Object.entries(sessionStorage));
  expect(stored.some(([, value]) => value.includes(job.id))).toBe(false);
  failedContext = false;
  await auction.find.click(); await expect(open).toBeVisible();
  expect(jobReads).toBe(0); expect(posts).toBe(2);
  await open.click(); await expect(auction.result).toBeVisible();
  expect(jobReads).toBe(1); expect(posts).toBe(2);
  const saved = await page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith("gildra:auction:v1:")).map(([, json]) => JSON.parse(json))[0]);
  expect(saved.excludedVariantKeys).toEqual([variant]);
  await expect(auction.panel.locator("[data-best-value=true]")).toHaveCount(0);
  await expect(auction.panel.locator("[data-auction-exclusions] > summary")).toBeVisible();
});

test("four-fix reload control: cancelling an opened pending context retains the owned ID until acknowledgement", async ({ auction, page }) => {
  const source = searchResult();
  const job = { id: "owned-pending-context-to-cancel", searchId: source.searchId, status: "queued", mode: "assembly", result: null, error: null, progress: null, scope: { characterSlug, locale: auction.language } };
  let releaseContext!: () => void, signalContext!: () => void, rejectDelete = true, jobReads = 0;
  const contextStarted = new Promise<void>(resolve => { signalContext = resolve; });
  const contextHeld = new Promise<void>(resolve => { releaseContext = resolve; });
  const deletedIds: string[] = [];
  await page.route("**/api/wow/auction-gear-plans**", async route => {
    const request = route.request(), query = new URL(request.url()).searchParams;
    if (request.method() === "POST") await route.fulfill({ status: 409, json: { error: "plan_already_running", activeJob: job, formIntent: { ...job.scope, budgetCopper: source.budgetCopper, scenario: source.scenario, objective: "dps", selectedSlots: source.selectedSlots } } });
    else if (request.method() === "DELETE") { deletedIds.push(query.get("id")!); await route.fulfill(rejectDelete ? { status: 503, json: { error: "auction_storage_unavailable" } } : { json: { ...job, status: "cancelled" } }); }
    else if (query.has("searchId")) { signalContext(); await contextHeld; await route.fulfill({ status: 503, json: { error: "auction_storage_unavailable" } }).catch(() => {}); }
    else { jobReads++; await route.fulfill({ json: { ...completedJob(auction.language, assemblyResult({ complete: true })), id: job.id, mode: "assembly" } }); }
  });
  try {
    await auction.open(); await auction.find.click();
    await auction.panel.getByRole("button", { name: /Открыть расчёт|Open calculation/, exact: true }).click();
    await contextStarted;
    await auction.panel.getByRole("button", { name: /Отменить сборку|Cancel assembly/, exact: true }).click();
    const retry = auction.panel.getByRole("button", { name: /Повторить отмену|Retry cancellation/ });
    await expect(retry).toBeVisible(); await expect(auction.find).toBeDisabled();
    const saved = await page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith("gildra:auction:v1:")).map(([, json]) => JSON.parse(json))[0]);
    expect(saved.jobId).toBe(job.id); expect(saved.cancellationRequested).toBe(true);
    await page.reload({ waitUntil: "networkidle" }); await expect(retry).toBeVisible(); await expect(auction.find).toBeDisabled();
    expect(jobReads).toBe(0);
    rejectDelete = false; await retry.click(); await expect(auction.find).toBeEnabled();
    expect(deletedIds.length).toBeGreaterThanOrEqual(3); expect(deletedIds.every(id => id === job.id)).toBe(true); expect(jobReads).toBe(0);
  } finally { releaseContext(); }
});
