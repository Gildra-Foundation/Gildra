import { chromium } from "playwright";

const baseURL = (process.env.CHARACTER_GEAR_BASE_URL ?? "http://127.0.0.1:5173").replace(/\/$/, "");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const candidate = (id, name, source, overrides = {}) => ({
  entityId: `entity-${id}`, itemId: id, name, iconUrl: "https://wow.zamimg.com/images/wow/icons/large/inv_jewelry_amulet_01.jpg",
  itemLevel: 540, slotType: "HEAD", inventoryType: 1, eligible: true, rejectionReasons: [],
  variants: [{ key: `verified-${id}`, itemLevel: 540, bonusIds: [12040 + id % 10] }],
  source: { type: source, evidence: "catalog", name: source === "crafting_recipe" ? "Кузнечное дело" : "Совет кузни", location: source === "encounter" ? "Отравленная бездна" : undefined },
  season: { id: "midnight-season-2", patch: "12.1", status: "current", evidence: "verified" },
  constraints: { uniqueEquipped: false, crafted: source === "crafting_recipe", setName: id === 910001 ? "Латы сезона" : undefined, allowableClassMask: "1", requiredLevel: 90 },
  provenance: { build: "12.1.0.69814" }, ...overrides,
});
const candidates = [
  candidate(910001, "Корона доказанного натиска", "encounter", { constraints: { uniqueEquipped: true, crafted: false, setName: "Латы сезона", allowableClassMask: "1", requiredLevel: 90 } }),
  candidate(910002, "Шлем кузнеца Бездны", "crafting_recipe"),
  candidate(910003, "Забрало торговца", "vendor"),
  candidate(910004, "Шлем без источника", "unknown", { source: { type: "unknown", evidence: "missing" }, season: { id: "midnight-season-2", patch: "12.1", status: "unknown", evidence: "missing" } }),
];
const comparisons = {
  910001: { baselineDps: 100000, candidateDps: 104000, deltaDps: 4000, deltaPercent: 4, uncertainty: { marginDps: 300, marginPercent: .3, significant: true } },
  910002: { baselineDps: 100000, candidateDps: 100200, deltaDps: 200, deltaPercent: .2, uncertainty: { marginDps: 300, marginPercent: .3, significant: false } },
  910003: { baselineDps: 100000, candidateDps: 98000, deltaDps: -2000, deltaPercent: -2, uncertainty: { marginDps: 300, marginPercent: .3, significant: true } },
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, extraHTTPHeaders: { "x-gildra-qa-mode": "battle-net-evidence" } });
const errors = [];
const simulationRequests = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => { if (message.type() === "error" && !message.text().startsWith("Failed to load resource:") && !message.text().includes("A tree hydrated")) errors.push(message.text()); });
await page.route("**/api/wow/talent-simulation", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ singleTargetDelta: 0, aoeDelta: 0, baselineSingleTargetDps: 100000, candidateSingleTargetDps: 100000, baselineAoeDps: 200000, candidateAoeDps: 200000, engine: "SimulationCraft QA", iterations: 750, encounter: { duration: 60, aoeTargets: 5 }, uncertainty: { confidence: 95, singleTargetDps: 0, singleTargetPercent: 0, aoeDps: 0, aoePercent: 0 }, statDeltas: { primary: 0, crit: 0, haste: 0, mastery: 0, versatility: 0 } }) }));
await page.route("**/api/wow/gear-candidates", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidates, rejectedByReason: { season_unverified: 2, simulation_variant_missing: 2 }, season: { id: "midnight-season-2", patch: "12.1", build: "12.1.0.69814" } }) }));
await page.route("**/api/wow/gear-simulation", async (route) => {
  const body = route.request().postDataJSON();
  simulationRequests.push(body);
  const measured = comparisons[body.candidateItemId];
  await route.fulfill({ status: 200, contentType: "application/json", headers: { "X-Gildra-Engine": "simulationcraft" }, body: JSON.stringify({ ...measured, confidence: 95, iterations: 750, engine: "SimulationCraft QA", scenario: { id: body.scenario, fightLengthSeconds: body.scenario === "aoe" ? 60 : 120, targets: body.scenario === "aoe" ? 5 : 1 } }) });
});

try {
  await page.goto(`${baseURL}/ru/wow/demo/furybar`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const optimizer = page.getByRole("region", { name: "Какая вещь действительно усилит персонажа" });
  await optimizer.waitFor({ timeout: 120000 });
  await optimizer.getByText("Корона доказанного натиска").waitFor();
  assert(await optimizer.getByText("Шлем без источника").count() === 0, "unknown source became a visible recommendation candidate");
  await optimizer.getByText("4 вариантов исключено проверками").waitFor();

  const raidFilter = optimizer.getByRole("button", { name: "Рейды" });
  await raidFilter.focus();
  await page.keyboard.press("Enter");
  assert(await raidFilter.getAttribute("aria-pressed") === "true", "source filter is not keyboard operable");
  assert(await optimizer.locator("ol > li").count() === 1, "raid filter did not narrow candidates");
  await optimizer.getByRole("button", { name: "Сравнить DPS" }).click();
  await optimizer.getByText(/\+4.?000 · \+4\.00%/).waitFor();
  await optimizer.getByText("Улучшение подтверждено · 95%").waitFor();
  await optimizer.getByText("100 000 → 104 000 DPS").waitFor();
  await optimizer.getByText("Комплект: Латы сезона").waitFor();
  assert(simulationRequests[0]?.characterSlug === "furybar" && simulationRequests[0]?.slotType === "HEAD" && simulationRequests[0]?.scenario === "single-target", "real character context was not forwarded to gear simulation");

  const obtained = optimizer.getByRole("button", { name: "Отметить полученным" });
  await obtained.click();
  await optimizer.getByRole("button", { name: "Уже получен" }).waitFor();
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  const restored = page.getByRole("region", { name: "Какая вещь действительно усилит персонажа" });
  await restored.getByRole("button", { name: "Уже получен" }).waitFor();

  await restored.getByRole("button", { name: "Все источники" }).click();
  await restored.getByRole("button", { name: "Просчитать видимые" }).click();
  await restored.getByText("Разница внутри погрешности ±0.30%").waitFor();
  await restored.getByText("Этот вариант слабее — не рекомендуем").waitFor();

  const responsive = {};
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    responsive[width] = overflow;
    assert(overflow <= 1, `horizontal overflow at ${width}px: ${overflow}px`);
  }
  assert(errors.length === 0, `browser errors: ${errors.join(" | ")}`);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await restored.screenshot({ path: ".artifacts/character-gear-optimizer.png" });
  console.log(JSON.stringify({ status: "passed", cards: 3, unknownExcluded: true, measuredRecommendation: true, insignificantGainRejected: true, downgradeRejected: true, ownedPersistence: true, keyboardFilter: true, responsive, requests: simulationRequests.length, browserErrors: errors }, null, 2));
} finally { await browser.close(); }
