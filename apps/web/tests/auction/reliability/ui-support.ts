import { test as base, expect, type Page, type Route, type TestInfo } from "playwright/test";
import { aliasIds, assemblyResult, characterSlug, comparison, completedJob, item, scope, searchResult } from "./ui-fixtures";

type Body = { clientRequestId?: string; action: string; searchId?: string; excludedOptionIds?: string[]; locale?: "ru" | "en" };
type Mode = "normal" | "running" | "error" | "held-once" | "transient-once" | "initial-running" | "late" | "network-failed";
export class AuctionHarness {
  requests: Body[] = [];
  polls: string[] = [];
  deletes: string[] = [];
  recoveries = 0;
  requestRecoveries = 0;
  requestRecoveryQueries: string[] = [];
  private requestJobs = new Map<string, string>();
  recoveryQueries: string[] = [];
  recoveryFailure = false;
  marketError: string | null = null;
  mode: Mode = "normal";
  noisyMaximum = false;
  incompleteAfterAssembly = false;
  currentExclusions: string[] = [];
  activePolls = 0;
  private jobs = new Map<string, ReturnType<typeof searchResult> | ReturnType<typeof assemblyResult>>();
  private releaseHeld: (() => void) | null = null;
  private releaseLate: (() => void) | null = null;
  private latestSearch = searchResult();
  private lastAssembly: ReturnType<typeof assemblyResult> | null = null;
  private activeRecoveryJob: { id: string; status: string; result: null; progress: null; error: null; scope: ReturnType<typeof scope>; searchId: string } | null = null;
  readonly language: "en" | "ru";
  constructor(readonly page: Page, info: TestInfo) {
    this.language = info.project.metadata.language as "en" | "ru";
  }
  get panel() { return this.page.getByRole("region", { name: this.t("Найти вещи под бюджет", "Find gear within your budget"), exact: true }); }
  get result() { return this.panel.locator("[data-auction-assembly-result]"); }
  get assembly() { return this.panel.locator("[data-auction-assembly]"); }
  get build() { return this.assembly.getByRole("button", { name: /Собрать сет под бюджет|Продолжить сборку сета|Обновить и пересобрать сет|Build a loadout within budget|Continue loadout assembly|Refresh and rebuild loadout|Повторить|Retry/ }).first(); }
  t(ru: string, en: string) { return this.language === "ru" ? ru : en; }
  async install() {
    await this.page.route("**/api/wow/auction-gear-plans**", route => this.intercept(route));
    await this.page.addInitScript(() => {
      // Preserve AbortSignal.timeout semantics while making deadlines controllable
      // with Playwright's virtual JS clock (no application fetch is replaced).
      AbortSignal.timeout = milliseconds => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), milliseconds);
        return controller.signal;
      };
    });
  }
  private async intercept(route: Route) {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "DELETE") {
      const id = url.searchParams.get("id") ?? "";
      this.deletes.push(id);
      this.activeRecoveryJob = null;
      await route.fulfill({ json: { id, status: "cancelled", progress: null, result: null, error: null, scope: scope(this.language) } });
      return;
    }
    if (request.method() === "POST") {
      const body = request.postDataJSON() as Body;
      this.requests.push(body);
      if (this.marketError) {
        await route.fulfill({ status: 202, json: { id: "synthetic-error-job", status: "failed", result: null,
          progress: null, error: this.marketError, scope: scope(this.language) } });
        return;
      }
      expect(["search", "resume", "assemble"]).toContain(body.action);
      let result: ReturnType<typeof searchResult> | ReturnType<typeof assemblyResult>;
      if (body.action !== "assemble") result = searchResult();
      else {
        expect(Object.keys(body).sort()).toEqual(["action", "excludedOptionIds", "searchId"]);
        this.currentExclusions = body.excludedOptionIds ?? [];
        result = assemblyResult({ noisyMaximum: this.noisyMaximum });
        if (this.incompleteAfterAssembly) result.updatedSearch = { ...result.updatedSearch, searchComplete: false, pendingItems: 1 };
        if (aliasIds.every(id => this.currentExclusions.includes(id))) {
          const confirmed = { purchases: [item(780003, "WRIST")], spentCopper: 10000,
            remainingCopper: 99990000, removedSlots: [], comparison: comparison(1050) };
          result = { ...result, ...confirmed, bestConfirmed: confirmed };
        }
      }
      const id = `synthetic-job-${this.requests.length}`;
      this.jobs.set(id, result);
      if (body.clientRequestId) this.requestJobs.set(body.clientRequestId, id);
      const heldPost = this.mode === "late";
      if (this.mode !== "normal") this.activeRecoveryJob = { id, status: "running", result: null, progress: null, error: null,
        scope: scope(body.locale ?? this.language), searchId: result.searchId };
      if (heldPost) await new Promise<void>(resolve => { this.releaseLate = resolve; });
      if (this.mode === "normal") {
        if ("items" in result) this.latestSearch = result;
        else { this.latestSearch = result.updatedSearch; this.lastAssembly = result; }
        try { await route.fulfill({ status: 202, json: { ...completedJob(body.locale ?? this.language, result), id } }); }
        catch (error) { if (!heldPost) throw error; }
      } else await route.fulfill({ status: 202, json: { id, status: "running", result: null, error: null,
        progress: { phase: "simulating", completed: 1, total: 8 }, scope: scope(this.language) } });
      return;
    }
    if (url.searchParams.has("clientRequestId")) {
      this.requestRecoveries++;
      this.requestRecoveryQueries.push(url.search);
      expect(url.searchParams.get("characterSlug")).toBe(characterSlug);
      expect(url.searchParams.get("locale")).toBe(this.language);
      const id = this.requestJobs.get(url.searchParams.get("clientRequestId") ?? "");
      if (!id) await route.fulfill({ status: 404, json: { error: "plan_not_found" } });
      else await route.fulfill({ json: { ...completedJob(this.language, this.jobs.get(id)!), id } });
      return;
    }
    if (url.searchParams.has("searchId")) {
      this.recoveries++;
      this.recoveryQueries.push(url.search);
      expect(url.searchParams.get("characterSlug")).toBe(characterSlug);
      expect(url.searchParams.get("locale")).toBe(this.language);
      if (this.recoveryFailure) await route.fulfill({ status: 404, json: { error: "search_not_found" } });
      else await route.fulfill({ json: { kind: "recovery", search: this.latestSearch,
        assembly: this.lastAssembly, excludedOptionIds: this.currentExclusions,
        activeJob: this.activeRecoveryJob, needsRefresh: true } });
      return;
    }
    const id = url.searchParams.get("id") ?? "";
    this.polls.push(id);
    this.activePolls++;
    if (this.mode === "held-once" && this.activePolls === 1) {
      await new Promise<void>(resolve => { this.releaseHeld = resolve; });
      try { await route.fulfill({ json: completedJob(this.language, this.jobs.get(id)!) }); } catch { /* Deadline closed this one request. */ }
      return;
    }
    if (this.mode === "network-failed" || this.mode === "transient-once" && this.activePolls === 1) { await route.abort("timedout"); return; }
    if (this.mode === "running") await route.fulfill({ json: { id, status: "running", result: null, error: null,
      progress: { phase: "simulating", completed: 2, total: 8 }, scope: scope(this.language) } });
    else if (this.mode === "error") await route.fulfill({ json: { id, status: "failed", result: null,
      progress: null, error: "simulation_unavailable", scope: scope(this.language) } });
    else {
      if (this.mode === "initial-running") {
        expect(url.searchParams.get("characterSlug")).toBe(characterSlug);
        expect(url.searchParams.get("locale")).toBe(this.language);
      }
      const result = this.jobs.get(id);
      expect(result).toBeDefined();
      if (result && "items" in result) this.latestSearch = result;
      this.activeRecoveryJob = null;
      await route.fulfill({ json: { ...completedJob(this.language, result!), id } });
    }
  }
  async open(query = "") {
    await this.page.goto(`/?lang=${this.language}${query}`, { waitUntil: "networkidle" });
    await this.page.evaluate(() => document.fonts.ready);
    await expect.poll(() => this.page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  }
  async search() {
    await this.panel.getByRole("button", { name: this.t("Найти улучшения", "Find upgrades"), exact: true }).click();
    await expect(this.panel.locator("[data-auction-search-result]")).toBeVisible();
  }
  async assemble() { await this.build.click(); await expect(this.result).toBeVisible(); }
  releasePost() { this.mode = "normal"; this.releaseLate?.(); }
  async release() { this.releaseHeld?.(); this.releaseLate?.(); await this.page.unrouteAll({ behavior: "ignoreErrors" }); }
}

export const test = base.extend<{ auction: AuctionHarness }>({
  auction: async ({ page }, provide, info) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const harness = new AuctionHarness(page, info);
    await harness.install();
    await provide(harness);
    await harness.release();
    await info.attach("synthetic-http-observations", { body: JSON.stringify({ requests: harness.requests,
      polls: harness.polls, deletes: harness.deletes, recoveries: harness.recoveries, recoveryQueries: harness.recoveryQueries,
      requestRecoveries: harness.requestRecoveries, requestRecoveryQueries: harness.requestRecoveryQueries, browserErrors: errors }), contentType: "application/json" });
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  },
});
export { expect };
