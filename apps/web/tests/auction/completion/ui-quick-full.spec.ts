import { test as base, expect, type Page, type Route, type TestInfo } from "playwright/test";
import { goldToCopper } from "../../../lib/wow/auctionMarket";
import { decodeAuctionGearSelectionTransport } from "../../../lib/wow/auctionGearSelectionTransport";
import { assemblyResult, characterSlug, scope, searchResult, wrist } from "../reliability/ui-fixtures";

// The real component runs in the private StrictMode harness. Every account,
// market, measurement and HTTP response in this file is an offline fixture.
type Body = { action: "search" | "resume" | "assemble"; clientRequestId?: string; searchId?: string;
  budgetGold?: string; selectedSlots?: string[]; scenario?: string; fightLengthSeconds?: number; targets?: number;
  compareScenarios?: Array<{ scenario: string; fightLengthSeconds: number; targets: number }>;
  objective?: "dps" | "value"; excludedOptionIds?: string[]; excludedVariantKeys?: string[]; excludedVariantIds?: Array<[number, string]> };
type Search = ReturnType<typeof searchResult>;
type Assembly = ReturnType<typeof assemblyResult>;
type Job = { id: string; status: "running" | "completed" | "cancelled"; mode: "search" | "assembly";
  result: Search | Assembly | null; progress: null; error: null; scope: ReturnType<typeof scope>; searchId: string };
type Intent = { kind: "quick" | "full"; phase: "search" | "assembly" | "done"; startedAt: number;
  searchTurns: number; assemblyTurns: number; lastCompletedJobId?: string };

class QuickHarness {
  readonly language: "en" | "ru";
  readonly requests: Body[] = [];
  readonly deletes: string[] = [];
  readonly lookups: string[] = [];
  readonly jobs = new Map<string, Job>();
  readonly nonces = new Map<string, string>();
  input: Body = { action: "search" };
  completeSearch = false;
  empty = false;
  negativeOnly = false;
  combinationsOnly = false;
  runningAction: Body["action"] | null = null;
  dropAssemblyOnce = false;
  completeAssemblyAt = Infinity;
  failContextRecovery = false;
  search: Search | null = null;
  assembly: Assembly | null = null;
  activeId: string | null = null;
  constructor(readonly page: Page, info: TestInfo) { this.language = info.project.metadata.language as "en" | "ru"; }
  get panel() { return this.page.locator("[data-auction-gear]"); }
  get find() { return this.panel.locator('button[type="submit"]'); }
  get full() { return this.panel.getByRole("button", { name: /^(Полный поиск|Full search)$/ }); }
  get result() { return this.panel.locator("[data-auction-assembly-result]"); }
  get key() { return `gildra:auction:v1:${encodeURIComponent(characterSlug)}:fury-warrior:${this.language}`; }
  makeSearch(): Search {
    const result = searchResult();
    return { ...result, budgetCopper: goldToCopper(this.input.budgetGold ?? "10000"),
      selectedSlots: this.input.selectedSlots ?? result.selectedSlots, scenario: this.input.scenario ?? result.scenario,
      baseline: { ...result.baseline, iterations: 750 },
      items: this.empty ? [] : this.combinationsOnly ? result.items.map(item => ({ ...item,
        comparison: undefined, evaluation: "requires_combination" })) as unknown as Search["items"]
        : this.negativeOnly ? result.items.filter(item => item.evaluation === "not_upgrade") : result.items,
      searchComplete: this.completeSearch, discoveryComplete: this.completeSearch, pendingItems: this.completeSearch ? 0 : 500,
      searchLimited: !this.completeSearch, coverage: { ...result.coverage, discoveryComplete: this.completeSearch, variantsPending: this.completeSearch ? 0 : 500 },
      ...this.encounter() };
  }
  private encounter() {
    return { fightLengthSeconds: this.input.fightLengthSeconds ?? 120, targets: this.input.targets ?? 1,
      compareScenarios: this.input.compareScenarios ?? [], objective: this.input.objective ?? "dps" };
  }
  makeAssembly(): Assembly {
    const complete = this.requests.filter(body => body.action === "assemble").length >= this.completeAssemblyAt;
    const result = assemblyResult({ complete });
    const updated = this.makeSearch();
    return { ...result, budgetCopper: updated.budgetCopper, selectedSlots: updated.selectedSlots,
      updatedSearch: updated, discoveryComplete: updated.discoveryComplete, coverage: updated.coverage,
      searchLimited: !complete, ...this.encounter() };
  }
  async open() {
    await this.page.goto(`/?lang=${this.language}`, { waitUntil: "networkidle" });
    await this.page.evaluate(() => document.fonts.ready);
    await expect.poll(() => this.find.evaluate(element => Object.keys(element).some(key => key.startsWith("__reactProps")))).toBe(true);
  }
  async cache(): Promise<{ orchestration?: Intent; excludedVariantKeys?: string[] }> {
    return this.page.evaluate(key => JSON.parse(sessionStorage.getItem(key) ?? "{}"), this.key);
  }
  async seed(orchestration?: Intent, active = false) {
    this.search = this.makeSearch();
    const jobId = active ? "synthetic-quick-recovered-job" : undefined;
    const clientRequestId = active ? "synthetic-quick-recovered-request" : undefined;
    if (jobId && clientRequestId) {
      this.activeId = jobId;
      this.jobs.set(jobId, this.job(jobId, this.search, "running"));
      this.nonces.set(clientRequestId, jobId);
    }
    await this.page.addInitScript(({ key, searchId, orchestration, jobId, clientRequestId }) => {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, JSON.stringify({ version: 1, profileKey: "synthetic-reliability:0", searchId,
        mode: "search", excludedOptionIds: [], excludedVariantKeys: [], ...(orchestration ? { orchestration } : {}),
        ...(jobId ? { jobId, clientRequestId } : {}) }));
    }, { key: this.key, searchId: this.search.searchId, orchestration, jobId, clientRequestId });
  }
  completeActive() {
    const job = this.activeId ? this.jobs.get(this.activeId) : undefined;
    if (job) job.status = "completed";
    this.activeId = null;
  }
  private job(id: string, result: Search | Assembly, status: Job["status"]): Job {
    return { id, status, mode: result.kind as Job["mode"], result, progress: null, error: null,
      searchId: result.searchId, scope: scope(this.language) };
  }
  private view(job: Job) { return job.status === "running" ? { ...job, result: null } : job; }
  async route(route: Route) {
    const request = route.request(), query = new URL(request.url()).searchParams;
    if (request.method() === "POST") {
      const body = request.postDataJSON() as Body; this.requests.push(body);
      if (this.requests.length > 18) { await route.fulfill({ status: 429, json: { error: "plan_queue_full" } }); return; }
      if (body.action === "search") this.input = body;
      const result = body.action === "assemble" ? this.makeAssembly() : this.makeSearch();
      if (body.action === "assemble") this.assembly = result as Assembly; else this.search = result as Search;
      const id = `synthetic-quick-job-${this.requests.length}`;
      const job = this.job(id, result, body.action === this.runningAction ? "running" : "completed");
      this.jobs.set(id, job); if (body.clientRequestId) this.nonces.set(body.clientRequestId, id);
      this.activeId = job.status === "running" ? id : null;
      if (body.action === "assemble" && this.dropAssemblyOnce) { this.dropAssemblyOnce = false; await route.abort("failed"); return; }
      await route.fulfill({ status: 202, json: this.view(job) }); return;
    }
    const nonce = query.get("clientRequestId"), id = query.get("id") ?? this.nonces.get(nonce ?? "");
    if (request.method() === "DELETE") {
      this.deletes.push(id ?? nonce ?? "unknown");
      const job = id ? this.jobs.get(id) : undefined;
      if (job) job.status = "cancelled";
      this.activeId = null;
      await route.fulfill({ json: job ? this.view(job) : { id: "synthetic-cancelled", status: "cancelled" } }); return;
    }
    this.lookups.push(query.toString());
    if (query.has("active")) { await route.fulfill({ json: { activeJob: null, formIntent: null } }); return; }
    if (query.has("searchId")) {
      if (this.failContextRecovery) { await route.fulfill({ status: 503, json: { error: "auction_storage_unavailable" } }); return; }
      const active = this.activeId ? this.jobs.get(this.activeId) : undefined;
      await route.fulfill({ json: { kind: "recovery", search: this.search, assembly: this.assembly,
        excludedOptionIds: [], excludedVariantKeys: [], activeJob: active ? this.view(active) : null, needsRefresh: true } }); return;
    }
    const job = id ? this.jobs.get(id) : undefined;
    await route.fulfill(job ? { json: this.view(job) } : { status: 404, json: { error: "plan_not_found" } });
  }
}
const test = base.extend<{ quick: QuickHarness }>({ quick: async ({ page }, provide, info) => {
  const errors: string[] = [], app = new QuickHarness(page, info);
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/wow/auction-gear-plans**", route => app.route(route));
  try { await provide(app); } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await info.attach("synthetic-quick-full-http", { contentType: "application/json",
      body: JSON.stringify({ requests: app.requests, deletes: app.deletes, lookups: app.lookups, errors }) });
  }
  expect(errors).toEqual([]);
} });

async function assertIdle(quick: QuickHarness) {
  await expect(quick.find).toBeEnabled();
  await expect.poll(async () => (await quick.cache()).orchestration?.phase).toBe("done");
  const count = quick.requests.length;
  await quick.page.clock.install(); await quick.page.clock.fastForward(180_000);
  expect(quick.requests).toHaveLength(count);
}

test("quick/full: default stops after three search turns and one partial assembly without claiming exhaustive completion", async ({ quick, page }, info) => {
  await quick.open(); await quick.find.click();
  await expect(quick.result).toHaveAttribute("data-exhaustive", "false");
  await assertIdle(quick);
  expect(quick.requests.map(body => body.action)).toEqual(["search", "resume", "resume", "assemble"]);
  expect((await quick.cache()).orchestration).toMatchObject({ kind: "quick", phase: "done", searchTurns: 3, assemblyTurns: 1 });
  await expect(quick.full).toBeVisible(); await quick.full.focus(); await expect(quick.full).toBeFocused();
  await expect(quick.panel).not.toContainText(/Все сочетания проверены|All combinations checked|global optimum/i);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: info.outputPath("quick-partial-result.png"), fullPage: true });
});

test("quick/full: a completed search automatically assembles measured negative single replacements", async ({ quick }) => {
  quick.completeSearch = true; quick.negativeOnly = true;
  await quick.open(); await quick.find.click();
  await expect(quick.result).toBeVisible(); await assertIdle(quick);
  expect(quick.requests.map(body => body.action)).toEqual(["search", "assemble"]);
  expect(quick.search?.items.every(item => item.comparison && item.evaluation === "not_upgrade")).toBe(true);
  expect(quick.search?.baseline).toMatchObject({ iterations: 750, confidence: 95, dpsError: 0.1 });
  for (const body of quick.requests) {
    expect(body).not.toHaveProperty("iterations"); expect(body).not.toHaveProperty("precision");
  }
});

test("quick/full: no measured options stops after its search budget without an empty assembly loop", async ({ quick }) => {
  quick.empty = true; await quick.open(); await quick.find.click();
  await assertIdle(quick);
  expect(quick.requests.map(body => body.action)).toEqual(["search", "resume", "resume"]);
  await expect(quick.result).toHaveCount(0); await expect(quick.full).toBeVisible();
  await expect(quick.panel).not.toContainText(/Поиск продолжается|search is continuing|Search continues/);
});

test("quick/full: eligible combination-only options still trigger one assembly", async ({ quick }) => {
  quick.combinationsOnly = true;
  await quick.open(); await quick.find.click(); await expect(quick.result).toBeVisible(); await assertIdle(quick);
  expect(quick.requests.map(body => body.action)).toEqual(["search", "resume", "resume", "assemble"]);
  expect(quick.search?.items.every(item => !item.comparison && item.evaluation === "requires_combination")).toBe(true);
});

test("quick/full: elapsed quick budget waits for the active job then transitions once to assembly", async ({ quick, page }) => {
  quick.runningAction = "search";
  await quick.open(); await page.clock.install(); await quick.find.click();
  await expect.poll(() => quick.requests.length).toBe(1);
  await page.clock.setSystemTime(new Date(Date.now() + 46_000));
  quick.completeActive(); await page.clock.runFor(500);
  await expect(quick.result).toBeVisible(); await expect(quick.find).toBeEnabled();
  expect(quick.requests.map(body => body.action)).toEqual(["search", "assemble"]);
  await page.clock.fastForward(180_000); expect(quick.requests).toHaveLength(2);
});

test("quick/full: explicit full search reuses the same search and exact exclusions until assembly finishes", async ({ quick, page }, info) => {
  await quick.open();
  await quick.panel.getByRole("textbox", { name: /Бюджет, золото|Budget, gold/ }).fill(quick.language === "ru" ? "10 000,1234" : "10,000.1234");
  await quick.find.click(); await expect(quick.result).toBeVisible(); await expect(quick.find).toBeEnabled();
  await quick.panel.getByText(/^(Отдельные улучшения по слотам|Individual slot upgrades)$/).click();
  await quick.panel.locator("[data-auction-option] summary").click();
  await quick.panel.getByRole("checkbox", { name: new RegExp(`(?:Учитывать вариант при сборке|Allow variant in assembly): ${wrist.name}`) }).focus();
  // Excluding removes this card, so assert the resulting selection instead of
  // asking Playwright to re-find the now-unmounted checkbox after uncheck().
  await page.keyboard.press("Space");
  const excluded = [JSON.stringify([wrist.itemId, wrist.variantKey])];
  expect((await quick.cache()).excludedVariantKeys).toEqual(excluded);
  quick.completeSearch = true; quick.completeAssemblyAt = 4;
  const start = quick.requests.length;
  await quick.full.click(); await expect(quick.result).toHaveAttribute("data-exhaustive", "true");
  await expect(quick.find).toBeEnabled();
  const full = quick.requests.slice(start);
  expect(full.map(body => body.action)).toEqual(["resume", "assemble", "assemble", "assemble"]);
  expect(quick.requests.filter(body => body.action === "search")).toHaveLength(1);
  expect(quick.requests[0].budgetGold).toBe("10000.1234");
  for (const body of full) {
    expect(body.searchId).toBe(searchResult().searchId);
    if (body.action === "assemble") expect(decodeAuctionGearSelectionTransport(body).excludedVariantKeys).toEqual(excluded);
  }
  expect(new Set(quick.requests.map(body => body.clientRequestId)).size).toBe(quick.requests.length);
  expect((await quick.cache()).orchestration).toMatchObject({ kind: "full", phase: "done" });
  await page.screenshot({ path: info.outputPath("explicit-full-result.png"), fullPage: true });
});

test("quick/full: reloading a completed quick result restores it without upgrading to full", async ({ quick, page }) => {
  await quick.open(); await quick.find.click(); await expect(quick.result).toBeVisible(); await expect(quick.find).toBeEnabled();
  const count = quick.requests.length;
  await page.reload({ waitUntil: "networkidle" });
  await expect(quick.result).toHaveAttribute("data-exhaustive", "false");
  await assertIdle(quick);
  expect(quick.requests).toHaveLength(count); expect((await quick.cache()).orchestration?.kind).toBe("quick");
  await expect(quick.full).toBeVisible();
});

test("quick/full: recovering active quick work keeps its consumed turn budget", async ({ quick, page }) => {
  await quick.seed({ kind: "quick", phase: "search", startedAt: Date.now(), searchTurns: 2, assemblyTurns: 0,
    lastCompletedJobId: "synthetic-quick-previous-job" }, true);
  await quick.open();
  await expect.poll(() => quick.lookups.some(query => query.includes("synthetic-quick-recovered"))).toBe(true);
  quick.completeActive();
  await expect(quick.result).toBeVisible(); await assertIdle(quick);
  expect(quick.requests.map(body => body.action)).toEqual(["assemble"]);
  expect((await quick.cache()).orchestration).toMatchObject({ kind: "quick", phase: "done", searchTurns: 3, assemblyTurns: 1 });
  await page.reload({ waitUntil: "networkidle" }); await expect(quick.result).toBeVisible();
  expect(quick.requests).toHaveLength(1);
});

test("quick/full: legacy completed recovery displays retained facts without automatically starting full search", async ({ quick, page }) => {
  await quick.seed(); quick.assembly = quick.makeAssembly();
  await quick.open(); await expect(quick.result).toHaveAttribute("data-exhaustive", "false");
  await expect(quick.full).toBeVisible();
  await page.clock.install(); await page.clock.fastForward(180_000);
  expect(quick.requests).toHaveLength(0);
});

test("quick/full: cancellation during automatic assembly prevents further steps", async ({ quick, page }) => {
  quick.runningAction = "assemble";
  await quick.open(); await quick.find.click();
  const cancel = quick.panel.getByRole("button", { name: /^(Отменить сборку|Cancel assembly)$/ });
  await expect(cancel).toBeVisible(); await cancel.click();
  await expect.poll(() => quick.deletes.length).toBeGreaterThan(0);
  await expect(quick.find).toBeEnabled();
  const count = quick.requests.length;
  quick.completeActive(); await page.clock.install(); await page.clock.fastForward(180_000);
  expect(quick.requests).toHaveLength(count);
  expect(quick.requests.map(body => body.action)).toEqual(["search", "resume", "resume", "assemble"]);
  await expect(quick.panel.getByRole("status").filter({ hasText: /Расчёт остановлен|Calculation stopped/ })).toBeVisible();
});

test("quick/full: lost automatic assembly response recovers the same request without escalating or duplicating work", async ({ quick }) => {
  quick.completeSearch = true; quick.dropAssemblyOnce = true;
  await quick.open(); await quick.find.click();
  const recover = quick.panel.getByRole("button", { name: /^(Повторить восстановление|Retry recovery)$/ });
  await expect(recover).toBeVisible(); await recover.click();
  await expect(quick.result).toHaveAttribute("data-exhaustive", "false");
  await assertIdle(quick);
  expect(quick.requests.map(body => body.action)).toEqual(["search", "assemble"]);
  const nonce = quick.requests[1].clientRequestId!;
  expect(quick.lookups.some(query => query.includes(nonce))).toBe(true);
  expect((await quick.cache()).orchestration?.kind).toBe("quick");
});

test("quick/full: explicit full after a lost quick assembly first recovers ownership then resumes discovery", async ({ quick }) => {
  quick.dropAssemblyOnce = true;
  await quick.open(); await quick.find.click();
  await expect(quick.panel.getByRole("button", { name: /^(Повторить восстановление|Retry recovery)$/ })).toBeVisible();
  const nonce = quick.requests.at(-1)!.clientRequestId!;
  quick.completeSearch = true; quick.completeAssemblyAt = 2;
  await quick.full.click();
  await expect(quick.result).toHaveAttribute("data-exhaustive", "true");
  await expect(quick.find).toBeEnabled();
  expect(quick.lookups.some(query => query.includes(nonce))).toBe(true);
  expect(quick.requests.map(body => body.action)).toEqual(["search", "resume", "resume", "assemble", "resume", "assemble"]);
  expect(quick.requests.filter(body => body.action === "search")).toHaveLength(1);
  expect((await quick.cache()).orchestration).toMatchObject({ kind: "full", phase: "done" });
});

test("quick/full: full retries failed saved-context recovery without cancelling it or starting a new search", async ({ quick }) => {
  await quick.seed({ kind: "quick", phase: "search", startedAt: Date.now(), searchTurns: 2, assemblyTurns: 0 });
  quick.failContextRecovery = true;
  await quick.open();
  await expect(quick.panel.getByRole("button", { name: /^(Повторить восстановление|Retry recovery)$/ })).toBeVisible({ timeout: 15_000 });
  expect(quick.requests).toHaveLength(0); expect(quick.deletes).toHaveLength(0);
  quick.failContextRecovery = false; quick.completeAssemblyAt = 1;
  // The retained context is incomplete, while the next fresh server turn finishes discovery.
  quick.completeSearch = true;
  await quick.full.click();
  await expect(quick.result).toHaveAttribute("data-exhaustive", "true");
  await expect(quick.find).toBeEnabled();
  expect(quick.requests.map(body => body.action)).toEqual(["resume", "assemble"]);
  expect(quick.deletes).toHaveLength(0);
  expect(quick.requests.every(body => body.searchId === searchResult().searchId)).toBe(true);
  expect((await quick.cache()).orchestration).toMatchObject({ kind: "full", phase: "done" });
});
