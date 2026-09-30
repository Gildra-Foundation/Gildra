import { chromium } from "playwright";

const baseURL = (process.env.CHARACTER_TALENTS_BASE_URL ?? "http://127.0.0.1:5173").replace(/\/$/, "");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  extraHTTPHeaders: { "x-gildra-qa-mode": "battle-net-evidence" },
});
const errors = [];
let refreshResponse = { status: 200, body: { fingerprint: "qa-initial" }, headers: {} };

page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  const text = message.text();
  if (message.type() === "error" && !text.startsWith("Failed to load resource:") && !text.includes("A tree hydrated but some attributes")) errors.push(text);
});
await page.route("**/api/wow/talent-simulation", (route) => route.fulfill({
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
}));
await page.route("**/api/wow/characters/furybar", (route) => {
  if (route.request().method() !== "POST") return route.continue();
  return route.fulfill({ status: refreshResponse.status, contentType: "application/json", headers: refreshResponse.headers, body: JSON.stringify(refreshResponse.body) });
});

try {
  await page.goto(`${baseURL}/ru/wow/demo/furybar`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const status = page.getByRole("status", { name: "Статус реальных данных Battle.net" });
  await status.waitFor({ timeout: 120000 });
  const hero = status.locator("xpath=ancestor::section[1]");
  const heroText = await hero.innerText();
  if (heroText.includes("/100")) throw new Error("Real profile header still exposes a /100 score");
  if (/\b(?:90|85)\b/.test(heroText)) throw new Error("Real profile header still exposes fixed mock scores");

  for (const label of ["Таланты", "Экипировка", "Чары", "Сокеты"]) {
    const tile = hero.locator(`[aria-label^="${label}:"]`);
    await tile.waitFor();
    const title = await tile.getAttribute("title");
    if (!title?.includes("Battle.net")) throw new Error(`${label}: source/method tooltip is missing`);
  }

  const update = page.getByRole("button", { name: "Обновить", exact: true });
  const recoveryMatrix = [
    { status: 401, error: "session_expired", text: "Сессия Battle.net истекла" },
    { status: 403, error: "access_forbidden", text: "Battle.net не разрешил доступ" },
    { status: 404, error: "character_not_found", text: "Персонаж больше не найден" },
    { status: 422, error: "incomplete_profile", text: "Battle.net вернул неполный профиль" },
    { status: 429, error: "rate_limited", text: "Battle.net временно ограничил запросы", headers: { "Retry-After": "60" } },
    { status: 503, error: "battle_net_unavailable", text: "Battle.net сейчас недоступен" },
  ];
  for (const testCase of recoveryMatrix) {
    refreshResponse = { status: testCase.status, body: { error: testCase.error }, headers: testCase.headers ?? {} };
    await update.click();
    await page.getByText(testCase.text, { exact: false }).waitFor();
  }
  refreshResponse = { status: 200, body: { fingerprint: "qa-refreshed" }, headers: {} };
  await update.click();
  await page.getByText("Профиль обновлён. Старые результаты расчётов сброшены.").waitFor();

  const responsive = {};
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    responsive[width] = overflow;
    if (overflow > 1) throw new Error(`Horizontal overflow at ${width}px: ${overflow}px`);
  }

  await page.screenshot({ path: ".artifacts/real-character-evidence.png", fullPage: true });
  if (errors.length) throw new Error(`Browser errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({ status: "passed", unsupportedScoresAbsent: true, evidenceTooltips: 4, refreshRecoveryStates: recoveryMatrix.map((entry) => entry.status), refreshSuccess: true, responsive, browserErrors: errors }, null, 2));
} finally {
  await browser.close();
}
