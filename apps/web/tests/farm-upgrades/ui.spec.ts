import { test, expect, type Page } from "playwright/test";
import { parseFarmScope, sameFarmScope, type GearFarmScope } from "../../lib/wow/gearFarm/recovery";
const start = /^(Проверить добычу|Check the loot)$/;
const good = { itemId: 999001, entityId: "synthetic", name: "Synthetic useful proc", slotType: "TRINKET_1", currentItemId: 99,
  currentItemLevel: 200, encounterId: 1, encounterName: "Synthetic boss", verification: "simulated", itemLevel: 139, requiredLevel: 78,
  deltaDps: 1000, deltaPercent: 10, marginPercent: 0.3, stats: {}, effectsVerified: false };
const bad = [{ ...good, name: "Junk downgrade", itemId: 999002, deltaDps: -10 },
  { ...good, name: "Junk noise", itemId: 999003, deltaPercent: 0.1 },
  { ...good, name: "Junk unmeasured", itemId: 999004, verification: "variant_verified" },
  { ...good, name: "Junk ilvl", itemId: 999005, verification: "item_level", itemLevel: 300 }];
const location = { id: "synthetic", name: "Synthetic accessible dungeon", slug: "synthetic", difficulty: "normal", access: "level_condition_met",
  group: "dungeon", minLevel: 78, sourceUrl: "https://example.invalid", sourceVerifiedAt: "2026-10-24", lootItemsChecked: 5, variantsUnverified: 1 };
const result = (targets: unknown[]) => ({ character: { name: "Synthetic", level: 81, equippedItemLevel: 200, specId: 72 },
  activities: [{ ...location, targets }, { ...location, id: "locked", name: "Synthetic locked dungeon", access: "level_locked", minLevel: 90, targets: [good] }],
  coverage: { instancesChecked: 2, lootItemsChecked: 6, exactVariants: 5, simulations: 6, searchLimited: true },
  checkedAt: "2026-10-24T17:00:00Z", baselineDps: 10000, engine: "SimulationCraft synthetic-ui", profileFingerprint: "synthetic" });
type FixtureJob = { id: string; scope: GearFarmScope; clientRequestId: string; createdAt: number; expiresAt: number; status: string; result: unknown; progress: unknown; error: string | null };
async function mockFarm(page: Page, initial: unknown) {
  const state = { value: initial, job: null as FixtureJob | null, posts: [] as Record<string, unknown>[], deletes: 0, failPolls: 0 };
  await page.route("**/api/wow/gear-farm-plans**", async route => {
    const request = route.request(), params = new URL(request.url()).searchParams;
    if (request.method() === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>; state.posts.push(body);
      state.job = { id: `synthetic-job-${state.posts.length}`, scope: parseFarmScope(body), clientRequestId: String(body.clientRequestId),
        createdAt: Date.now(), expiresAt: Date.now() + 30 * 60_000, status: "completed", result: state.value, progress: null, error: null };
    } else {
      const scope = parseFarmScope({ ...Object.fromEntries(params), ...(params.has("mythicKeyLevel") ? { mythicKeyLevel: Number(params.get("mythicKeyLevel")) } : {}) });
      const owned = state.job;
      const matches = owned && sameFarmScope(owned.scope, scope);
      if (request.method() === "DELETE") { state.deletes++; if (matches && owned) { owned.status = "cancelled"; owned.result = null; owned.progress = null; } }
      else if ((params.has("id") || params.has("clientRequestId")) && state.failPolls-- > 0) { await route.abort("failed"); return; }
      if (!matches) { await route.fulfill({ status: params.has("id") || params.has("clientRequestId") ? 404 : 200,
        json: params.has("id") || params.has("clientRequestId") ? { error: "plan_not_found" } : { job: null } }); return; }
    }
    if (state.job?.status !== "cancelled") {
      const value = state.value;
      Object.assign(state.job!, value && typeof value === "object" && "status" in value ? value : { status: "completed", result: value, progress: null, error: null });
    }
    const discovery = request.method() === "GET" && !params.has("id") && !params.has("clientRequestId");
    await route.fulfill({ json: discovery ? { job: state.job } : state.job });
  });
  return state;
}
test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", route => route.abort());
});
test("show only significant attainable upgrades", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await mockFarm(page, result([good, ...bad]));
  await page.goto(`/?lang=${info.project.metadata.locale}`);
  await page.getByRole("button", { name: start }).focus(); await page.keyboard.press("Enter");
  await expect(page.locator("[data-farm-verification]")).toHaveCount(1);
  await expect(page.getByText("Synthetic useful proc", { exact: true })).toBeVisible();
  await expect(page.getByText(/Junk/)).toHaveCount(0);
  await expect(page.getByText("Synthetic locked dungeon")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: info.outputPath("confirmed-farm.png"), fullPage: true });
  expect(errors).toEqual([]);
});
test("empty results never suggest farming junk", async ({ page }, info) => {
  await mockFarm(page, result(bad));
  await page.goto(`/?lang=${info.project.metadata.locale}`); await page.getByRole("button", { name: start }).click();
  await expect(page.getByRole("status")).toContainText(/Проверена часть|Only part of the loot/);
  await expect(page.locator("[data-farm-verification]")).toHaveCount(0);
  await expect(page.getByText("Synthetic accessible dungeon")).toHaveCount(0);
  await expect(page.getByText(/Junk/)).toHaveCount(0);
});
test("progress cancellation and server errors stay usable", async ({ page }, info) => {
  const state = await mockFarm(page, { status: "running", result: null, progress: { phase: "simulating", completed: 2, total: 31 }, error: null });
  await page.goto(`/?lang=${info.project.metadata.locale}`); await page.getByRole("button", { name: start }).click();
  await expect(page.getByRole("status")).toContainText("2 / 31");
  const cancel = page.getByRole("button", { name: /^(Отменить|Cancel)$/ });
  await cancel.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText(/Подбор отменён|Search cancelled/);
  await expect.poll(() => state.deletes).toBe(1);
  state.value = { status: "failed", result: null, progress: null, error: "simulation_unavailable" }; await page.getByRole("button", { name: start }).click();
  await expect(page.locator("[data-gear-farm]").getByRole("alert")).toContainText(/недоступен|unavailable/);
  await expect(page.getByRole("button", { name: start })).toBeEnabled();
});

test("navigation preserves work and restores its completed result", async ({ page }, info) => {
  const state = await mockFarm(page, { status: "running", result: null, progress: { phase: "simulating", completed: 2, total: 31 }, error: null });
  await page.goto(`/?lang=${info.project.metadata.locale}`); await page.getByRole("button", { name: start }).click();
  await expect(page.getByRole("status")).toContainText("2 / 31");
  await page.reload(); await expect(page.getByRole("status")).toContainText("2 / 31");
  state.value = result([good]); await expect(page.locator("[data-farm-verification]")).toHaveCount(1);
  await page.reload(); await expect(page.locator("[data-farm-verification]")).toHaveCount(1);
  expect(state.posts).toHaveLength(1); expect(state.deletes).toBe(0);
  await page.getByRole("button", { name: "Change synthetic profile" }).click();
  await expect(page.locator("[data-farm-verification]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: start })).toBeEnabled(); expect(state.deletes).toBe(0);
});
test("failed polling can reconnect without deleting or duplicating work", async ({ page }, info) => {
  const state = await mockFarm(page, { status: "running", result: null, progress: { phase: "simulating", completed: 2, total: 31 }, error: null });
  await page.goto(`/?lang=${info.project.metadata.locale}`); state.failPolls = 3;
  await page.getByRole("button", { name: start }).click();
  await expect(page.locator("[data-gear-farm]").getByRole("alert")).toContainText(/Связь прервалась|Connection interrupted/, { timeout: 15_000 });
  state.value = result([good]); await page.getByRole("button", { name: /^(Подключиться снова|Reconnect)$/ }).click();
  await expect(page.locator("[data-farm-verification]")).toHaveCount(1);
  expect(state.posts).toHaveLength(1); expect(state.deletes).toBe(0);
});
test("difficulty and key settings isolate recovery and persist across reload", async ({ page }, info) => {
  const state = await mockFarm(page, result([good]));
  await page.goto(`/?lang=${info.project.metadata.locale}`); await page.getByRole("button", { name: start }).click();
  await expect(page.locator("[data-farm-verification]")).toHaveCount(1);
  const dungeon = page.getByLabel(/^(Dungeon difficulty|Сложность подземелий)$/);
  await dungeon.selectOption("mythic-plus"); await expect(page.locator("[data-farm-verification]")).toHaveCount(0);
  const key = page.getByLabel(/^(Key level|Уровень ключа)$/); await key.selectOption("7");
  await page.getByLabel(/^(Raid difficulty|Сложность рейдов)$/).selectOption("heroic");
  await page.reload(); await expect(dungeon).toHaveValue("mythic-plus"); await expect(key).toHaveValue("7");
  await expect(page.getByLabel(/^(Raid difficulty|Сложность рейдов)$/)).toHaveValue("heroic");
  expect(state.deletes).toBe(0); await expect(page.locator("[data-farm-verification]")).toHaveCount(0);
  state.value = { ...result([]), activities: [{ ...location, difficulty: "mythic-plus", mythicKeyLevel: 7, unsupportedReason: "reward_sequence_unverified", targets: [] }], coverage: { instancesChecked: 1, lootItemsChecked: 0, exactVariants: 0, simulations: 0, searchLimited: true, unsupportedSources: ["synthetic"] } };
  await page.getByRole("button", { name: start }).click();
  await expect(page.locator("[data-farm-unsupported]")).toContainText(/Mythic|Мифик/);
  expect(state.posts[1]).toMatchObject({ dungeonDifficulty: "mythic-plus", mythicKeyLevel: 7, raidDifficulty: "heroic" });
  expect(await page.getByRole("combobox").evaluateAll(controls => controls.every((control, index) => {
    const rect = control.getBoundingClientRect();
    const label = document.querySelector(`label[for="${CSS.escape(control.id)}"]`)?.getBoundingClientRect();
    const previous = controls[index - 1]?.getBoundingClientRect();
    return rect.height >= 44 && Boolean(label && label.bottom <= rect.top) &&
      (!previous || Math.abs(previous.left - rect.left) > 10 || previous.bottom <= label!.top);
  }))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: info.outputPath("unsupported-settings.png"), fullPage: true });
});
