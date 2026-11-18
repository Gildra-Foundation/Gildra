import { test as base, expect, type Page, type Route, type TestInfo } from "playwright/test";
import { goldToCopper } from "../../../lib/wow/auctionMarket";
import { assemblyResult, enhancedAssemblyResult, characterSlug, scope, searchResult } from "../reliability/ui-fixtures";

// The real component runs in the private StrictMode harness. Every account,
// market, measurement and HTTP response in this file is an offline fixture.
type Body = { action: "search" | "resume" | "assemble"; clientRequestId?: string; searchId?: string;
  budgetGold?: string; selectedSlots?: string[]; scenario?: string; fightLengthSeconds?: number; targets?: number;
  compareScenarios?: Array<{ scenario: string; fightLengthSeconds: number; targets: number }>;
  enhancementMode?: "equipment" | "enhanced"; objective?: "dps" | "value"; excludedOptionIds?: string[]; excludedVariantKeys?: string[]; excludedVariantIds?: Array<[number, string]> };
type Search = ReturnType<typeof searchResult>;
type Assembly = ReturnType<typeof assemblyResult> | ReturnType<typeof enhancedAssemblyResult>;
type Job = { id: string; status: "running" | "completed" | "cancelled"; mode: "search" | "assembly";
  result: Search | Assembly | null; progress: null; error: null; scope: ReturnType<typeof scope>; searchId: string };
type Intent = { kind: "quick" | "full"; phase: "search" | "assembly" | "done"; startedAt: number;
  searchTurns: number; assemblyTurns: number; lastCompletedJobId?: string };

export class QuickHarness {
  readonly language: "en" | "ru";
  readonly requests: Body[] = [];
  readonly deletes: string[] = [];
  readonly lookups: string[] = [];
  readonly jobs = new Map<string, Job>();
  readonly nonces = new Map<string, string>();
  input: Body = { action: "search" };
  completeSearch = false;
  completeSearchAt = Infinity;
  empty = false;
  negativeOnly = false;
  combinationsOnly = false;
  runningAction: Body["action"] | null = null;
  dropAssemblyOnce = false;
  completeAssemblyAt = Infinity;
  completeEnhancementsAt = 1;
  enhancementStatus: "ready" | "unavailable" | "no_affordable_configuration" = "ready";
  failContextRecovery = false;
  search: Search | null = null;
  assembly: Assembly | null = null;
  activeId: string | null = null;
  constructor(readonly page: Page, info: TestInfo) { this.language = info.project.metadata.language as "en" | "ru"; }
  get panel() { return this.page.locator("[data-auction-gear]"); }
  get find() { return this.panel.locator('button[type="submit"]'); }
  get full() { return this.panel.getByRole("button", { name: /^(Искать дальше|Search further)$/ }); }
  get result() { return this.panel.locator("[data-auction-assembly-result]"); }
  get key() { return `gildra:auction:v1:${encodeURIComponent(characterSlug)}:fury-warrior:${this.language}`; }
  makeSearch(): Search {
    const complete = this.completeSearch || this.requests.filter(body => body.action === "search" || body.action === "resume").length >= this.completeSearchAt;
    const result = searchResult();
    return { ...result, budgetCopper: goldToCopper(this.input.budgetGold ?? "10000"),
      selectedSlots: this.input.selectedSlots ?? result.selectedSlots, scenario: this.input.scenario ?? result.scenario,
      baseline: { ...result.baseline, iterations: 750 },
      items: this.empty ? [] : this.combinationsOnly ? result.items.map(item => ({ ...item,
        comparison: undefined, evaluation: "requires_combination" })) as unknown as Search["items"]
        : this.negativeOnly ? result.items.filter(item => item.evaluation === "not_upgrade") : result.items,
      searchComplete: complete, discoveryComplete: complete, pendingItems: complete ? 0 : 500,
      searchLimited: !complete, coverage: { ...result.coverage, discoveryComplete: complete, variantsPending: complete ? 0 : 500 },
      ...this.encounter() };
  }
  private encounter() {
    return { fightLengthSeconds: this.input.fightLengthSeconds ?? 120, targets: this.input.targets ?? 1,
      compareScenarios: this.input.compareScenarios ?? [], ...(this.input.enhancementMode ? { enhancementMode: this.input.enhancementMode } : {}), objective: this.input.objective ?? "dps" };
  }
  makeAssembly(): Assembly {
    const complete = this.requests.filter(body => body.action === "assemble").length >= this.completeAssemblyAt;
    const turns = this.requests.filter(body => body.action === "assemble").length;
    const enhanced = this.input.enhancementMode === "enhanced" && complete
      ? enhancedAssemblyResult(turns < this.completeEnhancementsAt ? "pending" : this.enhancementStatus) : null;
    const result = enhanced ?? assemblyResult({ complete });
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
    if (query.has("latest")) { await route.fulfill({ json: { job: null, formIntent: null } }); return; }
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
export const test = base.extend<{ quick: QuickHarness }>({ quick: async ({ page }, provide, info) => {
  const errors: string[] = [], app = new QuickHarness(page, info);
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/wow/auction-gear-plans**", route => app.route(route));
  try { await provide(app); } finally {
    if (!page.isClosed()) await page.unrouteAll({ behavior: "ignoreErrors" });
    await info.attach("synthetic-quick-full-http", { contentType: "application/json",
      body: JSON.stringify({ requests: app.requests, deletes: app.deletes, lookups: app.lookups, errors }) });
  }
  expect(errors).toEqual([]);
} });

