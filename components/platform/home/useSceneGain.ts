"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

// Keep the saved slider value independent of the actual playback gain.
export function useSceneGain(audio: RefObject<HTMLAudioElement | null>) {
  const frame = useRef(0);
  const cancel = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
  }, []);
  const fadeTo = useCallback((target: number, duration = 0) => {
    cancel();
    const media = audio.current;
    if (!media) return;
    const from = media.volume;
    const to = Math.max(0, Math.min(1, target));
    if (!duration) { media.volume = to; return; }
    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - started) / duration));
      const eased = progress * progress * (3 - 2 * progress);
      media.volume = from + (to - from) * eased;
      if (progress < 1) frame.current = requestAnimationFrame(tick);
      else frame.current = 0;
    };
    frame.current = requestAnimationFrame(tick);
  }, [audio, cancel]);
  useEffect(() => cancel, [cancel]);
  return fadeTo;
}
