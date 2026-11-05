"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, RotateCcw } from "lucide-react";
import type { CharacterAppearanceProfile } from "@/lib/wow/characterAudit";
import styles from "./characterEquipment.module.css";
import type { Lang } from "@/lib/i18n";
import { characterPageCopy } from "./characterPageCopy";
import { configureZamViewerGlobals, createZamViewer, loadZamViewerScript, ZAM_CONTENT_PATH, ZAM_MODEL_TYPE, type WowViewer } from "@/lib/wow/zamModelViewer";

type ViewerProps = {
  lang?: Lang;
  appearance: CharacterAppearanceProfile;
  characterName: string;
  characterSlug: string;
};
type WowCustomization = { Options: Array<{ Id: number; Choices: Array<{ Id: number }> }> };

/** The character's 3D model in its current equipment. Mounted only when the reader asks for it (the viewer
 * downloads several megabytes and renders every frame), and destroyed when they close it. */
export function CharacterModelViewer({ appearance, characterName, characterSlug, lang = "ru" }: ViewerProps) {
  const copy = characterPageCopy(lang);
  const imported = appearance.presetId.startsWith("battlenet-");
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<WowViewer | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    let readyTimer: number | undefined;
    let positionTimer: number | undefined;
    const host = hostRef.current;
    if (!host) return;
    host.replaceChildren();

    const boot = async () => {
      await configureZamViewerGlobals();
      let modelItems = appearance.modelItems;
      if (imported) {
        const response = await fetch(`/api/wow/characters/${encodeURIComponent(characterSlug)}/model-items?locale=${lang}`, { cache: "no-store" });
        if (!response.ok) throw new Error("character model items unavailable");
        const payload = await response.json() as { modelItems?: Array<[number, number]> };
        modelItems = payload.modelItems ?? [];
      }
      const customizationResponse = await fetch(`${ZAM_CONTENT_PATH}meta/charactercustomization/${appearance.modelId}.json`);
      if (!customizationResponse.ok) throw new Error("character customization unavailable");
      const customization = await customizationResponse.json() as WowCustomization;
      const availableChoices = new Map(customization.Options.map((option) => [
        option.Id,
        new Set(option.Choices.map((choice) => choice.Id)),
      ]));
      const importedOptions = appearance.customizations?.filter((option) =>
        availableChoices.get(option.optionId)?.has(option.choiceId),
      );
      const options = importedOptions?.length
        ? importedOptions
        : customization.Options
            .filter((option) => option.Choices.length > 0)
            .map((option) => ({ optionId: option.Id, choiceId: option.Choices[0].Id }));

      await loadZamViewerScript();
      if (cancelled || !hostRef.current || !window.ZamModelViewer) return;
      const viewer = createZamViewer(hostRef.current, {
        aspect: 1,
        hd: true,
        models: { id: appearance.modelId, type: ZAM_MODEL_TYPE.character },
        charCustomization: { options },
        items: modelItems.map((item) => [...item]),
      });
      viewerRef.current = viewer;

      const frameModel = () => {
        const renderer = viewer.renderer;
        if (!renderer) return;
        renderer.distance = 4.75;
        renderer.zenith = 1.55;
        renderer.azimuth = -1.57;
      };
      positionTimer = window.setTimeout(() => {
        frameModel();
      }, 450);

      const startedAt = Date.now();
      const waitUntilReady = () => {
        if (cancelled) return;
        const renderer = viewer.renderer;
        const actorsReady = Boolean(renderer?.actors?.length);
        const downloadsFinished = renderer ? Object.keys(renderer.downloads ?? {}).length === 0 : false;
        const elapsed = Date.now() - startedAt;
        // The upstream viewer occasionally leaves bookkeeping entries in
        // `downloads` after WebGL has already painted the character. Do not
        // keep a usable model hidden behind a 24-second loading veil.
        if (actorsReady && ((downloadsFinished && renderer?.progressShown === false) || elapsed > 4_500)) {
          readyTimer = window.setTimeout(() => {
            if (cancelled) return;
            frameModel();
            setStatus("ready");
          }, 600);
          return;
        }
        if (elapsed > 5_000) {
          setStatus("error");
          return;
        }
        readyTimer = window.setTimeout(waitUntilReady, 250);
      };
      waitUntilReady();
    };

    void boot().catch(() => {
      if (!cancelled) setStatus("error");
    });

    return () => {
      cancelled = true;
      if (readyTimer) window.clearTimeout(readyTimer);
      if (positionTimer) window.clearTimeout(positionTimer);
      viewerRef.current?.destroy?.();
      viewerRef.current = null;
      host.replaceChildren();
    };
  }, [attempt, appearance.customizations, appearance.modelId, appearance.modelItems, appearance.presetId, characterSlug, imported, lang]);

  return (
    <div className={styles.viewer} data-model-state={status} role="img" aria-label={`${copy.model3d}: ${characterName}`}>
      <div ref={hostRef} className={styles.viewerHost} aria-hidden="true" />
      {status === "loading" ? <span className={styles.viewerState} role="status"><LoaderCircle aria-hidden="true" className={styles.spin} /><span className={styles.srOnly}>{copy.modelLoading}</span></span> : null}
      {status === "error" ? <span className={styles.viewerState}>
        <span>{copy.modelError}</span>
        <button type="button" onClick={() => { setStatus("loading"); setAttempt((value) => value + 1); }}><RotateCcw aria-hidden="true" />{copy.retry}</button>
      </span> : null}
    </div>
  );
}
