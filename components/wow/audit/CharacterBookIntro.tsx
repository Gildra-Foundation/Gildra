"use client";

import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { SkipForward } from "lucide-react";
import { useCharacterBookIntro } from "./useCharacterBookIntro";
import { CHARACTER_BOOK_COVER, CharacterBookLoadingScene, characterBookLoadingStyle } from "./CharacterBookLoadingScene";
import styles from "./characterBookIntro.module.css";

/** The server has loaded this real profile; reveal it by opening the loading book. */
export function CharacterBookIntro({ characterKey, characterName, locale }: {
  characterKey: string; characterName: string; locale: "ru" | "en";
}) {
  const { phase, playId, finish, onAssetsReady, onAssetsFailed } = useCharacterBookIntro({ enabled: true, characterKey });
  const dialogRef = useRef<HTMLDialogElement>(null);
  const labelId = useId();
  const active = phase === "preparing" || phase === "opening";

  useEffect(() => {
    if (phase !== "preparing" || playId === 0) return;
    let cancelled = false;
    const cover = new Image();
    cover.fetchPriority = "high";
    cover.src = CHARACTER_BOOK_COVER;
    cover.decode().then(() => { if (!cancelled) onAssetsReady(); })
      .catch(() => { if (!cancelled) onAssetsFailed(); });
    return () => { cancelled = true; };
  }, [phase, playId, onAssetsFailed, onAssetsReady]);

  useLayoutEffect(() => {
    if (!active) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.documentElement.style.overflow;
    // Promote the SSR cover to the native top layer. A hidden modal must never
    // trap reduced-motion users or a profile opened in a background tab.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.visibilityState === "hidden") return;
    if (dialog.open) dialog.close();
    dialog.showModal();
    document.documentElement.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.documentElement.style.overflow = previousOverflow;
      if (previousFocus?.isConnected && previousFocus !== document.body && !dialog.contains(previousFocus)) previousFocus.focus({ preventScroll: true });
      else document.getElementById("audit-overview")?.focus({ preventScroll: true });
    };
  }, [active]);

  if (!active) return null;
  return <>
    <noscript><style>{"[data-character-book-intro] { display: none !important; }"}</style></noscript>
    <dialog open ref={dialogRef} className={styles.dialog} data-character-book-intro={phase} data-play-id={playId} data-book-hydrated={playId > 0 || undefined}
      style={characterBookLoadingStyle} aria-labelledby={labelId} onCancel={(event) => { event.preventDefault(); finish(); }}>
      <CharacterBookLoadingScene locale={locale} characterName={characterName} labelId={labelId} />
      <button className={styles.skip} type="button" autoFocus onClick={finish} data-book-intro-skip
        onKeyDown={(event) => { if (event.key === "Tab") event.preventDefault(); }}>
        {locale === "ru" ? "Пропустить" : "Skip"}<SkipForward size={15} aria-hidden="true" /><kbd>Esc</kbd>
      </button>
    </dialog>
  </>;
}
