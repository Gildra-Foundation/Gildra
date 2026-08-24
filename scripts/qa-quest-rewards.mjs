import { chromium } from "playwright";

const BASE = process.env.DESIGN_BASE_URL || "http://127.0.0.1:3000";
const DETAIL_PATH = process.env.QUEST_DETAIL_PATH;
const EXPECTED_LABELS = (process.env.QUEST_EXPECTED_REWARDS || "Перстень-печатка Малфуриона|Круг Кенария").split("|").filter(Boolean);
const MIN_REWARDS = Number(process.env.QUEST_MIN_REWARDS || EXPECTED_LABELS.length);
const SCREENSHOT = process.env.QUEST_SCREENSHOT || ".artifacts/design/catalog-final/quest-rewards-tooltip--laptop-1280.png";
const ITEM_PATH = DETAIL_PATH?.startsWith("/ru/") ? "/ru/database/item/" : "/database/item/";

async function main() {
  if (!DETAIL_PATH) throw new Error("QUEST_DETAIL_PATH is required");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() < 400 || response.url().includes("render.worldofwarcraft.com")) return;
    errors.push(`${response.status()} ${response.url()}`);
  });
  try {
    const response = await page.goto(`${BASE}${DETAIL_PATH}`, { waitUntil: "networkidle", timeout: 30_000 });
    if (!response?.ok()) throw new Error(`quest detail HTTP ${response?.status()}`);
    const visibleText = await page.locator("body").innerText();
    if (visibleText.includes("{name}")) throw new Error("unresolved {name} quest template is visible");
    const rewards = page.locator(".db-tooltip-reward");
    await rewards.first().waitFor({ state: "visible" });
    const labels = await rewards.locator("strong").allTextContents();
    if (labels.length < MIN_REWARDS || EXPECTED_LABELS.some((label) => !labels.includes(label))) {
      throw new Error(`localized rewards are incomplete: ${labels.join(" | ")}`);
    }
    const itemLink = page.locator(`.db-tooltip-reward[href*="${ITEM_PATH}"]`).first();
    const href = await itemLink.getAttribute("href");
    if (!href?.includes(ITEM_PATH)) throw new Error(`item reward link is invalid: ${href}`);
    await itemLink.focus();
    if (!(await itemLink.evaluate((element) => element === document.activeElement))) {
      throw new Error("item reward link did not receive keyboard focus");
    }
    const layout = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    if (layout.scrollWidth > layout.clientWidth) throw new Error(`horizontal overflow ${layout.scrollWidth}/${layout.clientWidth}`);
    await page.screenshot({ path: SCREENSHOT, fullPage: true });
    if (errors.length) throw new Error(`browser errors: ${errors.join(" | ")}`);
    console.log(JSON.stringify({ questRewards: "ok", labels, href, layout }));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
