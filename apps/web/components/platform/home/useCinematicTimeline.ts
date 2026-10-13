"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { HomeCinematicScene } from "./homeCinematicScenes";

export type ScenePhase = "waiting" | "lead-in" | "writing" | "signing" | "done";

export function useCinematicTimeline({ audio, scene, ready, canHear, status }: {
  audio: RefObject<HTMLAudioElement | null>; scene: HomeCinematicScene | null; ready: boolean;
  canHear: boolean; status: string;
}) {
  const clock = useRef(0);
  const [state, setState] = useState<{ key: string | null; phase: ScenePhase }>({ key: null, phase: "waiting" });
  const [readyScene, setReadyScene] = useState<string | null>(null);
  const fallback = useRef({ canHear, status });
  fallback.current = { canHear, status };
  const sceneKey = scene?.key ?? null;
  const epigraphReady = sceneKey !== null && readyScene === sceneKey;
  const setEpigraphReady = useCallback((isReady: boolean) => {
    setReadyScene(previous => isReady ? sceneKey : previous === sceneKey ? null : previous);
  }, [sceneKey]);
  // Never expose the outgoing hero's writing phase to the incoming epigraph.
  const phase: ScenePhase = !scene ? "done" : state.key === sceneKey ? state.phase : "waiting";

  useEffect(() => {
    clock.current = 0;
    setState({ key: sceneKey, phase: scene ? "waiting" : "done" });
    if (!scene || !ready || !epigraphReady) return;
    const media = audio.current;
    if (!media) return;
    const finish = scene.quoteEnd + 600 + Array.from(scene.author).length * 70 + 180;
    let frame = 0;
    let last = performance.now();
    let stalled = 0;
    let currentPhase: ScenePhase = "lead-in";
    setState({ key: sceneKey, phase: currentPhase });
    const onVisibility = () => { last = performance.now(); };
    document.addEventListener("visibilitychange", onVisibility);
    const tick = (now: number) => {
      const elapsed = Math.max(0, now - last);
      last = now;
      if (!document.hidden) {
        if (!media.paused && media.readyState >= 2) {
          clock.current = media.currentTime * 1000;
          stalled = 0;
        } else {
          stalled += elapsed;
          if (!fallback.current.canHear || ["blocked", "error"].includes(fallback.current.status) || stalled > 4000) clock.current += elapsed;
        }
        const time = clock.current;
        const next: ScenePhase = time < scene.leadIn ? "lead-in" : time < scene.quoteEnd ? "writing" : time < finish ? "signing" : "done";
        if (next !== currentPhase) { currentPhase = next; setState({ key: sceneKey, phase: next }); }
        if (next === "done") return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("visibilitychange", onVisibility); };
  }, [scene, sceneKey, ready, epigraphReady, audio]);
  return { clock, phase, epigraphReady, setEpigraphReady };
}
