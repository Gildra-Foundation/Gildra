/** Optional explicit screenshots, separate from regression assertions/RED history. */
import { test, expect } from "./ui-support";

test("capture verified loadout and exact tooltip", async ({ auction, page }, info) => {
  await auction.open(); await auction.search(); await auction.assemble();
  await expect(auction.result.getByRole("heading", { name: /Что купить|Items to buy/ })).toBeVisible();
  const resultImage = info.outputPath("synthetic-confirmed-loadout.png");
  await page.screenshot({ path: resultImage, fullPage: true });
  await info.attach("synthetic-confirmed-loadout", { path: resultImage, contentType: "image/png" });
  const trigger = auction.result.getByRole("button", { name: /Synthetic exact item 780001.*(?:Описание предмета|Item details)/ });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("+21", { exact: true })).toBeVisible();
  await expect(dialog.getByText("+17", { exact: true })).toBeVisible();
  await expect(dialog.getByText(auction.t("Сила", "Strength"), { exact: true })).toBeVisible();
  await expect(dialog.getByText(auction.t("Критический удар", "Critical strike"), { exact: true })).toBeVisible();
  const image = dialog.locator("img");
  await expect(image).toHaveCount(1);
  await image.evaluate(async element => { if (element instanceof HTMLImageElement) await element.decode(); });
  expect(await image.evaluate(element => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0)).toBe(true);
  const icon = dialog.locator("span[data-quality]").first();
  expect(await icon.evaluate(element => getComputedStyle(element).borderLeftWidth)).toBe("2px");
  const tooltipImage = info.outputPath("synthetic-exact-tooltip.png");
  await page.screenshot({ path: tooltipImage, fullPage: true });
  await info.attach("synthetic-exact-tooltip", { path: tooltipImage, contentType: "image/png" });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
