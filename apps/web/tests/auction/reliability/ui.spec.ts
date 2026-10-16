import { test, expect } from "./ui-support";
import { aliasIds, unavailableDescriptions, unavailableWeapon, wrist } from "./ui-fixtures";

const stale = /Цены и доступность.*(?:не подтверждены|обновить)|Prices and availability.*(?:unverified|not verified)|Refresh.*(?:prices|availability)/i;

test("exclude a hidden purchased lot across all slot aliases and undo with keyboard", async ({ auction, page }) => {
  await auction.open(); await auction.search(); await auction.assemble();
  await expect(auction.panel.locator("[data-auction-option]")).toHaveCount(1);
  const exclude = auction.result.getByRole("button", { name: /Исключить лот|Exclude (?:auction )?lot/i }).first();
  await expect(exclude).toBeVisible();
  await exclude.focus(); await page.keyboard.press("Enter");
  const undo = auction.assembly.getByRole("button", { name: /Вернуть лот|Отменить исключение|Restore lot|Undo exclusion/i }).first();
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
  const wristCheckbox = auction.panel.getByRole("checkbox", { name: new RegExp(`(?:Учитывать при сборке|Allow in assembly): ${wrist.name}`) });
  await wristCheckbox.uncheck(); await auction.assemble();
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(() => auction.recoveries).toBe(1);
  await expect(auction.result).toBeVisible();
  await expect(wristCheckbox).not.toBeChecked();
  await expect(auction.assembly).toContainText(stale);
  expect(auction.requests.filter(body => body.action === "search")).toHaveLength(1);
});

test("reload preserves exclusions changed locally before the next assembly", async ({ auction, page }) => {
  await auction.open(); await auction.search();
  const checkbox = auction.panel.getByRole("checkbox", { name: new RegExp(`(?:Учитывать при сборке|Allow in assembly): ${wrist.name}`) });
  await checkbox.uncheck();
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(() => auction.recoveries).toBe(1);
  await expect(checkbox).not.toBeChecked();
  await auction.assemble();
  expect(auction.requests.at(-1)?.excludedOptionIds).toEqual([wrist.optionId]);
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
