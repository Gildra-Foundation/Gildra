import { expect } from "playwright/test";
import { test } from "./ui-quick-support";

test("ux layout: intermediate width keeps settings and shopping readable", async ({ quick, page }, info) => {
  const width = info.project.metadata.width === 390 ? 768 : 1280;
  await page.setViewportSize({ width, height: 1000 });
  quick.completeSearch = true;
  await quick.open();
  for (const state of ["initial", "recommendation"] as const) {
    if (state === "recommendation") { await quick.find.click(); await expect(quick.result).toBeVisible(); }
    await expect(quick.panel.locator("[data-auction-advanced-settings]")).not.toHaveAttribute("open", "");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => document.fonts.ready);
    const help = await quick.panel.locator("#auction-build-mode-help").boundingBox();
    for (const radio of await quick.panel.locator("[data-auction-build-modes]").getByRole("radio").all()) {
      const box = await radio.boundingBox();
      expect(box!.y + box!.height).toBeLessThanOrEqual(help!.y);
    }
    const path = info.outputPath(`synthetic-${state}-${quick.language}-${width}.png`);
    await page.screenshot({ path, fullPage: true });
    await info.attach(`synthetic-${state}-${width}`, { path, contentType: "image/png" });
  }
  await expect(quick.result.locator("[data-auction-shopping-list]")).toBeVisible();
  expect(quick.requests.map(body => body.action)).toEqual(["search", "assemble"]);
});
