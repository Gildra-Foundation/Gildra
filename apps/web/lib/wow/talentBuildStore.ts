import { emptyBuildLibrary, mergeBuildLibraries, parseBuildLibrary, type TalentBuildLibrary } from "./talentBuildLibrary";

type Status = "loading" | "saving" | "synced" | "offline" | "expired" | "limit" | "rejected";
type State = { library: TalentBuildLibrary; status: Status; storageFailed: boolean };
type Document = { payload: unknown; revision: number };
export function makeTalentBuildStore(key: string, owner: string, character: string, specialization: string) {
  let state: State = { library: emptyBuildLibrary(), status: "loading", storageFailed: false };
  const initial = state;
  const listeners = new Set<() => void>();
  let revision = 0, dirty = false, loaded = false, working = false, generation = 0;
  const scope = new URLSearchParams({ character, specialization });
  const emit = (patch: Partial<State>) => { state = { ...state, ...patch }; for (const listener of listeners) listener(); };
  const persist = () => {
    try { localStorage.setItem(key, JSON.stringify({ library: state.library, revision, dirty })); if (state.storageFailed) emit({ storageFailed: false }); }
    catch { emit({ storageFailed: true }); }
  };
  async function synchronize() {
    if (working) return;
    working = true;
    let failed = false;
    try {
      if (!loaded) {
        try {
          const local = JSON.parse(localStorage.getItem(key) ?? "null");
          if (local?.library) { dirty = local.dirty === true; revision = Number(local.revision) || 0; emit({ library: parseBuildLibrary(local.library) }); }
        } catch { /* A malformed browser cache never replaces the server library. */ }
        const response = await fetch(`/api/wow/workspace?${scope}`, { cache: "no-store", headers: { "X-Workspace-Owner": owner }, signal: AbortSignal.timeout(15_000) });
        if (!response.ok) throw new Error(response.status === 401 ? "expired" : "offline");
        const body = await response.json() as { documents?: Array<Document & { kind: string }> };
        const remote = body.documents?.find(document => document.kind === "talent-builds");
        const local = state.library;
        const library = remote ? dirty ? mergeBuildLibraries(parseBuildLibrary(remote.payload), local) : parseBuildLibrary(remote.payload) : local;
        revision = remote?.revision ?? 0; loaded = true;
        emit({ library, status: dirty ? "saving" : "synced" }); persist();
      }
      // Writes outlive the component. Navigating to the calculator must not
      // abort a pending save or discard the last edit during a debounce.
      let conflicts = 0;
      while (dirty) {
        const version = generation;
        const payload = state.library;
        emit({ status: "saving" });
        const response = await fetch(`/api/wow/workspace/talent-builds?${scope}`, {
          method: "PUT", headers: { "Content-Type": "application/json", "X-Workspace-Owner": owner }, signal: AbortSignal.timeout(15_000),
          body: JSON.stringify({ payload, expectedRevision: revision, mutationId: crypto.randomUUID() }),
        });
        const body = await response.json() as Document & { current?: Document; message?: string };
        if (response.status === 409 && body.current && conflicts++ < 4) {
          revision = body.current.revision;
          emit({ library: mergeBuildLibraries(parseBuildLibrary(body.current.payload), state.library) }); persist(); continue;
        }
        if (response.status === 400) throw new Error(body.message?.includes("limit reached") ? "limit" : "rejected");
        if (!response.ok || typeof body.revision !== "number") throw new Error(response.status === 401 ? "expired" : "offline");
        revision = body.revision;
        if (version === generation) dirty = false;
        emit({ status: dirty ? "saving" : "synced" }); persist();
      }
    } catch (error) {
      failed = true;
      emit({ status: error instanceof Error && ["expired", "limit", "rejected"].includes(error.message) ? error.message as Status : "offline" }); persist();
    } finally {
      working = false;
      if (dirty && !failed) void synchronize();
    }
  }
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => state, getServerSnapshot: () => initial,
    synchronize,
    update(library: TalentBuildLibrary) {
      generation++; dirty = true; emit({ library, status: "saving" }); persist(); void synchronize();
    },
    reload() { if (!working) loaded = false; void synchronize(); },
  };
}
