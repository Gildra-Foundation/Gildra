import type { Page } from "playwright/test";
import { decodeAuctionGearSelectionTransport } from "../../../lib/wow/auctionGearSelectionTransport";
import { aliasIds, assemblyResult, characterSlug, completedJob, scope, searchResult, wrist } from "../reliability/ui-fixtures";
import { test, expect, type CompletionHarness } from "./ui-support";

const waitingForQuota = /Ждём очереди|Waiting in queue/;
const cancelAssembly = /Отменить сборку|Cancel assembly/;
const assemblyRequests = (auction: CompletionHarness) => auction.requests.filter(body => body.action === "assemble");
const fullSearch = (auction: CompletionHarness) => auction.panel.getByRole("button", { name: /^(Искать дальше|Search further)$/ });
async function initialQuick(auction: CompletionHarness) {
  await auction.open(); await auction.search();
  await expect(auction.result).toHaveAttribute("data-exhaustive", "true");
  await auction.openBuildOptions(); await expect(auction.build).toBeEnabled();
}

async function restoreAssemblyHandle(page: Page, auction: CompletionHarness, observedActive: boolean) {
  const id = "synthetic-restored-assembly";
  const nonce = "synthetic-restored-assembly-nonce";
  const excludedOptionIds = [...aliasIds];
  const excludedVariantKeys = [JSON.stringify([wrist.itemId, wrist.variantKey])];
  const source = searchResult();
  const checkpoint = assemblyResult();
  const activeJob = { id, status: "running", mode: "assembly", result: null, progress: null, error: null,
    scope: scope(auction.language), searchId: source.searchId };
  await page.addInitScript(({ language, characterSlug, id, nonce, excludedOptionIds, excludedVariantKeys, observedActive }) => {
    sessionStorage.setItem(`gildra:auction:v1:${encodeURIComponent(characterSlug)}:fury-warrior:${language}`, JSON.stringify({
      version: 1, profileKey: "synthetic-reliability:0", searchId: "synthetic-reliability-search", jobId: id,
      clientRequestId: nonce, mode: "assembly", excludedOptionIds, excludedVariantKeys,
      ...(observedActive ? { orchestration: { kind: "full", phase: "assembly", startedAt: Date.now(), searchTurns: 1, assemblyTurns: 0 } } : {}),
    }));
  }, { language: auction.language, characterSlug, id, nonce, excludedOptionIds, excludedVariantKeys, observedActive });
  await page.route("**/api/wow/auction-gear-plans**", async route => {
    const request = route.request(), query = new URL(request.url()).searchParams;
    if (request.method() !== "GET") { await route.fallback(); return; }
    if (query.get("clientRequestId") === nonce) {
      await route.fulfill({ json: observedActive ? activeJob : { ...completedJob(auction.language, checkpoint), id, mode: "assembly" } });
    } else if (query.has("searchId")) {
      await route.fulfill({ json: { kind: "recovery", search: source, assembly: observedActive ? null : checkpoint,
        excludedOptionIds, excludedVariantKeys, activeJob: observedActive ? activeJob : null, needsRefresh: true } });
    } else if (query.get("id") === id) {
      await route.fulfill({ json: { ...completedJob(auction.language, checkpoint), id, mode: "assembly" } });
    } else await route.fallback();
  });
  return { excludedOptionIds, excludedVariantKeys };
}

test("one click finishes every assembly step with fresh nonces and the chosen variant and lot exclusions", async ({ auction, page }, info) => {
  auction.canonicalVariant = true;
  await initialQuick(auction);
  await auction.panel.getByText(/^(Отдельные улучшения по слотам|Individual slot upgrades)$/).click();
  await auction.panel.locator("[data-auction-option] summary").click();
  await auction.panel.getByRole("checkbox", { name: new RegExp(`(?:Учитывать вариант при сборке|Allow variant in assembly): ${wrist.name}`) }).focus();
  await page.keyboard.press("Space");
  await expect(auction.panel.locator("[data-auction-option]")).toHaveCount(0);
  await expect(auction.panel.locator("[data-auction-exclusions] > summary")).toBeVisible();
  await fullSearch(auction).click(); await expect(auction.result).toHaveAttribute("data-exhaustive", "true");
  await auction.result.getByRole("button", { name: /Исключить лот|Exclude (?:auction )?lot/i }).first().click();

  const firstNewRequest = assemblyRequests(auction).length;
  auction.assemblyCompleteness = [false, false, true];
  await fullSearch(auction).click();
  await expect(auction.result).toHaveAttribute("data-exhaustive", "true");
  await auction.openBuildOptions(); await expect(auction.build).toBeEnabled();
  const steps = assemblyRequests(auction).slice(firstNewRequest);
  expect(steps).toHaveLength(3);
  expect(new Set(steps.map(body => body.clientRequestId)).size).toBe(3);
  for (const body of steps) {
    expect(body.clientRequestId).toMatch(/^[A-Za-z0-9_-]{16,100}$/);
    const decoded = decodeAuctionGearSelectionTransport(body);
    expect([...(decoded.excludedOptionIds as string[])].sort()).toEqual([...aliasIds].sort());
    expect(decoded.excludedVariantKeys).toEqual([JSON.stringify([wrist.itemId, `auction:${"a".repeat(32)}`])]);
    expect(body.searchId).toBe(searchResult().searchId);
  }
  await expect(auction.assembly.getByRole("button", { name: cancelAssembly })).toHaveCount(0);
  await expect(auction.result).toHaveAttribute("data-exhaustive", "true");
  await page.clock.install(); await page.clock.fastForward(180_000);
  expect(assemblyRequests(auction)).toHaveLength(firstNewRequest + 3);
  await page.screenshot({ path: info.outputPath("automatic-assembly-complete.png"), fullPage: true });
});

test("cancelling an automatic assembly step keeps the previous result and starts no further step", async ({ auction, page }) => {
  await initialQuick(auction); const initialAssemblies = assemblyRequests(auction).length;
  auction.assemblyCompleteness = [false, false, true]; auction.holdAssemblyStep = initialAssemblies + 2;
  await fullSearch(auction).click();
  await expect.poll(() => assemblyRequests(auction).length).toBe(initialAssemblies + 2);
  await expect(auction.result).toHaveAttribute("data-exhaustive", "false");
  await auction.assembly.getByRole("button", { name: cancelAssembly }).click();
  await expect.poll(() => auction.cancellationRequests.length).toBeGreaterThan(0);
  auction.release();
  await expect(auction.find).toBeEnabled();
  await expect(auction.assembly.getByRole("status").filter({ hasText: /Расчёт остановлен|Calculation stopped/ })).toBeVisible();
  await expect(auction.result).toBeVisible();
  await expect(auction.result).toHaveAttribute("data-price-state", "stale");
  await page.clock.install(); await page.clock.fastForward(180_000);
  expect(assemblyRequests(auction)).toHaveLength(initialAssemblies + 2);
});

test("a failed automatic next step keeps the previous confirmed result with stale prices and stops", async ({ auction, page }) => {
  await initialQuick(auction); const initialAssemblies = assemblyRequests(auction).length;
  auction.assemblyCompleteness = [false, false, true];
  await page.route("**/api/wow/auction-gear-plans**", async route => {
    const request = route.request();
    if (request.method() === "POST" && request.postDataJSON().action === "assemble" && assemblyRequests(auction).length === initialAssemblies + 1) auction.fail = true;
    await route.fallback();
  });
  await fullSearch(auction).click();
  await expect(auction.assembly.getByRole("alert")).toContainText(/Расчёт сейчас недоступен|Calculation is unavailable/);
  await expect(auction.result).toHaveAttribute("data-exhaustive", "false");
  await expect(auction.result).toHaveAttribute("data-price-state", "stale");
  await expect(auction.result).toContainText(/1[,.\s]?200/);
  await auction.openBuildOptions(); await expect(auction.build).toBeEnabled();
  await page.clock.install(); await page.clock.fastForward(180_000);
  expect(assemblyRequests(auction)).toHaveLength(initialAssemblies + 2);
});

test("a remotely cancelled automatic next step keeps the previous result with stale prices and stops", async ({ auction, page }) => {
  await initialQuick(auction);
  auction.assemblyCompleteness = [false, true];
  let steps = 0;
  await page.route("**/api/wow/auction-gear-plans**", async route => {
    const request = route.request();
    if (request.method() === "POST" && request.postDataJSON().action === "assemble" && ++steps === 2) {
      await route.fulfill({ status: 202, json: { id: "remotely-cancelled-step", status: "cancelled", mode: "assembly",
        result: null, progress: null, error: null, searchId: searchResult().searchId, scope: scope(auction.language) } });
      return;
    }
    await route.fallback();
  });
  await fullSearch(auction).click();
  await expect(auction.assembly.getByRole("status").filter({ hasText: /Расчёт остановлен|Calculation stopped/ })).toBeVisible();
  await expect(auction.result).toHaveAttribute("data-price-state", "stale");
  await expect(auction.result).toHaveAttribute("data-exhaustive", "false");
  await auction.openBuildOptions(); await expect(auction.build).toBeEnabled();
  await page.clock.install(); await page.clock.fastForward(180_000);
  expect(steps).toBe(2);
});

test("a quota rejection waits a minute and resumes automatically with a fresh request identity", async ({ auction, page }, info) => {
  await initialQuick(auction); const initialAssemblies = assemblyRequests(auction).length;
  await page.clock.install(); await page.clock.pauseAt(new Date());
  auction.assemblyCompleteness = [false, true]; auction.rateLimitedAssemblySteps.add(initialAssemblies + 2);
  await fullSearch(auction).click();
  await expect(auction.assembly.getByRole("status").filter({ hasText: waitingForQuota })).toBeVisible();
  await expect(auction.result).toHaveAttribute("data-exhaustive", "false");
  expect(assemblyRequests(auction)).toHaveLength(initialAssemblies + 2);
  await page.screenshot({ path: info.outputPath("automatic-assembly-quota-wait.png"), fullPage: true });
  await page.clock.fastForward(59_000);
  expect(assemblyRequests(auction)).toHaveLength(initialAssemblies + 2);
  await page.clock.runFor(1500);
  await expect(auction.result).toHaveAttribute("data-exhaustive", "true");
  await auction.openBuildOptions(); await expect(auction.build).toBeEnabled();
  expect(assemblyRequests(auction)).toHaveLength(initialAssemblies + 3);
  expect(new Set(assemblyRequests(auction).map(body => body.clientRequestId)).size).toBe(initialAssemblies + 3);
});

test("cancelling the quota wait aborts its scheduled automatic retry", async ({ auction, page }) => {
  await initialQuick(auction); const initialAssemblies = assemblyRequests(auction).length;
  await page.clock.install(); await page.clock.pauseAt(new Date());
  auction.assemblyCompleteness = [false, true]; auction.rateLimitedAssemblySteps.add(initialAssemblies + 2);
  await fullSearch(auction).click();
  await expect(auction.assembly.getByRole("status").filter({ hasText: waitingForQuota })).toBeVisible();
  await auction.assembly.getByRole("button", { name: cancelAssembly }).click();
  await expect(auction.find).toBeEnabled();
  await expect(auction.assembly.getByRole("status").filter({ hasText: /Расчёт остановлен|Calculation stopped/ })).toBeVisible();
  await page.clock.fastForward(180_000);
  expect(assemblyRequests(auction)).toHaveLength(initialAssemblies + 2);
  await expect(auction.result).toHaveAttribute("data-exhaustive", "false");
  await expect(auction.result).toHaveAttribute("data-price-state", "stale");
});

test("restoring an already completed incomplete checkpoint does not silently restart assembly", async ({ auction, page }) => {
  await restoreAssemblyHandle(page, auction, false);
  await auction.open();
  await expect(auction.result).toHaveAttribute("data-exhaustive", "false");
  await expect(auction.result).toHaveAttribute("data-price-state", "stale");
  await auction.openBuildOptions(); await expect(auction.build).toBeEnabled();
  await page.clock.install(); await page.clock.fastForward(180_000);
  expect(auction.requests).toHaveLength(0);
});

test("reattaching an observed active assembly continues automatically with its restored exclusions", async ({ auction, page }) => {
  const selection = await restoreAssemblyHandle(page, auction, true);
  auction.assemblyCompleteness = [false, true];
  await auction.open();
  await expect(auction.result).toHaveAttribute("data-exhaustive", "true");
  await expect(auction.result).toHaveAttribute("data-price-state", "calculated");
  await auction.openBuildOptions(); await expect(auction.build).toBeEnabled();
  const steps = assemblyRequests(auction);
  expect(steps).toHaveLength(2);
  for (const body of steps) expect(body).toMatchObject({ action: "assemble", searchId: searchResult().searchId, ...selection });
  expect(new Set(steps.map(body => body.clientRequestId)).size).toBe(2);
});

test("an unknown assembly POST outcome requires recovery before any automatic continuation", async ({ auction, page }) => {
  await initialQuick(auction); const initialAssemblies = assemblyRequests(auction).length;
  auction.assemblyCompleteness = [false, true]; auction.dropAction = "assemble";
  await fullSearch(auction).click();
  const recover = auction.assembly.getByRole("button", { name: /Повторить восстановление|Retry recovery/ });
  await expect(recover).toBeVisible();
  await page.clock.install(); await page.clock.fastForward(180_000);
  expect(assemblyRequests(auction)).toHaveLength(initialAssemblies + 1);
  // Explicit recovery keeps the previously chosen full intent, reads its
  // accepted checkpoint, and advances with a fresh continuation identity.
  const first = assemblyRequests(auction).at(-1)!;
  await recover.click();
  await expect(auction.result).toHaveAttribute("data-exhaustive", "true");
  expect(assemblyRequests(auction)).toHaveLength(initialAssemblies + 2);
  expect(auction.requestLookups).toContain(first.clientRequestId);
  expect(assemblyRequests(auction).at(-1)?.clientRequestId).not.toBe(first.clientRequestId);
});
