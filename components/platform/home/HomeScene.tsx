"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Lang } from "@/lib/i18n";
import { useHomeTheme } from "./HomeTheme";
import { homeMusicTracks } from "./homeMusicTracks";
import { getHomeCinematicScene, type HomeCinematicScene } from "./homeCinematicScenes";
import { useSoundPreferences } from "./useSoundPreferences";
import { useCinematicTimeline } from "./useCinematicTimeline";
import { useSceneGain } from "./useSceneGain";

type Status = "idle" | "loading" | "playing" | "blocked" | "error";
type SoundState = ReturnType<typeof useSoundPreferences>;
type Timeline = ReturnType<typeof useCinematicTimeline>;
const SceneContext = createContext<(Pick<SoundState, "volume" | "enabled"> & Timeline & {
  started: boolean; entryReady: boolean; confirmSound: (enabled: boolean) => void;
  cinematic: boolean; scene: HomeCinematicScene | null; status: Status; generation: string; toggle: () => void; changeVolume: (volume: number) => void;
}) | null>(null);

export function HomeScene({ lang, children }: { lang: Lang; children: ReactNode }) {
  const { theme } = useHomeTheme();
  const audio = useRef<HTMLAudioElement>(null);
  const sound = useSoundPreferences();
  const fadeTo = useSceneGain(audio);
  const targetGain = useRef(sound.volume / 100);
  targetGain.current = sound.volume / 100;
  const [status, setStatus] = useState<Status>("idle");
  const [started, setStarted] = useState(false);
  const [entryReady, setEntryReady] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const hasPlayed = useRef(false);
  const isBackground = useRef(false);
  const requestedScene = getHomeCinematicScene(theme, lang);
  const scene = reducedMotion ? null : requestedScene;
  const cinematic = scene !== null;
  const generation = `${theme}:${lang}:${cinematic ? "scene" : "background"}`;
  const canHear = sound.enabled && sound.volume > 0;
  const timeline = useCinematicTimeline({ audio, scene, ready: sound.ready && started, canHear, status });
  // Keep one soundtrack for the whole scene, including before the font is ready.
  const composite = cinematic;
  const src = scene?.src ?? requestedScene?.background ?? homeMusicTracks[theme].src;

  useEffect(() => {
    if (!sound.ready) return;
    if (sound.confirmed) setStarted(true);
    setEntryReady(true);
  }, [sound.ready, sound.confirmed]);

  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(motion.matches);
    update(); motion.addEventListener("change", update);
    return () => motion.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const media = audio.current;
    if (!media || !sound.ready) return;
    media.pause();
    fadeTo(0);
    media.src = src;
    media.loop = !composite;
    hasPlayed.current = false;
    isBackground.current = false;
    setStatus("idle");
    return () => { fadeTo(0); media.pause(); media.removeAttribute("src"); media.load(); };
  }, [src, composite, sound.ready, fadeTo]);

  useEffect(() => {
    if (audio.current && !audio.current.paused) fadeTo(sound.volume / 100, 250);
  }, [sound.volume, fadeTo]);

  useEffect(() => {
    const media = audio.current;
    if (!media || !sound.ready || !started) return;
    let current = true;
    const start = () => {
      if (!canHear || document.hidden) { fadeTo(0); media.pause(); return; }
      if (media.paused) fadeTo(0);
      if (cinematic && hasPlayed.current && !isBackground.current) media.currentTime = Math.max(media.currentTime, timeline.clock.current / 1000);
      setStatus("loading");
      void media.play().catch((error: DOMException) => {
        if (current && error.name !== "AbortError") setStatus(error.name === "NotAllowedError" ? "blocked" : "error");
      });
    };
    start();
    const visibility = () => { if (document.hidden) { fadeTo(0); media.pause(); } else start(); };
    document.addEventListener("visibilitychange", visibility);
    return () => { current = false; document.removeEventListener("visibilitychange", visibility); fadeTo(0); media.pause(); };
  }, [sound.ready, started, canHear, src, cinematic, generation, timeline.clock, fadeTo]);

  function activate(volume: number) {
    const media = audio.current;
    sound.setVolume(volume);
    sound.setEnabled(true);
    if (!media || !sound.ready) return;
    if (cinematic && !isBackground.current) media.currentTime = Math.max(media.currentTime, timeline.clock.current / 1000);
    targetGain.current = volume / 100;
    if (media.paused) fadeTo(0);
    setStatus("loading");
    void media.play().catch((error: DOMException) => {
      if (error.name !== "AbortError") setStatus(error.name === "NotAllowedError" ? "blocked" : "error");
    });
  }
  function confirmSound(enabled: boolean) {
    sound.confirm(enabled);
    setStarted(true);
    if (enabled) {
      // Call play in the button's gesture so mobile browsers can unlock audio.
      activate(sound.volume || sound.lastVolume.current);
    } else {
      sound.setEnabled(false);
      fadeTo(0);
      audio.current?.pause();
    }
  }
  function toggle() {
    if (!started) return;
    if (canHear && (status === "playing" || status === "loading")) { fadeTo(0); audio.current?.pause(); sound.setEnabled(false); return; }
    activate(sound.volume || sound.lastVolume.current);
  }
  function changeVolume(volume: number) {
    if (!started) return;
    if (volume > 0 && (!canHear || status === "blocked")) activate(volume);
    else sound.setVolume(volume);
  }
  function continueMusic() {
    const media = audio.current;
    if (!media || !scene) return;
    isBackground.current = true;
    fadeTo(0);
    media.src = scene.background;
    media.loop = true;
    if (canHear && !document.hidden) void media.play().catch(() => setStatus("blocked"));
  }
  return <SceneContext.Provider value={{ started, entryReady, confirmSound, volume: sound.volume, enabled: sound.enabled, status, cinematic, scene, generation, toggle, changeVolume, ...timeline }}>
    <div style={{ display: "contents" }} data-home-scene data-scene-started={started} data-scene-phase={!started ? "waiting" : cinematic ? timeline.phase : "done"}>
      {children}
      <audio ref={audio} preload="none" data-scene-audio="music" data-scene-composite={composite ? "true" : undefined}
        onPlaying={() => {
          const media = audio.current;
          // A slow first download must catch up with the readable silent fallback.
          if (media && cinematic && !isBackground.current && timeline.clock.current > media.currentTime * 1000 + 250) media.currentTime = timeline.clock.current / 1000;
          hasPlayed.current = true;
          fadeTo(targetGain.current, 450);
          setStatus("playing");
        }}
        onPause={() => setStatus(value => value === "blocked" || value === "error" ? value : "idle")}
        onError={() => setStatus("error")} onEnded={continueMusic} />
    </div>
  </SceneContext.Provider>;
}

export function useHomeScene() {
  const value = useContext(SceneContext);
  if (!value) throw new Error("Home sound must be inside HomeScene");
  return value;
}
