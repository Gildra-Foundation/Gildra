import { chromium } from "playwright";

const BASE = process.env.DESIGN_BASE_URL || "http://127.0.0.1:3000";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() < 400) return;
    const url = response.url();
    // Product analytics intentionally degrades when local ClickHouse is absent;
    // catalog interaction must remain functional in that state.
    if (url.includes("/api/analytics/events") || url.includes("render.worldofwarcraft.com")) return;
    errors.push(`${response.status()} ${url}`);
  });
  try {
    const response = await page.goto(`${BASE}/ru/database?type=item`, { waitUntil: "networkidle", timeout: 30_000 });
    if (!response?.ok()) throw new Error(`database HTTP ${response?.status()}`);
    const layout = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    if (layout.scrollWidth > layout.clientWidth) throw new Error(`horizontal overflow ${layout.scrollWidth}/${layout.clientWidth}`);

    const tooltipButton = page.locator(".db-record-preview").first();
    await tooltipButton.focus();
    const focusedBeforeOpen = await tooltipButton.evaluate((element) => element === document.activeElement);
    await page.keyboard.press("Enter");
    const dialog = page.locator('[role="dialog"]');
    try {
      await dialog.waitFor({ state: "visible", timeout: 10_000 });
    } catch (error) {
      const state = await tooltipButton.getAttribute("aria-expanded");
      const status = await page.locator(".db-tooltip-status").allTextContents();
      throw new Error(`tooltip did not open (focused=${focusedBeforeOpen}, expanded=${state}, status=${status.join(" | ")}, browser=${errors.join(" | ")}): ${error.message}`);
    }
    try {
      await page.waitForFunction(() => document.activeElement === document.querySelector(".db-tooltip-close"), undefined, { timeout: 5_000 });
    } catch (error) {
      const active = await page.evaluate(() => ({
        tag: document.activeElement?.tagName,
        className: document.activeElement?.getAttribute("class"),
        ariaLabel: document.activeElement?.getAttribute("aria-label"),
      }));
      throw new Error(`tooltip close button did not receive focus (active=${JSON.stringify(active)}): ${error.message}`);
    }
    await page.screenshot({ path: ".artifacts/design/catalog-final/database-tooltip--laptop-1280.png" });
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached", timeout: 5_000 });
    if (!(await tooltipButton.evaluate((element) => element === document.activeElement))) {
      throw new Error("tooltip did not restore trigger focus");
    }

    const detailLink = page.locator(".db-record h3 a").first();
    const href = await detailLink.getAttribute("href");
    if (!href) throw new Error("detail link is absent");
    const detailResponse = await page.goto(`${BASE}${href}`, { waitUntil: "networkidle", timeout: 30_000 });
    if (!detailResponse?.ok()) throw new Error(`detail HTTP ${detailResponse?.status()}`);
    await page.locator(".db-detail-header h1").waitFor({ state: "visible" });
    await page.screenshot({ path: ".artifacts/design/catalog-final/database-detail--laptop-1280.png", fullPage: true });
    if (errors.length) throw new Error(`browser errors: ${errors.join(" | ")}`);
    console.log(JSON.stringify({ database: "ok", tooltipKeyboard: "ok", detail: "ok", href, layout }));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
