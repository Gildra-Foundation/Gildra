import { decodeMythicTalentImport } from "./mythicTalentImport";
import { saveTalentBuild, type BuildSaveError, type BuildSaveResult, type SavedTalentBuild } from "./savedTalentBuilds";

export type AccountBuild = SavedTalentBuild & { revision: number };
export type AccountBuildState = { mode: "loading" | "guest" | "account" | "error"; accountKey: string; accountName: string | null; builds: AccountBuild[]; busy: boolean; error: BuildSaveError | null };
const initial: AccountBuildState = { mode: "loading", accountKey: "", accountName: null, builds: [], busy: false, error: null };
type Envelope = { accountKey: string; accountName?: string | null; builds: AccountBuild[]; duplicate?: boolean };
export function parseAccountBuilds(value: unknown): Envelope {
  if (!value || typeof value !== "object") throw new Error("Invalid response");
  const body = value as Partial<Envelope>;
  if (typeof body.accountKey !== "string" || !/^[0-9a-f]{64}$/.test(body.accountKey) || !Array.isArray(body.builds) || body.builds.length > 20) throw new Error("Invalid response");
  const ids = new Set<string>();
  for (const b of body.builds) {
    if (!b || typeof b.id !== "string" || !/^[0-9a-f-]{36}$/i.test(b.id) || ids.has(b.id) || typeof b.name !== "string" || !b.name.trim() || b.name.length > 64 || typeof b.code !== "string" || !b.code || b.code.length > 4096 || !Number.isSafeInteger(b.revision) || b.revision < 1) throw new Error("Invalid response");
    ids.add(b.id);
  }
  return { accountKey: body.accountKey, accountName: typeof body.accountName === "string" ? body.accountName.slice(0,128) : null, builds: body.builds.map(b => ({ id: b.id, name: b.name, code: b.code, revision: b.revision })), duplicate: body.duplicate === true };
}

/** Account data stays in memory, never in the shared guest storage. Stale async replies cannot switch owners. */
export class AccountTalentBuildStore {
  private state: AccountBuildState = initial;
  private listeners = new Set<() => void>();
  private epoch = 0;
  private refreshPending = false;
  private request: typeof fetch;
  private changed: () => void;
  constructor(request: typeof fetch, changed: () => void = () => {}) { this.request = request; this.changed = changed; }
  snapshot = () => this.state;
  serverSnapshot = () => initial;
  subscribe = (notify: () => void) => { this.listeners.add(notify); return () => { this.listeners.delete(notify); }; };
  private publish(next: AccountBuildState) { this.state = next; this.listeners.forEach(notify => notify()); }
  reset() { this.epoch++; this.refreshPending = false; this.publish({ ...initial }); }
  async refresh() {
    if (this.state.busy) { this.refreshPending = true; return; }
    const epoch = ++this.epoch;
    this.publish({ ...initial });
    try {
      const response = await this.request("/api/wow/mythic-builds", { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(12_000) });
      if (epoch !== this.epoch) return;
      if (response.status === 401) { this.publish({ ...initial, mode: "guest" }); return; }
      if (!response.ok) throw new Error("Unavailable");
      const body = parseAccountBuilds(await response.json());
      if (epoch === this.epoch) this.publish({ ...initial, mode: "account", accountKey: body.accountKey, accountName: body.accountName ?? null, builds: body.builds });
    } catch { if (epoch === this.epoch) this.publish({ ...initial, mode: "error", error: "network" }); }
  }
  private async mutate(method: string, path: string, body: unknown): Promise<BuildSaveResult> {
    const current = this.state;
    if (current.mode !== "account" || current.busy) return { ok: false, error: "account" };
    const epoch = ++this.epoch;
    this.publish({ ...current, busy: true, error: null });
    try {
      const response = await this.request(`/api/wow/mythic-builds${path}`, { method, cache: "no-store", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-Mythic-Account": current.accountKey }, body: JSON.stringify(body), signal: AbortSignal.timeout(12_000) });
      const raw = await response.json().catch(() => null);
      if (epoch !== this.epoch || this.state.accountKey !== current.accountKey) return { ok: false, error: "account" };
      if (response.status === 401 || raw?.code === "account_changed") {
        this.publish({ ...initial, mode: "loading", error: "account" });
        await this.refresh(); return { ok: false, error: "account" };
      }
      if (response.ok || response.status === 409 || response.status === 422) {
        const result = parseAccountBuilds(raw);
        if (result.accountKey !== current.accountKey) throw new Error("Account changed");
        const error = response.ok ? null : response.status === 422 && raw?.code === "limit" ? "limit" : "conflict";
        this.publish({ ...current, busy: false, builds: result.builds, error });
        if (error) return { ok: false, error };
        this.changed(); return { ok: true, builds: result.builds, duplicate: result.duplicate };
      }
      throw new Error("Unavailable");
    } catch {
      if (epoch === this.epoch) this.publish({ ...current, busy: false, error: "network" });
      return { ok: false, error: "network" };
    } finally {
      if (this.refreshPending && !this.state.busy) { this.refreshPending = false; void this.refresh(); }
    }
  }
  async save(name: string, raw: string): Promise<BuildSaveResult> {
    const validated = saveTalentBuild([], name, raw, crypto.randomUUID());
    if (!validated.ok) return validated;
    const entry = validated.builds[0], old = this.state.builds.find(b => b.code === entry.code);
    const id = old?.id ?? entry.id;
    return this.mutate("PUT", `/${id}`, { id, name: entry.name, code: entry.code, expectedRevision: old?.revision ?? 0, mutationId: crypto.randomUUID() });
  }
  async remove(id: string): Promise<BuildSaveResult> {
    const old = this.state.builds.find(b => b.id === id);
    if (!old) return { ok: false, error: "conflict" };
    return this.mutate("DELETE", `/${id}`, { expectedRevision: old.revision, mutationId: crypto.randomUUID() });
  }
  async migrate(builds: SavedTalentBuild[]): Promise<BuildSaveResult> {
    const valid = builds.filter(b => decodeMythicTalentImport(b.code).ok).map(b => ({ id: crypto.randomUUID(), name: b.name, code: b.code, expectedRevision: 0, mutationId: crypto.randomUUID() }));
    if (!valid.length) return { ok: false, error: "invalid" };
    return this.mutate("POST", "/import", { builds: valid });
  }
}
