import { chromium } from "playwright";

const baseURL = (process.env.TALENT_OPTIMIZER_UI_BASE_URL ?? "http://127.0.0.1:5173").replace(/\/$/, "");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const candidateLoadout = "CgEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgGDzMmZ2MzMzMDjZmZGzMzsMzMmZmZzYmBAAixy2ALgJYGmAzwGwMDjFAAYmhxYYMYM";
const makeEntry = (index, tree, deltaPercent) => ({
  candidateId: tree + "-candidate-" + index,
  loadout: candidateLoadout,
  tree,
  kind: index === 2 ? "choice" : "rank-swap",
  changes: [
    { nodeId: 108542 + index, nodeKey: "class-108542", name: "Текущий талант", rankDelta: -1 },
    { nodeId: 108674 + index, nodeKey: "class-108674", name: "Новый талант", rankDelta: 1 },
  ],
  dps: Math.round(100000 * (1 + deltaPercent / 100)),
  dpsError: 100,
  deltaDps: Math.round(100000 * deltaPercent / 100),
  deltaPercent,
  marginDps: 277,
  significant: Math.abs(deltaPercent) > .3,
  fromCache: false,
  singleTargetDps: Math.round(100000 * (1 + deltaPercent / 100)),
  singleTargetDeltaPercent: deltaPercent,
  aoeDps: Math.round(240000 * (1 + (deltaPercent - .5) / 100)),
  aoeDeltaPercent: deltaPercent - .5,
});
const entries = [makeEntry(0, "spec", 3), makeEntry(1, "hero", 1.2), makeEntry(2, "class", -.4)];
const baseJob = {
  id: "ui-optimizer-job", status: "running", phase: "candidates", completed: 2, total: 9,
  results: [entries[0]], result: null, error: null,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
const submitted = [];
let starts = 0;
let reads = 0;
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) errors.push(message.text());
});
await page.route("**/api/wow/talent-simulation", (route) => route.fulfill({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    singleTargetDelta: 0, aoeDelta: 0, baselineSingleTargetDps: 100000, candidateSingleTargetDps: 100000,
    baselineAoeDps: 240000, candidateAoeDps: 240000, engine: "SimulationCraft UI QA", iterations: 10000,
    encounter: { duration: 60, aoeTargets: 5 }, uncertainty: { confidence: 95, singleTargetDps: 0, singleTargetPercent: 0, aoeDps: 0, aoePercent: 0 },
    statDeltas: { primary: 0, crit: 0, haste: 0, mastery: 0, versatility: 0 },
  }),
}));
await page.route("**/api/wow/talent-optimizer**", async (route) => {
  const request = route.request();
  if (request.method() === "POST") {
    starts += 1;
    submitted.push(request.postDataJSON());
    reads = 0;
    await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ ...baseJob, status: "queued", phase: "queued", completed: 0, results: [] }) });
    return;
  }
  if (request.method() === "DELETE") {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...baseJob, status: "cancelled", error: "cancelled" }) });
    return;
  }
  reads += 1;
  if (starts > 1 || reads === 1) {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(baseJob) });
    return;
  }
  const completed = {
    ...baseJob, status: "completed", phase: "verification", completed: 9, results: entries,
    result: {
      baseline: { dps: 100000, dpsError: 100, engine: "SimulationCraft UI QA", iterations: 10000, confidence: 95, fromCache: false },
      results: entries,
      winner: entries[0],
      verification: { dps: 103000, dpsError: 100, engine: "SimulationCraft UI QA", iterations: 10000, confidence: 95, fromCache: false },
      verifiedWinnerDpsDelta: 0,
    },
  };
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(completed) });
});

try {
  await page.goto(baseURL + "/ru/wow/demo/furybar", { waitUntil: "domcontentloaded", timeout: 120000 });
  const optimizer = page.getByRole("region", { name: "Найти лучший соседний билд автоматически" });
  await optimizer.waitFor();
  await optimizer.getByRole("button", { name: /AoE PvE/ }).click();
  await optimizer.getByRole("button", { name: "Начать подбор" }).click();
  await optimizer.getByText("Сравниваем варианты").waitFor();
  await optimizer.getByText("2 из 9 расчётов завершено").waitFor();
  await optimizer.getByText("Найден прирост 3.00%").waitFor();
  await optimizer.getByRole("heading", { name: "Лучшие варианты" }).waitFor();
  await optimizer.getByText("ST: +3.00%").waitFor();
  await optimizer.getByText("AoE: +2.50%").waitFor();
  assert(await optimizer.locator("ol > li").count() === 3, "Optimizer did not render top three variants");
  assert(submitted[0]?.scenario === "pve-aoe" && submitted[0]?.maxCandidates === 8, "Selected scenario or bounded budget was not sent to the optimizer");
  const appliedSimulation = page.waitForRequest((request) => request.url().includes("/api/wow/talent-simulation") && request.method() === "POST" && request.postDataJSON()?.candidateLoadout === candidateLoadout, { timeout: 30000 });
  await optimizer.getByRole("button", { name: "Применить" }).first().click();
  await optimizer.getByRole("button", { name: "Применён" }).waitFor();
  await appliedSimulation;

  const buildManager = page.getByRole("region", { name: "Выберите, где будете играть" });
  await buildManager.getByLabel("Название билда").fill("QA автоподбор AoE");
  await buildManager.getByRole("button", { name: "Сохранить", exact: true }).click();
  await buildManager.getByText("Билд сохранён на этом устройстве.").waitFor();
  const revertedSimulation = page.waitForRequest((request) => request.url().includes("/api/wow/talent-simulation") && request.method() === "POST" && request.postDataJSON()?.candidateLoadout !== candidateLoadout && request.postDataJSON()?.editDistance === 0, { timeout: 30000 });
  await page.getByRole("button", { name: "Вернуть исходный билд" }).click();
  await revertedSimulation;

  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  const buildManagerAfterReload = page.getByRole("region", { name: "Выберите, где будете играть" });
  await Promise.all([
    page.waitForRequest((request) => request.url().includes("/api/wow/talent-simulation") && request.method() === "POST" && request.postDataJSON()?.candidateLoadout === candidateLoadout, { timeout: 30000 }),
    buildManagerAfterReload.getByRole("button", { name: /^QA автоподбор AoE / }).click(),
  ]);
  const optimizerAfterReload = page.getByRole("region", { name: "Найти лучший соседний билд автоматически" });

  await optimizerAfterReload.getByRole("button", { name: /Начать подбор|Подобрать заново/ }).click();
  await optimizerAfterReload.getByRole("button", { name: "Остановить" }).click();
  await optimizerAfterReload.getByText("Подбор остановлен").waitFor();

  await page.setExtraHTTPHeaders({ "x-gildra-qa-mode": "battle-net-evidence" });
  await page.goto(baseURL + "/ru/wow/demo/furybar", { waitUntil: "domcontentloaded", timeout: 120000 });
  const realOptimizer = page.getByRole("region", { name: "Найти лучший соседний билд автоматически" });
  await realOptimizer.getByRole("button", { name: /Начать подбор|Подобрать заново/ }).click();
  await realOptimizer.getByRole("button", { name: "Остановить" }).click();
  assert(submitted.at(-1)?.dataMode === "battle-net" && submitted.at(-1)?.characterSlug === "furybar", "Real character page did not forward its Battle.net context to the optimizer");

  const responsive = {};
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    responsive[width] = overflow;
    assert(overflow <= 1, "Horizontal overflow at " + width + "px: " + overflow + "px");
  }
  assert(errors.length === 0, "Browser errors: " + errors.join(" | "));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await realOptimizer.screenshot({ path: ".artifacts/talent-optimizer-ui.png" });
  console.log(JSON.stringify({ status: "passed", starts, scenario: submitted[0].scenario, realCharacterContext: submitted.at(-1).dataMode, applied: true, reverted: true, saved: true, restoredAfterReload: true, cancellation: true, topVariants: 3, responsive, browserErrors: errors }, null, 2));
} finally {
  await browser.close();
}
