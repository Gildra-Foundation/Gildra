export type CharacterBookIntroPhase = "idle" | "preparing" | "opening" | "done";
export type CharacterBookIntroFailure = "timeout" | "assets" | null;
export type CharacterBookIntroState = {
  phase: CharacterBookIntroPhase;
  playId: number;
  failure: CharacterBookIntroFailure;
};

export const CHARACTER_BOOK_INTRO_TIMING = {
  prepare: 2_000,
  opening: 1_400,
  watchdog: 4_000,
} as const;

type Timer = ReturnType<typeof setTimeout>;
type IntroOptions = {
  onChange: (state: CharacterBookIntroState) => void;
  schedule?: (callback: () => void, delay: number) => Timer;
  cancelTimer?: (timer: Timer) => void;
};

/** Starts only when the server has supplied the real profile. Never gates its fetch. */
export function createCharacterBookIntroLifecycle({
  onChange, schedule = setTimeout, cancelTimer = clearTimeout,
}: IntroOptions) {
  let state: CharacterBookIntroState = { phase: "idle", playId: 0, failure: null };
  const timers = new Set<Timer>();
  let prepareTimer: Timer | undefined;
  const active = () => state.phase === "preparing" || state.phase === "opening";
  const publish = (phase: CharacterBookIntroPhase, failure: CharacterBookIntroFailure = null) => {
    state = { ...state, phase, failure };
    onChange(state);
  };
  const clear = () => {
    timers.forEach(cancelTimer);
    timers.clear();
    prepareTimer = undefined;
  };
  const stop = (failure: CharacterBookIntroFailure = null) => {
    clear();
    publish("done", failure);
  };
  const later = (delay: number, callback: () => void) => {
    const id = state.playId;
    const timer = schedule(() => {
      timers.delete(timer);
      if (id === state.playId && active()) callback();
    }, delay);
    timers.add(timer);
    return timer;
  };

  return {
    start({ enabled, reducedMotion }: { enabled: boolean; reducedMotion: boolean }) {
      clear();
      state = { phase: "idle", playId: state.playId + 1, failure: null };
      if (!enabled || reducedMotion) { publish("done"); return; }
      publish("preparing");
      prepareTimer = later(CHARACTER_BOOK_INTRO_TIMING.prepare, () => stop("timeout"));
      later(CHARACTER_BOOK_INTRO_TIMING.watchdog, () => stop("timeout"));
    },
    assetsReady(playId: number) {
      if (playId !== state.playId || state.phase !== "preparing") return;
      if (prepareTimer !== undefined) {
        cancelTimer(prepareTimer);
        timers.delete(prepareTimer);
        prepareTimer = undefined;
      }
      publish("opening");
      later(CHARACTER_BOOK_INTRO_TIMING.opening, () => stop());
    },
    assetsFailed(playId: number) {
      if (playId === state.playId && state.phase === "preparing") stop("assets");
    },
    finish(playId = state.playId) {
      if (playId === state.playId && active()) stop();
    },
    interrupt() { if (active()) stop(); },
    cancel() {
      clear();
      // Invalidate pending decode callbacks without notifying an unmounted hook.
      state = { phase: "idle", playId: state.playId + 1, failure: null };
    },
  };
}
