import { chromium } from "playwright";

const baseURL = (process.env.ROTATION_QA_BASE_URL ?? "http://127.0.0.1:5173").replace(/\/$/, "");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

await page.route("**/api/platform/rotation/simulations", async (route) => {
  const input = route.request().postDataJSON();
  const abilityIds = [...new Set(input.rules)];
  await route.fulfill({
    status: 201,
    contentType: "application/json",
    body: JSON.stringify({
      id: "qa-icons", status: "completed", engine: "SimulationCraft QA", modelNotice: "QA",
      resourceLabel: "Rage", scenario: input.scenario, fightLengthSeconds: input.fightLengthSeconds,
      targets: input.targets, iterations: 100, confidence: 95, dps: 400000, dpsSeries: [400000],
      enrageUptime: 90, rageEfficiency: 90, castsPerMinute: 42, baselineDelta: 0,
      casts: [], recommendedSequence: abilityIds, rage: [], resources: [], procs: [], cooldowns: [],
      abilities: abilityIds.map((id) => ({ id, name: id, iconUrl: "/assets/specs/fury-warrior.jpg", resourceCost: 0, cooldown: 0, gcd: 1.5 })),
      accuracy: { mode: "simulationcraft-reference", rotationSource: "user-priority-model", considers: [], limitations: [] },
      findings: [], bossEvents: [], metrics: [],
    }),
  });
});

try {
  await page.goto(`${baseURL}/ru/wow/demo/furybar`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const lab = page.locator("#audit-rotation");
  await lab.waitFor({ timeout: 120000 });
  await lab.getByRole("button", { name: /Запустить симуляцию/ }).click();
  await page.getByText("SimulationCraft QA", { exact: false }).first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(250);
  await lab.getByRole("button", { name: /Перейти к тренировке/ }).click();
  const editor = page.locator("#rotation-trainer");
  const expected = {
    rampage: "/assets/abilities/rampage.jpg",
    bloodthirst: "/assets/abilities/bloodthirst.jpg",
    recklessness: "/assets/abilities/recklessness.jpg",
  };
  const actual = {};
  for (const [id, suffix] of Object.entries(expected)) {
    const row = editor.locator('button[class*="trainerSkill"]').filter({ hasText: new RegExp(id.replace("-", "[ -]"), "i") }).first();
    if (!(await row.count())) continue;
    actual[id] = new URL(await row.locator("img").getAttribute("src"), baseURL).pathname;
    if (actual[id] !== suffix) throw new Error(`${id} uses ${actual[id]} instead of ${suffix}`);
  }
  if (Object.keys(actual).length < 2) throw new Error(`Not enough known abilities were rendered: ${JSON.stringify(actual)}`);
  for (const id of ["heroic-leap", "crushing-blow", "bloodbath"]) {
    const row = editor.locator('button[class*="trainerSkill"]').filter({ hasText: new RegExp(id.replace("-", "[ -]"), "i") }).first();
    if (!(await row.count())) continue;
    actual[id] = new URL(await row.locator("img").getAttribute("src"), baseURL).pathname;
    if (actual[id] === "/assets/specs/fury-warrior.jpg") throw new Error(`${id} still uses the specialization fallback icon`);
  }
  const rendered = await editor.locator('button[class*="trainerSkill"]').evaluateAll((slots) => slots.map((slot) => ({
    name: slot.textContent?.trim() ?? "",
    icon: (slot.querySelector("img")?.getAttribute("src") ?? "").replace(/^https?:\/\/[^/]+/, ""),
  })));
  const generic = rendered.filter((slot) => slot.icon === "/assets/specs/fury-warrior.jpg");
  if (generic.length) throw new Error(`Generic specialization icons remain: ${JSON.stringify(generic)}`);
  await page.screenshot({ path: ".artifacts/rotation-icons.png", fullPage: true });
  console.log(JSON.stringify({ status: "passed", icons: actual, rendered }, null, 2));
} finally {
  await browser.close();
}
