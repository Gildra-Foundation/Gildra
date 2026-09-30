"use client";

import { useCallback, useLayoutEffect, useState } from "react";
import { createCharacterBookIntroLifecycle, type CharacterBookIntroState } from "./characterBookIntroLifecycle";

/** Each profile entry opens automatically; ordinary renders never restart the book. */
export function useCharacterBookIntro({ enabled, characterKey }: { enabled: boolean; characterKey: string }) {
  // Match the server loading cover, without flashing the ready page before hydration.
  const [state, setState] = useState<CharacterBookIntroState>({ phase: "preparing", playId: 0, failure: null });
  const [lifecycle] = useState(() => createCharacterBookIntroLifecycle({ onChange: setState }));

  useLayoutEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const canPlay = enabled && Boolean(characterKey);
    let waitingForFirstVisibility = canPlay && document.visibilityState === "hidden";
    lifecycle.start({ enabled: canPlay && !waitingForFirstVisibility, reducedMotion: preference.matches });
    const onPreferenceChange = () => {
      if (preference.matches) lifecycle.interrupt();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") lifecycle.interrupt();
      else if (waitingForFirstVisibility) {
        waitingForFirstVisibility = false;
        lifecycle.start({ enabled: canPlay, reducedMotion: preference.matches });
      }
    };
    preference.addEventListener("change", onPreferenceChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      preference.removeEventListener("change", onPreferenceChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      lifecycle.cancel();
    };
  }, [enabled, characterKey, lifecycle]);

  const finish = useCallback(() => lifecycle.finish(state.playId), [lifecycle, state.playId]);
  const onAssetsReady = useCallback(() => lifecycle.assetsReady(state.playId), [lifecycle, state.playId]);
  const onAssetsFailed = useCallback(() => lifecycle.assetsFailed(state.playId), [lifecycle, state.playId]);
  return { ...state, finish, onAssetsReady, onAssetsFailed };
}
