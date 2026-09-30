import { chromium } from "playwright";

const baseURL = process.env.ROTATION_QA_BASE_URL ?? "http://127.0.0.1:51620";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const failures = [];

page.on("pageerror", (error) => failures.push(`page error: ${error.message}`));
page.on("response", (response) => {
  if (response.url().includes("/api/platform/rotation/simulations") && response.status() >= 500) {
    failures.push(`simulation API returned ${response.status()}`);
  }
});

try {
  await page.goto(`${baseURL}/ru/wow/rotation/fury-warrior`, { waitUntil: "networkidle" });
  const layout = await page.locator('[class*="forgeConsole"]').evaluate((consoleElement) => {
    const consoleRect = consoleElement.getBoundingClientRect();
    const arsenal = document.querySelector('details[class*="comboLibrary"]');
    const arsenalRect = arsenal?.getBoundingClientRect();
    return {
      consoleWidth: consoleRect.width,
      arsenalGap: arsenalRect ? arsenalRect.top - consoleRect.bottom : -1,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  if (layout.consoleWidth < 700) failures.push("desktop combat console collapsed unexpectedly");
  if (layout.arsenalGap < 12) failures.push("combo arsenal visually collides with combat console");
  if (layout.pageOverflow > 0) failures.push(`page overflows horizontally by ${layout.pageOverflow}px`);
  const calculate = page.getByRole("button", { name: /Рассчитать(?: мой)? прокаст/ });
  await calculate.click();
  await page.getByRole("button", { name: /Начать тренировку на 30 секунд/ }).waitFor({ state: "visible", timeout: 15_000 });
  const ribbon = await page.locator('[class*="readyComboStep"]').evaluateAll((steps) => ({
    count: steps.length,
    animation: steps[0] ? getComputedStyle(steps[0]).animationName : "none",
    clippedNames: steps.filter((step) => {
      const name = step.querySelector('[class*="readyComboName"]');
      if (!(name instanceof HTMLElement)) return true;
      const itemRect = step.getBoundingClientRect();
      const nameRect = name.getBoundingClientRect();
      return nameRect.left < itemRect.left || nameRect.right > itemRect.right;
    }).length,
  }));
  if (ribbon.count < 8) failures.push("calculated combo ribbon is incomplete");
  if (ribbon.clippedNames) failures.push(`${ribbon.clippedNames} ability labels escape their steps`);
  if (ribbon.animation === "none") failures.push("calculated combo has no entry motion");
  if (failures.length) throw new Error(failures.join("; "));
  process.stdout.write("rotation qa: combo calculated and training handoff is available\n");
} catch (error) {
  process.stderr.write(`rotation qa failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
