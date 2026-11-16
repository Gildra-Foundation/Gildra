import { farmJobActive, farmRecoveryUrl, farmRequestLifetime, farmScopeKey, isFarmRequestId, parseFarmJob, type GearFarmScope, type RecoverableGearFarmJob } from "./recovery";

export type FarmClientState = {
  job?: RecoverableGearFarmJob;
  initializing?: boolean;
  starting?: boolean;
  reconnecting?: boolean;
  cancelling?: boolean;
  recoverable?: boolean;
  pendingRequest?: boolean;
  error?: string;
};
type Handle = { clientRequestId: string; cancellationRequested?: boolean };
type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
class FarmTransportError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable = false) { super(message); this.retryable = retryable; }
}
export function farmClientWait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
/** Owns only a browser subscription. detach() never sends DELETE or cancels server work. */
export class GearFarmClient {
  private controller: AbortController | null = null;
  private detached = false;
  private pending: Handle | null = null;
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;
  private state: FarmClientState = { initializing: true };
  private readonly cacheKey: string;
  private readonly fetcher: typeof fetch;
  private readonly wait: typeof farmClientWait;
  private readonly storage?: Storage;
  private readonly scope: GearFarmScope;
  private readonly onChange: (state: FarmClientState) => void;
  constructor(scope: GearFarmScope, onChange: (state: FarmClientState) => void,
    options: { fetch?: typeof fetch; wait?: typeof farmClientWait; storage?: Storage } = {}) {
    this.scope = scope;
    this.onChange = onChange;
    this.cacheKey = `gildra:farm:v1:${farmScopeKey(scope)}`;
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.wait = options.wait ?? farmClientWait;
    try { this.storage = options.storage ?? globalThis.sessionStorage; } catch { /* Server discovery works without storage. */ }
  }
  private handle(): Handle | null {
    if (this.pending) return this.pending;
    try {
      const value = JSON.parse(this.storage?.getItem(this.cacheKey) ?? "null") as Handle | null;
      return value && isFarmRequestId(value.clientRequestId) && Number(value.clientRequestId.split(":", 1)[0]) + farmRequestLifetime > Date.now()
        ? { clientRequestId: value.clientRequestId, ...(value.cancellationRequested ? { cancellationRequested: true } : {}) } : null;
    } catch { return null; }
  }
  private remember(handle: Handle) {
    this.pending = handle;
    try { this.storage?.setItem(this.cacheKey, JSON.stringify(handle)); } catch { /* Owned discovery remains available. */ }
  }
  private forget(clientRequestId?: string) {
    if (!clientRequestId || this.pending?.clientRequestId === clientRequestId) this.pending = null;
    try {
      // Read storage directly: an unmounted controller may still acknowledge DELETE after a newer mount started work.
      const saved = JSON.parse(this.storage?.getItem(this.cacheKey) ?? "null") as Handle | null;
      if (!clientRequestId || saved?.clientRequestId === clientRequestId) this.storage?.removeItem(this.cacheKey);
    } catch { /* Storage is optional. */ }
  }
  private publish(state: FarmClientState) {
    if (this.detached) return;
    this.state = state;
    this.onChange(state);
  }
  private operation() {
    this.controller?.abort();
    clearTimeout(this.expiryTimer);
    const controller = new AbortController();
    this.controller = controller;
    return controller;
  }
  private current(controller: AbortController) { return !this.detached && this.controller === controller && !controller.signal.aborted; }
  private async request(url: string, signal: AbortSignal, init: RequestInit = {}, retry = true): Promise<Record<string, unknown>> {
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted();
      try {
        const response = await this.fetcher(url, { ...init, cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) });
        const body = await response.json() as Record<string, unknown>;
        if (!response.ok) {
          if (response.status === 409 && body.error === "plan_already_running" && body.job &&
              farmJobActive(body.job as RecoverableGearFarmJob)) return body.job as Record<string, unknown>;
          throw new FarmTransportError(typeof body.error === "string" ? body.error : "farm_plan_unavailable", response.status >= 500);
        }
        return body;
      } catch (error) {
        signal.throwIfAborted();
        const transient = !(error instanceof FarmTransportError) || error.retryable;
        if (!transient) throw error;
        if (!retry || attempt >= 2) throw new FarmTransportError("plan_connection_interrupted", true);
        this.publish({ ...this.state, reconnecting: true });
        await this.wait(750 * (attempt + 1), signal);
      }
    }
  }
  private async watch(value: unknown, controller: AbortController) {
    let job = parseFarmJob(value, this.scope);
    while (this.current(controller)) {
      if (job.expiresAt <= Date.now()) throw new FarmTransportError("plan_not_found");
      this.publish({ job });
      if (!farmJobActive(job)) {
        this.forget(job.clientRequestId);
        this.expiryTimer = setTimeout(() => {
          if (this.current(controller)) this.publish({ error: "plan_not_found" });
        }, Math.max(1, job.expiresAt - Date.now()));
        return;
      }
      await this.wait(1500, controller.signal);
      const next = parseFarmJob(await this.request(farmRecoveryUrl(this.scope, { id: job.id }), controller.signal), this.scope);
      if (next.id !== job.id || next.clientRequestId !== job.clientRequestId) throw new Error("invalid_plan_result");
      job = next;
    }
  }
  private failed(error: unknown, controller: AbortController) {
    if (!this.current(controller)) return;
    const code = error instanceof Error ? error.message : "plan_connection_interrupted";
    const recoverable = code === "plan_connection_interrupted";
    if (["plan_not_found", "plan_request_expired"].includes(code)) this.forget();
    // An expired/logged-out owner must never leave their old result visible.
    this.publish({ ...(recoverable ? { job: this.state.job } : {}), error: code, recoverable, pendingRequest: Boolean(this.handle()) });
  }
  async recover() {
    const handle = this.handle();
    if (handle?.cancellationRequested) { await this.cancel(); return; }
    const controller = this.operation();
    this.publish({ ...this.state, initializing: true, reconnecting: Boolean(this.state.job || handle), error: undefined });
    try {
      let job: unknown;
      let missingRequest = false;
      if (handle) {
        try { job = await this.request(farmRecoveryUrl(this.scope, handle), controller.signal); }
        catch (error) {
          if (!(error instanceof Error) || error.message !== "plan_not_found") throw error;
          // A lost POST response can precede server acceptance. Never silently launch a replacement.
          if (Date.now() - Number(handle.clientRequestId.split(":", 1)[0]) < 35_000) throw new FarmTransportError("plan_connection_interrupted", true);
          this.forget(handle.clientRequestId);
          missingRequest = true;
        }
      }
      if (!job) job = (await this.request(farmRecoveryUrl(this.scope), controller.signal)).job;
      if (!this.current(controller)) return;
      if (missingRequest && !farmJobActive(job as RecoverableGearFarmJob | null)) throw new FarmTransportError("plan_not_found");
      if (job === null) { this.publish(handle ? { error: "plan_not_found" } : {}); return; }
      await this.watch(job, controller);
    } catch (error) { this.failed(error, controller); }
  }
  async start() {
    if (this.detached) return;
    if (this.state.recoverable || this.state.initializing || farmJobActive(this.state.job)) { await this.recover(); return; }
    const controller = this.operation();
    const clientRequestId = `${Date.now()}:${crypto.randomUUID()}`;
    this.remember({ clientRequestId });
    this.publish({ starting: true });
    let accepted = false;
    try {
      const job = await this.request("/api/wow/gear-farm-plans", controller.signal, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...this.scope, clientRequestId }),
      }, false);
      if (!this.current(controller)) return;
      const owned = parseFarmJob(job, this.scope);
      accepted = true;
      this.remember({ clientRequestId: owned.clientRequestId });
      await this.watch(owned, controller);
    } catch (error) {
      if (!this.current(controller)) return;
      if (!accepted && error instanceof Error && error.message === "plan_connection_interrupted") { await this.recover(); return; }
      if (!accepted) this.forget(clientRequestId);
      this.failed(error, controller);
    }
  }
  async cancel() {
    const handle = this.handle();
    const job = this.state.job;
    if (!handle && !farmJobActive(job)) return;
    const controller = this.operation();
    const clientRequestId = job?.clientRequestId ?? handle!.clientRequestId;
    this.remember({ clientRequestId, cancellationRequested: true });
    this.publish({ job, cancelling: true });
    try {
      // Explicit cancellation is allowed to finish after navigation; only the acknowledgement clears its intent.
      const value = await this.request(farmRecoveryUrl(this.scope, job ? { id: job.id } : { clientRequestId }), controller.signal,
        { method: "DELETE", keepalive: true });
      const cancelled = parseFarmJob(value, this.scope);
      if (job && cancelled.id !== job.id || !job && cancelled.clientRequestId !== clientRequestId) throw new Error("invalid_plan_result");
      this.forget(clientRequestId);
      if (this.current(controller)) await this.watch(cancelled, controller);
    } catch (error) {
      if (error instanceof Error && ["plan_not_found", "plan_request_expired"].includes(error.message)) this.forget(clientRequestId);
      this.failed(error, controller);
      if (this.current(controller) && this.handle()?.cancellationRequested) this.publish({ ...this.state, recoverable: true });
    }
  }
  detach() {
    this.detached = true;
    clearTimeout(this.expiryTimer);
    if (!this.state.cancelling) this.controller?.abort();
  }
}
