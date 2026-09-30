import { chromium } from "playwright";

const baseURL = (process.env.CHARACTER_DPS_BASE_URL ?? "http://127.0.0.1:5173").replace(/\/$/, "");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
const submitted = [];

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const closeToZero = (value) => Number.isFinite(value) && Math.abs(value) < .005;

page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) errors.push(message.text());
});
page.on("request", (request) => {
  if (!request.url().includes("/api/wow/talent-simulation") && !request.url().includes("/api/platform/rotation/simulations")) return;
  try { submitted.push({ url: request.url(), body: request.postDataJSON() }); } catch { /* no-op */ }
});

try {
  const initialResponsePromise = page.waitForResponse((response) => response.url().includes("/api/wow/talent-simulation"), { timeout: 120_000 });
  await page.goto(`${baseURL}/ru/wow/demo/furybar`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  const initialResponse = await initialResponsePromise;
  const initial = await initialResponse.json();
  assert(initialResponse.ok(), `Initial talent simulation failed: ${initialResponse.status()} ${JSON.stringify(initial)}`);
  assert(initial.source === "simulationcraft" && String(initial.engine).startsWith("SimulationCraft"), "Initial talent result is not real SimulationCraft output");
  assert(initial.baselineSingleTargetDps > 0 && initial.baselineAoeDps > 0, "Initial DPS is missing");
  assert(closeToZero(initial.singleTargetDelta) && closeToZero(initial.aoeDelta), "Unchanged build must be exactly the baseline");

  const changedResponsePromise = page.waitForResponse((response) => response.url().includes("/api/wow/talent-simulation"), { timeout: 120_000 });
  await page.getByRole("button", { name: /^Wrath and Fury, ранг 1 из 1/ }).click({ button: "right" });
  const changedResponse = await changedResponsePromise;
  const changed = await changedResponse.json();
  assert(changedResponse.ok(), `Changed talent simulation failed: ${changedResponse.status()} ${JSON.stringify(changed)}`);
  assert(changed.candidateSingleTargetDps < changed.baselineSingleTargetDps, "Removing Wrath and Fury unexpectedly increased single-target DPS");
  assert(changed.candidateAoeDps <= changed.baselineAoeDps * 1.0025, "Removing talents unexpectedly increased AoE DPS");
  assert(changed.uncertainty?.singleTargetDps > 0 && changed.uncertainty?.aoeDps > 0, "Changed build is missing SimulationCraft uncertainty");
  await page.getByText(/дерево отключило ещё 3 зависимых/).waitFor();
  await page.getByText(/Считается сразу несколько изменений: 4/).waitFor();
  await page.getByRole("heading", { name: "Сняты вручную" }).waitFor();
  const automaticChanges = page.getByRole("heading", { name: "Автоматически отключены" }).locator("..").locator("article");
  const automaticRanks = (await automaticChanges.locator("em").allTextContents()).reduce((sum, value) => sum + Math.abs(Number(value.replace(/[^0-9.-]/g, "")) || 0), 0);
  assert(automaticRanks === 3, `Dependent pruning lists ${automaticRanks} automatically disabled ranks instead of 3`);
  await page.getByText("Абсолютная разница:", { exact: false }).first().waitFor();
  await page.getByText("Погрешность:", { exact: false }).first().waitFor();

  const talentRequest = submitted.filter((entry) => entry.url.includes("/api/wow/talent-simulation")).at(-1)?.body;
  assert(talentRequest?.editDistance === 4 && talentRequest?.removedRanks === 4, "Dependent talent pruning was not represented in the request");

  const rotationResponsePromise = page.waitForResponse((response) => response.url().includes("/api/platform/rotation/simulations"), { timeout: 120_000 });
  const lab = page.getByRole("region", { name: "Тренер ротации персонажа" });
  await lab.getByRole("button", { name: /Запустить симуляцию/ }).click();
  const rotationResponse = await rotationResponsePromise;
  const rotation = await rotationResponse.json();
  const rotationRequest = submitted.filter((entry) => entry.url.includes("/api/platform/rotation/simulations")).at(-1)?.body;
  assert(rotationResponse.ok(), `Embedded rotation failed: ${rotationResponse.status()} ${JSON.stringify(rotation)}`);
  assert(rotationRequest?.talentLoadout === talentRequest.candidateLoadout, "Talent candidate was not forwarded to the embedded rotation lab");
  assert(rotation.accuracy?.rotationSource === "user-priority-model" && String(rotation.engine).startsWith("SimulationCraft"), "Rotation result is not a real custom-APL SimulationCraft result");
  assert(rotation.dps > 0, "Rotation DPS is missing");

  const apiMatrix = await page.evaluate(async ({ candidateLoadout, normalRules }) => {
    const call = async (scenario, targets, rules) => {
      const response = await fetch("/api/platform/rotation/simulations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spec: "fury-warrior", scenario, fightLengthSeconds: 60, targets, rules, talentLoadout: candidateLoadout, characterSlug: "furybar", dataMode: "fixture" }) });
      return { status: response.status, payload: await response.json() };
    };
    const badRules = [normalRules.at(-1)];
    return {
      normal: await call("single-target", 1, normalRules),
      repeat: await call("single-target", 1, normalRules),
      bad: await call("single-target", 1, badRules),
      aoe3: await call("aoe", 3, normalRules),
      aoe8: await call("aoe", 8, normalRules),
    };
  }, { candidateLoadout: talentRequest.candidateLoadout, normalRules: rotationRequest.rules });
  for (const [name, result] of Object.entries(apiMatrix)) assert(result.status === 201, `${name} live matrix request failed: ${result.status}`);
  assert(apiMatrix.normal.payload.dps === apiMatrix.repeat.payload.dps, "Identical deterministic SimulationCraft requests returned different DPS");
  assert(apiMatrix.bad.payload.dps < apiMatrix.normal.payload.dps, "A deliberately worse priority did not reduce DPS");
  assert(apiMatrix.aoe8.payload.dps >= apiMatrix.aoe3.payload.dps, "Total AoE DPS decreased when target count increased");

  const responsive = {};
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    responsive[width] = overflow;
    assert(overflow <= 1, `Horizontal overflow at ${width}px: ${overflow}px`);
  }
  assert(errors.length === 0, `Browser errors: ${errors.join(" | ")}`);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: ".artifacts/character-dps-live.png", fullPage: true });
  console.log(JSON.stringify({
    status: "passed",
    engine: rotation.engine,
    initial: { singleTarget: initial.baselineSingleTargetDps, aoe5: initial.baselineAoeDps },
    withoutWrathAndFury: { singleTarget: changed.candidateSingleTargetDps, singleTargetDelta: changed.singleTargetDelta, aoe5: changed.candidateAoeDps, aoeDelta: changed.aoeDelta, removedRanks: talentRequest.removedRanks },
    rotationDps: rotation.dps,
    matrix: Object.fromEntries(Object.entries(apiMatrix).map(([key, value]) => [key, value.payload.dps])),
    responsive,
    browserErrors: errors,
  }, null, 2));
} finally {
  await browser.close();
}
