import { chromium } from "playwright";

const baseURL = (process.env.ROTATION_QA_BASE_URL ?? "http://127.0.0.1:5173").replace(/\/$/, "");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, extraHTTPHeaders: { "x-gildra-qa-mode": "battle-net-evidence" } });
const requests = [];
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => { if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) errors.push(message.text()); });
await page.route("**/api/platform/rotation/simulations", async (route) => {
  const input = route.request().postDataJSON();
  requests.push(input);
  await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({
    id: "apl-qa", status: "completed", engine: "SimulationCraft QA", modelNotice: "typed APL QA", resourceLabel: "Rage",
    scenario: input.scenario, fightLengthSeconds: input.fightLengthSeconds, targets: input.targets, iterations: 10, confidence: 95,
    dps: 123456, dpsSeries: [120000, 123456], enrageUptime: 90, rageEfficiency: 90, castsPerMinute: 40, baselineDelta: 0,
    casts: [], abilities: [], recommendedSequence: input.rules, rage: [], resources: [], procs: [], cooldowns: [], findings: [], bossEvents: [], metrics: [],
    accuracy: { mode: "simulationcraft-armory", rotationSource: "user-priority-model", considers: ["typed conditions"], limitations: [] },
  }) });
});

try {
  await page.goto(`${baseURL}/ru/wow/demo/furybar`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.getByRole("heading", { name: "Проверка ротации персонажа" }).waitFor({ timeout: 120000 });
  const details = page.locator("#rotation-advanced-analysis");
  if (!(await details.evaluate((element) => element.open))) await details.locator(":scope > summary").click();
  await page.getByRole("button", { name: "Приоритет" }).click();
  const editor = page.locator('[class*="priorityPanel"]');
  await editor.getByText(/SimulationCraft · поддерживаемый профиль/).waitFor();
  const firstRule = editor.locator("ol > li").first();
  await firstRule.getByRole("button", { name: "Настроить условия" }).click();
  const typeSelect = firstRule.getByLabel("Тип нового условия");
  await typeSelect.selectOption("resource");
  await firstRule.getByRole("button", { name: "Добавить условие" }).click();
  await firstRule.getByLabel("Количество ресурса").fill("80");
  await page.getByRole("button", { name: /Запустить симуляцию/ }).click();
  await page.getByText("123K").first().waitFor({ timeout: 10000 });
  const submitted = requests.at(-1);
  if (!submitted?.aplRules?.length) throw new Error("Typed APL was not submitted");
  const edited = submitted.aplRules.find((rule) => rule.abilityId === submitted.rules[0]);
  if (!edited || edited.source !== "custom" || !edited.conditions.some((condition) => condition.type === "resource" && condition.resource === "rage" && condition.value === 80)) throw new Error("Edited resource condition was not submitted accurately");
  if (submitted.dataMode !== "battle-net" || !submitted.characterSlug) throw new Error("APL simulation lost real character context");

  const arsenal = page.locator('details[class*="comboLibrary"]');
  if (!(await arsenal.getAttribute("open"))) await arsenal.locator("summary").click();
  await arsenal.getByRole("button", { name: "Сохранить ротацию" }).click();
  const storedConditions = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((entry) => entry.startsWith("gildra:rotation-build-studio:fury-warrior:battle-net:furybar:"));
    if (!key) return null;
    return JSON.parse(localStorage.getItem(key) ?? "null")?.combos?.[0]?.aplRules?.[0]?.conditions ?? null;
  });
  if (!storedConditions?.some((condition) => condition.type === "resource" && condition.value === 80)) throw new Error("Saved rotation lost typed conditions");
  const combo = arsenal.locator('[class*="comboCard"]').first();
  await combo.getByRole("button", { name: /Поделиться/ }).click();
  const tag = await arsenal.getByLabel("Тег ротации").inputValue();
  const encoded = tag.slice("GLD1.".length).replace(/-/g, "+").replace(/_/g, "/");
  const shared = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  if (!shared.aplRules?.[0]?.conditions?.some((condition) => condition.type === "resource" && condition.value === 80)) throw new Error("Share tag lost typed conditions");

  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) throw new Error(`Horizontal overflow at ${width}px: ${overflow}px`);
  }
  if (errors.length) throw new Error(`Browser errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({ status: "passed", typedConditionSubmitted: edited.conditions, savedAndShared: true, dataMode: submitted.dataMode, characterSlug: submitted.characterSlug, responsive: true, browserErrors: errors }, null, 2));
} finally {
  await browser.close();
}
