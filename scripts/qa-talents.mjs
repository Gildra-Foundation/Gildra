import { chromium } from "playwright";

const baseUrl = process.env.TALENTS_BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

try {
  const response = await page.goto(`${baseUrl}/talents`, { waitUntil: "commit", timeout: 120_000 });
  if (!response || response.status() !== 200) throw new Error(`Expected /talents to return 200, got ${response?.status() ?? "no response"}`);

  const nodes = page.locator(".tc-node");
  await nodes.first().waitFor({ state: "attached", timeout: 120_000 });
  await page.waitForTimeout(500);
  const nodeCount = await nodes.count();
  if (nodeCount === 0) throw new Error("No talent nodes rendered");
  const uniqueNodeCount = await nodes.evaluateAll((items) => new Set(items.map((item) => item.getAttribute("aria-label"))).size);
  const choiceCount = await page.locator(".tc-node.choice").count();
  const tieredCount = await page.locator(".tc-node.tiered").count();
  const lockedCount = await page.locator(".tc-node[aria-disabled='true']").count();

  const tooltipTexts = [];
  for (let index = 0; index < nodeCount; index += 1) {
    await nodes.nth(index).hover();
    await page.locator(".tc-tooltip").waitFor({ state: "visible", timeout: 3_000 });
    tooltipTexts.push(await page.locator(".tc-tooltip").innerText());
  }

  const allTooltips = tooltipTexts.join("\n");
  const rawTokenCount = (allTooltips.match(/\$[A-Za-z0-9]/g) ?? []).length;
  const misleadingFallbackCount = (allTooltips.match(/\bзначение\b/gi) ?? []).length;
  const negativePercentCount = (allTooltips.match(/-\d+(?:[.,]\d+)?%/g) ?? []).length;
  const malformedUnitCount = (allTooltips.match(/\bрадиус(?: действия)?\s+радиус\b|\b(?:время восстановления|длительность эффекта)\s+сек\.?|эффект зависит от контекста|цель:цели:целей|цели:\w+:\w+;|;\d+s\d+/gi) ?? []).length;
  const malformedLargeSecondsCount = (allTooltips.match(/\b\d{4,}\s*сек\.?/gi) ?? []).length;
  const tieredLabels = await page.locator(".tc-node.tiered").evaluateAll((items) => items.map((item) => item.getAttribute("aria-label") ?? ""));
  const apexDuplicateLabelCount = tieredLabels.filter((label) => {
    const names = label.split(" — ")[0].split(" или ").map((name) => name.trim()).filter(Boolean);
    return names.length > 1 && new Set(names).size !== names.length;
  }).length;
  const loadedIcons = await nodes.locator("img").evaluateAll((images) => images.filter((image) => image.naturalWidth > 0).length);
  const unmarkedIconSourceCount = await nodes.locator("img:not([data-icon-source])").count();

  const pvpSlots = page.locator("[data-pvp-slot]");
  const pvpSlotCount = await pvpSlots.count();
  if (pvpSlotCount !== 3) throw new Error(`Expected 3 PvP slots, got ${pvpSlotCount}`);
  await pvpSlots.nth(0).click();
  const pvpPicker = page.locator("#tc-pvp-picker");
  await pvpPicker.waitFor({ state: "visible" });
  const pvpOptions = pvpPicker.locator("[data-pvp-picker-id]");
  const pvpRosterCount = await pvpOptions.count();
  const pvpIds = await pvpOptions.evaluateAll((items) => items.map((item) => item.getAttribute("data-pvp-picker-id")));
  const pvpUniqueCount = new Set(pvpIds).size;
  await pvpOptions.locator("img").evaluateAll((images) => Promise.all(images.map((image) => image.complete ? Promise.resolve() : new Promise((resolve) => { image.addEventListener("load", resolve, { once: true }); image.addEventListener("error", resolve, { once: true }); }))));
  const pvpIconsLoaded = await pvpOptions.locator("img").evaluateAll((images) => images.filter((image) => image.naturalWidth > 0).length);
  await pvpOptions.filter({ hasText: "Инстинкт смерти" }).hover();
  await page.locator(".tc-tooltip").waitFor({ state: "visible", timeout: 3_000 });
  const pvpTooltipText = await page.locator(".tc-tooltip").innerText();
  const pvpTooltipRawTokenCount = (pvpTooltipText.match(/\$[A-Za-z0-9]/g) ?? []).length;
  const pvpTooltipMalformedValueCount = (pvpTooltipText.match(/\b\d{4,}\s*сек\.?|эффект зависит от контекста|точное значение не подтверждено/gi) ?? []).length;
  const pvpTooltipTexts = [];
  for (let index = 0; index < pvpRosterCount; index += 1) {
    const option = pvpOptions.nth(index);
    await option.hover();
    if (await page.locator(".tc-tooltip").count() === 0) await option.focus();
    await page.locator(".tc-tooltip").waitFor({ state: "visible", timeout: 3_000 });
    pvpTooltipTexts.push(await page.locator(".tc-tooltip").innerText());
  }
  const pvpAllTooltipText = pvpTooltipTexts.join("\n");
  const pvpAllTooltipRawTokenCount = (pvpAllTooltipText.match(/\$[A-Za-z0-9]/g) ?? []).length;
  const pvpAllTooltipMalformedValueCount = (pvpAllTooltipText.match(/\b\d{4,}\s*сек\.?|эффект зависит от контекста|точное значение не подтверждено/gi) ?? []).length;
  await pvpOptions.filter({ hasText: "Инстинкт смерти" }).click();
  await pvpSlots.nth(1).click();
  const duplicatePvp = page.locator('[data-pvp-picker-id="179"]');
  const duplicatePvpDisabled = await duplicatePvp.isDisabled();
  await pvpOptions.filter({ hasText: "Отскок" }).click();
  const pvpSelectedCount = await page.locator("[data-pvp-slot][data-pvp-id]").count();
  const pvpIconsInSlots = await pvpSlots.locator("img").evaluateAll((images) => images.filter((image) => image.naturalWidth > 0).length);

  const dependencyPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const dependencyPayload = Buffer.from(JSON.stringify({ ranks: [["class-90343", 1]], choices: [] })).toString("base64url");
  await dependencyPage.goto(`${baseUrl}/talents?loadout=${dependencyPayload}`, { waitUntil: "commit", timeout: 120_000 });
  await dependencyPage.locator(".tc-node").first().waitFor({ state: "attached", timeout: 120_000 });
  const crossTreeDependency = { tested: true, passed: (await dependencyPage.locator(".tc-hero-panel .tc-node:not([aria-disabled='true'])").count()) >= 1, unlockedHeroNodes: await dependencyPage.locator(".tc-hero-panel .tc-node:not([aria-disabled='true'])").count() };
  await dependencyPage.close();
  const cascadePage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await cascadePage.goto(`${baseUrl}/talents`, { waitUntil: "commit", timeout: 120_000 });
  await cascadePage.locator(".tc-node").first().waitFor({ state: "attached", timeout: 120_000 });
  const parentNode = cascadePage.locator('[data-node-id="class-90325"]');
  const childNode = cascadePage.locator('[data-node-id="class-90344"]');
  await parentNode.click();
  await childNode.click();
  await parentNode.click({ button: "right" });
  const cascadeChildLabel = await childNode.getAttribute("aria-label");
  const cascadePassed = cascadeChildLabel?.includes("ранг 0 из") === true;
  await cascadePage.close();
  const illegalPayload = Buffer.from(JSON.stringify({ v: 1, ranks: [["class-90344", 1]], choices: [] })).toString("base64url");
  const illegalPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await illegalPage.goto(`${baseUrl}/talents?loadout=${illegalPayload}`, { waitUntil: "commit", timeout: 120_000 });
  await illegalPage.locator(".tc-node").first().waitFor({ state: "attached", timeout: 120_000 });
  const illegalLoadoutPoints = await illegalPage.locator(".tc-total-points").innerText();
  const illegalLoadoutNotice = await illegalPage.locator(".tc-toast").innerText();
  await illegalPage.close();

  await nodes.first().click();
  const selectedPoints = await page.locator(".tc-total-points").innerText();
  const loadoutUrl = page.url();
  const loadoutPayload = JSON.parse(Buffer.from(new URL(loadoutUrl).searchParams.get("loadout"), "base64url").toString("utf8"));
  await page.reload({ waitUntil: "commit", timeout: 120_000 });
  await page.locator(".tc-node").first().waitFor({ state: "attached", timeout: 120_000 });
  const restoredPoints = await page.locator(".tc-total-points").innerText();
  const restoredUrl = page.url();
  const restoredTooltipCount = await page.locator(".tc-tooltip").count();
  await page.locator(".tc-import").click();
  await page.getByRole("menuitem", { name: "Сбросить таланты" }).click();
  const undoPoints = await page.locator(".tc-total-points").innerText();
  const undoVisible = await page.getByRole("button", { name: "Отменить" }).isVisible();
  await page.getByRole("button", { name: "Отменить" }).click();
  const undonePoints = await page.locator(".tc-total-points").innerText();
  const firstNodeAfterReload = page.locator(".tc-node").first();
  await firstNodeAfterReload.click({ button: "right" });
  const resetPoints = await page.locator(".tc-total-points").innerText();
  await page.getByLabel("Поиск талантов").fill("нет такого таланта");
  const dimmedNodes = await page.locator(".tc-node.is-dimmed").count();
  const dimmedEdges = await page.locator(".tc-lines line.is-dimmed").count();
  await page.locator(".tc-import").click();
  const menuVisible = await page.locator(".tc-loadout-popover").isVisible();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload({ waitUntil: "commit", timeout: 120_000 });
  await page.locator(".tc-node").first().waitFor({ state: "attached", timeout: 120_000 });
  await page.locator(".tc-node").first().hover();
  const reducedMotion = await page.locator(".tc-tooltip").evaluate((tooltip) => ({ animationName: getComputedStyle(tooltip).animationName, transitionDuration: getComputedStyle(tooltip).transitionDuration }));
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const mobileErrors = [];
  mobile.on("pageerror", (error) => mobileErrors.push(String(error)));
  mobile.on("console", (message) => { if (message.type() === "error") mobileErrors.push(message.text()); });
  await mobile.goto(`${baseUrl}/talents`, { waitUntil: "commit", timeout: 120_000 });
  await mobile.locator(".tc-node").first().waitFor({ state: "attached", timeout: 120_000 });
  const mobileLayout = await mobile.evaluate(() => { const workspace = document.querySelector(".tc-workspace"); const heads = document.querySelector(".tc-column-heads"); const pvp = document.querySelector(".tc-pvp-group"); return { documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, workspaceOverflow: Boolean(workspace && workspace.scrollWidth > workspace.clientWidth), headerOverflow: Boolean(heads && heads.scrollWidth > heads.clientWidth), pvpVisible: Boolean(pvp && getComputedStyle(pvp).display !== "none"), pvpOverflow: Boolean(pvp && pvp.scrollWidth > pvp.clientWidth), pvpTouchTarget: Math.min(...[...document.querySelectorAll("[data-pvp-slot]")].map((item) => item.getBoundingClientRect().width)), panels: document.querySelectorAll(".tc-panel").length }; });
  const mobilePvpSlot = mobile.locator("[data-pvp-slot]").first();
  await mobilePvpSlot.click();
  await mobile.locator("#tc-pvp-picker").waitFor({ state: "visible" });
  await mobile.waitForTimeout(250);
  const mobileModal = await mobile.evaluate(() => ({ inertBackground: document.querySelectorAll(".talent-calculator > [inert]").length >= 1, closeTarget: document.querySelector(".tc-pvp-close")?.getBoundingClientRect().width ?? 0, clearTarget: document.querySelector(".tc-pvp-clear")?.getBoundingClientRect().height ?? 0 }));
  await mobile.locator("[data-pvp-option]:not([disabled])").first().press("ArrowDown");
  const mobileArrowFocus = await mobile.evaluate(() => document.activeElement?.matches('[data-pvp-option]:not([disabled])') === true);
  await mobile.keyboard.press("Escape");
  const mobileFocusRestored = await mobile.evaluate(() => document.activeElement?.matches("[data-pvp-slot]") === true);
  const narrow = await browser.newPage({ viewport: { width: 320, height: 844 } });
  await narrow.goto(`${baseUrl}/talents`, { waitUntil: "commit", timeout: 120_000 });
  await narrow.locator(".tc-node").first().waitFor({ state: "attached", timeout: 120_000 });
  const narrowLayout = await narrow.evaluate(() => ({ documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, headerOverflow: (document.querySelector(".tc-column-heads")?.scrollWidth ?? 0) > (document.querySelector(".tc-column-heads")?.clientWidth ?? 0) }));
  await narrow.close();
  await mobile.close();

  const result = { status: response.status(), nodeCount, uniqueNodeCount, choiceCount, tieredCount, lockedCount, loadedIcons, tooltipCount: tooltipTexts.length, restoredTooltipCount, withSeconds: tooltipTexts.filter((text) => /сек\.?|секунд/i.test(text)).length, withPercent: tooltipTexts.filter((text) => /%/.test(text)).length, rawTokenCount, misleadingFallbackCount, negativePercentCount, malformedUnitCount, malformedLargeSecondsCount, apexDuplicateLabelCount, unmarkedIconSourceCount, pvpSlotCount, pvpRosterCount, pvpUniqueCount, pvpIconsLoaded, pvpTooltipRawTokenCount, pvpTooltipMalformedValueCount, pvpAllTooltipRawTokenCount, pvpAllTooltipMalformedValueCount, duplicatePvpDisabled, pvpSelectedCount, pvpIconsInSlots, loadoutVersion: loadoutPayload.v, loadoutPvp: loadoutPayload.pvp, crossTreeDependency, cascadePassed, cascadeChildLabel, illegalLoadoutPoints, illegalLoadoutNotice, selectedPoints, restoredPoints, undoPoints, undoVisible, undonePoints, resetPoints, loadoutPersisted: loadoutUrl.includes("loadout=") && restoredUrl.includes("loadout=") && restoredPoints.includes("1 очко") && loadoutPayload.v === 2 && loadoutPayload.pvp?.length === 3, dimmedNodes, dimmedEdges, menuVisible, reducedMotion, mobileLayout, mobileModal, mobileArrowFocus, mobileFocusRestored, narrowLayout, errors: [...errors, ...mobileErrors] };
  console.log(JSON.stringify(result, null, 2));
  if (rawTokenCount || misleadingFallbackCount || negativePercentCount || malformedUnitCount || malformedLargeSecondsCount || apexDuplicateLabelCount || unmarkedIconSourceCount || pvpRosterCount !== 10 || pvpUniqueCount !== 10 || pvpIconsLoaded !== 10 || pvpTooltipRawTokenCount || pvpTooltipMalformedValueCount || pvpAllTooltipRawTokenCount || pvpAllTooltipMalformedValueCount || !duplicatePvpDisabled || pvpSelectedCount !== 2 || pvpIconsInSlots !== 2 || errors.length || mobileErrors.length || loadedIcons !== nodeCount || uniqueNodeCount !== nodeCount || choiceCount === 0 || tieredCount === 0 || restoredTooltipCount > 1 || !menuVisible || !undoVisible || !result.loadoutPersisted || !undonePoints.includes("1 очко") || !illegalLoadoutPoints.includes("0 очков") || !illegalLoadoutNotice.includes("недоступные таланты") || !cascadePassed || !dimmedEdges || (crossTreeDependency.tested && !crossTreeDependency.passed) || reducedMotion.animationName !== "none" || mobileLayout.documentOverflow || mobileLayout.headerOverflow || !mobileLayout.pvpVisible || mobileLayout.pvpOverflow || mobileLayout.pvpTouchTarget < 44 || narrowLayout.documentOverflow || narrowLayout.headerOverflow || !mobileArrowFocus || !mobileFocusRestored || !mobileModal.inertBackground || mobileModal.closeTarget < 44 || mobileModal.clearTarget < 44) process.exitCode = 1;
} finally {
  await browser.close();
}
