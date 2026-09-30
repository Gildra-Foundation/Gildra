import { chromium } from "playwright";

const baseURL = (process.env.CHARACTER_TALENTS_BASE_URL ?? "http://127.0.0.1:5173").replace(/\/$/, "");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
const requests = [];
const rotationRequests = [];

page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) errors.push(message.text());
});
await page.route("**/api/wow/talent-simulation", async (route) => {
  const body = route.request().postDataJSON();
  requests.push(body);
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      singleTargetDelta: 0,
      aoeDelta: 0,
      baselineSingleTargetDps: 300000,
      candidateSingleTargetDps: 300000,
      baselineAoeDps: 500000,
      candidateAoeDps: 500000,
      engine: "SimulationCraft QA",
      iterations: 750,
      encounter: { duration: 60, aoeTargets: 5 },
      statDeltas: { primary: 0, crit: 0, haste: 0, mastery: 0, versatility: 0 },
    }),
  });
});
await page.route("**/api/platform/rotation/simulations", async (route) => {
  const input = route.request().postDataJSON();
  rotationRequests.push(input);
  const sequence = [...input.rules, ...input.rules].slice(0, 12);
  await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({
    id: "qa-character-rotation", status: "completed", engine: "SimulationCraft QA", modelNotice: "QA",
    resourceLabel: "Rage", scenario: input.scenario, fightLengthSeconds: input.fightLengthSeconds, targets: input.targets,
    iterations: 750, confidence: 95, dps: 412345, dpsSeries: [400000, 412345], enrageUptime: 90,
    rageEfficiency: 91, castsPerMinute: 42, baselineDelta: 0,
    casts: sequence.map((abilityId, index) => ({ id: `cast-${index}`, abilityId, time: index * 1.5, lane: "global" })),
    recommendedSequence: sequence, rage: [{ time: 0, value: 0 }, { time: 1, value: 50 }], resources: [], procs: [], cooldowns: [], abilities: [],
    accuracy: { mode: "simulationcraft-armory", rotationSource: "user-priority-model", considers: ["gear", "talents", "priority"], limitations: [] },
    findings: [], bossEvents: [], metrics: [{ label: "Actions Per Min", value: "42" }],
  }) });
});

try {
  await page.goto(`${baseURL}/ru/wow/demo/furybar`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.getByRole("heading", { name: "Выберите, где будете играть" }).waitFor({ timeout: 120000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  const manager = page.getByRole("region", { name: "Выберите, где будете играть" });

  const modes = manager.getByRole("group", { name: "Режим расчёта" }).getByRole("button");
  if (await modes.count() !== 4) throw new Error("Expected exactly four working PvE mode cards");
  await manager.getByRole("group", { name: "Режим расчёта" }).getByRole("button", { name: /^AoE PvE/ }).click();
  await page.waitForTimeout(800);
  if (requests.at(-1)?.scenario !== "pve-aoe") throw new Error("AoE mode did not change simulation conditions");

  await page.getByRole("navigation", { name: "Деревья талантов" }).getByRole("button", { name: /^Специализация/ }).click();
  const directionStats = await page.locator(".talent-calculator .tc-lines line").evaluateAll((lines) => ({
    total: lines.length,
    leftToRight: lines.filter((line) => Number(line.getAttribute("x2")) > Number(line.getAttribute("x1"))).length,
    arrows: lines.filter((line) => Boolean(line.getAttribute("marker-end"))).length,
  }));
  if (!directionStats.total || directionStats.leftToRight / directionStats.total < .8) throw new Error(`Talent tree is not predominantly left-to-right: ${JSON.stringify(directionStats)}`);
  if (directionStats.arrows !== directionStats.total) throw new Error("Not every talent connection has a direction arrow");
  const selected = page.locator(".talent-calculator .tc-tree-canvas button.tc-node[aria-pressed='true']").first();
  await selected.click({ button: "right" });
  await page.waitForTimeout(800);
  const savedLoadout = requests.at(-1)?.candidateLoadout;
  if (!savedLoadout) throw new Error("Talent edit did not create an export string");

  const rotationLab = page.getByRole("region", { name: "Тренер ротации персонажа" });
  await rotationLab.getByRole("heading", { name: "Проверка ротации персонажа" }).waitFor();
  await rotationLab.getByRole("button", { name: /Запустить симуляцию/ }).click();
  await rotationLab.getByText("412", { exact: false }).first().waitFor({ timeout: 10000 });
  const rotationRequest = rotationRequests.at(-1);
  if (rotationRequest?.characterSlug !== "furybar" || rotationRequest?.dataMode !== "fixture") throw new Error("Embedded rotation lab lost character context");
  if (rotationRequest?.talentLoadout !== savedLoadout) throw new Error("Embedded rotation lab did not receive the edited talent loadout");

  await manager.getByLabel("Название билда").fill("QA большие паки");
  await manager.getByRole("button", { name: /^Сохранить$/ }).click();
  await page.getByText("Билд сохранён на этом устройстве.").waitFor();
  await manager.getByRole("button", { name: /^QA большие паки/ }).waitFor();

  await page.getByRole("button", { name: "Вернуть исходный билд" }).click();
  await manager.getByRole("button", { name: /^QA большие паки/ }).click();
  await page.waitForTimeout(800);
  if (requests.at(-1)?.candidateLoadout !== savedLoadout) throw new Error("Saved build did not restore the exact talent export");

  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  await page.getByRole("region", { name: "Выберите, где будете играть" }).getByRole("button", { name: /^QA большие паки/ }).waitFor({ timeout: 120000 });
  await page.screenshot({ path: ".artifacts/character-build-manager.png", fullPage: true });

  const responsive = {};
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    responsive[width] = overflow;
    if (overflow > 1) throw new Error(`Horizontal overflow at ${width}px: ${overflow}px`);
  }

  await page.getByRole("button", { name: "Удалить билд QA большие паки" }).click();
  await page.getByText("Сохранённый билд удалён.").waitFor();
  if (errors.length) throw new Error(`Browser errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({ status: "passed", modes: 4, saveLoadReloadDelete: true, embeddedRotation: true, talentLoadoutSynced: true, directionStats, responsive, browserErrors: errors }, null, 2));
} finally {
  await browser.close();
}
