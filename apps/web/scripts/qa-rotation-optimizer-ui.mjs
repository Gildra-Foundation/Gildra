import { chromium } from "playwright";

const baseURL = (process.env.ROTATION_QA_BASE_URL ?? "http://127.0.0.1:5173").replace(/\/$/, "");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, extraHTTPHeaders: { "x-gildra-qa-mode": "battle-net-evidence" } });
const requests = [];
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => { if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) errors.push(message.text()); });

const signature = (input) => JSON.stringify(input.aplRules ?? input.rules);
const score = (input) => {
  if (input.rules[0] === "recklessness" && input.rules[1] === "heroic-leap") return 45000;
  let hash = 0;
  for (const character of signature(input)) hash = (hash * 31 + character.charCodeAt(0)) % 9000;
  return 100000 + hash;
};
await page.route("**/api/platform/rotation/simulations", async (route) => {
  const input = route.request().postDataJSON();
  requests.push(input);
  const dps = score(input);
  await route.fulfill({ status: 201, headers: input.verificationRun ? { "X-Gildra-Verification": "fresh" } : {}, contentType: "application/json", body: JSON.stringify({
    id: `optimizer-${requests.length}`, status: "completed", engine: "SimulationCraft QA", modelNotice: "optimizer QA", resourceLabel: "Rage",
    scenario: input.scenario, fightLengthSeconds: input.fightLengthSeconds, targets: input.targets, iterations: 750, confidence: 95,
    dps, dpsError: 10, dpsSeries: [dps - 100, dps], enrageUptime: 90, rageEfficiency: 90, castsPerMinute: 40, baselineDelta: 0,
    casts: [], abilities: [], recommendedSequence: input.rules, rage: [], resources: [], procs: [], cooldowns: [], findings: [], bossEvents: [], metrics: [],
    accuracy: { mode: "simulationcraft-armory", rotationSource: "user-priority-model", considers: ["typed APL"], limitations: [] },
  }) });
});

const run = async () => {
  const before = requests.length;
  await page.getByRole("button", { name: "Рассчитать прокаст" }).click();
  await page.getByText(/Победитель повторно проверен SimulationCraft/).waitFor({ timeout: 20000 });
  const batch = requests.slice(before);
  if (batch.length < 2 || !batch.at(-1).verificationRun) throw new Error("Winner did not receive a fresh verification run");
  const preliminary = batch.slice(0, -1).sort((a, b) => score(b) - score(a))[0];
  if (signature(preliminary) !== signature(batch.at(-1))) throw new Error("Verification did not repeat the measured winner");
  return batch;
};

try {
  await page.goto(`${baseURL}/ru/wow/demo/furybar`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.getByRole("heading", { name: "Проверка ротации персонажа" }).waitFor({ timeout: 120000 });
  const lab = page.getByRole("region", { name: "Тренер ротации персонажа" });
  const batches = [];
  batches.push(await run());
  await lab.getByRole("radio", { name: "AoE", exact: true }).click();
  await lab.getByLabel("Сколько целей").selectOption("2");
  batches.push(await run());
  await lab.getByLabel("Сколько целей").selectOption("3");
  batches.push(await run());
  await lab.getByRole("radio", { name: "Execute", exact: true }).click();
  batches.push(await run());

  await page.locator('details[class*="optimizerDetails"] > p').filter({ hasText: "локальный поиск, а не доказательство глобального максимума" }).waitFor();
  await page.getByText(/проверен · Δ 0/).first().waitFor();
  const saved = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((entry) => entry.startsWith("gildra:rotation-build-studio:fury-warrior:battle-net:furybar:"));
    return key ? JSON.parse(localStorage.getItem(key) ?? "null")?.combos ?? [] : [];
  });
  const modes = new Set(saved.map((combo) => `${combo.scenario}:${combo.targetCount}`));
  for (const mode of ["single-target:1", "aoe:2", "aoe:3", "execute:1"]) if (!modes.has(mode)) throw new Error(`Missing separately saved result ${mode}`);
  if (saved.some((combo) => !combo.verified)) throw new Error("An unverified optimized combo was saved");
  if (!batches.flat().every((input) => input.dataMode === "battle-net" && input.characterSlug === "furybar")) throw new Error("Optimizer lost real character context");
  const responsive = {};
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    responsive[width] = overflow;
    if (overflow > 1) throw new Error(`Horizontal overflow at ${width}px: ${overflow}px`);
  }
  if (errors.length) throw new Error(`Browser errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({ status: "passed", modes: [...modes].sort(), batches: batches.map((batch) => batch.length), freshWinnerVerification: true, boundedSearchDisclosure: true, realCharacterContext: true, responsive, browserErrors: errors }, null, 2));
} finally {
  await browser.close();
}
