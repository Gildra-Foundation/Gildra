import { chromium } from "playwright";

const baseURL = (process.env.ROTATION_QA_BASE_URL ?? "http://127.0.0.1:5173").replace(/\/$/, "");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1100 },
  extraHTTPHeaders: { "x-gildra-qa-mode": "battle-net-evidence" },
});
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) errors.push(message.text());
});

await page.route("**/api/platform/rotation/simulations", async (route) => {
  const input = route.request().postDataJSON();
  const preferred = ["recklessness", "avatar", "odyns-fury", "rampage", "bloodthirst", "raging-blow", "execute", "whirlwind"];
  const sequence = preferred.filter((abilityId) => input.rules.includes(abilityId)).slice(0, 4);
  if (sequence.length < 2) sequence.push(...[...new Set(input.rules)].filter((abilityId) => !sequence.includes(abilityId)).slice(0, 2));
  await route.fulfill({
    status: 201,
    contentType: "application/json",
    body: JSON.stringify({
      id: "trainer-qa", status: "completed", engine: "SimulationCraft QA", modelNotice: "trainer QA",
      resourceLabel: "Rage", scenario: input.scenario, fightLengthSeconds: input.fightLengthSeconds,
      targets: input.targets, iterations: 1000, confidence: 95, dps: 500000, dpsError: 100,
      dpsSeries: [499900, 500000, 500100], enrageUptime: 92, rageEfficiency: 91,
      castsPerMinute: 40, baselineDelta: 0, casts: [], recommendedSequence: sequence,
      rage: [], resources: [], procs: [], cooldowns: [], abilities: [], findings: [], bossEvents: [], metrics: [],
      accuracy: { mode: "simulationcraft-reference", rotationSource: "user-priority-model", considers: ["typed APL"], limitations: [] },
    }),
  });
});

async function openTrainer() {
  const lab = page.locator("#audit-rotation");
  await lab.waitFor({ timeout: 120000 });
  await lab.getByRole("button", { name: /Запустить симуляцию/ }).click();
  await page.getByText("SimulationCraft QA", { exact: false }).first().waitFor({ timeout: 15000 });
  await lab.getByRole("button", { name: /Перейти к тренировке/ }).click();
  const trainer = page.locator("#rotation-trainer");
  await trainer.waitFor();
  await trainer.getByLabel("Упражнение").selectOption("priority");
  await trainer.getByText("trace последнего расчёта SimulationCraft", { exact: true }).waitFor();
  return trainer;
}

try {
  await page.goto(`${baseURL}/ru/wow/demo/furybar`, { waitUntil: "domcontentloaded", timeout: 120000 });
  let trainer = await openTrainer();

  const simcCard = trainer.getByText("SIMULATIONCRAFT DPS", { exact: true }).locator("..");
  const trainingCard = trainer.getByText("ОЦЕНКА ТРЕНИРОВКИ", { exact: true }).locator("..");
  if (!((await simcCard.innerText()).includes("500K"))) throw new Error("SimC benchmark is not shown separately");
  if (!((await trainingCard.innerText()).includes("—"))) throw new Error("Training estimate must be empty before inputs");

  await trainer.getByRole("button", { name: "Настроить панель" }).click();
  const dialog = page.getByRole("dialog", { name: "Настройка панели" });
  await dialog.waitFor();
  const focusedLabel = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  if (focusedLabel !== "Закрыть настройку панели") throw new Error(`Dialog did not focus its close button: ${focusedLabel}`);
  const bindingButtons = dialog.getByRole("button", { name: /Назначить клавишу/ });
  await bindingButtons.nth(0).click();
  await page.keyboard.press("2");
  await dialog.getByText("Клавиши двух слотов поменялись местами.").waitFor();
  await dialog.getByText("Панель автоматически сохраняется только для этого персонажа.").waitFor({ state: "hidden" }).catch(() => {});
  await dialog.getByRole("button", { name: "Готово" }).click();
  await page.waitForTimeout(150);

  const saved = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((entry) => entry === "gildra:rotation-trainer:fury-warrior:battle-net:furybar:v3");
    return key ? { key, value: JSON.parse(localStorage.getItem(key) ?? "null") } : null;
  });
  if (!saved || saved.value.slots[0].key !== "2" || saved.value.slots[1].key !== "1") throw new Error(`Character-scoped swapped keys were not saved: ${JSON.stringify(saved)}`);

  await trainer.getByRole("button", { name: "Начать тренировку" }).click();
  await page.waitForTimeout(2300);
  const target = trainer.locator('button[class*="trainerSkillTarget"]');
  await target.waitFor({ timeout: 5000 });
  const expectedBeforeWrong = await target.getAttribute("data-ability");
  const wrong = trainer.locator('button[class*="trainerSkill"]:not([class*="trainerSkillTarget"])').filter({ visible: true }).first();
  await wrong.click();
  await trainer.getByText("Не тот скилл — текущая цель остаётся", { exact: true }).waitFor();
  const expectedAfterWrong = await trainer.locator('button[class*="trainerSkillTarget"]').getAttribute("data-ability");
  if (expectedAfterWrong !== expectedBeforeWrong) throw new Error("Wrong input advanced the sequence");

  const correctKey = await trainer.locator('button[class*="trainerSkillTarget"] kbd').innerText();
  await page.keyboard.press(correctKey);
  await trainer.getByText("Отлично — держи ритм", { exact: true }).waitFor();
  for (let index = 0; index < 2; index += 1) {
    const key = await trainer.locator('button[class*="trainerSkillTarget"] kbd').innerText();
    await page.keyboard.press(key);
    await page.waitForTimeout(80);
  }
  await trainer.getByRole("button", { name: "Закончить" }).click();
  await trainer.getByRole("heading", { name: /Подход завершён|Короткая тренировка/ }).waitFor();
  const summary = await trainer.locator('section[class*="sessionSummary"]').innerText();
  if (!summary.includes("Оценка тренировки") || summary.includes("По темпу, точности и эталону выбранного спека")) throw new Error("Training result provenance is ambiguous");

  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  trainer = await openTrainer();
  await trainer.getByRole("button", { name: "Настроить панель" }).click();
  const reloadedDialog = page.getByRole("dialog", { name: "Настройка панели" });
  const firstKey = await reloadedDialog.getByRole("button", { name: /Назначить клавишу/ }).nth(0).locator("kbd").innerText();
  if (firstKey !== "2") throw new Error(`Saved panel was not restored after reload: ${firstKey}`);
  await page.keyboard.press("Escape");
  await reloadedDialog.waitFor({ state: "hidden" });

  const responsive = {};
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    responsive[width] = overflow;
    if (overflow > 1) throw new Error(`Horizontal overflow at ${width}px: ${overflow}px`);
  }
  if (errors.length) throw new Error(`Browser errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({ status: "passed", characterScopedStorage: saved.key, conflictSwap: true, wrongPressStayed: true, keyboardPressAdvanced: true, dialogFocusAndEscape: true, provenance: "simulation-trace", responsive, browserErrors: errors }, null, 2));
} finally {
  await browser.close();
}
