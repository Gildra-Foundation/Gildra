export type BookRouteKind = "open" | "turn";
export type BookRouteState = { kind: BookRouteKind; phase: "waiting" | "playing" | "loading" | "idle"; id: number };
export const BOOK_ROUTE_TIMING = { open: 500, turn: 120, lift: 40, watchdog: 12000 } as const;

type Timer = ReturnType<typeof setTimeout>;

/** One generation owns its timers; stale responses cannot dismiss a newer navigation. */
export function createBookRouteLifecycle(
  publish: (state: BookRouteState) => void,
  clock = {
    now: () => performance.now(),
    schedule: (callback: () => void, delay: number) => setTimeout(callback, delay),
    cancel: (timer: Timer) => clearTimeout(timer),
  },
) {
  let state: BookRouteState = { kind: "open", phase: "idle", id: 0 };
  let started = 0;
  let scheduled = false;
  let pageReady = false;
  let turnDone = false;
  const timers = new Set<Timer>();
  const clear = () => { timers.forEach(clock.cancel); timers.clear(); scheduled = false; };
  const update = (phase: BookRouteState["phase"]) => { state = { ...state, phase }; publish(state); };
  const later = (delay: number, callback: () => void) => {
    const id = state.id;
    const timer = clock.schedule(() => {
      timers.delete(timer);
      if (id === state.id) callback();
    }, delay);
    timers.add(timer);
  };
  const finish = () => { clear(); update("idle"); };
  return {
    get state() { return state; },
    start(kind: BookRouteKind, reducedMotion = false) {
      clear();
      pageReady = false;
      turnDone = false;
      state = { kind, phase: "waiting", id: state.id + 1 };
      started = clock.now();
      update(reducedMotion ? "idle" : "waiting");
      if (!reducedMotion) later(BOOK_ROUTE_TIMING.watchdog, finish);
      return state.id;
    },
    ready(id: number) {
      if (id !== state.id || state.phase !== "waiting" || scheduled) return;
      scheduled = true;
      later(Math.max(0, (state.kind === "turn" ? BOOK_ROUTE_TIMING.lift : 0) - (clock.now() - started)), () => {
        update("playing");
        later(BOOK_ROUTE_TIMING[state.kind], () => {
          turnDone = true;
          if (pageReady) finish();
          else update("loading");
        });
      });
    },
    pageReady(id: number) {
      if (id !== state.id || state.phase === "idle") return;
      pageReady = true;
      if (turnDone) finish();
    },
    finish,
    cancel() { clear(); state = { ...state, phase: "idle", id: state.id + 1 }; },
  };
}
