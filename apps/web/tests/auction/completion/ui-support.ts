import { test as base, expect, type Page, type Route, type TestInfo } from "playwright/test";
import { goldToCopper } from "../../../lib/wow/auctionMarket";
import { assemblyResult, completedJob, scope, searchResult } from "../reliability/ui-fixtures";

type Body = { action: "search" | "resume" | "assemble"; clientRequestId?: string; budgetGold?: string; searchId?: string; excludedOptionIds?: string[]; excludedVariantKeys?: string[]; objective?: "value" | "dps"; locale?: string; selectedSlots?: string[]; scenario?: string };
type Result = ReturnType<typeof searchResult> | ReturnType<typeof assemblyResult>;
export class CompletionHarness {
  readonly language: "en" | "ru";
  requests: Body[] = [];
  deletes: string[] = [];
  requestLookups: string[] = [];
  nonceDeletes: string[] = [];
  workStarted: string[] = [];
  serverExclusions: string[] = [];
  searchLookups = 0;
  holdRecovery = false;
  holdPriorDelete = false;
  pendingInitial = false;
  excludedVariantLevels: "same" | "different" | null = null;
  holdPost = false;
  holdContinuation = false;
  holdAcceptance = false;
  holdRequestRecovery = false;
  requestRecoveryMissing = false;
  cancelFailure = false;
  recoveryFailure = false;
  dropAction: "resume" | "assemble" | null = null;
  conflictNext = false;
  conflictResumeMode: "search" | "assembly" | null = null;
  empty = false;
  valueChoices = false;
  valueMaximum: "confirmed" | "unconfirmed" | null = null;
  aliasVariants = false;
  manyDuplicateLots = false;
  serverVariantExclusions: string[] = [];
  private serverObjective: "value" | "dps" = "dps";
  incompleteData = false;
  incompleteSearchOnce = false;
  fail = false;
  private held: Array<() => void> = [];
  private jobs = new Map<string, { result: Result; clientRequestId?: string; cancelled?: boolean }>();
  private cancelledRequests = new Set<string>();
  private byRequest = new Map<string, string>();
  private latestSearch = searchResult();
  private lastAssembly: ReturnType<typeof assemblyResult> | null = null;
  private activeJobId: string | null = null;
  constructor(readonly page: Page, info: TestInfo) { this.language = info.project.metadata.language as "en" | "ru"; }
  t(ru: string, en: string) { return this.language === "ru" ? ru : en; }
  get panel() { return this.page.locator("[data-auction-gear]"); }
  get assembly() { return this.panel.locator("[data-auction-assembly]"); }
  get result() { return this.panel.locator("[data-auction-assembly-result]"); }
  get find() { return this.panel.locator('button[type="submit"]'); }
  get build() { return this.assembly.getByRole("button", { name: /Собрать сет под бюджет|Продолжить сборку сета|Обновить и пересобрать сет|Build a loadout within budget|Continue loadout assembly|Refresh and rebuild loadout/ }).first(); }
  async install() { await this.page.route("**/api/wow/auction-gear-plans**", route => this.intercept(route)); }
  async open(controls = false) {
    await this.page.goto(`/?lang=${this.language}${controls ? "&controls=1" : ""}`, { waitUntil: "networkidle" });
    await this.page.evaluate(() => document.fonts.ready);
    await expect.poll(() => this.find.evaluate(element => Object.keys(element).some(key => key.startsWith("__reactProps")))).toBe(true);
  }
  async search() { await this.find.click(); await expect(this.panel.locator("[data-auction-search-result]")).toBeVisible(); }
  async seedRecovery() {
    await this.page.evaluate(({ locale }) => sessionStorage.setItem(`gildra:auction:v1:eu--synthetic-reliability--synthetic:fury-warrior:${locale}`, JSON.stringify({
      version: 1, profileKey: "synthetic-reliability:0", searchId: "synthetic-reliability-search", mode: "search", excludedOptionIds: [],
    })), { locale: this.language });
  }
  async seedRecoveryMode(cachedMode: "search" | "assembly", activeMode: "search" | "assembly") {
    this.seedBusyMode(activeMode, [], true); this.conflictNext = false;
    this.lastAssembly = cachedMode === "assembly" ? assemblyResult() : null;
    await this.seedRecovery();
    await this.page.evaluate(({ locale, cachedMode }) => {
      const key = `gildra:auction:v1:eu--synthetic-reliability--synthetic:fury-warrior:${locale}`;
      sessionStorage.setItem(key, JSON.stringify({ ...JSON.parse(sessionStorage.getItem(key)!), mode: cachedMode }));
    }, { locale: this.language, cachedMode });
  }
  seedBusyMode(mode: "search" | "assembly", excludedOptionIds: string[] = [], marker = false) {
    const result = mode === "assembly" ? assemblyResult() : searchResult();
    if (marker) result.market = { ...result.market, realm: `MODE ${mode.toUpperCase()} COMPLETED` };
    this.serverExclusions = excludedOptionIds;
    this.activeJobId = `completion-conflicting-${mode}`;
    this.jobs.set(this.activeJobId, { result }); this.conflictNext = true;
  }
  seedBusyAssembly(excludedOptionIds: string[] = []) {
    this.lastAssembly = assemblyResult(); this.seedBusyMode("assembly", excludedOptionIds);
  }
  release() { this.holdPriorDelete = false; this.holdPost = false; this.holdContinuation = false; this.holdRecovery = false; this.holdAcceptance = false; this.holdRequestRecovery = false; for (const release of this.held.splice(0)) release(); }
  async dispose() { this.release(); await this.page.unrouteAll({ behavior: "ignoreErrors" }); }
  private async intercept(route: Route) {
    const request = route.request(), url = new URL(request.url());
    if (request.method() === "DELETE") {
      const nonce = url.searchParams.get("clientRequestId");
      if (nonce && this.cancelFailure) { await route.fulfill({ status: 503, json: { error: "auction_storage_unavailable" } }); return; }
      if (nonce) { this.cancelledRequests.add(nonce); this.nonceDeletes.push(nonce); }
      const id = url.searchParams.get("id") ?? this.byRequest.get(nonce ?? "") ?? "";
      if (id) { this.deletes.push(id); const job = this.jobs.get(id); if (job) job.cancelled = true; }
      if (this.activeJobId === id) this.activeJobId = null;
      if (this.holdPriorDelete && id === "prior-held-job") await new Promise<void>(resolve => this.held.push(resolve));
      await route.fulfill({ json: { id, status: "cancelled", progress: null, result: null, error: null, scope: scope(this.language) } }); return;
    }
    if (request.method() === "POST") {
      const body = request.postDataJSON() as Body; this.requests.push(body);
      if (this.holdAcceptance) await new Promise<void>(resolve => this.held.push(resolve));
      if (body.clientRequestId && this.cancelledRequests.has(body.clientRequestId)) {
        const id = `completion-cancelled-${this.requests.length}`;
        await route.fulfill({ status: 202, json: { id, status: "cancelled", result: null, progress: null, error: null, scope: scope(this.language) } }); return;
      }
      if (body.action === "resume" && this.conflictResumeMode) {
        this.seedBusyMode(this.conflictResumeMode, [], true); this.conflictResumeMode = null;
      }
      if (this.conflictNext) { this.conflictNext = false; await route.fulfill({ status: 409, json: { error: "plan_already_running" } }); return; }
      let result: Result;
      if (body.action === "assemble") { result = assemblyResult({ noisyMaximum: Boolean(this.valueMaximum) });
        if (this.valueMaximum) { result.spentCopper = 500000; result.comparison.uncertainty.significant = this.valueMaximum === "confirmed"; } this.lastAssembly = result; this.serverExclusions = body.excludedOptionIds ?? []; this.serverVariantExclusions = body.excludedVariantKeys ?? []; }
      else {
        result = searchResult();
        if (body.action === "search") {
          this.serverObjective = body.objective ?? "dps";
          try { result.budgetCopper = goldToCopper(body.budgetGold); }
          catch { await route.fulfill({ status: 400, json: { error: "invalid_budget" } }); return; }
          result.selectedSlots = body.selectedSlots ?? result.selectedSlots; result.scenario = body.scenario ?? result.scenario;
        }
        if (this.valueChoices) {
          const base = result.items.find(item => item.evaluation === "upgrade")!;
          const choice = (optionId: string, itemId: number, cost: number, gain: number) => ({ ...base,
            optionId, itemId, auctionId: itemId + 1000, name: `Synthetic ${optionId}`, variantKey: "synthetic-value-base", lotCostCopper: cost,
            comparison: { ...base.comparison, candidateDps: 1000 + gain, deltaDps: gain, deltaPercent: gain / 10 } });
          result.items = [choice("cheap", 880001, 10000, 1), choice("strong", 880003, 100000, 30),
            choice("value-best", 880002, 40000, 20), { ...choice("duplicate", 880002, 60000, 20), auctionId: 889999 }];
        }
        if (this.aliasVariants || this.manyDuplicateLots) {
          const base = result.items.find(item => item.evaluation === "upgrade")!;
          result.items = Array.from({ length: this.manyDuplicateLots ? 400 : 4 }, (_, index) => ({ ...base,
            optionId: `alias-${index}`, auctionId: 990000 + Math.floor(index / 2), itemId: 880002,
            variantKey: "same-exact-variant", slotType: index % 2 ? "FINGER_2" : "FINGER_1" }));
        }
        if (this.excludedVariantLevels) {
          const base = result.items.find(item => item.evaluation === "upgrade")!;
          result.items = [0, 1].map(index => ({ ...base, name: "Synthetic shared variant name",
            optionId: `identity-${index}`, auctionId: 770000 + index, itemId: 880002,
            variantKey: `exact-identity-${index}`, itemLevel: index && this.excludedVariantLevels === "different" ? 120 : 100,
            stats: { ...base.stats, strength: 21, crit_rating: index ? 0 : 40, haste_rating: index ? 40 : 0 } }));
        }
        if (this.empty) result.items = [];
        if (this.incompleteData) result.dataComplete = false;
        if (body.action === "search" && this.incompleteSearchOnce) { result.searchComplete = false; result.pendingItems = 1; this.incompleteSearchOnce = false; }
        this.latestSearch = result;
      }
      Object.assign(result, { objective: this.serverObjective });
      if ("updatedSearch" in result) Object.assign(result.updatedSearch, { objective: this.serverObjective });
      const existing = body.clientRequestId ? this.byRequest.get(body.clientRequestId) : undefined;
      const id = existing ?? `completion-job-${this.requests.length}`;
      this.workStarted.push(body.action);
      this.jobs.set(id, { result, clientRequestId: body.clientRequestId });
      if (body.clientRequestId) this.byRequest.set(body.clientRequestId, id);
      this.activeJobId = id;
      if (body.action === "search" && this.pendingInitial && !this.holdPost) {
        await route.fulfill({ status: 202, json: { id, status: "queued", mode: "search", result: null, progress: null, error: null, scope: scope(this.language) } }); return;
      }
      if (this.holdPost || body.action === "resume" && this.holdContinuation) await new Promise<void>(resolve => this.held.push(resolve));
      if (this.dropAction === body.action) { this.dropAction = null; await route.abort("failed"); return; }
      this.activeJobId = null;
      await route.fulfill({ status: 202, json: this.fail ? { id, status: "failed", result: null, progress: null, error: "simulation_unavailable", scope: scope(this.language) } : { ...completedJob(this.language, result), id, mode: result.kind } }); return;
    }
    const requestId = url.searchParams.get("clientRequestId");
    if (requestId) {
      this.requestLookups.push(requestId);
      if (this.holdRequestRecovery) await new Promise<void>(resolve => this.held.push(resolve));
      if (this.requestRecoveryMissing) { await route.fulfill({ status: 404, json: { error: "plan_not_found" } }); return; }
      const id = this.byRequest.get(requestId), job = id ? this.jobs.get(id) : undefined;
      if (!id || !job) { await route.fulfill({ status: 404, json: { error: "plan_not_found" } }); return; }
      if (this.pendingInitial && !job.cancelled) { await route.fulfill({ json: { id, status: "running", mode: "search", result: null, progress: null, error: null, scope: scope(this.language) } }); return; }
      this.activeJobId = null;
      await route.fulfill({ json: job.cancelled ? { id, status: "cancelled", result: null, progress: null, error: null, scope: scope(this.language) } : { ...completedJob(this.language, job.result), id, mode: job.result.kind } }); return;
    }
    if (url.searchParams.has("searchId")) {
      this.searchLookups++;
      if (this.holdRecovery) await new Promise<void>(resolve => this.held.push(resolve));
      if (this.recoveryFailure) { await route.fulfill({ status: 404, json: { error: "search_not_found" } }); return; }
      const activeJob = this.activeJobId ? { id: this.activeJobId, status: "running", result: null, progress: null, error: null, scope: scope(this.language), mode: this.jobs.get(this.activeJobId)?.result.kind } : null;
      await route.fulfill({ json: { kind: "recovery", search: this.latestSearch, assembly: this.lastAssembly, excludedOptionIds: this.serverExclusions, excludedVariantKeys: this.serverVariantExclusions, activeJob, needsRefresh: true } }); return;
    }
    const id = url.searchParams.get("id") ?? "", job = this.jobs.get(id);
    if (!job) { await route.fulfill({ status: 404, json: { error: "plan_not_found" } }); return; }
    if (this.pendingInitial && !job.cancelled) { await route.fulfill({ json: { id, status: "running", mode: "search", result: null, progress: null, error: null, scope: scope(this.language) } }); return; }
    this.activeJobId = null;
    await route.fulfill({ json: { ...completedJob(this.language, job.result), id, mode: job.result.kind } });
  }
}
export const test = base.extend<{ auction: CompletionHarness }>({ auction: async ({ page }, provide, info) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const harness = new CompletionHarness(page, info); await harness.install();
  try { await provide(harness); }
  finally { await harness.dispose(); await info.attach("synthetic-completion-http", { body: JSON.stringify({ requests: harness.requests, deletes: harness.deletes, nonceDeletes: harness.nonceDeletes, workStarted: harness.workStarted, requestLookups: harness.requestLookups, searchLookups: harness.searchLookups, browserErrors: errors }), contentType: "application/json" }); }
  expect(errors).toEqual([]);
} });
export { expect };
