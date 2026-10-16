import { test as base, expect, type Page, type Route, type TestInfo } from "playwright/test";
import { aliasIds, assemblyResult, characterSlug, comparison, completedJob, item, scope, searchResult } from "./ui-fixtures";

type Body = { action: string; searchId?: string; excludedOptionIds?: string[] };
type Mode = "normal" | "running" | "error" | "held-once" | "transient-once" | "initial-running";
export class AuctionHarness {
  requests: Body[] = [];
  polls: string[] = [];
  deletes: string[] = [];
  recoveries = 0;
  recoveryQueries: string[] = [];
  recoveryFailure = false;
  marketError: string | null = null;
  mode: Mode = "normal";
  noisyMaximum = false;
  currentExclusions: string[] = [];
  activePolls = 0;
  private jobs = new Map<string, ReturnType<typeof searchResult> | ReturnType<typeof assemblyResult>>();
  private releaseHeld: (() => void) | null = null;
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
        if (aliasIds.every(id => this.currentExclusions.includes(id))) {
          const confirmed = { purchases: [item(780003, "WRIST")], spentCopper: 10000,
            remainingCopper: 99990000, removedSlots: [], comparison: comparison(1050) };
          result = { ...result, ...confirmed, bestConfirmed: confirmed };
        }
      }
      const id = `synthetic-job-${this.requests.length}`;
      this.jobs.set(id, result);
      if (this.mode === "normal") await route.fulfill({ status: 202, json: { ...completedJob(this.language, result), id } });
      else await route.fulfill({ status: 202, json: { id, status: "running", result: null, error: null,
        progress: { phase: "simulating", completed: 1, total: 8 }, scope: scope(this.language) } });
      return;
    }
    if (url.searchParams.has("searchId")) {
      this.recoveries++;
      this.recoveryQueries.push(url.search);
      expect(url.searchParams.get("characterSlug")).toBe(characterSlug);
      expect(url.searchParams.get("locale")).toBe(this.language);
      if (this.recoveryFailure) await route.fulfill({ status: 404, json: { error: "search_not_found" } });
      else await route.fulfill({ json: { kind: "recovery", search: searchResult(),
        assembly: assemblyResult({ noisyMaximum: this.noisyMaximum }), excludedOptionIds: this.currentExclusions,
        activeJob: null, needsRefresh: true } });
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
    if (this.mode === "transient-once" && this.activePolls === 1) { await route.abort("timedout"); return; }
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
  async release() { this.releaseHeld?.(); await this.page.unrouteAll({ behavior: "ignoreErrors" }); }
}

export const test = base.extend<{ auction: AuctionHarness }>({
  auction: async ({ page }, use, info) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const harness = new AuctionHarness(page, info);
    await harness.install();
    await use(harness);
    await harness.release();
    await info.attach("synthetic-http-observations", { body: JSON.stringify({ requests: harness.requests,
      polls: harness.polls, deletes: harness.deletes, recoveries: harness.recoveries, recoveryQueries: harness.recoveryQueries,
      browserErrors: errors }), contentType: "application/json" });
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  },
});
export { expect };
