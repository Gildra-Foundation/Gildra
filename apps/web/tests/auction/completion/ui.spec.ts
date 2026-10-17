import { test, expect } from "./ui-support";

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
    await auction.panel.locator('[name="budgetGold"]').fill(invalid); await auction.find.click();
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
  await auction.panel.locator('[data-auction-option] input[type="checkbox"]').uncheck();
  await auction.build.click(); await expect(auction.result).toBeVisible();
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
  await main.locator('input[type="checkbox"]').uncheck();
  await expect(main).toContainText(auction.t('Исключён из сборки сета', 'Excluded from loadout assembly'));
  await main.locator('input[type="checkbox"]').check();
  await alternatives.click();
  await expect(auction.panel.locator('[data-auction-option]')).toHaveCount(1);
  await info.attach('value-interface', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await auction.build.click(); await expect(auction.result).toBeVisible();
  expect(auction.requests.find(body => body.action === 'assemble')?.excludedOptionIds).toEqual([]);
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
  await cards.first().getByRole('checkbox').uncheck();
  await expect(cards.nth(1).getByRole('checkbox')).not.toBeChecked();
  await page.reload({ waitUntil: 'networkidle' });
  await expect(auction.panel.locator('[data-auction-search-result]')).toBeVisible();
  for (const card of await cards.all()) await card.locator('summary').click();
  await expect(cards.nth(1).getByRole('checkbox')).not.toBeChecked();
  await expect(auction.build).toBeDisabled();
  await cards.first().getByRole('checkbox').check();
  await expect(cards.nth(1).getByRole('checkbox')).toBeChecked();
  await auction.build.click(); await expect(auction.result).toBeVisible();
  expect(auction.requests.find(body => body.action === 'assemble')?.excludedVariantKeys).toEqual([]);
});

test("audit fixes: selecting during background discovery retires it before assembling", async ({ auction }) => {
  auction.valueChoices = true; auction.incompleteSearchOnce = true; auction.holdContinuation = true;
  await auction.open(); await auction.search();
  await expect.poll(() => auction.requests.map(body => body.action)).toEqual(['search', 'resume']);
  const card = auction.panel.locator('[data-best-value]'); await card.locator('summary').click();
  await expect(card.getByRole('checkbox')).toBeEnabled(); await card.getByRole('checkbox').uncheck();
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
