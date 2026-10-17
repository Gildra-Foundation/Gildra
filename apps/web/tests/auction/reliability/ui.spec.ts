import { test, expect } from "./ui-support";
import { aliasIds, unavailableDescriptions, unavailableWeapon, wrist } from "./ui-fixtures";

const stale = /Цены и доступность.*(?:не подтверждены|обновить)|Prices and availability.*(?:unverified|not verified)|Refresh.*(?:prices|availability)/i;

test("exclude a hidden purchased lot across all slot aliases and undo with keyboard", async ({ auction, page }) => {
  await auction.open(); await auction.search(); await auction.assemble();
  await expect(auction.panel.locator("[data-auction-option]")).toHaveCount(1);
  const exclude = auction.result.getByRole("button", { name: /Исключить лот|Exclude (?:auction )?lot/i }).first();
  await expect(exclude).toBeVisible();
  await exclude.focus(); await page.keyboard.press("Enter");
  await auction.assembly.locator("summary").filter({ hasText: /Исключения|Exclusions/ }).click();
  const undo = auction.assembly.getByRole("button", { name: /Вернуть вариант|Restore variant/i }).first();
  await expect(undo).toBeVisible();
  await auction.assemble();
  expect(auction.requests.at(-1)?.excludedOptionIds?.slice().sort()).toEqual(aliasIds.slice().sort());
  await undo.focus(); await page.keyboard.press("Enter");
  await auction.assemble();
  expect(auction.requests.at(-1)?.excludedOptionIds).toEqual([]);
});

for (const outcome of ["cancel", "error"] as const) {
  test(`previous positive set survives continuation ${outcome} with stale prices explicit`, async ({ auction, page }) => {
    await auction.open(); await auction.search(); await auction.assemble();
    await expect(auction.result).toContainText(/1[,.\s]?200/);
    auction.mode = outcome === "cancel" ? "running" : "error";
    await auction.build.click();
    if (outcome === "cancel") await auction.assembly.getByRole("button", { name: /Отменить сборку|Cancel assembly/ }).click();
    else await expect(auction.assembly.getByRole("alert")).toBeVisible();
    await expect(auction.result).toBeVisible();
    await expect(auction.result).toContainText(/1[,.\s]?200/);
    await expect(auction.assembly).toContainText(stale);
    await expect(auction.build).toHaveText(/Продолжить|Повторить|Continue|Retry/);
    expect(auction.requests.filter(body => body.action === "assemble")).toHaveLength(2);
    await auction.build.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(auction.build).toBeFocused();
    expect(await auction.build.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}

for (const kind of ["held-once", "transient-once"] as const) {
  test(`poll ${kind} reconnects to the same job without duplicate POST or DELETE`, async ({ auction, page }) => {
    await auction.open(); await auction.search(); await auction.assemble();
    await page.clock.install();
    auction.mode = kind;
    await auction.build.click();
    for (let step = 0; step < 18; step++) await page.clock.runFor(1000);
    await expect.poll(() => auction.activePolls).toBeGreaterThanOrEqual(2);
    await expect(auction.result).toBeVisible();
    expect(new Set(auction.polls).size).toBe(1);
    expect(auction.requests.filter(body => body.action === "assemble")).toHaveLength(2);
    expect(auction.deletes).toEqual([]);
    await expect(auction.panel.getByRole("alert")).toHaveCount(0);
  });
}

test("reload restores owned search, exclusions and previous loadout through server validation", async ({ auction, page }) => {
  await auction.open(); await auction.search();
  const wristCheckbox = auction.panel.getByRole("checkbox", { name: new RegExp(`(?:Учитывать вариант при сборке|Allow variant in assembly): ${wrist.name}`) });
  await auction.panel.locator("[data-auction-option] summary").click();
  await wristCheckbox.uncheck(); await auction.assemble();
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(() => auction.recoveries).toBe(1);
  await expect(auction.result).toBeVisible();
  await auction.panel.locator("[data-auction-option] summary").click();
  await expect(wristCheckbox).not.toBeChecked();
  await expect(auction.assembly).toContainText(stale);
  expect(auction.requests.filter(body => body.action === "search")).toHaveLength(1);
});

test("reload preserves exclusions changed locally before the next assembly", async ({ auction, page }) => {
  await auction.open(); await auction.search();
  const checkbox = auction.panel.getByRole("checkbox", { name: new RegExp(`(?:Учитывать вариант при сборке|Allow variant in assembly): ${wrist.name}`) });
  await auction.panel.locator("[data-auction-option] summary").click();
  await checkbox.uncheck();
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(() => auction.recoveries).toBe(1);
  await auction.panel.locator("[data-auction-option] summary").click();
  await expect(checkbox).not.toBeChecked();
  await auction.assemble();
  expect(auction.requests.at(-1)?.excludedOptionIds).toEqual([]);
  expect(auction.requests.at(-1)?.excludedVariantKeys).toEqual([JSON.stringify([wrist.itemId, wrist.variantKey])]);
});

test("expired or different-owner search is discarded with a localized restart action", async ({ auction, page }) => {
  await auction.open(); await auction.search(); await auction.assemble();
  auction.recoveryFailure = true;
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(() => auction.recoveries).toBe(1);
  await expect(auction.result).toHaveCount(0);
  await expect(auction.panel).toContainText(/устарел|больше недоступен|expired|no longer available/i);
  await expect(auction.panel.getByRole("button", { name: /Найти улучшения|Новый поиск|Find upgrades|New search/ })).toBeEnabled();
});

test("reload reconnects to initial in-flight job with server-checked character and locale", async ({ auction, page }) => {
  await auction.open(); auction.mode = "initial-running";
  await auction.panel.getByRole("button", { name: auction.t("Найти улучшения", "Find upgrades"), exact: true }).click();
  await expect.poll(() => auction.requests.length).toBe(1);
  await expect.poll(() => page.evaluate(() => JSON.stringify({ ...sessionStorage }))).toContain("synthetic-job-1");
  await page.reload({ waitUntil: "networkidle" });
  await expect(auction.panel.locator("[data-auction-search-result]")).toBeVisible();
  expect(auction.requests.filter(body => body.action === "search")).toHaveLength(1);
  expect(auction.polls).toContain("synthetic-job-1");
});

test("market failures explain the failing service instead of a generic calculation error", async ({ auction }) => {
  await auction.open();
  for (const code of ["market_busy", "market_rate_limited", "market_unavailable", "market_response_too_large", "connected_realm_unresolved"]) {
    auction.marketError = code;
    await auction.panel.getByRole("button", { name: auction.t("Найти улучшения", "Find upgrades"), exact: true }).click();
    const alert = auction.panel.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/аукцион|рынк|сервер|auction|market|realm/i);
    await expect(alert).not.toContainText(/Не удалось завершить расчёт|calculation could not finish/i);
  }
});

test("confirmed set remains purchasable when the measured maximum is inconclusive", async ({ auction }) => {
  auction.noisyMaximum = true;
  await auction.open(); await auction.search(); await auction.assemble();
  await expect(auction.result.getByRole("heading", { name: /Что купить|Items to buy/ })).toBeVisible();
  await expect(auction.result).toContainText(/1[,.\s]?200/);
  await expect(auction.result).toContainText(/1[,.\s]?250/);
  await expect(auction.result).toContainText(/погрешност|uncertainty/i);
});

test("missing exact effect and weapon descriptions are explicit in localized accessible tooltip", async ({ auction, page }) => {
  await auction.open("&tooltip=1");
  const trigger = page.getByRole("button", { name: /Synthetic exact weapon.*(?:Описание предмета|Item details)/ });
  await trigger.focus(); await expect(page.getByRole("tooltip")).toBeVisible();
  await page.keyboard.press("Escape"); await expect(page.getByRole("tooltip")).toHaveCount(0);
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(unavailableDescriptions);
  await expect(dialog).toContainText(unavailableWeapon);
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("exact weapon values and verified proc are rendered without base-data substitution", async ({ auction, page }) => {
  await auction.open("&tooltip=1&weapon=1");
  await page.getByRole("button", { name: /Synthetic exact weapon.*(?:Описание предмета|Item details)/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Synthetic exact proc +17");
  await expect(dialog).toContainText(/24/);
  await expect(dialog).toContainText(/2[,.]5/);
  await expect(dialog).toContainText(/50/);
  await expect(dialog).toContainText(/70/);
  await expect(dialog).not.toContainText(unavailableWeapon);
});

test("locale change waits for late POST cancellation before starting the next scope", async ({ auction, page }) => {
  await auction.open("&controls=1"); auction.mode = "late";
  await auction.panel.getByRole("button", { name: auction.t("Найти улучшения", "Find upgrades"), exact: true }).click();
  await expect.poll(() => auction.requests.length).toBe(1);
  await page.getByRole("button", { name: "Private locale change", exact: true }).click();
  const changed = page.getByRole("region", { name: auction.t("Find gear within your budget", "Найти вещи под бюджет"), exact: true });
  await changed.getByRole("button", { name: auction.t("Find upgrades", "Найти улучшения"), exact: true }).click();
  await expect(changed.getByRole("button", { name: auction.t("Searching…", "Ищем вещи…"), exact: true })).toBeDisabled();
  expect(auction.requests).toHaveLength(1);
  auction.releasePost();
  await expect(changed.locator("[data-auction-search-result]")).toBeVisible();
  expect(auction.deletes).toContain("synthetic-job-1");
  expect(auction.requests).toHaveLength(2);
  expect(auction.requests[1].locale).toBe(auction.language === "ru" ? "en" : "ru");
});

test("changed character snapshot does not restore an old profile result from storage", async ({ auction, page }) => {
  await auction.open("&controls=1"); await auction.search(); await auction.assemble();
  await page.getByRole("button", { name: "Private snapshot change", exact: true }).click();
  await expect(auction.result).toHaveCount(0);
  await expect(auction.panel.locator("[data-auction-search-result]")).toHaveCount(0);
  expect(auction.recoveries).toBe(0);
  await expect(auction.panel.getByRole("button", { name: auction.t("Найти улучшения", "Find upgrades"), exact: true })).toBeEnabled();
});

test("exhausted polls followed by changed exclusions creates a new correctly filtered assembly", async ({ auction, page }) => {
  await auction.open(); await auction.search(); await auction.assemble();
  await page.clock.install(); auction.mode = "network-failed";
  await auction.build.click();
  for (let step = 0; step < 12; step++) await page.clock.runFor(1000);
  await expect(auction.assembly.getByRole("button", { name: /Повторить подключение|Reconnect to calculation/ })).toBeVisible();
  auction.mode = "normal";
  await auction.result.getByRole("button", { name: /Исключить лот|Exclude lot/i }).first().click();
  await auction.assemble();
  expect(auction.requests.filter(body => body.action === "assemble")).toHaveLength(3);
  expect(auction.requests.at(-1)?.excludedOptionIds?.slice().sort()).toEqual(aliasIds.slice().sort());
  expect(auction.deletes).toContain("synthetic-job-3");
});

test("delayed resume POST followed by reload recovers the intended search job mode", async ({ auction, page }) => {
  await auction.open(); await auction.search(); auction.incompleteAfterAssembly = true;
  await auction.assemble(); auction.mode = "late";
  await auction.panel.getByRole("button", { name: /Продолжить проверку вещей|Continue item comparisons/ }).click();
  await expect.poll(() => auction.requests.length).toBe(3);
  await expect.poll(() => page.evaluate(() => {
    const entry = Object.entries(sessionStorage).find(([key]) => key.startsWith("gildra:auction:v1:"));
    return entry ? JSON.parse(entry[1]).mode : null;
  })).toBe("search");
  await page.reload({ waitUntil: "networkidle" });
  await expect(auction.panel.getByText(/Проверка найденных вариантов завершена|Evaluation of discovered options is complete/)).toBeVisible();
  await expect(auction.panel.getByRole("alert")).toHaveCount(0);
  expect(auction.requests.filter(body => body.action === "resume")).toHaveLength(1);
  expect(auction.polls).toContain("synthetic-job-3");
  auction.releasePost();
});


test("accepted initial search survives lost 202, reload and transport-timeout recovery without a duplicate POST", async ({ auction, page }) => {
  await auction.open(); auction.mode = "late";
  const find = auction.panel.getByRole("button", { name: auction.t("Найти улучшения", "Find upgrades"), exact: true });
  await find.click();
  await expect.poll(() => auction.requests.length).toBe(1);
  const requestId = auction.requests[0].clientRequestId;
  expect(requestId).toMatch(/^[A-Za-z0-9_-]{16,100}$/);
  await expect.poll(() => page.evaluate(() => JSON.stringify({ ...sessionStorage }))).toContain(requestId!);
  await page.reload({ waitUntil: "networkidle" });
  await expect(auction.panel.locator("[data-auction-search-result]")).toBeVisible();
  expect(auction.requestRecoveries).toBe(1);
  expect(auction.requests.filter(body => body.action === "search")).toHaveLength(1);
  await expect.poll(() => page.evaluate(() => {
    const entry = Object.entries(sessionStorage).find(([key]) => key.startsWith("gildra:auction:v1:"));
    return entry ? JSON.parse(entry[1]).clientRequestId : null;
  })).toBeUndefined();
  auction.releasePost();

  await page.clock.install(); auction.mode = "late";
  await auction.panel.getByRole("button", { name: auction.t("Новый поиск", "New search"), exact: true }).click();
  await expect.poll(() => auction.requests.length).toBe(2);
  for (let step = 0; step < 32; step++) await page.clock.runFor(1000);
  const retry = auction.panel.getByRole("button", { name: /Повторить восстановление|Retry recovery/ });
  await expect(retry).toBeVisible();
  await retry.click();
  for (let step = 0; step < 3; step++) await page.clock.runFor(1000);
  await expect(auction.panel.locator("[data-auction-search-result]")).toBeVisible();
  expect(auction.requestRecoveries).toBe(2);
  expect(auction.requests.filter(body => body.action === "search")).toHaveLength(2);
  expect(new Set(auction.requests.map(body => body.clientRequestId)).size).toBe(2);
  auction.releasePost();
});

test("scope change after initial response timeout retires the prior job before restoring another cached job", async ({ auction, page }, info) => {
  await auction.open("&controls=1");
  await page.clock.install(); auction.mode = "late";
  await auction.panel.getByRole("button", { name: auction.t("Найти улучшения", "Find upgrades"), exact: true }).click();
  await expect.poll(() => auction.requests.length).toBe(1);
  for (let step = 0; step < 32; step++) await page.clock.runFor(1000);
  await expect(auction.panel.getByRole("button", { name: /Повторить восстановление|Retry recovery/ })).toBeVisible();
  const nextLocale = auction.language === "en" ? "ru" : "en";
  const priorCachedId = "synthetic-cancelled-other-scope";
  await page.evaluate(({ nextLocale, priorCachedId }) => {
    const entry = Object.entries(sessionStorage).find(([key]) => key.startsWith("gildra:auction:v1:"));
    if (!entry) throw new Error("Pending initial request cache missing");
    const saved = JSON.parse(entry[1]);
    sessionStorage.setItem(entry[0].replace(/:(en|ru)$/, `:${nextLocale}`), JSON.stringify({
      ...saved, jobId: priorCachedId, searchId: undefined, clientRequestId: undefined,
    }));
  }, { nextLocale, priorCachedId });
  const blockedNewSearches: unknown[] = [];
  let restoredPriorScope = false;
  await page.route("**/api/wow/auction-gear-plans**", async route => {
    const request = route.request(); const url = new URL(request.url());
    if (request.method() === "GET" && url.searchParams.get("id") === priorCachedId) {
      expect(url.searchParams.get("locale")).toBe(nextLocale);
      restoredPriorScope = true;
      await route.fulfill({ json: { id: priorCachedId, status: "cancelled", result: null, progress: null, error: null,
        scope: { characterSlug: url.searchParams.get("characterSlug"), locale: nextLocale } } });
    } else if (request.method() === "POST" && request.postDataJSON().locale === nextLocale && !auction.deletes.includes("synthetic-job-1")) {
      // Model the API's existing one-running-job-per-owner contract.
      blockedNewSearches.push(request.postDataJSON());
      await route.fulfill({ status: 409, json: { error: "plan_already_running" } });
    } else await route.fallback();
  });
  await page.getByRole("button", { name: "Private locale change", exact: true }).click();
  const changed = page.getByRole("region", { name: auction.t("Find gear within your budget", "Найти вещи под бюджет"), exact: true });
  for (let step = 0; step < 3; step++) await page.clock.runFor(1000);
  await expect(changed.getByText(/Поиск отменён|Search cancelled/)).toBeVisible();
  expect(restoredPriorScope).toBe(true);
  auction.mode = "normal";
  await changed.getByRole("button", { name: auction.t("Find upgrades", "Найти улучшения"), exact: true }).click();
  for (let step = 0; step < 3; step++) await page.clock.runFor(1000);
  await info.attach("pending-scope-retirement", { body: JSON.stringify({ nextLocale, restoredPriorScope,
    blockedNewSearches, deletes: auction.deletes }), contentType: "application/json" });
  await expect(changed.locator("[data-auction-search-result]")).toBeVisible();
  expect(blockedNewSearches).toEqual([]);
  expect(auction.deletes).toContain("synthetic-job-1");
  auction.releasePost();
});

test("audit fixes: purchased lot can be excluded while background discovery retires safely", async ({ auction }) => {
  await auction.open(); await auction.search(); auction.incompleteAfterAssembly = true; await auction.assemble();
  auction.mode = "late";
  await auction.panel.getByRole("button", { name: /Продолжить проверку вещей|Continue item comparisons/ }).click();
  await expect.poll(() => auction.requests.at(-1)?.action).toBe("resume");
  const exclude = auction.result.getByRole("button", { name: /Исключить лот|Exclude lot/i }).first();
  await expect(exclude).toBeEnabled(); await exclude.click();
  auction.releasePost(); await auction.assemble();
  expect(auction.requests.at(-1)?.excludedOptionIds?.slice().sort()).toEqual(aliasIds.slice().sort());
  expect(auction.deletes).toContain("synthetic-job-3");
});
