import { chromium } from "playwright";

const baseURL = (process.env.ROTATION_QA_BASE_URL ?? "http://127.0.0.1:5173").replace(/\/$/, "");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const requests = [];
const errors = [];

page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) errors.push(message.text());
});
await page.route("**/api/platform/rotation/simulations", async (route) => {
  const input = route.request().postDataJSON();
  requests.push(input);
  const sequence = [...input.rules, ...input.rules, ...input.rules].slice(0, 16);
  await route.fulfill({
    status: 201,
    contentType: "application/json",
    body: JSON.stringify({
      id: "qa-rotation", status: "completed", engine: "SimulationCraft QA", modelNotice: "QA",
      resourceLabel: "Rage", scenario: input.scenario, fightLengthSeconds: input.fightLengthSeconds,
      targets: input.targets, iterations: 750, confidence: 95, dps: 412345, dpsSeries: [390000, 412345],
      enrageUptime: 90, rageEfficiency: 91, castsPerMinute: 42, baselineDelta: 0,
      casts: sequence.map((abilityId, index) => ({ id: `cast-${index}`, abilityId, time: index * 1.5, lane: "global" })),
      recommendedSequence: sequence, rage: [{ time: 0, value: 0 }, { time: 1, value: 50 }],
      resources: [], procs: [], cooldowns: [], abilities: [],
      accuracy: { mode: input.characterSlug ? "simulationcraft-armory" : "simulationcraft-reference", rotationSource: "user-priority-model", considers: ["gear", "talents", "priority"], limitations: [] },
      findings: [], bossEvents: [], metrics: [{ label: "Actions Per Min", value: "42" }],
    }),
  });
});

try {
  await page.goto(`${baseURL}/ru/wow/rotation/fury-warrior?character=furybar&mode=fixture`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.getByRole("heading", { name: /Тренер ротации/ }).waitFor({ timeout: 120000 });
  await page.evaluate(() => localStorage.removeItem("gildra:rotation-build-studio:fury-warrior:fixture:furybar:v2"));
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });

  if (!(await page.locator("#rotation-advanced-analysis").evaluate((element) => element instanceof HTMLDetailsElement && element.open))) await page.locator("#rotation-advanced-analysis > summary").click();
  await page.getByRole("button", { name: "Приоритет" }).click();
  const editor = page.locator('[class*="priorityPanel"]');
  const initialRules = await editor.locator("ol > li").count();
  await editor.getByRole("button", { name: /Удалить из панели/ }).last().click();
  await editor.getByLabel("Способность для добавления").selectOption({ index: 0 });
  await editor.getByRole("button", { name: /Добавить правило/ }).click();
  await editor.getByRole("button", { name: /Опустить/ }).first().click();
  if (await editor.locator("ol > li").count() !== initialRules) throw new Error("Remove/add changed the number of active priority slots");

  await page.getByRole("button", { name: /Запустить симуляцию/ }).click();
  await page.getByText("412", { exact: false }).first().waitFor({ timeout: 10000 });
  const submitted = requests.at(-1);
  if (!submitted || submitted.characterSlug !== "furybar" || submitted.dataMode !== "fixture") throw new Error("Character context was not sent to the simulation route");
  if (submitted.rules.join("|") === "rampage|bloodthirst|raging-blow|execute|odyns-fury|whirlwind") throw new Error("Edited priority was not sent to SimulationCraft");

  const arsenal = page.locator('details[class*="comboLibrary"]');
  if (!(await arsenal.getAttribute("open"))) await arsenal.locator("summary").click();
  await arsenal.getByRole("button", { name: "Сохранить ротацию" }).click();
  const combo = arsenal.locator('[class*="comboCard"]').first();
  await combo.waitFor();
  await combo.getByRole("button", { name: /Поделиться/ }).click();
  const tag = await arsenal.getByLabel("Тег ротации").inputValue();
  if (!tag.startsWith("GLD1.") || tag.length < 40) throw new Error("Portable rotation tag was not generated");

  await combo.getByRole("button", { name: /Удалить/ }).click();
  if (!(await arsenal.getAttribute("open"))) await arsenal.locator("summary").click();
  await arsenal.getByLabel("Тег ротации").fill(tag);
  await arsenal.getByRole("button", { name: "Импортировать" }).click();
  await arsenal.getByText("DPS не рассчитан").waitFor();
  await arsenal.locator('[class*="comboCard"]').first().getByRole("button", { name: "В тренировку" }).click();
  await page.locator("#rotation-trainer").getByText("импортированный тег ротации", { exact: true }).waitFor();
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  await page.getByText("DPS не рассчитан").waitFor({ timeout: 120000 });
  await page.screenshot({ path: ".artifacts/rotation-editor.png", fullPage: true });

  const responsive = {};
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    responsive[width] = overflow;
    if (overflow > 1) {
      const offenders = await page.evaluate(() => [...document.querySelectorAll("body *")].flatMap((element) => {
        const rect = element.getBoundingClientRect();
        return rect.right > document.documentElement.clientWidth + 1 ? [`${element.tagName}.${element.className}:${Math.round(rect.right)}`] : [];
      }).slice(-12));
      throw new Error(`Horizontal overflow at ${width}px: ${overflow}px; ${offenders.join(" | ")}`);
    }
  }
  if (errors.length) throw new Error(`Browser errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({ status: "passed", priorityEditor: true, customRulesSubmitted: submitted.rules, saveReload: true, shareTag: true, importedSequenceProvenance: true, responsive, browserErrors: errors }, null, 2));
} finally {
  await browser.close();
}
