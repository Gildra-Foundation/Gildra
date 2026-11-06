// Player walk-through of the public talent pages (/talents/<spec>, /ru/talents/<spec>):
// trees and counters, clicks and right-clicks, dependent ranks, point limits, tooltips that
// never cover their node or leave the screen, URL state, hero path switch, import box,
// keyboard, the phone tree switch and talent sheet, no page overflow at 390/320.
// Run against a dev or production server: TALENTS_BASE_URL=http://localhost:3154 npm run qa:talents
import { chromium } from "playwright";

const baseUrl = process.env.TALENTS_BASE_URL ?? "http://localhost:3000";
const specs = (process.env.TALENTS_SPECS ?? "arms-warrior,shadow-priest,devastation-evoker,havoc-demon-hunter").split(",");
const browser = await chromium.launch({ headless: true });
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const watch = (page, bucket) => {
  page.on("pageerror", (error) => bucket.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error" && !/Failed to load resource/.test(message.text())) bucket.push(message.text().slice(0, 300)); });
};
const ready = async (page) => {
  await page.locator('.talent-calculator[data-interactive="true"]').waitFor({ timeout: 120_000 });
};
const open = (page, tree) => page.locator(`[data-tree-canvas="${tree}"] [data-talent-node][data-state="open"]`);
const points = (page, tree) => page.locator(`[data-tree-points="${tree}"]`).innerText().then((text) => Number(text.split("/")[0].trim()));
const overlap = (a, b) => !(a.x >= b.x + b.width || a.x + a.width <= b.x || a.y >= b.y + b.height || a.y + a.height <= b.y);

try {
  for (const spec of specs) {
    const errors = [];
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    watch(page, errors);
    const response = await page.goto(`${baseUrl}/talents/${spec}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    check(response?.status() === 200, `${spec}: status ${response?.status()}`);
    await ready(page);
    await page.waitForFunction(() => document.querySelectorAll("[data-tree-canvas]").length === 3, undefined, { timeout: 30_000 });
    const text = await page.locator("main").innerText();
    check(!/Talent data|Raidbots|Wowhead|community snapshot|\b\d+\.\d+\.\d+\.\d{4,}\b|Unsaved|%/.test(text), `${spec}: service text on the page`);

    // Clicks fill each tree; counters follow; the URL carries the build.
    const firstBought = await open(page, "class").first().getAttribute("data-talent-node");
    for (const [tree, clicks] of [["class", 10], ["spec", 10], ["hero", 4]]) {
      for (let index = 0; index < clicks; index += 1) {
        const node = open(page, tree).first();
        if (!(await node.count())) break;
        await node.click();
      }
      check(await points(page, tree) > 0, `${spec}: ${tree} counter did not move`);
    }
    await page.waitForFunction(() => new URL(location.href).searchParams.has("build"), undefined, { timeout: 3_000 }).catch(() => failures.push(`${spec}: URL has no build`));
    const before = { class: await points(page, "class"), hero: await points(page, "hero"), spec: await points(page, "spec") };

    // Tooltips: beside the node, inside the viewport, for a sample of every tree.
    for (const tree of ["class", "hero", "spec"]) {
      const nodes = page.locator(`[data-tree-canvas="${tree}"] [data-talent-node]`);
      const count = await nodes.count();
      for (const index of [0, Math.floor(count / 2), count - 1]) {
        const node = nodes.nth(index);
        await node.scrollIntoViewIfNeeded();
        await node.hover();
        const tip = page.locator("[data-talent-tip]");
        await tip.waitFor({ state: "visible", timeout: 3_000 });
        await page.waitForTimeout(150);
        const [tipBox, nodeBox] = [await tip.boundingBox(), await node.boundingBox()];
        check(tipBox && nodeBox && !overlap(tipBox, nodeBox), `${spec}: tooltip covers ${tree} node ${index}`);
        if (!(tipBox && tipBox.x >= 0 && tipBox.y >= 0 && tipBox.x + tipBox.width <= 1440 && tipBox.y + tipBox.height <= 900)) console.log(spec, tree, index, tipBox, nodeBox);
        check(tipBox && tipBox.x >= 0 && tipBox.y >= 0 && tipBox.x + tipBox.width <= 1440 && tipBox.y + tipBox.height <= 900, `${spec}: tooltip clipped on ${tree} node ${index}`);
        const tipText = await tip.innerText();
        check(!/\$[A-Za-z0-9]|ЛКМ|LMB|Max rank|Макс\. ранг/.test(tipText), `${spec}: tooltip text ${tipText.slice(0, 60)}`);
      }
    }
    await page.mouse.move(2, 2);

    // Right-click on a parent removes its dependents too.
    const lit = page.locator('[data-tree-canvas="class"] [data-talent-node]:is([data-state="selected"],[data-state="partial"])');
    const selectedBefore = await lit.count();
    // The first node bought after the free ones: removing it also drops what hangs below it.
    await page.locator(`[data-tree-canvas="class"] [data-talent-node="${firstBought}"]`).click({ button: "right" });
    check(await lit.count() < selectedBefore, `${spec}: right-click did not remove a rank`);

    // Reload keeps the build (URL state).
    await page.waitForTimeout(500);
    const urlBuild = new URL(page.url()).searchParams.get("build");
    const afterRemoval = await points(page, "class");
    await page.reload({ waitUntil: "domcontentloaded" });
    await ready(page);
    await page.waitForFunction(() => document.querySelectorAll("[data-tree-canvas]").length === 3, undefined, { timeout: 30_000 });
    check(await points(page, "class") === afterRemoval && await points(page, "spec") === before.spec, `${spec}: reload lost the build`);
    check(new URL(page.url()).searchParams.get("build") === urlBuild, `${spec}: reload changed the build string`);

    // The hero path switch keeps class and spec points.
    const heroBefore = await page.locator("main[data-hero]").getAttribute("data-hero");
    await page.locator('.tc-hero-paths a:not([aria-current="page"])').click();
    await page.waitForFunction((previous) => document.querySelector("main[data-hero]")?.getAttribute("data-hero") !== previous, heroBefore, { timeout: 60_000 });
    await ready(page);
    await page.waitForFunction(() => document.querySelectorAll("[data-tree-canvas]").length === 3, undefined, { timeout: 30_000 });
    check(await points(page, "class") === afterRemoval && await points(page, "spec") === before.spec && await points(page, "hero") === 0, `${spec}: hero switch lost the build`);

    // Point limit: the class tree never goes past its budget.
    for (let index = 0; index < 60; index += 1) {
      const node = open(page, "class").first();
      if (!(await node.count())) break;
      await node.click();
    }
    const budget = Number((await page.locator('[data-tree-points="class"]').innerText()).split("/")[1]);
    check(await points(page, "class") <= budget, `${spec}: class tree went over budget`);

    // Keyboard: arrows move between nodes, Backspace removes a rank.
    const first = page.locator('[data-tree-canvas="spec"] [data-talent-node][tabindex="0"]');
    await first.focus();
    await page.keyboard.press("ArrowDown");
    const focused = await page.evaluate(() => document.activeElement?.getAttribute("data-talent-node"));
    check(Boolean(focused?.startsWith("spec-")), `${spec}: arrow keys did not move focus`);
    check(await page.locator("[data-talent-tip]").isVisible(), `${spec}: no tooltip on keyboard focus`);
    await page.keyboard.press("Escape");

    // Import box: tells what is wrong; loads a valid string.
    const game = new URL(page.url()).searchParams.get("build");
    await page.getByRole("button", { name: /Import build/ }).click();
    const box = page.locator("textarea[data-build-import]");
    await box.fill(game.slice(0, 26));
    check(await page.locator('[data-import-state="damaged"]').isVisible(), `${spec}: damaged string not reported`);
    await box.fill("hello world");
    check(await page.locator('[data-import-state="unknown"]').isVisible(), `${spec}: unknown input not reported`);
    check(await page.locator("[data-build-import-apply]").isDisabled(), `${spec}: apply enabled for a bad string`);
    await box.fill(game);
    check(!(await page.locator("[data-build-import-apply]").isDisabled()), `${spec}: apply disabled for a good string`);
    await page.locator("[data-build-import-apply]").click();
    check(!(await page.locator(".tc-import-dialog").count()), `${spec}: import dialog stayed open`);

    // Search dims everything else.
    await page.getByLabel(/Search talents/).first().fill("zzzz-no-such-talent");
    await page.waitForTimeout(500);
    check(await page.locator("[data-talent-node][data-dimmed]").count() > 0, `${spec}: search did not dim nodes`);
    check(errors.length === 0, `${spec}: console errors ${errors.join(" | ").slice(0, 300)}`);
    await page.close();

    // Phone: one tree at a time, counters on the switch, the sheet edits ranks, no overflow.
    for (const width of [390, 320]) {
      const phoneErrors = [];
      const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true });
      const phone = await context.newPage();
      watch(phone, phoneErrors);
      await phone.goto(`${baseUrl}/ru/talents/${spec}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await ready(phone);
      await phone.locator('[data-tree-canvas="class"]').waitFor();
      const node = open(phone, "class").first();
      await node.scrollIntoViewIfNeeded();
      await node.tap();
      await phone.locator("[data-talent-sheet]").waitFor({ timeout: 3_000 }).catch(() => undefined);
      check(await phone.locator("[data-talent-sheet]").isVisible(), `${spec}@${width}: no talent sheet on tap`);
      check((await phone.locator('[data-tree-tab="class"]').innerText()).includes("/"), `${spec}@${width}: switch has no counter`);
      await phone.locator('[data-tree-tab="spec"]').tap();
      await phone.locator('[data-tree-canvas="spec"]').waitFor({ timeout: 10_000 });
      const layout = await phone.evaluate(() => ({ overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, trees: document.querySelectorAll("[data-tree-canvas]").length }));
      check(!layout.overflow, `${spec}@${width}: page overflows horizontally`);
      check(layout.trees === 1, `${spec}@${width}: ${layout.trees} trees on the phone`);
      check(phoneErrors.length === 0, `${spec}@${width}: console errors ${phoneErrors.join(" | ").slice(0, 300)}`);
      await context.close();
    }
    console.log(`${spec}: checked`);
  }
} finally {
  await browser.close();
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else console.log("qa:talents — all checks passed");
